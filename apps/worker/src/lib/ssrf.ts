import { promises as dns } from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import { isIP } from 'node:net';

export const MAX_REDIRECTS = 5;
export const MAX_EXTERNAL_MEDIA_BYTES = 100 * 1024 * 1024;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

function ipv4ToNumber(address: string): number {
  return address.split('.').reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function inIpv4Range(address: string, network: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(network) & mask);
}

export function isBlockedIpv4(address: string): boolean {
  return ([
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
    ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
    ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24],
    ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
    ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ] as Array<[string, number]>).some(([network, prefix]) => inIpv4Range(address, network, prefix));
}

function ipv6ToBigInt(address: string): bigint {
  let normalized = address.toLowerCase();
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    const value = ipv4ToNumber(normalized.slice(lastColon + 1));
    normalized = `${normalized.slice(0, lastColon)}:${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const [left, right = ''] = normalized.split('::');
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];
  const missing = 8 - leftParts.length - rightParts.length;
  const parts = normalized.includes('::')
    ? [...leftParts, ...Array(missing).fill('0'), ...rightParts]
    : leftParts;
  return parts.reduce((value, part) => (value << 16n) + BigInt(`0x${part || '0'}`), 0n);
}

function inIpv6Range(value: bigint, network: bigint, prefix: number): boolean {
  const mask = prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << (128n - BigInt(prefix));
  return (value & mask) === (network & mask);
}

export function isBlockedIpv6(address: string): boolean {
  // IPv4-mapped IPv6 is rejected outright, including mapped public IPv4: it
  // avoids family-confusion between validation and the socket implementation.
  if (/^::ffff:/i.test(address)) return true;
  const value = ipv6ToBigInt(address);
  return value === 0n || value === 1n ||
    inIpv6Range(value, 0n, 96) ||
    inIpv6Range(value, 0xfc00n << 112n, 7) ||
    inIpv6Range(value, 0xfe80n << 112n, 10) ||
    inIpv6Range(value, 0xff00n << 112n, 8) ||
    inIpv6Range(value, 0x100n << 112n, 64) ||
    inIpv6Range(value, 0x20010db8n << 96n, 32) ||
    inIpv6Range(value, 0xffffn << 32n, 96);
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? isBlockedIpv4(address) : family === 6 ? isBlockedIpv6(address) : true;
}

export function parseExternalHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafeUrlError('Source URL must be a valid HTTP(S) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Source URL must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('Source URL must not contain credentials');
  }
  return url;
}

export type Lookup = (hostname: string) => Promise<Array<{ address: string }>>;
const systemLookup: Lookup = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

async function resolveApproved(url: URL, lookup: Lookup): Promise<{ address: string; family: 4 | 6 }> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let records: Array<{ address: string }>;
  try {
    records = await lookup(hostname);
  } catch {
    throw new UnsafeUrlError('Source URL hostname could not be resolved');
  }
  if (!records.length || records.some(({ address }) => isBlockedAddress(address))) {
    throw new UnsafeUrlError('Source URL resolves to a disallowed address');
  }
  const address = records[0].address;
  return { address, family: isIP(address) as 4 | 6 };
}

export async function validateExternalHttpUrl(value: string, lookup: Lookup = systemLookup): Promise<URL> {
  const url = parseExternalHttpUrl(value);
  await resolveApproved(url, lookup);
  return url;
}

type Request = (
  url: URL,
  pinned: { address: string; family: 4 | 6 },
  init: RequestInit,
) => Promise<Response>;

function nodeRequest(url: URL, pinned: { address: string; family: 4 | 6 }, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const requester = url.protocol === 'https:' ? https.request : http.request;
    const headers = new Headers(init.headers);
    // The URL hostname remains the authority for Host and, for HTTPS, SNI. Only
    // lookup is overridden, so the socket can never be rebound to a new answer.
    headers.set('host', url.host);
    const request = requester(url, {
      method: init.method || 'GET',
      headers: Object.fromEntries(headers.entries()),
      servername: url.hostname.replace(/^\[|\]$/g, ''),
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
    }, (response) => {
      const chunks: Buffer[] = [];
      const contentLength = Number(response.headers['content-length'] || 0);
      if (contentLength > MAX_EXTERNAL_MEDIA_BYTES) {
        response.destroy();
        reject(new UnsafeUrlError('Source URL response exceeds the size limit'));
        return;
      }
      let received = 0;
      response.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_EXTERNAL_MEDIA_BYTES) {
          response.destroy();
          request.destroy();
          reject(new UnsafeUrlError('Source URL response exceeds the size limit'));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on('end', () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
        }
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode || 500, headers: responseHeaders }));
      });
    });
    request.once('error', reject);
    if (init.body) request.write(init.body as any);
    request.end();
  });
}

export interface SsrfSafeFetcher {
  fetch(value: string | URL, init?: RequestInit): Promise<Response>;
}

/**
 * Fetches a user-controlled HTTP(S) URL only after all DNS answers have been
 * approved. The selected answer is supplied to node's lookup callback, pinning
 * the actual TCP connection. Redirects are deliberately followed here rather
 * than by fetch, so each Location receives the same validation.
 */
export function createSsrfSafeFetcher(options: { lookup?: Lookup; request?: Request } = {}): SsrfSafeFetcher {
  const lookup = options.lookup || systemLookup;
  const request = options.request || nodeRequest;
  return {
    async fetch(value, init = {}) {
      let url = parseExternalHttpUrl(String(value));
      for (let redirects = 0; ; redirects++) {
        const pinned = await resolveApproved(url, lookup);
        const response = await request(url, pinned, { ...init, redirect: 'manual' });
        if (![301, 302, 303, 307, 308].includes(response.status)) return response;
        const location = response.headers.get('location');
        if (!location) return response;
        if (redirects >= MAX_REDIRECTS) throw new UnsafeUrlError('Source URL exceeded redirect limit');
        url = parseExternalHttpUrl(new URL(location, url).toString());
      }
    },
  };
}

export const safeExternalFetch = createSsrfSafeFetcher().fetch;

/** Download external media through the pinned, redirect-validating fetch path. */
export async function downloadExternalMedia(value: string): Promise<{ body: Buffer; contentType: string }> {
  const response = await safeExternalFetch(value);
  if (!response.ok) throw new Error(`Failed to download source media: ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_EXTERNAL_MEDIA_BYTES) {
    throw new UnsafeUrlError('Source URL response exceeds the size limit');
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_EXTERNAL_MEDIA_BYTES) {
    throw new UnsafeUrlError('Source URL response exceeds the size limit');
  }
  return { body, contentType: response.headers.get('content-type') || 'application/octet-stream' };
}