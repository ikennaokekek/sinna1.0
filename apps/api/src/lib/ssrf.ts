import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

export const MAX_REDIRECTS = 5;

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

/**
 * Returns whether an IPv4 address is unsuitable for outbound requests.  We
 * deliberately reject the special-use ranges as well as RFC1918 space: a
 * public fetcher has no reason to contact them.
 */
export function isBlockedIpv4(address: string): boolean {
  const blockedRanges: Array<readonly [string, number]> = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
    ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
    ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24],
    ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
    ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ];
  return blockedRanges.some(([network, prefix]) => inIpv4Range(address, network, prefix));
}

function ipv6ToBigInt(address: string): bigint {
  let normalized = address.toLowerCase();
  // dns.lookup may express an IPv4-mapped IPv6 answer with a dotted tail.
  // Expand that tail before parsing the eight hexadecimal groups.
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    const ipv4 = normalized.slice(lastColon + 1);
    const value = ipv4ToNumber(ipv4);
    normalized = `${normalized.slice(0, lastColon)}:${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const [left, right = ''] = normalized.split('::');
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];
  const missing = 8 - leftParts.length - rightParts.length;
  const parts = address.includes('::')
    ? [...leftParts, ...Array(missing).fill('0'), ...rightParts]
    : leftParts;
  return parts.reduce((value, part) => (value << 16n) + BigInt(`0x${part || '0'}`), 0n);
}

function inIpv6Range(value: bigint, network: bigint, prefix: number): boolean {
  const bits = 128n;
  const mask = prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << (bits - BigInt(prefix));
  return (value & mask) === (network & mask);
}

/** Reject local, multicast, unspecified, documentation, and mapped IPv6. */
export function isBlockedIpv6(address: string): boolean {
  const value = ipv6ToBigInt(address);
  const mappedPrefix = 0xffffn << 32n;
  return value === 0n ||
    value === 1n ||
    inIpv6Range(value, 0xfc00n << 112n, 7) ||
    inIpv6Range(value, 0xfe80n << 112n, 10) ||
    inIpv6Range(value, 0xff00n << 112n, 8) ||
    inIpv6Range(value, 0x100n << 112n, 64) ||
    inIpv6Range(value, 0x20010db8n << 96n, 32) ||
    inIpv6Range(value, mappedPrefix, 96);
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
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

const systemLookup: Lookup = async (hostname) =>
  dns.lookup(hostname, { all: true, verbatim: true });

/**
 * Resolve every address before accepting a URL. Consumers that connect to the
 * URL must use this resolution as a pinned lookup; resolving alone is not a
 * DNS-rebinding defense.
 */
export async function validateExternalHttpUrl(value: string, lookup: Lookup = systemLookup): Promise<URL> {
  const url = parseExternalHttpUrl(value);
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
  return url;
}