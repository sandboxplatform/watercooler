"use client";

import { useEffect, useSyncExternalStore } from "react";
import { voiceChat, type VoiceView } from "../voice/voice-chat";

const OFF: VoiceView = {
  status: "off",
  peers: 0,
  withMic: 0,
  online: 1,
  connecting: 0,
  failed: 0,
  silent: 0,
  speaking: false,
  reason: null,
};

// Written once rather than inline: a subscribe function that is new every
// render is one React unsubscribes and subscribes again on every render.
const subscribe = (listener: () => void) => voiceChat.subscribe(listener);
const snapshot = () => voiceChat.snapshot();
const offOnTheServer = () => OFF;

/** Keep voice chat listening to the room while mounted, and read its state. */
export function useVoice(): VoiceView {
  useEffect(() => voiceChat.attach(), []);
  return useSyncExternalStore(subscribe, snapshot, offOnTheServer);
}
