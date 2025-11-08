/**
 * Qwen3-VL-8B-Instruct Client
 * 
 * Strictly enforces use of qwen/qwen3-vl-8b-instruct model only.
 * No overrides or fallbacks allowed.
 */

import * as fs from 'fs';
import * as path from 'path';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUIRED_MODEL = 'qwen/qwen3-vl-8b-instruct';

export interface QwenPromptPayload {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
  }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

export interface QwenResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: {
    message: string;
    type: string;
  };
}

/**
 * Qwen3-VL-8B-Instruct instruction client
 * 
 * @param promptPayload - Prompt payload (model is automatically set)
 * @returns Qwen API response
 * @throws Error if OPEN_ROUTER_QWEN_KEY is missing or API call fails
 */
export async function qwenInstruct(promptPayload: QwenPromptPayload): Promise<QwenResponse> {
  const apiKey = process.env.OPEN_ROUTER_QWEN_KEY;
  
  if (!apiKey) {
    throw new Error('OPEN_ROUTER_QWEN_KEY environment variable is required');
  }

  // Enforce model lock - override any model in payload
  const payload = {
    ...promptPayload,
    model: REQUIRED_MODEL, // Always enforce qwen/qwen3-vl-8b-instruct
  };

  try {
    // Use global fetch (Node.js 18+ native or polyfill)
    const response = await globalThis.fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.BASE_URL || 'https://sinna.site',
        'X-Title': 'Sinna 1.0 Accessibility API',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as QwenResponse;

    // Verify model lock was respected
    if (data.model && !data.model.includes('qwen3-vl-8b-instruct')) {
      throw new Error(`Model lock violation: Expected qwen/qwen3-vl-8b-instruct, got ${data.model}`);
    }

    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Qwen API call failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Log Qwen usage for QA verification
 */
export async function logQwenUsage(prompt: string, response: QwenResponse): Promise<void> {
  const logDir = path.join(process.cwd(), 'logs');
  const logFile = path.join(logDir, 'qwen_usage.json');

  try {
    // Ensure logs directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      model: REQUIRED_MODEL,
      prompt_preview: prompt.substring(0, 200),
      response_preview: response.choices[0]?.message?.content?.substring(0, 200) || '',
      usage: response.usage,
      model_verified: response.model?.includes('qwen3-vl-8b-instruct') || false,
    };

    // Append to log file
    let logs: any[] = [];
    if (fs.existsSync(logFile)) {
      const existing = fs.readFileSync(logFile, 'utf-8');
      try {
        logs = JSON.parse(existing);
      } catch {
        logs = [];
      }
    }

    logs.push(logEntry);

    // Keep last 100 entries
    if (logs.length > 100) {
      logs = logs.slice(-100);
    }

    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  } catch (error) {
    // Don't fail the request if logging fails
    console.error('Failed to log Qwen usage:', error);
  }
}

