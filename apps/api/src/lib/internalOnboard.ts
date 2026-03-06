/**
 * Render → Replit internal onboarding call (single direction, no circular sync).
 * Secured with HMAC SHA256 and timestamp; 5s timeout, 3 retries with exponential backoff.
 * Used only for checkout.session.completed. Replit writes directly to shared Postgres.
 */

import crypto from 'crypto';

const TIMEOUT_MS = 5_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

export interface InternalOnboardPayload {
  eventId: string;
  stripeSessionId: string;
  stripeCustomerId: string;
  subscriptionId: string;
  email: string;
  plan: string;
  timestamp: string;
}

/**
 * Generate HMAC SHA256 signature for internal request verification.
 * Format: HMAC(secret, ${timestamp}.${payload})
 * Replit must verify using the same secret and timestamp window to prevent replay.
 */
export function signInternalRequest(secret: string, timestamp: string, payload: string): string {
  const message = `${timestamp}.${payload}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

/**
 * Call Replit POST /internal/onboard with HMAC-signed request.
 * - X-Internal-Timestamp: Unix ms (string)
 * - X-Internal-Signature: HMAC SHA256 hex
 * - Timeout 5 seconds
 * - Retry 3 times with exponential backoff (500ms, 1s, 2s)
 */
export async function callReplitInternalOnboard(
  baseUrl: string,
  secret: string,
  payload: InternalOnboardPayload,
  options?: {
    timeoutMs?: number;
    maxRetries?: number;
    onLog?: (step: string, status: string, error?: string) => void;
  }
): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  const timeoutMs = options?.timeoutMs ?? TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? MAX_RETRIES;
  const onLog = options?.onLog ?? (() => {});

  const url = `${baseUrl.replace(/\/$/, '')}/internal/onboard`;
  const payloadStr = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = signInternalRequest(secret, timestamp, payloadStr);

  let lastError: string | undefined;
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    onLog('replit_call_start', attempt === 1 ? 'start' : 'retry', attempt > 1 ? `attempt ${attempt}` : undefined);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Timestamp': timestamp,
          'X-Internal-Signature': signature,
        },
        body: payloadStr,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      lastStatus = response.status;

      if (response.ok) {
        onLog('replit_call_success', 'success');
        return { ok: true };
      }
      const bodyText = await response.text().catch(() => '');
      lastError = `HTTP ${response.status} ${bodyText.slice(0, 500)}`;
      onLog('replit_call_failure', 'failure', lastError);
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err.message : String(err);
      onLog('replit_call_failure', 'failure', lastError);
    }

    if (attempt < maxRetries) {
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  return { ok: false, statusCode: lastStatus, error: lastError };
}
