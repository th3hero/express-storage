import { RateLimiterAdapter, RateLimitOptions } from '../types/storage.types.js';

/**
 * O(1) sliding window counter rate limiter for presigned URL generation.
 * 
 * Uses a two-bucket sliding window algorithm: tracks request counts for the
 * current and previous windows, then estimates the effective count with a
 * time-weighted blend. This provides smooth rate limiting without storing
 * individual timestamps.
 * 
 * All operations are O(1) time and O(1) space regardless of request volume.
 * 
 * Suitable for single-process applications. For clustered/multi-process
 * deployments, implement `RateLimiterAdapter` backed by a shared store.
 */
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

  /**
   * Rotates the window buckets if the current window has elapsed.
   */
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

  /**
   * Returns the estimated request count across the sliding window,
   * blending the previous window's count proportionally with elapsed time.
   */
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

/**
 * Returns true if the value is a RateLimiterAdapter (has the required methods),
 * as opposed to plain RateLimitOptions.
 */
export function isRateLimiterAdapter(value: unknown): value is RateLimiterAdapter {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tryAcquire' in value &&
    typeof (value as RateLimiterAdapter).tryAcquire === 'function'
  );
}
