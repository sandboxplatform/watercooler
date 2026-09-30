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
 * it; `offers.ts` says what it was, for whenever it comes back.
 *
 * Who is on the server, rather than who is in this room, is `presence-online`:
 * the same list the People panel shows, which the server sends to everybody
 * whenever anyone arrives, leaves or walks somewhere else.
 *
 * This file is the conductor, and the parts are beside it:
 *
 *   view.ts        what the HUD shows, and telling it
 *   microphone.ts  asking for the microphone, listening to it, letting go
 *   peers.ts       the connections and the handshake that makes them
 *   sweep.ts       what to do about connections that are not working
 *   playback.ts    playing somebody's voice, and hearing who is talking
 *
 * One instance per browser. It listens to the room socket for as long as
 * the HUD is mounted, and does nothing at all until the microphone is
 * switched on.
 */

import { createLogger } from "../logger";
import { onRoomMessage, sendRoom } from "../room-socket";
import { onlinePeople, subscribeOnline } from "../presence-online";
import { getSelfId } from "../presence-self";
import type { OnlinePerson, VoiceSignal } from "../presence-types";
import { askForMicrophone, cannotAsk, LocalMicrophone } from "./microphone";
import { Peers } from "./peers";
import { LEVEL_POLL_MS, Meter } from "./playback";
import { rememberVoice, voiceWasOn } from "./remember";
import { SWEEP_MS, sweepPlan, type Greeting } from "./sweep";
import { VoiceStore, type VoiceView } from "./view";

export type { VoiceStatus, VoiceView } from "./view";

const log = createLogger("Voice");

class VoiceChat {
  private store = new VoiceStore();
  private mic: LocalMicrophone | null = null;
  private context: AudioContext | null = null;
  private meter = new Meter();
  private peers = new Peers({
    send: (to, signal) => this.send(to, signal),
    local: () => this.mic?.stream ?? null,
    context: () => this.context,
    changed: () => this.count(),
    failed: (id) => this.unreachable.add(id),
    connected: (id) => {
      const greeting = this.greetedAt.get(id);
      if (greeting) greeting.tries = 0;
      this.unreachable.delete(id);
    },
  });
  private unsubs: (() => void)[] = [];
  private attached = 0;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * People whose connection has failed and has not since been mended.
   *
   * A set rather than the running total it was: the total only ever went
   * up, so a pair that failed once and connected on the retry went on
   * being reported as unreachable for the rest of the session. A number
   * that cannot come down is not a report of anything.
   */
  private unreachable = new Set<string>();
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
  /**
   * When somebody first went missing from the server's list.
   *
   * Only for people this browser holds something for. Cleared the moment
   * they are back, which for a room change is the very next list.
   */
  private missingSince = new Map<string, number>();
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
    return this.store.snapshot();
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  private get status() {
    return this.store.snapshot().status;
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
            if (this.status === "on") sendRoom({ type: "mic", on: true });
            this.sweep();
          }
        }),
        // Who is on the server, not who is in this room: someone switching
        // their microphone on two floors up is somebody to say hello to.
        subscribeOnline(() => this.sweep()),
      ];
      // The microphone was on when the last page was left: on again here.
      if (voiceWasOn() && this.status === "off") void this.enable();
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
    if (this.status === "on" || this.status === "requesting") await this.disable();
    else await this.enable();
  }

  /**
   * Switch the microphone on. It is remembered for this tab, so it comes
   * back after walking through a door — unless it is a hold-to-talk press,
   * which lasts only as long as the button.
   */
  async enable({ remember = true }: { remember?: boolean } = {}) {
    if (this.status === "on" || this.status === "requesting") return;
    const unsupported = cannotAsk();
    if (unsupported) {
      this.store.publish({ status: "unsupported", reason: unsupported });
      return;
    }
    this.store.publish({ status: "requesting", reason: null });
    const turn = ++this.turn;
    const answer = await askForMicrophone();
    if ("refused" in answer) {
      // Only if this is still the switching-on in progress: a refusal that
      // arrives after the person already gave up must not overwrite "off"
      // with a red error they did not ask to see.
      if (turn === this.turn) this.store.publish({ status: "denied", reason: answer.refused });
      return;
    }

    /**
     * Switched off while the permission prompt was up.
     *
     * `disable` could do nothing about a stream that did not exist yet — it
     * stopped no tracks, because there was no microphone held yet — and this
     * side went on to publish "on", greet every peer and start sending audio.
     * The HUD said off, the person believed off, and the microphone was live.
     * So the stream is stopped here instead, by whoever actually has it.
     */
    if (turn !== this.turn) {
      log.info("microphone was switched off while it was being asked for");
      answer.stream.getTracks().forEach((track) => track.stop());
      return;
    }

    // A click got us here, so the context may start; if it was made
    // earlier and suspended, wake it.
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
    this.mic = new LocalMicrophone(answer.stream, this.context, () =>
      this.lost("The microphone stopped — another app may have taken it, or it was unplugged."),
    );
    this.levelTimer = setInterval(() => this.pollLevels(), LEVEL_POLL_MS);
    this.unreachable.clear();
    this.store.publish({ status: "on" });
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
    if (this.status === "off") return;
    for (const player of this.everyoneElse()) this.send(player.id, { kind: "bye" });
    for (const id of this.peers.ids()) this.peers.drop(id);
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.levelTimer = null;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    this.mic?.release();
    this.mic = null;
    sendRoom({ type: "mic", on: false });
    this.greetedAt.clear();
    this.missingSince.clear();
    this.unreachable.clear();
    this.store.publish({
      status: "off",
      peers: 0,
      connecting: 0,
      failed: 0,
      silent: 0,
      speaking: false,
    });
    this.census();
    log.info("microphone off");
  }

  /**
   * The microphone has gone out from under us. Leave, and say why.
   *
   * Not remembered, unlike an ordinary switch-off, because coming back on
   * the next page with the same dead device is a person told twice that
   * they are in a conversation they cannot speak into.
   */
  private lost(reason: string) {
    if (this.status !== "on" && this.status !== "requesting") return;
    log.warn(reason);
    void this.disable().then(() => this.store.publish({ status: "denied", reason }));
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

  private handle(from: string, signal: VoiceSignal): Promise<void> | undefined {
    if (this.status !== "on") return;
    const me = getSelfId();
    if (!me) return;
    return this.peers.handle(from, me, signal);
  }

  /** Carry out what `sweepPlan` decided. See `sweep.ts` for why each is what it is. */
  private sweep() {
    this.census();
    if (this.status !== "on") return;
    const me = getSelfId();
    if (!me) return;
    const now = Date.now();
    const plan = sweepPlan(this.peers.facts(), this.everyoneElse(), now, {
      me,
      greeted: this.greetedAt,
      missing: this.missingSince,
    });
    this.missingSince = plan.missing;
    for (const id of plan.forget) {
      this.peers.drop(id);
      this.greetedAt.delete(id);
      this.unreachable.delete(id);
    }
    // Asking again costs nothing and is what a context that has since been
    // woken needs to hear.
    for (const id of plan.replay) this.peers.replay(id);
    // Not in the chat, so nobody to report as unreachable.
    for (const id of plan.quiet) this.unreachable.delete(id);
    for (const { id, tries } of plan.mend) {
      this.greetedAt.set(id, { at: now, tries });
      log.info(`asking for a new route to ${id}`);
      void this.peers.restart(id, now);
    }
    for (const { id, tries } of plan.greet) {
      this.greetedAt.set(id, { at: now, tries });
      // A hello tells them to throw away what they hold for us; ours has to
      // go the same way, or their offer arrives at a connection that has
      // already moved on and is refused by its own state.
      this.peers.drop(id);
      this.send(id, { kind: "hello" });
    }
    this.count();
  }

  /** How many are on the server, and how many of them are on voice — this browser included. */
  private census() {
    const others = this.everyoneElse();
    const on = this.status === "on";
    this.store.update({
      online: others.length + 1,
      withMic: others.filter((p) => p.mic).length + (on ? 1 : 0),
    });
  }

  private count() {
    this.store.update({ ...this.peers.counts(), failed: this.unreachable.size });
  }

  // ── Who is talking ─────────────────────────────────────

  private pollLevels() {
    if (this.mic) {
      const speaking = this.meter.speaking(this.mic.analyser);
      if (speaking !== this.store.snapshot().speaking) this.store.publish({ speaking });
    }
    this.peers.meter(this.meter);
  }
}

export const voiceChat = new VoiceChat();
