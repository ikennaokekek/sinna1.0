import fetch from 'node-fetch';
import { JobCreateInputSchema } from '@sinna/types';

export class SinnaClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(opts: { baseUrl: string; apiKey: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
  }

  async createJob(input: unknown) {
    const parsed = JobCreateInputSchema.parse(input);
    const res = await fetch(`${this.baseUrl}/v1/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(parsed),
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }
}


