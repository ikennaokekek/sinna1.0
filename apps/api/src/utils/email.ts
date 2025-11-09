/**
 * Email Utilities for API Key Delivery
 * Specialized email functions for sending API keys to clients
 */

import { sendEmailNotice } from '../lib/email';

/**
 * Sends an API key to a client via email
 * Uses the standard Sinna 1.0 API key email template
 * 
 * @param email - Client's email address
 * @param apiKey - The API key to send (plain text)
 * @param options - Optional configuration
 */
export async function sendApiKeyEmail(
  email: string,
  apiKey: string,
  options?: {
    baseUrl?: string;
    note?: string;
  }
): Promise<void> {
  const baseUrl = options?.baseUrl || process.env.BASE_URL_PUBLIC || 'https://sinna.site';
  const note = options?.note ? `\n\n${options.note}` : '';
  
  const subject = 'Your Sinna API Key is Ready! 🎉';
  const text = `Your API key: ${apiKey}${note}\n\nBase URL: ${baseUrl}\n\nKeep this key secure and use it in the X-API-Key header for all requests.`;
  
  await sendEmailNotice(email, subject, text);
}

