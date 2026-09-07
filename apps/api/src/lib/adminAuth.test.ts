import { describe, expect, it } from 'vitest';
import { requireAdminAccess } from './adminAuth';

function request(key?: string) {
  return { headers: key === undefined ? {} : { 'x-admin-key': key } } as any;
}

function reply() {
  const result = { status: 200, payload: undefined as unknown };
  return {
    result,
    code(status: number) {
      result.status = status;
      return this;
    },
    send(payload: unknown) {
      result.payload = payload;
      return this;
    },
  } as any;
}

describe('requireAdminAccess', () => {
  it('fails closed for missing or invalid admin credentials', () => {
    const previous = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = 'admin-secret';

    const missing = reply();
    expect(requireAdminAccess(request(), missing)).toBe(false);
    expect(missing.result.status).toBe(403);

    const invalid = reply();
    expect(requireAdminAccess(request('wrong-secret'), invalid)).toBe(false);
    expect(invalid.result.status).toBe(403);

    if (previous === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = previous;
  });
});