/**
 * How much one connection may say, and how fast.
 *
 * Every message on the room socket costs the server something — a parse, a
 * lookup, often a broadcast to everybody in the room or on the server — and
 * nothing used to stop one browser sending as many as its network would
 * carry. An honest client sends a move and a paddle position twenty times a
 * second each and a flurry of voice candidates when it joins Global Chat;
 * the allowance is set well over that and anything past it is dropped.
 *
 * A few messages are dear out of all proportion to their size — a
 * microphone flips the whole server's online list, a meeting tells every
 * connection, a wiped board is everybody's drawing gone — so those have
 * tighter budgets of their own on top.
 *
 * A connection that goes on being dropped is not a client having a bad
 * second: it is closed.
 *
 * The clock is injectable, as the hub's is, so the budgets can be tested
 * without waiting for them.
 */

/** What an honest client could send in a sustained second, with room to spare. */
export const RATE_SUSTAINED_PER_S = 60;

/** How far over that a moment may go — a second's worth, for a burst of ICE candidates. */
export const RATE_BURST = 60;

/** Dropped messages within `RATE_ABUSE_WINDOW_MS` past which the connection is closed. */
export const RATE_ABUSE_DROPS = 300;

/** The window the drops are counted over: thirty a second over budget, for ten seconds. */
export const RATE_ABUSE_WINDOW_MS = 10_000;

/**
 * The tighter budgets, by message kind: how many at once, and how fast they
 * come back. A board being wiped is at most one every thirty seconds.
 */
export const KIND_BUDGETS = {
  mic: { burst: 4, perSecond: 0.5 },
  meeting: { burst: 2, perSecond: 0.1 },
  "board-clear": { burst: 1, perSecond: 1 / 30 },
} as const;

export type BudgetedKind = keyof typeof KIND_BUDGETS;

/** What happened to a message offered to the limiter. */
export type Verdict = "ok" | "drop" | "abuse";

/** A token bucket: `burst` to begin with, refilling at `perSecond`. */
export class TokenBucket {
  private tokens: number;
  private at: number;

  constructor(
    private readonly burst: number,
    private readonly perSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = burst;
    this.at = now();
  }

  take(): boolean {
    const now = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.at) / 1000) * this.perSecond);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** One connection's allowance: the overall rate, the dear kinds, and the tally of drops. */
export class ConnectionLimiter {
  private readonly overall: TokenBucket;
  private readonly kinds = new Map<BudgetedKind, TokenBucket>();
  private drops = 0;
  private windowStart: number;

  constructor(private readonly now: () => number = Date.now) {
    this.overall = new TokenBucket(RATE_BURST, RATE_SUSTAINED_PER_S, now);
    this.windowStart = now();
  }

  /** Any message at all, before it is so much as parsed. */
  admit(): Verdict {
    return this.overall.take() ? "ok" : this.dropped();
  }

  /** One of the dear kinds, on top of `admit`. */
  admitKind(kind: BudgetedKind): Verdict {
    let bucket = this.kinds.get(kind);
    if (!bucket) {
      const budget = KIND_BUDGETS[kind];
      bucket = new TokenBucket(budget.burst, budget.perSecond, this.now);
      this.kinds.set(kind, bucket);
    }
    return bucket.take() ? "ok" : this.dropped();
  }

  private dropped(): Verdict {
    const now = this.now();
    if (now - this.windowStart > RATE_ABUSE_WINDOW_MS) {
      this.windowStart = now;
      this.drops = 0;
    }
    this.drops += 1;
    return this.drops > RATE_ABUSE_DROPS ? "abuse" : "drop";
  }
}
