#!/usr/bin/env node
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';

const PRODUCTION_HOSTS = new Set(['sinna.site', 'sinna1-0.onrender.com']);

function isProductionHost(hostname) {
  return [...PRODUCTION_HOSTS].some(
    (productionHost) =>
      hostname === productionHost || hostname.endsWith(`.${productionHost}`)
  );
}

function fail(message) {
  throw new Error(`Invalid staging target: ${message}`);
}

export function assertStagingTarget(rawUrl, rawExpectedHost) {
  if (!rawUrl?.trim() || !rawExpectedHost?.trim()) {
    fail('STAGING_E2E_BASE_URL and STAGING_ALLOWED_HOST are both required');
  }

  const expectedHost = rawExpectedHost.trim().toLowerCase();
  if (
    !/^[a-z0-9.-]+$/.test(expectedHost) ||
    expectedHost.endsWith('.') ||
    expectedHost === 'localhost' ||
    isIP(expectedHost)
  ) {
    fail('STAGING_ALLOWED_HOST must be a DNS hostname');
  }
  if (isProductionHost(expectedHost)) {
    fail('STAGING_ALLOWED_HOST must not be a production host');
  }

  let target;
  try {
    target = new URL(rawUrl.trim());
  } catch {
    fail('STAGING_E2E_BASE_URL must be a valid HTTPS URL');
  }
  if (target.protocol !== 'https:') fail('target must use HTTPS');
  if (target.username || target.password) fail('target must not contain credentials');
  if (target.hash) fail('target must not contain a fragment');
  if (target.port) fail('target must not include a port');

  const hostname = target.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || isIP(hostname)) {
    fail('target must not be localhost or an IP address');
  }
  if (hostname.endsWith('.') || isProductionHost(hostname)) {
    fail('target must not be a production host');
  }
  if (hostname !== expectedHost) fail('target host does not match STAGING_ALLOWED_HOST');
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertStagingTarget(process.env.STAGING_E2E_BASE_URL, process.env.STAGING_ALLOWED_HOST);
    console.log('Staging target validated.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid staging target');
    process.exitCode = 1;
  }
}