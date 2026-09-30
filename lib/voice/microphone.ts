/**
 * This browser's own microphone: asking for it, listening to it, letting go.
 *
 * Asking is the one slow step in the voice chat — a permission prompt sits
 * open for as long as somebody looks at it — so it is a function of its own
 * that hands back either a stream or the sentence saying why there is none,
 * and the caller decides whether the answer is still wanted.
 */

import { createLogger } from "../logger";
import { refusalReason, unsupportedReason, type MicError } from "./refusal";

const log = createLogger("Voice");

/** How long to wait on the permission lookup before explaining without it. */
const PERMISSION_WAIT_MS = 1_000;

/**
 * What the browser says this site may do with a microphone, where it will
 * say. Firefox throws on the name, and a web view may not answer at all —
 * which is why it is raced: a lookup that never settles would leave the
 * pill saying "Asking for the microphone…" over a refusal already made.
 */
async function microphonePermission(): Promise<PermissionState | null> {
  try {
    const query = navigator.permissions?.query({ name: "microphone" as PermissionName });
    if (!query) return null;
    const status = await Promise.race([
      query,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), PERMISSION_WAIT_MS)),
    ]);
    return status?.state ?? null;
  } catch {
    return null;
  }
}

/** Why this browser cannot have a microphone at all, or null if it can ask. */
export function cannotAsk(): string | null {
  return unsupportedReason({
    secure: typeof window === "undefined" || window.isSecureContext !== false,
    hasApi: typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
  });
}

/** The stream, or the sentence saying why there is none. */
export async function askForMicrophone(): Promise<{ stream: MediaStream } | { refused: string }> {
  const askedAt = Date.now();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    return { stream };
  } catch (err) {
    // Timed before the permission is looked up, which is its own await.
    const elapsedMs = Date.now() - askedAt;
    const refused = refusalReason(err as MicError, {
      permission: await microphonePermission(),
      elapsedMs,
    });
    log.warn(`${refused} (${(err as Error)?.name}: ${(err as Error)?.message}, ${elapsedMs}ms)`);
    return { refused };
  }
}

/**
 * A microphone that was given: its stream, and the analyser listening to it.
 *
 * The source node is kept, which is the point of this being a class. It was
 * made and connected and never held, so nothing could disconnect it, and
 * every time a microphone went off and on again another source and analyser
 * were left in the graph reading a stream that had stopped.
 */
export class LocalMicrophone {
  readonly analyser: AnalyserNode;
  private readonly source: MediaStreamAudioSourceNode;

  /**
   * `onLost` is for a device taken away after it was given: the OS hands it
   * to another app, or somebody unplugs it. Nothing downstream would ever
   * notice — the pill stays green, every connection stays up, and the person
   * goes on believing they are in the conversation while sending silence at
   * it. A track's `ended` is the only warning a browser gives.
   */
  constructor(
    readonly stream: MediaStream,
    context: AudioContext,
    onLost: () => void,
  ) {
    for (const track of stream.getTracks()) track.onended = onLost;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.source = context.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
  }

  tracks(): MediaStreamTrack[] {
    return this.stream.getTracks();
  }

  /** Stop the device and take this out of the audio graph. */
  release() {
    for (const track of this.stream.getTracks()) track.stop();
    this.source.disconnect();
  }
}
