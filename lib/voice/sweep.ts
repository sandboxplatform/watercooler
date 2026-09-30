/**
 * The retry: what the voice chat does about connections that are not working.
 *
 * Until it existed there was none — a handshake that did not complete stayed
 * uncompleted until somebody switched their microphone off and on. It runs on
 * a timer while the microphone is on, on every change to the server's list,
 * and on arriving in a new room.
 *
 * Every decision is in `sweepPlan`, which is pure: it is handed what the
 * connections look like and who is on the server, and answers what to do.
 * `voice-chat.ts` does it. So the policy can be tested without a single
 * `RTCPeerConnection`, stubbed or otherwise.
 */

import type { OnlinePerson } from "../presence-types";
import { offers } from "./offers";

/**
 * How long a connection may sit unfinished before it is started again.
 *
 * Long enough for a slow network to finish the ICE exchange, short enough
 * that a handshake nobody is going to answer is not mistaken for one in
 * progress. `disconnected` is inside it too: WebRTC drops through that
 * state on an ordinary hiccup and usually comes back on its own.
 */
export const NEGOTIATE_GRACE_MS = 8_000;

/** The least time between two hellos to the same person. */
export const GREET_RETRY_MS = 5_000;

/** The most, once it is clear the two networks cannot reach each other. */
export const GREET_MAX_MS = 60_000;

/** How often the connections are looked over while the microphone is on. */
export const SWEEP_MS = 4_000;

/**
 * How long somebody may be missing from the server's list before their voice
 * is let go of.
 *
 * Gone from the list is the only way this browser learns that somebody has
 * left, and it used to be acted on the instant it happened — which is right
 * for a closed tab and wrong for every gap that is not one. A list is a
 * snapshot taken between two things happening, and a person walking through
 * a door is out of one room before they are into the next.
 *
 * The server no longer publishes that particular gap, and this is the other
 * half of the same argument: a reconnected socket, a dropped frame or any
 * later gap nobody has thought of yet must not cost a working conversation
 * either. Long enough that no blink reaches the audio, short enough that
 * somebody who has really gone stops being counted as connected.
 */
export const GONE_GRACE_MS = 10_000;

/**
 * How long to leave it before saying hello again, after so many tries.
 *
 * Two people whose networks have no route between them — no relay, and a
 * NAT that will not be traversed — never connect however often they are
 * introduced, and a hello every five seconds for the length of a session
 * is noise on the socket for nothing. It backs off to a minute and stays
 * there, so the retry still happens the moment the network allows it.
 */
export function backoff(tries: number): number {
  return Math.min(GREET_RETRY_MS * 2 ** Math.min(tries, 4), GREET_MAX_MS);
}

/** When somebody was last said hello to, and how many times running. */
export interface Greeting {
  at: number;
  tries: number;
}

/** What the sweep needs to know about one connection, and nothing else. */
export interface PeerFacts {
  /** `RTCPeerConnection.connectionState`. */
  state: string;
  /** When the connection last changed state, for telling stalled from slow. */
  changedAt: number;
  /** Whether it has ever been up. */
  everConnected: boolean;
  /** When ICE was last restarted on it, 0 for never. */
  restartedAt: number;
  /** Whether this browser's connections can restart ICE at all. */
  canRestart: boolean;
  /** Whether there is a sink and it is refusing to play. */
  silent: boolean;
}

/** Connected, or on the way there and not yet out of time. */
export function settled(peer: PeerFacts | undefined, now: number): boolean {
  if (!peer) return false;
  if (peer.state === "connected") return true;
  // `disconnected` is in here on purpose: WebRTC passes through it on an
  // ordinary hiccup and usually comes back without being asked. What it
  // must not do is stay there, which is what the grace period decides.
  if (peer.state === "new" || peer.state === "connecting" || peer.state === "disconnected") {
    return now - peer.changedAt < NEGOTIATE_GRACE_MS;
  }
  return false;
}

/**
 * Whether there is a connection here worth mending, and a mend left to try.
 *
 * A route that was working and stopped is worth asking to be found again; a
 * handshake that never completed is more likely wedged than misrouted, and
 * no amount of fresh candidates mends a connection whose description went
 * wrong. And one mend only: a second that fails the same way is a minute of
 * silence spent on the wrong remedy, and starting again from hello is the
 * remedy that is left.
 */
export function mendable(peer: PeerFacts | undefined): boolean {
  return !!peer && peer.everConnected && peer.restartedAt === 0 && peer.canRestart;
}

/** What the sweep remembers between runs. */
export interface SweepMemory {
  /** This browser's own presence id. */
  me: string;
  greeted: ReadonlyMap<string, Greeting>;
  /** When somebody first went missing from the server's list. */
  missing: ReadonlyMap<string, number>;
}

export interface SweepPlan {
  /** Gone for long enough to be believed: drop the connection and forget them. */
  forget: string[];
  /** Who is missing now and since when — replaces `missing` in the memory. */
  missing: Map<string, number>;
  /** Connections whose sink should be asked to play again. */
  replay: string[];
  /** Microphone off: nothing to answer with, and nobody to call unreachable. */
  quiet: string[];
  /** Ask the existing connection for a fresh route. */
  mend: { id: string; tries: number }[];
  /** Throw away what is held for them and say hello again. */
  greet: { id: string; tries: number }[];
}

/**
 * Look the connections over: who has gone, and who we ought to be able to
 * hear and cannot.
 *
 * `online` is everybody else on the server, this browser left out. Anyone
 * back before `GONE_GRACE_MS` keeps the connection they already had, which is
 * the whole point: walking through a door is not leaving.
 */
export function sweepPlan(
  peers: ReadonlyMap<string, PeerFacts>,
  online: readonly OnlinePerson[],
  now: number,
  memory: SweepMemory,
): SweepPlan {
  const here = new Set(online.map((p) => p.id));
  const plan: SweepPlan = {
    forget: [],
    missing: new Map(memory.missing),
    replay: [],
    quiet: [],
    mend: [],
    greet: [],
  };

  for (const id of new Set([...peers.keys(), ...memory.greeted.keys()])) {
    if (here.has(id)) {
      plan.missing.delete(id);
      continue;
    }
    const since = plan.missing.get(id) ?? now;
    plan.missing.set(id, since);
    if (now - since < GONE_GRACE_MS) continue;
    plan.forget.push(id);
    plan.missing.delete(id);
  }

  const forgotten = new Set(plan.forget);
  for (const [id, peer] of peers) {
    if (peer.silent && !forgotten.has(id)) plan.replay.push(id);
  }

  for (const person of online) {
    // Somebody with their microphone off has nothing to answer with, and
    // when they switch it on theirs is the hello that starts this.
    if (!person.mic) {
      plan.quiet.push(person.id);
      continue;
    }
    const peer = peers.get(person.id);
    if (settled(peer, now)) continue;
    const greeting = memory.greeted.get(person.id) ?? { at: 0, tries: 0 };
    if (now - greeting.at < backoff(greeting.tries)) continue;
    const tries = greeting.tries + 1;
    // Mend what is there before building another one — but only the side
    // that opens the line may, because a restart is an offer and two
    // crossing offers are the thing `offers` exists to prevent.
    if (offers(memory.me, person.id) && mendable(peer)) plan.mend.push({ id: person.id, tries });
    else plan.greet.push({ id: person.id, tries });
  }
  return plan;
}
