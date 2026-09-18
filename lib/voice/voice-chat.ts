"use client";

/**
 * One voice chat for the whole server.
 *
 * Audio goes browser to browser over WebRTC; the room socket carries only
 * the handshake, and the server never hears a thing. Switching a microphone
 * on joins the one conversation everybody on the server is in — a mesh,
 * which is fine while the cast is small — and everyone in it is heard in
 * full, wherever in the world they are standing.
 *
 * It used to be one conversation per room, each voice turned down by how
 * far away its owner stood. Distance is the wrong measure once the chat
 * spans rooms: a floor above has coordinates of its own, so the same
 * numbers mean something different in every place, and a person you can
 * hear at all is a person you should hear properly. The fade is gone with
 * it; `proximity.ts` says what it was, for whenever it comes back.
 *
 * Who is on the server, rather than who is in this room, is `presence-online`:
 * the same list the People panel shows, which the server sends to everybody
 * whenever anyone arrives, leaves or walks somewhere else.
 *
 * One instance per browser. It listens to the room socket for as long as
 * the HUD is mounted, and does nothing at all until the microphone is
 * switched on.
 */

import { gameEvents } from "../events";
import { createLogger } from "../logger";
import { onRoomMessage, sendRoom } from "../room-socket";
import { onlinePeople, subscribeOnline } from "../presence-online";
import { getSelfId } from "../presence-self";
import type { OnlinePerson, VoiceSignal } from "../presence-types";
import { STUN_URL, TURN_URL } from "./ice";
import { offers } from "./proximity";
import { rememberVoice, voiceWasOn } from "./remember";

const log = createLogger("Voice");

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
  /** People the connection could not be made to at all — usually a network that needs a relay. */
  failed: number;
  /** Whether this browser's own microphone is picking up speech. */
  speaking: boolean;
  /** Why the microphone could not be used, when it could not. */
  reason: string | null;
}

/**
 * Voice in the wild: STUN to find a route, and a TURN relay if one is given.
 *
 * The addresses come from `./ice`, which `next.config.ts` reads too — the
 * Content-Security-Policy has to name every one of them or the browser drops
 * it without saying so.
 */
function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: STUN_URL }];
  if (TURN_URL) {
    servers.push({
      urls: TURN_URL,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

/** Louder than this, as RMS of the signal, counts as talking. */
const SPEAKING_RMS = 0.02;
const LEVEL_POLL_MS = 120;

/**
 * How long a connection may sit unfinished before it is started again.
 *
 * Long enough for a slow network to finish the ICE exchange, short enough
 * that a handshake nobody is going to answer is not mistaken for one in
 * progress. `disconnected` is inside it too: WebRTC drops through that
 * state on an ordinary hiccup and usually comes back on its own.
 */
const NEGOTIATE_GRACE_MS = 8_000;

/** The least time between two hellos to the same person. */
const GREET_RETRY_MS = 5_000;

/** The most, once it is clear the two networks cannot reach each other. */
const GREET_MAX_MS = 60_000;

/** How often the connections are looked over while the microphone is on. */
const SWEEP_MS = 4_000;

/**
 * How long to leave it before saying hello again, after so many tries.
 *
 * Two people whose networks have no route between them — no relay, and a
 * NAT that will not be traversed — never connect however often they are
 * introduced, and a hello every five seconds for the length of a session
 * is noise on the socket for nothing. It backs off to a minute and stays
 * there, so the retry still happens the moment the network allows it.
 */
function backoff(tries: number): number {
  return Math.min(GREET_RETRY_MS * 2 ** Math.min(tries, 4), GREET_MAX_MS);
}

interface Peer {
  pc: RTCPeerConnection;
  /** Keeps Chrome decoding the stream; Web Audio does the actual playing. */
  sink: HTMLAudioElement | null;
  source: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
  /** ICE that arrived before the remote description did. */
  earlyIce: RTCIceCandidateInit[];
  speaking: boolean;
  /** Negotiation, one step at a time: two at once wedge the connection. */
  work: Promise<void>;
  /** When the connection last changed state, for telling stalled from slow. */
  changedAt: number;
}

/** When somebody was last said hello to, and how many times running. */
interface Greeting {
  at: number;
  tries: number;
}

class VoiceChat {
  private view: VoiceView = {
    status: "off",
    peers: 0,
    withMic: 0,
    online: 1,
    connecting: 0,
    failed: 0,
    speaking: false,
    reason: null,
  };
  private listeners = new Set<() => void>();
  private local: MediaStream | null = null;
  private context: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private peers = new Map<string, Peer>();
  private unsubs: (() => void)[] = [];
  private attached = 0;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  /** Connections that failed outright since the microphone came on. */
  private failedPeers = 0;
  /**
   * Whom this browser has said hello to, when, and how often running.
   *
   * It was a plain set, which made it a gate rather than a record: greeting
   * somebody put them in it for good, so a handshake that failed was never
   * tried again. With the time in it the sweep can retry, and back off.
   */
  private greetedAt = new Map<string, Greeting>();
  /** Looks the connections over while the microphone is on. */
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private levels = new Float32Array(1024);
  /**
   * Which switching-on this is, so one that was called off can tell.
   *
   * Asking for the microphone is the one slow step here, and the browser's
   * permission prompt can sit there for as long as the person looks at it.
   * Every way of switching off bumps this, and `enable` compares it across
   * the await: an answer that arrives for a switching-on nobody wants any
   * more is thrown away rather than acted on.
   */
  private turn = 0;

  // ── For the HUD ────────────────────────────────────────

  snapshot(): VoiceView {
    return this.view;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(patch: Partial<VoiceView>) {
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

  // ── Lifecycle ──────────────────────────────────────────

  /** Listen to the room while the HUD is mounted. Reference counted. */
  attach(): () => void {
    this.attached += 1;
    if (this.attached === 1) {
      this.unsubs = [
        onRoomMessage((message) => {
          if (message.type === "voice") void this.handle(message.from.id, message.signal);
          // A "left" is somebody leaving *this room* — most often for the
          // room next door, on the same socket and the same connection.
          // Ending their voice on it was right while the chat was the
          // room's; now it would cut a conversation off at every lift ride,
          // for no better reason than that they walked upstairs. Who has
          // actually gone is the server's own list, below.
          else if (message.type === "welcome") {
            // A new room, or a reconnection: it does not know the microphone
            // is on until told. Who to say hello to again is the sweep's
            // question, not this one — it used to forget everybody here,
            // which re-greeted people already being heard perfectly well.
            if (this.view.status === "on") sendRoom({ type: "mic", on: true });
            this.sweep();
          }
        }),
        // Who is on the server, not who is in this room: someone switching
        // their microphone on two floors up is somebody to say hello to.
        subscribeOnline(() => this.sweep()),
      ];
      // The microphone was on when the last page was left: on again here.
      if (voiceWasOn() && this.view.status === "off") void this.enable();
    }
    return () => {
      this.attached = Math.max(0, this.attached - 1);
      if (this.attached === 0) {
        for (const unsub of this.unsubs) unsub();
        this.unsubs = [];
        // The page is going, not the person's choice: keep it remembered.
        void this.disable({ forget: false });
      }
    };
  }

  async toggle() {
    if (this.view.status === "on" || this.view.status === "requesting") await this.disable();
    else await this.enable();
  }

  /**
   * Switch the microphone on. It is remembered for this tab, so it comes
   * back after walking through a door — unless it is a hold-to-talk press,
   * which lasts only as long as the button.
   */
  async enable({ remember = true }: { remember?: boolean } = {}) {
    if (this.view.status === "on" || this.view.status === "requesting") return;
    if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      this.publish({ status: "unsupported", reason: "This browser cannot do voice chat." });
      return;
    }
    this.publish({ status: "requesting", reason: null });
    const turn = ++this.turn;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      const name = (err as Error)?.name;
      const reason =
        name === "NotAllowedError"
          ? "Microphone access was refused. Allow it in the browser and try again."
          : name === "NotFoundError"
            ? "No microphone was found."
            : `The microphone could not be opened: ${(err as Error)?.message ?? err}`;
      log.warn(reason);
      // Only if this is still the switching-on in progress: a refusal that
      // arrives after the person already gave up must not overwrite "off"
      // with a red error they did not ask to see.
      if (turn === this.turn) this.publish({ status: "denied", reason });
      return;
    }

    /**
     * Switched off while the permission prompt was up.
     *
     * `disable` could do nothing about a stream that did not exist yet — it
     * stopped no tracks, because `this.local` was still null — and this side
     * went on to publish "on", greet every peer and start sending audio. The
     * HUD said off, the person believed off, and the microphone was live.
     * So the stream is stopped here instead, by whoever actually has it.
     */
    if (turn !== this.turn) {
      log.info("microphone was switched off while it was being asked for");
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.local = stream;

    // A click got us here, so the context may start; if it was made
    // earlier and suspended, wake it.
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
    this.localAnalyser = this.context.createAnalyser();
    this.localAnalyser.fftSize = 1024;
    this.context.createMediaStreamSource(this.local).connect(this.localAnalyser);
    this.levelTimer = setInterval(() => this.pollLevels(), LEVEL_POLL_MS);
    this.failedPeers = 0;
    this.publish({ status: "on" });
    if (remember) rememberVoice(true);
    log.info("microphone on");
    // The room counts who is on voice; then tell everyone here, and
    // those with a microphone on will answer.
    sendRoom({ type: "mic", on: true });
    // Everybody, whatever the server last said about their microphone: this
    // is the announcement, and somebody whose flag has not reached us yet
    // still needs telling. The sweep is the retry and is choosier.
    const now = Date.now();
    for (const player of this.everyoneElse()) {
      this.greetedAt.set(player.id, { at: now, tries: 1 });
      this.send(player.id, { kind: "hello" });
    }
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_MS);
    this.census();
  }

  async disable({ forget = true }: { forget?: boolean } = {}) {
    if (forget) rememberVoice(false);
    // Before the early return, so switching off always calls off whatever
    // switching-on is in flight — even when the view already reads "off".
    this.turn += 1;
    if (this.view.status === "off") return;
    for (const player of this.everyoneElse()) this.send(player.id, { kind: "bye" });
    for (const id of [...this.peers.keys()]) this.drop(id);
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.levelTimer = null;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    this.local?.getTracks().forEach((track) => track.stop());
    this.local = null;
    this.localAnalyser = null;
    sendRoom({ type: "mic", on: false });
    this.greetedAt.clear();
    this.publish({
      status: "off",
      peers: 0,
      connecting: 0,
      failed: 0,
      speaking: false,
    });
    this.census();
    log.info("microphone off");
  }

  // ── The handshake ──────────────────────────────────────

  /**
   * Everybody else on the server. The list the server sends already leaves
   * the residents out — they have no microphone and nothing to say into one.
   */
  private everyoneElse(): OnlinePerson[] {
    const me = getSelfId();
    // Before the welcome frame there is no telling ourselves from anybody
    // else, and the list would otherwise have this browser in it — greeting
    // itself, and counting one person too many on the pill. The sweep runs
    // again on the `online` that follows every welcome, so nothing is lost.
    if (!me) return [];
    return onlinePeople().filter((p) => p.id !== me);
  }

  private send(to: string, signal: VoiceSignal) {
    sendRoom({ type: "voice", to, signal });
  }

  private async handle(from: string, signal: VoiceSignal) {
    if (this.view.status !== "on") return;
    const me = getSelfId();
    if (!me) return;
    switch (signal.kind) {
      /**
       * They have just switched on, or given up on us and started again.
       * Either way what they were holding is gone, so whatever we hold for
       * them is half a connection: throw it away and begin.
       *
       * It used to be ignored outright when a connection to them already
       * existed, which is what made one lost handshake permanent. Every way
       * of dropping a peer is one-sided — a `failed` is noticed by whichever
       * side noticed it — so the side that dropped said hello and the side
       * that had not said nothing at all, for the rest of the session.
       */
      case "hello":
        this.drop(from);
        this.send(from, { kind: "hi" });
        if (offers(me, from)) await this.offerTo(from);
        return;
      // The answer to ours. Deliberately not a second `hello`: that would be
      // answered in turn, and two sides that each start again on one never
      // finish starting again.
      case "hi":
        // A connection already under way is the offer this would make.
        if (this.peers.has(from)) return;
        if (offers(me, from)) await this.offerTo(from);
        return;
      case "bye":
        this.drop(from);
        return;
      case "offer": {
        const peer = this.peer(from);
        await this.negotiate(from, peer, async () => {
          // Both sides offered. Only the lower id does, so this is two
          // restarts crossing rather than the ordinary case — give way,
          // since ours is about to be answered in any event. Without the
          // rollback this throws, and a throw here leaves the connection
          // half-described with nothing to notice it.
          if (peer.pc.signalingState === "have-local-offer") {
            await peer.pc.setLocalDescription({ type: "rollback" });
          }
          await peer.pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
          await this.flushIce(peer);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          this.send(from, { kind: "answer", sdp: answer.sdp ?? "" });
        });
        return;
      }
      case "answer": {
        const peer = this.peers.get(from);
        if (!peer) return;
        await this.negotiate(from, peer, async () => {
          // An answer to an offer that has since been superseded. Taking it
          // throws, and the connection it would wedge is the live one.
          if (peer.pc.signalingState !== "have-local-offer") return;
          await peer.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
          await this.flushIce(peer);
        });
        return;
      }
      case "ice": {
        const peer = this.peers.get(from);
        if (!peer) return;
        const candidate = signal.candidate as RTCIceCandidateInit;
        await this.negotiate(from, peer, async () => {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(candidate).catch(() => {});
          else peer.earlyIce.push(candidate);
        });
        return;
      }
    }
  }

  /**
   * One step at a time, per connection, and never thrown away.
   *
   * Signals were handled as they arrived, which with two greetings crossing
   * means two negotiations on one `RTCPeerConnection` at once: the second
   * throws `InvalidStateError`, the throw lands in a promise nobody holds,
   * and the connection is left half-described for the rest of the session.
   * Queued, and a failure is logged rather than lost.
   */
  private negotiate(id: string, peer: Peer, step: () => Promise<void>): Promise<void> {
    const next = peer.work
      .then(() => {
        // Dropped while this waited its turn: every one of these throws on
        // a closed connection, and the result is not wanted in any case.
        if (this.peers.get(id) !== peer) return;
        return step();
      })
      .catch((err: Error) => log.warn(`voice handshake with ${id} failed:`, err.message));
    peer.work = next;
    return next;
  }

  private async flushIce(peer: Peer) {
    for (const candidate of peer.earlyIce) await peer.pc.addIceCandidate(candidate).catch(() => {});
    peer.earlyIce = [];
  }

  private async offerTo(id: string) {
    const peer = this.peer(id);
    await this.negotiate(id, peer, async () => {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.send(id, { kind: "offer", sdp: offer.sdp ?? "" });
    });
  }

  /** The connection to one person, made on first use. */
  private peer(id: string): Peer {
    const existing = this.peers.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const peer: Peer = {
      pc,
      sink: null,
      source: null,
      analyser: null,
      earlyIce: [],
      speaking: false,
      work: Promise.resolve(),
      changedAt: Date.now(),
    };
    this.peers.set(id, peer);
    for (const track of this.local?.getTracks() ?? []) pc.addTrack(track, this.local!);
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send(id, { kind: "ice", candidate: { ...event.candidate.toJSON() } });
      }
    };
    pc.ontrack = (event) => this.hear(id, peer, event.streams[0] ?? new MediaStream([event.track]));
    pc.onconnectionstatechange = () => {
      peer.changedAt = Date.now();
      if (pc.connectionState === "failed") {
        // No route between the two networks *this time*: the HUD says so,
        // since the fix — a TURN relay — is not something a person can do
        // mid-chat. The sweep tries again, more slowly each time.
        this.failedPeers += 1;
        log.warn(`voice could not connect to ${id}; a relay (TURN) may be needed`);
        this.drop(id);
      } else if (pc.connectionState === "closed") this.drop(id);
      else if (pc.connectionState === "connected") {
        // It worked, so the next thing to go wrong is worth trying hard at.
        const greeting = this.greetedAt.get(id);
        if (greeting) greeting.tries = 0;
        log.info(`voice connected to ${id}`);
      }
      this.count();
    };
    return peer;
  }

  /** Their voice arrives: play it. */
  private hear(id: string, peer: Peer, stream: MediaStream) {
    // A second track on this connection, or one renegotiated: whatever was
    // playing is not this stream, and leaving it attached leaves a node in
    // the graph reading a source that has gone.
    peer.source?.disconnect();
    if (peer.sink) peer.sink.srcObject = null;
    // The element is what plays, and it needs no audio context, which a
    // browser may keep suspended. The context only listens, to see when
    // they are talking.
    const sink = new Audio();
    sink.srcObject = stream;
    sink.autoplay = true;
    sink.volume = 1;
    void sink.play().catch((err: Error) => log.warn(`could not play ${id}:`, err.message));
    peer.sink = sink;
    if (this.context) {
      if (this.context.state === "suspended") void this.context.resume();
      peer.source = this.context.createMediaStreamSource(stream);
      peer.analyser = this.context.createAnalyser();
      peer.analyser.fftSize = 1024;
      peer.source.connect(peer.analyser);
    }
    this.count();
    log.info(`hearing ${id}`);
  }

  private drop(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    if (peer.speaking) gameEvents.emit("voice-speaking", id, false);
    peer.source?.disconnect();
    if (peer.sink) peer.sink.srcObject = null;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    this.count();
  }

  /**
   * Look the connections over: forget anyone gone from the server, and say
   * hello again to anyone we ought to be able to hear and cannot.
   *
   * This is the retry, and until it existed there was none — a handshake
   * that did not complete stayed uncompleted until somebody switched their
   * microphone off and on. Run on a timer while the microphone is on, on
   * every change to the server's list, and on arriving in a new room.
   */
  private sweep() {
    this.census();
    if (this.view.status !== "on") return;
    const others = this.everyoneElse();
    const online = new Set(others.map((p) => p.id));
    for (const id of [...this.peers.keys()]) if (!online.has(id)) this.drop(id);
    for (const id of [...this.greetedAt.keys()]) if (!online.has(id)) this.greetedAt.delete(id);

    const now = Date.now();
    for (const person of others) {
      // Somebody with their microphone off has nothing to answer with, and
      // when they switch it on theirs is the hello that starts this.
      if (!person.mic) continue;
      if (this.settled(this.peers.get(person.id), now)) continue;
      const greeting = this.greetedAt.get(person.id) ?? { at: 0, tries: 0 };
      if (now - greeting.at < backoff(greeting.tries)) continue;
      this.greetedAt.set(person.id, { at: now, tries: greeting.tries + 1 });
      // A hello tells them to throw away what they hold for us; ours has to
      // go the same way, or their offer arrives at a connection that has
      // already moved on and is refused by its own state.
      this.drop(person.id);
      this.send(person.id, { kind: "hello" });
    }
    this.count();
  }

  /** Connected, or on the way there and not yet out of time. */
  private settled(peer: Peer | undefined, now: number): boolean {
    if (!peer) return false;
    const state = peer.pc.connectionState;
    if (state === "connected") return true;
    // `disconnected` is in here on purpose: WebRTC passes through it on an
    // ordinary hiccup and usually comes back without being asked. What it
    // must not do is stay there, which is what the grace period decides.
    if (state === "new" || state === "connecting" || state === "disconnected") {
      return now - peer.changedAt < NEGOTIATE_GRACE_MS;
    }
    return false;
  }

  /** How many are on the server, and how many of them are on voice — this browser included. */
  private census() {
    const others = this.everyoneElse();
    const on = this.view.status === "on";
    const patch = {
      online: others.length + 1,
      withMic: others.filter((p) => p.mic).length + (on ? 1 : 0),
    };
    if (patch.online !== this.view.online || patch.withMic !== this.view.withMic) {
      this.publish(patch);
    }
  }

  private count() {
    const all = [...this.peers.values()];
    const connected = all.filter((p) => p.pc.connectionState === "connected");
    const patch = {
      peers: connected.length,
      // `disconnected` belongs with these rather than with nothing: it is a
      // connection that may well come back, and the sweep restarts it if it
      // does not. Left out, the pill read "0" over audio still flowing.
      connecting: all.filter((p) =>
        ["new", "connecting", "disconnected"].includes(p.pc.connectionState),
      ).length,
      failed: this.failedPeers,
    };
    if (
      patch.peers !== this.view.peers ||
      patch.connecting !== this.view.connecting ||
      patch.failed !== this.view.failed
    ) {
      this.publish(patch);
    }
  }

  // ── Who is talking ─────────────────────────────────────

  private loudness(analyser: AnalyserNode): number {
    analyser.getFloatTimeDomainData(this.levels);
    let sum = 0;
    for (let i = 0; i < analyser.fftSize; i++) sum += this.levels[i] * this.levels[i];
    return Math.sqrt(sum / analyser.fftSize);
  }

  private pollLevels() {
    if (this.localAnalyser) {
      const speaking = this.loudness(this.localAnalyser) > SPEAKING_RMS;
      if (speaking !== this.view.speaking) this.publish({ speaking });
    }
    for (const [id, peer] of this.peers) {
      if (!peer.analyser) continue;
      const speaking = this.loudness(peer.analyser) > SPEAKING_RMS;
      if (speaking !== peer.speaking) {
        peer.speaking = speaking;
        gameEvents.emit("voice-speaking", id, speaking);
      }
    }
  }
}

export const voiceChat = new VoiceChat();
