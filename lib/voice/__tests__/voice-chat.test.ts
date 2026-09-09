/**
 * Switching the microphone off while the browser is still asking for it.
 *
 * The one step in here that takes real time is `getUserMedia`, and the
 * permission prompt sits open for as long as the person looks at it. Anything
 * that happens in that window has to be honoured, because the thing being
 * decided is whether a live microphone starts sending audio to the room.
 *
 * The bug this holds down: `disable` could do nothing about a stream that did
 * not exist yet, and `enable` never re-read its own status across the await —
 * so cancelling mid-prompt left the HUD saying "off" over a microphone that
 * was on, greeted and streaming.
 *
 * Stubbed to the bone. The point is the ordering, not WebRTC.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../room-socket", () => ({
  onRoomMessage: () => () => {},
  sendRoom: vi.fn(() => true),
}));
vi.mock("../../presence-online", () => ({
  onlinePeople: () => [],
  subscribeOnline: () => () => {},
}));
vi.mock("../../presence-self", () => ({ getSelfId: () => "me" }));
vi.mock("../remember", () => ({ rememberVoice: vi.fn(), voiceWasOn: () => false }));

/** A track that remembers whether anybody stopped it. */
function fakeStream() {
  const track = { stop: vi.fn(), kind: "audio" };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
}

/** Hand out streams on demand, so a test can hold the prompt open. */
let pending: ((stream: MediaStream) => void) | null = null;
let rejectWith: ((err: Error) => void) | null = null;

beforeEach(() => {
  vi.resetModules();
  pending = null;
  rejectWith = null;
  // `navigator` is getter-only on node's global, so it has to be stubbed
  // rather than assigned.
  vi.stubGlobal("RTCPeerConnection", class {});
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      resume() {}
      createAnalyser() {
        return { fftSize: 1024, connect() {}, getFloatTimeDomainData() {} };
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
    },
  );
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: () =>
        new Promise<MediaStream>((resolve, reject) => {
          pending = resolve;
          rejectWith = reject;
        }),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the microphone, switched off while it is being asked for", () => {
  it("stops the stream that arrives and stays off", async () => {
    const { voiceChat } = await import("../voice-chat");
    const { stream, track } = fakeStream();

    const enabling = voiceChat.enable();
    expect(voiceChat.snapshot().status).toBe("requesting");

    // The person changes their mind while the prompt is still up.
    await voiceChat.disable();
    expect(voiceChat.snapshot().status).toBe("off");

    // ...and only then do they grant permission.
    pending!(stream);
    await enabling;

    expect(voiceChat.snapshot().status).toBe("off");
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite off with a refusal that arrives too late", async () => {
    const { voiceChat } = await import("../voice-chat");

    const enabling = voiceChat.enable();
    await voiceChat.disable();

    const denied = new Error("no");
    denied.name = "NotAllowedError";
    rejectWith!(denied);
    await enabling;

    expect(voiceChat.snapshot().status).toBe("off");
    expect(voiceChat.snapshot().reason).toBeNull();
  });

  it("still comes on when nobody cancels", async () => {
    vi.useFakeTimers();
    const { voiceChat } = await import("../voice-chat");
    const { stream, track } = fakeStream();

    const enabling = voiceChat.enable();
    pending!(stream);
    await enabling;

    expect(voiceChat.snapshot().status).toBe("on");
    expect(track.stop).not.toHaveBeenCalled();

    await voiceChat.disable();
    expect(voiceChat.snapshot().status).toBe("off");
    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});
