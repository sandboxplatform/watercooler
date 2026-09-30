/**
 * What the socket passes on between two browsers, rebuilt rather than
 * forwarded.
 *
 * The server is a post box for ping pong and for the voice handshake: it
 * does not play the game and it never hears the audio. But it used to hand
 * the other side whatever object arrived, so anything that passed the check
 * on the envelope went through with every field it happened to carry —
 * any size, any shape, straight into somebody else's browser. Each relay is
 * now built again from the fields its kind is known to have, each capped,
 * the way `sanitiseStroke` rebuilds a line on the whiteboard. A payload that
 * cannot be rebuilt is not passed on at all.
 */

import { MAX_MATCH_ID, type PongPayload } from "../pong/protocol";
import type { Side } from "../pong/game";
import { SDP_LIMIT, type VoiceSignal } from "../presence-types";

/** A candidate line is a hundred-odd characters; this is plenty and no more. */
export const ICE_CANDIDATE_LIMIT = 1_024;

/** `sdpMid` and `usernameFragment` are a few characters each in practice. */
export const ICE_FIELD_LIMIT = 256;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isSide = (value: unknown): value is Side => value === "left" || value === "right";

/** A pair of finite numbers under the two names a pong message uses for them. */
function pair(value: unknown): { left: number; right: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const { left, right } = value as Record<string, unknown>;
  return finite(left) && finite(right) ? { left, right } : null;
}

/** A ping pong move, rebuilt from the fields its kind carries, or null. */
export function relayablePong(value: unknown): PongPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const payload = value as Record<string, unknown>;
  const { kind, matchId } = payload;
  if (typeof matchId !== "string" || matchId.length > MAX_MATCH_ID) return null;
  switch (kind) {
    case "invite":
    case "accept":
    case "decline":
    case "quit":
      return { kind, matchId };
    case "paddle":
      return finite(payload.y) ? { kind, matchId, y: payload.y } : null;
    case "state": {
      const ball = payload.ball as Record<string, unknown> | null;
      if (typeof ball !== "object" || ball === null) return null;
      const { x, y, vx, vy } = ball;
      if (!finite(x) || !finite(y) || !finite(vx) || !finite(vy)) return null;
      const paddles = pair(payload.paddles);
      const score = pair(payload.score);
      const { servePause, rallyHits, winner } = payload;
      if (!paddles || !score || !finite(servePause) || !finite(rallyHits)) return null;
      if (winner !== null && !isSide(winner)) return null;
      return {
        kind,
        matchId,
        ball: { x, y, vx, vy },
        paddles,
        score,
        servePause,
        winner,
        rallyHits,
      };
    }
    default:
      return null;
  }
}

/**
 * A voice handshake step, rebuilt, or null.
 *
 * Expects what `isVoiceSignal` has already let through. An ICE candidate
 * keeps the four fields `RTCIceCandidate.toJSON` writes and only those, and
 * only where they are present: a candidate handed over with `sdpMid` and
 * `sdpMLineIndex` both null is one `addIceCandidate` refuses outright.
 */
export function relayableVoice(signal: VoiceSignal): VoiceSignal | null {
  switch (signal.kind) {
    case "hello":
    case "hi":
    case "bye":
      return { kind: signal.kind };
    case "offer":
    case "answer":
      return typeof signal.sdp === "string" && signal.sdp.length <= SDP_LIMIT
        ? { kind: signal.kind, sdp: signal.sdp }
        : null;
    case "ice": {
      const raw = signal.candidate;
      const line = raw.candidate;
      if (typeof line !== "string" || line.length > ICE_CANDIDATE_LIMIT) return null;
      const candidate: Record<string, unknown> = { candidate: line };
      const { sdpMid, sdpMLineIndex, usernameFragment } = raw;
      if (sdpMid === null || (typeof sdpMid === "string" && sdpMid.length <= ICE_FIELD_LIMIT)) {
        candidate.sdpMid = sdpMid;
      }
      if (
        sdpMLineIndex === null ||
        (Number.isInteger(sdpMLineIndex) && Number(sdpMLineIndex) >= 0)
      ) {
        candidate.sdpMLineIndex = sdpMLineIndex;
      }
      if (
        usernameFragment === null ||
        (typeof usernameFragment === "string" && usernameFragment.length <= ICE_FIELD_LIMIT)
      ) {
        candidate.usernameFragment = usernameFragment;
      }
      return { kind: "ice", candidate };
    }
    default:
      return null;
  }
}
