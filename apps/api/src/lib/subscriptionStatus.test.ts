import { describe, expect, it } from 'vitest';
import { stripeGraceDays } from './subscriptionStatus';

describe('stripeGraceDays', () => {
  it('uses the bounded seven-day default', () => {
    expect(stripeGraceDays(undefined)).toBe(7);
  });

  it.each([
    ['0', 0],
    ['14', 14],
  ])('accepts boundary value %s', (value, expected) => {
    expect(stripeGraceDays(value)).toBe(expected);
  });

  it.each(['-1', '15', '1.5', 'abc', ' 7'])('rejects unsafe value %s', (value) => {
    expect(() => stripeGraceDays(value)).toThrow(/between 0 and 14/);
  });
});