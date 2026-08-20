import { RateLimiterAdapter, RateLimitOptions } from '../types/storage.types.js';

export class InMemoryRateLimiter implements RateLimiterAdapter {
  private maxRequests: number;
  private windowMs: number;
  private currentCount: number = 0;
  private previousCount: number = 0;
  private windowStart: number;

  constructor(options: RateLimitOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs || 60000;
    this.windowStart = Date.now();
  }

  private slide(): void {
    const now = Date.now();
    const elapsed = now - this.windowStart;

    if (elapsed >= this.windowMs * 2) {
      this.previousCount = 0;
      this.currentCount = 0;
      this.windowStart = now;
    } else if (elapsed >= this.windowMs) {
      this.previousCount = this.currentCount;
      this.currentCount = 0;
      this.windowStart += this.windowMs;
    }
  }

  private getEstimatedCount(): number {
    const elapsed = Date.now() - this.windowStart;
    const weight = Math.max(0, (this.windowMs - elapsed) / this.windowMs);
    return this.previousCount * weight + this.currentCount;
  }

  tryAcquire(): boolean {
    this.slide();

    if (this.getEstimatedCount() >= this.maxRequests) {
      return false;
    }

    this.currentCount++;
    return true;
  }

  getRemainingRequests(): number {
    this.slide();
    return Math.max(0, Math.floor(this.maxRequests - this.getEstimatedCount()));
  }

  getResetTime(): number {
    this.slide();
    if (this.currentCount === 0 && this.previousCount === 0) {
      return 0;
    }
    const elapsed = Date.now() - this.windowStart;
    return Math.max(0, this.windowMs - elapsed);
  }
}

export function isRateLimiterAdapter(value: unknown): value is RateLimiterAdapter {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tryAcquire' in value &&
    typeof (value as RateLimiterAdapter).tryAcquire === 'function'
  );
}
