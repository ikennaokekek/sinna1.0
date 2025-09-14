import IORedis from 'ioredis';

export class RedisTokenBucket {
  private client: IORedis;
  private capacity: number;
  private refillTokens: number;
  private refillIntervalSec: number;

  constructor(client: IORedis, capacity = 60, refillTokens = 60, refillIntervalSec = 60) {
    this.client = client;
    this.capacity = capacity;
    this.refillTokens = refillTokens;
    this.refillIntervalSec = refillIntervalSec;
  }

  async consume(key: string): Promise<{ remaining: number; resetSec: number }> {
    const now = Math.floor(Date.now() / 1000);
    const bucketKey = `rl:${key}`;
    const refillAtKey = `rl:${key}:refill`;

    const execRes = await this.client.multi().get(bucketKey).get(refillAtKey).exec();
    const tokensRaw = (execRes && execRes[0] && (execRes[0][1] as string)) || null;
    const refillAtRaw = (execRes && execRes[1] && (execRes[1][1] as string)) || null;

    let tokens = tokensRaw ? parseInt(tokensRaw, 10) : this.capacity;
    let refillAt = refillAtRaw ? parseInt(refillAtRaw, 10) : now + this.refillIntervalSec;

    if (now >= refillAt) {
      tokens = Math.min(this.capacity, tokens + this.refillTokens);
      refillAt = now + this.refillIntervalSec;
    }

    if (tokens <= 0) {
      const resetSec = refillAt - now;
      return { remaining: 0, resetSec };
    }

    tokens -= 1;
    await this.client
      .multi()
      .set(bucketKey, tokens.toString(), 'EX', this.refillIntervalSec * 2)
      .set(refillAtKey, refillAt.toString(), 'EX', this.refillIntervalSec * 2)
      .exec();

    return { remaining: tokens, resetSec: refillAt - now };
  }
}


