#!/usr/bin/env node
import fs from 'node:fs';

const [envName, outputPath, serviceName] = process.argv.slice(2);
if (!envName || !outputPath || !serviceName) {
  console.error('Usage: write-pg-service.mjs ENV_NAME OUTPUT_FILE SERVICE_NAME');
  process.exit(2);
}
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(serviceName)) {
  console.error('Invalid environment variable or service name.');
  process.exit(2);
}

const raw = process.env[envName];
if (!raw) {
  console.error('Database URL environment variable is unset or empty.');
  process.exit(2);
}
if (/[\0\r\n]/.test(raw)) {
  console.error('Database URL contains an unsupported control character.');
  process.exit(2);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error('Database URL is invalid.');
  process.exit(2);
}
if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
  console.error('Database URL protocol must be postgres or postgresql.');
  process.exit(2);
}

function decode(value, label) {
  try {
    const decoded = decodeURIComponent(value);
    if (/[\0\r\n]/.test(decoded)) throw new Error();
    return decoded;
  } catch {
    console.error(`Database URL has an invalid ${label}.`);
    process.exit(2);
  }
}

function checkedDecoded(value, label) {
  if (/[\0\r\n]/.test(value)) {
    console.error(`Database URL has an invalid ${label}.`);
    process.exit(2);
  }
  return value;
}

const dbname = decode(url.pathname.replace(/^\//, ''), 'database name');
if (!dbname) {
  console.error('Database URL must include a database name.');
  process.exit(2);
}
const hostname = decode(url.hostname.replace(/^\[|\]$/g, ''), 'host');
if (!hostname) {
  console.error('Database URL must include a host.');
  process.exit(2);
}

const allowedOptions = new Set([
  'application_name', 'connect_timeout', 'gssencmode', 'krbsrvname',
  'sslcert', 'sslcrl', 'sslkey', 'sslmode', 'sslrootcert', 'sslsni',
  'target_session_attrs',
]);
const fields = [];
if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':')) {
  fields.push(['hostaddr', hostname]);
} else {
  fields.push(['host', hostname]);
}
if (url.port) fields.push(['port', url.port]);
fields.push(['dbname', dbname]);
if (url.username) fields.push(['user', decode(url.username, 'user')]);
if (url.password) fields.push(['password', decode(url.password, 'password')]);
for (const [key, value] of url.searchParams) {
  if (!allowedOptions.has(key)) {
    console.error(`Unsupported PostgreSQL URL query option: ${key}`);
    process.exit(2);
  }
  // URLSearchParams has already percent-decoded this value exactly once.
  fields.push([key, checkedDecoded(value, `query option ${key}`)]);
}

function serviceValue(value) {
  if (/[\0\r\n]/.test(value)) {
    console.error('Database URL contains an unsupported decoded control character.');
    process.exit(2);
  }
  /*
   * pg_service.conf uses PostgreSQL's INI parser, not conninfo quoting:
   * quote characters would become literal value bytes (and break integers).
   * Reject ambiguous INI/metacharacter forms instead of silently changing a
   * credential. Percent-encoding does not make these safe after URL decoding.
   */
  if (/[\t #;=\\]/.test(value)) {
    console.error('A decoded database URL value contains whitespace or an unsupported service-file metacharacter (# ; = or backslash).');
    process.exit(2);
  }
  return value;
}

const body = `[${serviceName}]\n${fields.map(([key, value]) => `${key}=${serviceValue(value)}`).join('\n')}\n`;
try {
  fs.writeFileSync(outputPath, body, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  fs.chmodSync(outputPath, 0o600);
} catch {
  console.error('Could not write PostgreSQL service file.');
  process.exit(1);
}