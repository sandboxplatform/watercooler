/**
 * Somebody else's voice coming out of this browser, and who is talking.
 *
 * An `Audio` element does the playing, because it needs no audio context and
 * a browser may keep one suspended; the context only listens, to see when a
 * voice is loud enough to be speech.
 */

/** Louder than this, as RMS of the signal, counts as talking. */
export const SPEAKING_RMS = 0.02;
export const LEVEL_POLL_MS = 120;

/** Reads an analyser's level. One buffer, reused for every read. */
export class Meter {
  private levels = new Float32Array(1024);

  speaking(analyser: AnalyserNode): boolean {
    return this.loudness(analyser) > SPEAKING_RMS;
  }

  private loudness(analyser: AnalyserNode): number {
    analyser.getFloatTimeDomainData(this.levels);
    let sum = 0;
    for (let i = 0; i < analyser.fftSize; i++) sum += this.levels[i] * this.levels[i];
    return Math.sqrt(sum / analyser.fftSize);
  }
}

/** One person's voice: what plays it, what measures it, and whether either is working. */
export class Hearing {
  /** Keeps Chrome decoding the stream; Web Audio does the measuring. */
  sink: HTMLAudioElement | null = null;
  analyser: AnalyserNode | null = null;
  /** Whether their audio is actually coming out of this browser. */
  playing = true;
  speaking = false;
  private source: MediaStreamAudioSourceNode | null = null;

  /**
   * Their voice arrives: play it.
   *
   * `refused` is for a browser that will not start playback — the one
   * failure on this side of the connection that looks exactly like success
   * from every angle the app had: the peer is up, the mark over their head
   * goes green as they talk, and nothing comes out.
   */
  start(stream: MediaStream, context: AudioContext | null, refused: (err: Error) => void) {
    // A second track on this connection, or one renegotiated: whatever was
    // playing is not this stream, and leaving it attached leaves a node in
    // the graph reading a source that has gone.
    this.stop();
    const sink = new Audio();
    sink.srcObject = stream;
    sink.autoplay = true;
    sink.volume = 1;
    this.sink = sink;
    this.playing = true;
    void sink.play().catch((err: Error) => {
      this.playing = false;
      refused(err);
    });
    if (context) {
      if (context.state === "suspended") void context.resume();
      this.source = context.createMediaStreamSource(stream);
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.source.connect(this.analyser);
    }
  }

  /** A sink that never started playing, asked again. True if it plays now. */
  retry(): Promise<boolean> | null {
    if (this.playing || !this.sink) return null;
    return this.sink.play().then(
      () => (this.playing = true),
      () => false,
    );
  }

  stop() {
    this.source?.disconnect();
    if (this.sink) this.sink.srcObject = null;
  }
}
