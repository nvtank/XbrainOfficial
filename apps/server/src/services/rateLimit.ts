/** Token bucket rate limiter (per client, per message type). */
export class TokenBucket {
  private tokens: number;
  private last = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {
    this.tokens = capacity;
  }

  take(n = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

/** Sliding one-second counter used to detect message floods. */
export class FloodCounter {
  private windowStart = Date.now();
  private count = 0;

  hit(limitPerSec: number): boolean {
    const now = Date.now();
    if (now - this.windowStart > 1000) {
      this.windowStart = now;
      this.count = 0;
    }
    this.count++;
    return this.count > limitPerSec;
  }
}

/** Simple fixed-window limiter keyed by string (REST endpoints). */
export class KeyedWindowLimiter {
  private hits = new Map<string, { start: number; n: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || now - h.start > this.windowMs) {
      this.hits.set(key, { start: now, n: 1 });
      if (this.hits.size > 10000) this.hits.clear();
      return true;
    }
    h.n++;
    return h.n <= this.max;
  }
}
