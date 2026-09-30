/**
 * What this server asks of other people's servers: held, shared, and given
 * up on. Server only.
 *
 * Trello and Zoho both count what they are asked, and every browser on a
 * floor asks this server on its own timer. So a read is held for a while,
 * the one already on its way is shared rather than sent again, and a
 * failure is held too — briefly — so a desk that is rate limiting us is not
 * asked again by every browser in the building the moment it says no.
 */

/** How long an outbound request may take before it is given up on. */
export const OUTBOUND_TIMEOUT_MS = 10_000;

/**
 * A signal that gives up after `OUTBOUND_TIMEOUT_MS`. Without one a host
 * that accepts the connection and never answers holds the request — and
 * the shared promise every other caller is waiting on — for as long as the
 * socket stays open.
 */
export function outboundSignal(): AbortSignal {
  return AbortSignal.timeout(OUTBOUND_TIMEOUT_MS);
}

/** How long a failure is held before the next caller may try again. */
export const FAILURE_HOLD_MS = 15_000;

export interface Held<T> {
  value: T;
  /** When it was fetched, which is what a panel says as "updated at". */
  at: number;
}

type Settled =
  | { ok: true; value: unknown; at: number; until: number }
  | { ok: false; error: unknown; until: number };

interface Entry {
  settled: Settled | null;
  pending: Promise<Held<unknown>> | null;
}

const entries = new Map<string, Entry>();

/**
 * `load()`, held under `key` for `ttlMs`.
 *
 * Callers that arrive while a load is under way get that same load rather
 * than a second one. A load that fails is held for `failureMs` and rethrown
 * to everybody who asks in that time; a success is held for `ttlMs`.
 */
export function cachedFetch<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  failureMs: number = FAILURE_HOLD_MS,
): Promise<Held<T>> {
  const now = Date.now();
  const entry = entries.get(key);
  const settled = entry?.settled;
  if (settled && now < settled.until) {
    return settled.ok
      ? Promise.resolve({ value: settled.value as T, at: settled.at })
      : Promise.reject(settled.error);
  }
  if (entry?.pending) return entry.pending as Promise<Held<T>>;

  const pending = Promise.resolve()
    .then(load)
    .then(
      (value) => {
        const at = Date.now();
        entries.set(key, { settled: { ok: true, value, at, until: at + ttlMs }, pending: null });
        return { value, at };
      },
      (error: unknown) => {
        entries.set(key, {
          settled: { ok: false, error, until: Date.now() + failureMs },
          pending: null,
        });
        throw error;
      },
    );
  entries.set(key, { settled: null, pending });
  return pending;
}

/** Test seam, and a way to read afresh: forget everything held. */
export function forgetCached(): void {
  entries.clear();
}
