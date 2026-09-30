/**
 * The connections to everybody else in the chat, and the handshake that makes them.
 *
 * One `RTCPeerConnection` per person, made on first use and dropped the
 * moment anything says to start again. What to do about a connection that
 * is not working is not decided here — that is `sweep.ts` — only how.
 */

import { gameEvents } from "../events";
import { createLogger } from "../logger";
import type { VoiceSignal } from "../presence-types";
import { STUN_URL, TURN_URL } from "./ice";
import { offers } from "./offers";
import { Hearing, type Meter } from "./playback";
import type { PeerFacts } from "./sweep";

const log = createLogger("Voice");

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

interface Peer {
  pc: RTCPeerConnection;
  audio: Hearing;
  /** ICE that arrived before the remote description did. */
  earlyIce: RTCIceCandidateInit[];
  /** Negotiation, one step at a time: two at once wedge the connection. */
  work: Promise<void>;
  /** When the connection last changed state, for telling stalled from slow. */
  changedAt: number;
  /**
   * When ICE was last restarted on this connection, 0 for never.
   *
   * One restart per connection, cleared when it connects — see `mendable`.
   */
  restartedAt: number;
  /** Whether this connection has ever been up. See `mendable`. */
  everConnected: boolean;
}

/** What the connections need from the rest of the voice chat. */
export interface PeerHost {
  send(to: string, signal: VoiceSignal): void;
  /** The microphone's stream, whose tracks every new connection carries. */
  local(): MediaStream | null;
  context(): AudioContext | null;
  /** Something about the connections changed: count them again. */
  changed(): void;
  /** The route to somebody failed. */
  failed(id: string): void;
  /** A connection came up. */
  connected(id: string): void;
}

export class Peers {
  private peers = new Map<string, Peer>();

  constructor(private readonly host: PeerHost) {}

  has(id: string): boolean {
    return this.peers.has(id);
  }

  ids(): string[] {
    return [...this.peers.keys()];
  }

  /** The facts the sweep plans from, one entry per connection. */
  facts(): Map<string, PeerFacts> {
    const out = new Map<string, PeerFacts>();
    for (const [id, peer] of this.peers) {
      out.set(id, {
        state: peer.pc.connectionState,
        changedAt: peer.changedAt,
        everConnected: peer.everConnected,
        restartedAt: peer.restartedAt,
        canRestart: typeof peer.pc.restartIce === "function",
        silent: !peer.audio.playing && !!peer.audio.sink,
      });
    }
    return out;
  }

  /** Connected, still connecting, and connected but inaudible. */
  counts(): { peers: number; connecting: number; silent: number } {
    const all = [...this.peers.values()];
    const connected = all.filter((p) => p.pc.connectionState === "connected");
    return {
      peers: connected.length,
      // `disconnected` belongs with these rather than with nothing: it is a
      // connection that may well come back, and the sweep restarts it if it
      // does not. Left out, the pill read "0" over audio still flowing.
      connecting: all.filter((p) =>
        ["new", "connecting", "disconnected"].includes(p.pc.connectionState),
      ).length,
      // Connected and inaudible, which is not being in the conversation
      // however good the connection looks from here.
      silent: connected.filter((p) => !p.audio.playing).length,
    };
  }

  async handle(from: string, me: string, signal: VoiceSignal) {
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
        this.host.send(from, { kind: "hi" });
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
          this.host.send(from, { kind: "answer", sdp: answer.sdp ?? "" });
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
      this.host.send(id, { kind: "offer", sdp: offer.sdp ?? "" });
    });
  }

  /**
   * Ask for a fresh route without taking the connection down.
   *
   * What fails mid-conversation is almost never the connection: it is the
   * path through the network — a wifi handover, a NAT rebinding, a relay
   * that dropped the pair. `restartIce` gathers candidates again and keeps
   * everything else, so nothing is renegotiated but the route, and the
   * audio is back in about the time one exchange takes rather than the
   * time a whole handshake takes.
   *
   * Only the side that opens the line may do it (the sweep sees to that).
   * The other side needs no new code at all: a restart arrives as an
   * ordinary offer and is answered as one.
   */
  restart(id: string, now: number): Promise<void> {
    const peer = this.peers.get(id);
    if (!peer) return Promise.resolve();
    peer.restartedAt = now;
    return this.negotiate(id, peer, async () => {
      peer.pc.restartIce();
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.host.send(id, { kind: "offer", sdp: offer.sdp ?? "" });
    });
  }

  /** A sink that never started playing: ask again. */
  replay(id: string) {
    const peer = this.peers.get(id);
    const asked = peer?.audio.retry();
    if (!asked) return;
    const context = this.host.context();
    if (context?.state === "suspended") void context.resume();
    void asked.then((playing) => {
      if (!playing) return;
      log.info(`hearing ${id} after all`);
      this.host.changed();
    });
  }

  /** Who is talking, read off each connection's audio. */
  meter(meter: Meter) {
    for (const [id, peer] of this.peers) {
      const { analyser } = peer.audio;
      if (!analyser) continue;
      const speaking = meter.speaking(analyser);
      if (speaking !== peer.audio.speaking) {
        peer.audio.speaking = speaking;
        gameEvents.emit("voice-speaking", id, speaking);
      }
    }
  }

  /** The connection to one person, made on first use. */
  private peer(id: string): Peer {
    const existing = this.peers.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const peer: Peer = {
      pc,
      audio: new Hearing(),
      earlyIce: [],
      work: Promise.resolve(),
      changedAt: Date.now(),
      restartedAt: 0,
      everConnected: false,
    };
    this.peers.set(id, peer);
    const local = this.host.local();
    for (const track of local?.getTracks() ?? []) pc.addTrack(track, local!);
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.host.send(id, { kind: "ice", candidate: { ...event.candidate.toJSON() } });
      }
    };
    pc.ontrack = (event) => this.hear(id, peer, event.streams[0] ?? new MediaStream([event.track]));
    pc.onconnectionstatechange = () => {
      peer.changedAt = Date.now();
      if (pc.connectionState === "failed") {
        // Kept rather than closed, which is the whole of the change: a
        // failed connection is exactly what `restartIce` is for, and
        // throwing it away left the sweep nothing to mend and a whole
        // handshake to run in its place — over a socket, through the other
        // browser, and only if that browser agrees. The route is what went;
        // the connection is still good for asking for another one.
        this.host.failed(id);
        log.warn(`voice lost the route to ${id}; the sweep will try to mend it`);
      } else if (pc.connectionState === "closed") this.drop(id);
      else if (pc.connectionState === "connected") {
        // It worked, so the next thing to go wrong is worth trying hard at,
        // and worth trying to mend before it is rebuilt.
        peer.restartedAt = 0;
        peer.everConnected = true;
        this.host.connected(id);
        log.info(`voice connected to ${id}`);
      }
      this.host.changed();
    };
    return peer;
  }

  /** Their voice arrives: play it. */
  private hear(id: string, peer: Peer, stream: MediaStream) {
    peer.audio.start(stream, this.host.context(), (err) => {
      // The sweep asks again; the pill stops counting them in the
      // meantime, because they are not in this conversation.
      this.host.changed();
      log.warn(`could not play ${id}:`, err.message);
    });
    this.host.changed();
    log.info(`hearing ${id}`);
  }

  drop(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    if (peer.audio.speaking) gameEvents.emit("voice-speaking", id, false);
    peer.audio.stop();
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    this.host.changed();
  }
}
