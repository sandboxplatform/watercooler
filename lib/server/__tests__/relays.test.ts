import { describe, expect, it } from "vitest";
import { ICE_CANDIDATE_LIMIT, relayablePong, relayableVoice } from "../relays";
import { SDP_LIMIT, type VoiceSignal } from "../../presence-types";

describe("a ping pong move on its way through", () => {
  it("keeps the fields its kind carries and nothing else", () => {
    expect(
      relayablePong({ kind: "paddle", matchId: "m-1", y: 40, extra: "x".repeat(9000) }),
    ).toEqual({
      kind: "paddle",
      matchId: "m-1",
      y: 40,
    });
    expect(relayablePong({ kind: "invite", matchId: "m-1", html: "<b>" })).toEqual({
      kind: "invite",
      matchId: "m-1",
    });
  });

  it("rebuilds a state frame whole, and refuses one with a hole in it", () => {
    const state = {
      kind: "state",
      matchId: "m-1",
      ball: { x: 1, y: 2, vx: 3, vy: 4, spin: 9 },
      paddles: { left: 5, right: 6 },
      score: { left: 0, right: 1 },
      servePause: 0,
      winner: null,
      rallyHits: 2,
    };
    expect(relayablePong(state)).toEqual({ ...state, ball: { x: 1, y: 2, vx: 3, vy: 4 } });
    expect(relayablePong({ ...state, ball: { x: 1, y: 2, vx: 3 } })).toBeNull();
    expect(relayablePong({ ...state, winner: "middle" })).toBeNull();
    expect(relayablePong({ ...state, rallyHits: Number.NaN })).toBeNull();
  });

  it("refuses what is not one of ours", () => {
    expect(relayablePong({ kind: "serve", matchId: "m-1" })).toBeNull();
    expect(relayablePong({ kind: "paddle", matchId: "m".repeat(65), y: 1 })).toBeNull();
    expect(relayablePong({ kind: "paddle", matchId: "m-1", y: "high" })).toBeNull();
    expect(relayablePong(null)).toBeNull();
  });
});

describe("a voice handshake step on its way through", () => {
  it("passes a greeting on as a bare greeting", () => {
    expect(relayableVoice({ kind: "hello", junk: 1 } as unknown as VoiceSignal)).toEqual({
      kind: "hello",
    });
  });

  it("keeps a session description only while it is a sensible size", () => {
    expect(relayableVoice({ kind: "offer", sdp: "v=0" })).toEqual({ kind: "offer", sdp: "v=0" });
    expect(relayableVoice({ kind: "answer", sdp: "x".repeat(SDP_LIMIT + 1) })).toBeNull();
  });

  it("keeps the four fields of a candidate, only where they are present", () => {
    const kept = {
      candidate: "candidate:1 1 udp 1 10.0.0.1 5000 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
      usernameFragment: "abcd",
    };
    const full = { ...kept, evil: { deep: true } };
    expect(relayableVoice({ kind: "ice", candidate: full })).toEqual({
      kind: "ice",
      candidate: kept,
    });
    expect(relayableVoice({ kind: "ice", candidate: { candidate: "c", sdpMid: "0" } })).toEqual({
      kind: "ice",
      candidate: { candidate: "c", sdpMid: "0" },
    });
  });

  it("refuses a candidate that is too long or has no line", () => {
    const long = "c".repeat(ICE_CANDIDATE_LIMIT + 1);
    expect(relayableVoice({ kind: "ice", candidate: { candidate: long } })).toBeNull();
    expect(relayableVoice({ kind: "ice", candidate: { sdpMid: "0" } })).toBeNull();
  });
});
