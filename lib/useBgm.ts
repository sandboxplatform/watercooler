"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { DEFAULT_BGM_VOLUME } from "@/lib/constants";
import { loadBgmVolume, saveBgmVolume } from "@/lib/persistence";

const BGM_SRC = "/audio/bgm.mp3";

function clampVolume(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_BGM_VOLUME;
  return Math.min(1, Math.max(0, value));
}

let sharedAudio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio(BGM_SRC);
    sharedAudio.loop = true;
    sharedAudio.preload = "auto";
  }
  return sharedAudio;
}

/**
 * Whether a game has the music stepped aside for its own song.
 *
 * Kept so the unlock below does not start the room's music over a game's:
 * the first key somebody presses may well be the E that opened the game.
 */
let steppedAside = false;

/** Step the room's music aside for a game's own song. */
export function pauseBgm() {
  steppedAside = true;
  sharedAudio?.pause();
}

/** Bring it back, if the person had it on. */
export function resumeBgm() {
  steppedAside = false;
  if (!sharedAudio || readStoredVolume() <= 0) return;
  sharedAudio.play().catch(() => {});
}

export interface BgmState {
  volume: number;
  setVolume: (percent: number) => void;
}

// ── Volume store ───────────────────────────────────────
// A module-level store keeps the persisted volume out of the render body so it
// can be read hydration-safely via useSyncExternalStore.

let storedVolume: number | null = null;
const volumeListeners = new Set<() => void>();

function readStoredVolume(): number {
  if (storedVolume === null) storedVolume = clampVolume(loadBgmVolume());
  return storedVolume;
}

function getServerVolume(): number {
  return DEFAULT_BGM_VOLUME;
}

function writeStoredVolume(value: number) {
  storedVolume = value;
  saveBgmVolume(value);
  for (const listener of volumeListeners) listener();
}

function subscribeVolume(listener: () => void): () => void {
  volumeListeners.add(listener);
  return () => {
    volumeListeners.delete(listener);
  };
}

/**
 * Start the music, and keep trying until the browser lets it.
 *
 * Mounted once, somewhere that is always on screen. It used to live inside
 * `useBgm`, whose only caller is the footer of the People column — which is
 * not mounted while the column is shut, so the music did not start until
 * somebody opened it, and a session spent with the column away was silent.
 *
 * A browser refuses `play()` before the page has had a gesture, so the
 * first try usually fails and the first press or tap is what starts it.
 */
export function useBgmPlayback(): void {
  useEffect(() => {
    // Read the store directly: this runs during hydration, when the hook's
    // snapshot is still the server's rather than the saved setting.
    const stored = readStoredVolume();
    const audio = getAudio();
    audio.volume = stored;
    // Off is off: turning it up later plays it from the slider, which is a
    // gesture of its own.
    if (stored <= 0) return;

    let listening = true;
    const stop = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    const tryPlay = () => {
      // Playing already — the slider started it — is as good as unlocked.
      if (!audio.paused) return stop();
      if (steppedAside || readStoredVolume() <= 0) return;
      audio.play().then(stop, () => {});
    };
    function unlock() {
      tryPlay();
    }

    tryPlay();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return stop;
  }, []);
}

/** The volume, and a way to set it. The music itself is `useBgmPlayback`'s. */
export function useBgm(): BgmState {
  // The persisted volume lives in localStorage, which does not exist during
  // SSR. Reading it in the render body would make the client's first paint
  // disagree with the server's (a muted user gets a different music icon),
  // which React reports as a hydration mismatch. useSyncExternalStore renders
  // the server snapshot during hydration and swaps to the stored value after.
  const volume = useSyncExternalStore(subscribeVolume, readStoredVolume, getServerVolume);

  const changeVolume = useCallback((percent: number) => {
    const v = clampVolume(percent / 100);
    writeStoredVolume(v);
    const audio = getAudio();
    audio.volume = v;
    if (v > 0 && audio.paused && !steppedAside) {
      audio.play().catch(() => {});
    }
  }, []);

  return { volume, setVolume: changeVolume };
}
