/**
 * API Key Generation Utilities
 * Centralized functions for creating and hashing API keys
 */

import crypto from 'crypto';

export interface ApiKeyResult {
  apiKey: string;
  hashed: string;
}

/**
 * Creates a new API key with the format: sk_live_<32_random_chars>
 * Also returns the SHA-256 hash for database storage
 * 
 * @returns Object with apiKey (plain text) and hashed (SHA-256 hash)
 */
export function createApiKey(): ApiKeyResult {
  const randomBytes = crypto.randomBytes(24);
  const randomString = randomBytes
    .toString('base64')
    .replace(/[+/=]/g, '') // Remove base64 special chars
    .toLowerCase()
    .substring(0, 32); // Ensure consistent length
  
  const apiKey = `sk_live_${randomString}`;
  const hashed = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  return { apiKey, hashed };
}

/**
 * Validates API key format
 * @param apiKey - The API key to validate
 * @returns true if format is valid (starts with sk_live_ and is correct length)
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  return /^sk_live_[a-z0-9]{32}$/.test(apiKey);
}

