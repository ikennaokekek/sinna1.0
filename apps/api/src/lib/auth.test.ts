import { describe, it, expect } from 'vitest';
import { hashKey } from './auth';

describe('hashKey', () => {
  it('should hash a key consistently', () => {
    const key = 'test-key-123';
    const hash1 = hashKey(key);
    const hash2 = hashKey(key);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
  });

  it('should produce different hashes for different keys', () => {
    const hash1 = hashKey('key1');
    const hash2 = hashKey('key2');
    
    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty string', () => {
    const hash = hashKey('');
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

