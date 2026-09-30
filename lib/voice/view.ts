/**
 * What the voice chat shows, and who is told when it changes.
 *
 * The HUD reads it through `useVoice` as an external store; the scene reads
 * the one part of it that is about this browser's own character off the bus,
 * because the game layer holds no React.
 */

import { gameEvents } from "../events";

export type VoiceStatus = "off" | "requesting" | "on" | "denied" | "unsupported";

/** What the HUD shows. */
export interface VoiceView {
  status: VoiceStatus;
  /** People whose voice is connected. */
  peers: number;
  /** People on the server with a microphone on, counting this browser's. */
  withMic: number;
  /** People on the server, counting this browser's. */
  online: number;
  /** People still being connected to. */
  connecting: number;
  /** People in the chat this browser has given up reaching, as things stand. */
  failed: number;
  /** People connected whose audio this browser is not actually playing. */
  silent: number;
  /** Whether this browser's own microphone is picking up speech. */
  speaking: boolean;
  /** Why the microphone could not be used, when it could not. */
  reason: string | null;
}

export class VoiceStore {
  private view: VoiceView = {
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
  private listeners = new Set<() => void>();

  snapshot(): VoiceView {
    return this.view;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(patch: Partial<VoiceView>) {
    const before = this.view;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
    // The scene hangs a mark over this browser's own character and holds no
    // React, so the bus is where the two layers meet. Only on a change: the
    // level is polled several times a second and most polls say nothing new.
    const was = before.status === "on";
    const now = this.view.status === "on";
    if (was !== now || before.speaking !== this.view.speaking) {
      gameEvents.emit("voice-self", now, this.view.speaking);
    }
  }

  /** Publish only the fields that differ, so a poll that finds nothing new says nothing. */
  update(patch: Partial<VoiceView>) {
    const keys = Object.keys(patch) as (keyof VoiceView)[];
    if (keys.some((key) => patch[key] !== this.view[key])) this.publish(patch);
  }
}
