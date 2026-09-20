/**
 * Shared presence vocabulary for the room socket.
 *
 * Imported by both the browser and the server, so it must stay free of Phaser
 * and of node built-ins.
 */

/** How many *humans* can be in one place at once. Agent seats are unrelated. */
export const MAX_HUMAN_PLAYERS = 6;

/** Presence broadcast rate. 20 Hz is smooth once the client interpolates. */
export const TICK_MS = 50;

/** Client send rate. Matching the tick avoids sending frames nobody reads. */
export const MOVE_SEND_MS = 50;

/** How often the server pings idle sockets to confirm somebody is still there. */
export const HEARTBEAT_MS = 5_000;

/** Drop a player who has gone quiet for this long (tab closed, laptop asleep). */
export const IDLE_TIMEOUT_MS = 15_000;

/**
 * How long the place is held for the connection already standing in it.
 *
 * One person holds one place and the one already there keeps it, so a
 * second connection claiming the same personal code is turned away. The
 * trouble is that a page load is a new connection too — walking through a
 * building's front door, a refresh, reopening the tab — and behind a proxy
 * the socket the old page left behind is not closed promptly at the
 * server. Refusing on the strength of that alone would shut somebody out
 * of their own world with their own ghost, for as long as the heartbeat
 * takes to notice it, which is twice HEARTBEAT_MS.
 *
 * So the one in possession is pinged and given this long to answer. A
 * browser that is really there replies in tens of milliseconds and the
 * newcomer is refused; a ghost never replies and the newcomer walks in
 * after a second. A second's pause on a reload, against two of the same
 * person in the world at once.
 */
export const CLAIM_GRACE_MS = 1_000;

/**
 * How fast a person moves, in px/s.
 *
 * They live here, with the presence types, because both sides need them and
 * this file imports nothing: the game reads them as MOVE_SPEED and
 * SPRINT_SPEED, and the server needs them to reject a teleport without
 * importing Phaser. They used to be written out in both places and called
 * mirrored, which lasts until one of them changes.
 */
export const MOVE_SPEED_PX_S = 160;

/**
 * Shift is a toggle, and this is the other setting: a bit over twice walking.
 *
 * It was 280, a shade under twice, which is a brisk jog and not what the mode
 * is for — the point of it is crossing several rooms, and the world map is
 * wide. The server's teleport clamp is derived from this number rather than
 * written beside it, so raising it does not need a second edit.
 */
export const SPRINT_SPEED_PX_S = 364;

/**
 * Allowance over the fastest legitimate speed before a move is a teleport.
 *
 * Measured against sprinting rather than walking, or the clamp would be
 * spending its jitter allowance on somebody running honestly: two updates
 * arriving back to back after a network stall carry a long interval's worth
 * of movement, and a budget without headroom would haul them back to where
 * they were. What the ceiling has to stay well under is a jump across the
 * map, which at 700px/s it does.
 */
export const SPEED_TOLERANCE = 2.5;

/**
 * The longest stretch a single move may be paid for out of.
 *
 * The clamp budgets from the last move, and standing still sends nothing —
 * so the budget went on growing while somebody stood there. A pong keeps the
 * idle sweep off them indefinitely, so a modified client could stand for a
 * minute, bank about 54,000px, and cross any map in the world in one message.
 * The comment on the clamp promised that could not happen; this is what makes
 * it true.
 *
 * Five times the client's own send interval, so an honest walker never feels
 * it: they send every `MOVE_SEND_MS` while moving, and a slow frame or a
 * little jitter has four intervals of headroom. The one thing it refuses is
 * the case it exists for — a long silence followed by one enormous step,
 * which no honest client produces. A genuinely large move is a `place`, not a
 * `move`: through a door, off a ferry, out of a lift.
 */
export const MOVE_BUDGET_WINDOW_MS = MOVE_SEND_MS * 5;

export type Facing = "up" | "down" | "left" | "right";

export interface PresencePlayer {
  id: string;
  name: string;
  spriteKey: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  /** An agent the server walks about, not a person; never counts as one. */
  resident?: boolean;
  /** Their microphone is on for voice chat. */
  mic?: boolean;
  /**
   * They have stepped out of sight — into the lift, or through a door.
   *
   * Still in the room and still counted, but there is nothing to draw: the
   * car is a hole in the wall and they are inside it. Their own browser
   * already hides them (`Player.board`); this is how everyone else's does.
   */
  hidden?: boolean;
}

// ── Client → server ────────────────────────────────────

export interface JoinMessage {
  type: "join";
  /** Which room to walk into; absent means the default one. */
  room?: string;
  /**
   * Which browser tab this is, kept in `sessionStorage` so it survives a
   * reload and no other tab has it.
   *
   * One person holds one session, and the awkward case has always been the
   * same person coming back: a reload is a new connection, and behind a
   * proxy the one the old page left behind is not closed at the server for
   * some seconds yet. The server pings it to find out whether anyone is
   * still there — and gets an answer, because a pong is written by the
   * browser's network stack rather than by the page's script, so a socket
   * whose page is being torn down answers exactly like a live one. That is
   * how somebody came to be shut out of their own world by their own ghost.
   *
   * This settles it without guessing: the same tab is the same person at
   * the same screen, so it takes its own place back and nothing is pinged.
   * A connection with no session, or another tab's, is challenged as before.
   */
  session?: string;
  name: string;
  spriteKey: string;
  x: number;
  y: number;
  facing: Facing;
}

export interface MoveMessage {
  type: "move";
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
}

/**
 * A change to the shared world. One entity at a time: with four people acting
 * at once, sending whole collections means the later write erases the other
 * person's work.
 */
export type WorldChange = { entity: "seat"; seat: Record<string, unknown> };

export interface WorldMessage {
  type: "world";
  change: WorldChange;
}

/** A mark added to the room's whiteboard, or a request to wipe it. */
export interface BoardMessage {
  type: "board";
  action: "draw" | "clear";
  stroke?: unknown;
  /** False while the pen is still moving, true when it is lifted. */
  done?: boolean;
}

/**
 * A hand on the basketball: picking it up, or letting it go.
 *
 * The browser says which of the three and, for a throw, how hard — the
 * meter over the thrower's head. It deliberately says nothing else: where
 * they are standing and which way they face are the room's own record of
 * them, so a throw cannot be aimed from somewhere nobody is, and the flight
 * and the basket are the server's alone.
 */
export interface BasketballMessage {
  type: "basketball";
  action: "take" | "throw" | "drop";
  /** 0 to 1, for a throw. Clamped server-side; anything else is zero. */
  power?: number;
}

/**
 * Bending down for an egg.
 *
 * It says nothing but that: which egg is whichever one is nearest, and
 * whether there is one within reach at all is the server's to answer off
 * the room's own record of where this person is standing. A message that
 * named an egg would be a message that could name one on the other side
 * of the map, and the tier — the whole point of an egg — would be a thing
 * a browser had a say in.
 */
export interface EggMessage {
  type: "egg";
  action: "take";
}

/** A move in a game of ping pong, on its way to the other player. */
export interface PongRelayMessage {
  type: "pong";
  /** Who it is for. The server will not send it anywhere else. */
  to: string;
  payload: import("./pong/protocol").PongPayload;
}

/**
 * Voice chat is browser to browser over WebRTC; the server only carries the
 * handshake. "hello" says a microphone is on, "bye" that it is off; the
 * rest is the standard offer, answer and ICE exchange.
 */
export type VoiceSignal =
  /** I am on voice. Throw away whatever you hold for me and start again. */
  | { kind: "hello" }
  /**
   * The answer to a `hello`, and the only reason there are two words for
   * what looks like one thing: a `hello` answered with a `hello` is itself
   * answered, and two sides that each start again on one never stop.
   */
  | { kind: "hi" }
  | { kind: "bye" }
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: Record<string, unknown> };

/** The microphone went on or off, so the room can count who is on voice. */
export interface MicMessage {
  type: "mic";
  on: boolean;
}

/**
 * This character stepped into the lift, or back out of it.
 *
 * A message of its own rather than a field on `move`, because somebody in
 * the lift is standing still and the scene stops reporting position while a
 * dialog is up — there is no frame left to carry it on.
 *
 * Unlike `mic` it is deliberately *not* remembered across a room change:
 * riding to a floor is a fresh join, and arriving invisible is a worse bug
 * than the one this fixes.
 */
export interface BoardedMessage {
  type: "boarded";
  inside: boolean;
}

/** A handshake step on its way to one other player in the room. */
export interface VoiceRelayMessage {
  type: "voice";
  to: string;
  signal: VoiceSignal;
}

/**
 * Start or end the meeting in the room this connection is in.
 *
 * The room's, not the sender's: a meeting is a thing happening in a place,
 * so anybody standing at the table may end one — the person who called it
 * may well have walked out, and a meeting nobody can end is a notice that
 * hangs over the building for ever.
 */
export interface MeetingMessage {
  type: "meeting";
  on: boolean;
}

export type ClientMessage =
  | JoinMessage
  | MoveMessage
  | WorldMessage
  | BoardMessage
  | PongRelayMessage
  | VoiceRelayMessage
  | MicMessage
  | BoardedMessage
  | BasketballMessage
  | EggMessage
  | MeetingMessage;

// ── Server → client ────────────────────────────────────

export interface WelcomeMessage {
  type: "welcome";
  you: string;
  players: PresencePlayer[];
  capacity: number;
}

/** Somebody on the server, and the room they are in. */
export interface OnlinePerson {
  id: string;
  name: string;
  spriteKey: string;
  room: string;
  mic?: boolean;
  /**
   * Who they are across sessions: their `AccessIdentity` if they hold a
   * code of their own, else `guest:<name>`. `id` is this connection and
   * changes every time they open a tab; this is the handle their badges
   * and their profile hang on, so the People panel keys on it.
   *
   * It is no more than their name already says out loud — the panel has
   * always shown that — and the codes themselves never leave the server.
   */
  person: string;
}

/**
 * Everyone on the server, wherever they are. Sent to every connection
 * when someone arrives, leaves or walks somewhere else, and now and then
 * regardless, so nobody's list drifts.
 *
 * `locals` is the residents, in a field of their own rather than mixed in:
 * they are always somewhere, so they are never news, and the Online count
 * is a count of people. But where Doc is standing right now is exactly
 * what somebody looking for Doc wants, and the server is the only thing
 * that knows.
 */
export interface OnlineMessage {
  type: "online";
  people: OnlinePerson[];
  locals: OnlinePerson[];
}

export interface RejectedMessage {
  type: "rejected";
  /**
   * `full` — the room is at its human limit. `private` — not yours to
   * enter. `already-online` — you are in the world on another connection,
   * which keeps its place; this one is turned away.
   */
  reason: "full" | "private" | "already-online";
  /** Only meaningful for `full`. */
  capacity?: number;
}

export interface PresenceMessage {
  type: "presence";
  players: PresencePlayer[];
}

export interface PlayerJoinedMessage {
  type: "joined";
  player: PresencePlayer;
}

export interface PlayerLeftMessage {
  type: "left";
  id: string;
  name: string;
}

/**
 * Somebody just earned a badge.
 *
 * Sent to **everybody**, not to the room it happened in, because a badge is
 * the person's rather than the place's and the panel that lists them lists
 * the world. `room` is what lets the toast be narrower than the message:
 * everyone's list stays current, and only the room it happened in — and the
 * person it happened to — is interrupted about it.
 */
export interface BadgeMessage {
  type: "badge";
  code: string;
  /** The holder id: a persona's identity, or `guest:<name>`. */
  person: string;
  name: string;
  /** Where they were standing when they earned it. */
  room: string;
  at: string;
}

/**
 * Where the basketball is, to everyone standing on the world map.
 *
 * Sent on every tick while the ball is doing something — carried, in the
 * air, rolling — and once more when it settles, so a browser that arrives
 * to a ball lying still is still told where it is lying. Only the world
 * map gets it: it is the one room with a court in it, and a floor of
 * Sandbox ERP has no use for a ball's coordinates twenty times a second.
 *
 * `scored` is the moment, not a tally: which rim it fell through and who
 * threw it, so every screen can mark the same basket at the same hoop. The
 * count of them is nobody's — a badge is earned for sinking one, and that
 * is the whole of what is kept.
 */
export interface BasketballBroadcast {
  type: "basketball";
  ball: {
    x: number;
    y: number;
    z: number;
    /** The connection carrying it, or null for a ball nobody has. */
    heldBy: string | null;
  };
  scored?: { side: "west" | "east"; by: string };
}

/**
 * What is lying in the grass on the world map.
 *
 * The whole field every time rather than one egg appearing and another
 * going, for the reason `online` and `meetings` are whole lists: it is
 * sent on every change and to everybody arriving, so a browser that
 * missed a message is not left drawing an egg somebody pocketed ten
 * minutes ago. It is a short list — `NEST_LIMIT` at the very most — and
 * it changes a handful of times an hour, which is nothing beside the
 * ball's twenty a second.
 *
 * `taken` is the moment: what somebody just picked up, what they are
 * called and the patch of grass they picked it up off, so every screen on
 * the map marks the same find in the same place. Which is the only part
 * of this the people standing about actually watch for.
 *
 * The spot is on the message rather than worked out from the list,
 * because by the time the list arrives the egg is out of it — and it is
 * the egg's own spot rather than the finder's, so a screen that has never
 * drawn that person still puts the words where the thing was.
 */
export interface EggsBroadcast {
  type: "eggs";
  eggs: import("./world/eggs").LaidEgg[];
  taken?: { tier: import("./world/eggs").EggTier; by: string; x: number; y: number };
}

/**
 * What is on the highway, to everyone standing on the world map.
 *
 * The whole road every time, like `eggs` and `meetings` and for the same
 * reason — but sent a great deal less often than either, because it is sent
 * only when the road **changes**: a car setting off, a car leaving. In
 * between there is nothing to say. A car travels in a straight line at a
 * speed written down in `lib/world/traffic.ts`, so every browser advances
 * the ones it already has against its own clock and arrives at the same
 * place the server has them.
 *
 * Which is the opposite of the ball beside it, published twenty times a
 * second, and the difference is worth keeping in mind: a ball is somebody's
 * throw and nobody can say where it goes next, while a car is a car on a
 * road.
 *
 * The world map only, as the ball and the field are: a floor of Sandbox ERP
 * has no use for the traffic out at the edge of the world.
 */
export interface TrafficBroadcast {
  type: "traffic";
  cars: import("./world/traffic").Car[];
}

/**
 * Somebody's basket gained an egg — to **everybody**, wherever they are.
 *
 * The same split the badges are under, and for the same reason: the field
 * of eggs is a fact about one room and goes to that room, and what is in
 * somebody's basket is a fact about a person, which the panel listing
 * baskets lists the world of. A browser keeps its tally current off this
 * rather than refetching, exactly as it does for a badge.
 */
export interface EggFoundMessage {
  type: "egg-found";
  /** The holder id: a persona's identity, or `guest:<name>`. */
  person: string;
  name: string;
  tier: import("./world/eggs").EggTier;
  at: string;
}

/** The same, arriving at the other end, stamped with who sent it. */
export interface PongBroadcast {
  type: "pong";
  from: { id: string; name: string };
  payload: import("./pong/protocol").PongPayload;
}

export interface WorldBroadcast {
  type: "world";
  change: WorldChange;
  /** Who made the change, so the room can say who asked for what. */
  by?: { id: string; name: string };
}

/**
 * Something said out loud, drawn as a bubble over the speaker's head.
 *
 * Only the residents say anything now: the chat that let a person type a
 * remark is gone, and with it the log that kept one. So this is the server
 * telling a room what one of its characters just said, and it is over when
 * the bubble fades — nothing stores it and nothing sends it back.
 */
export interface SaidMessage {
  type: "said";
  id: string;
  from: { id: string; name: string };
  text: string;
  at: string;
}

/** A handshake step arriving from another player. */
export interface VoiceBroadcast {
  type: "voice";
  from: { id: string; name: string };
  signal: VoiceSignal;
}

export interface BoardBroadcast {
  type: "board";
  action: "draw" | "clear";
  stroke?: unknown;
  done?: boolean;
  by?: string;
}

/** A meeting somebody has called, and where it is being held. */
export interface MeetingNotice {
  /** The room it is in, which is a floor of a building. */
  room: string;
  /** That floor in words — "Sandbox ERP · Floor 3 · Operations". */
  where: string;
  /** Who called it. */
  host: string;
  /** When, as an ISO stamp, so the HUD can say how long it has been going. */
  since: string;
}

/**
 * Every meeting this connection is allowed to know about.
 *
 * The whole list rather than a start or an end, for the reason `online` is
 * a whole list: it is sent on every change and to everyone arriving, so a
 * browser that missed one message is not left with a notice that will never
 * be taken down.
 *
 * Filtered per connection by the room's own rule (`mayEnterRoom`) — a
 * meeting on a floor you cannot ride to is not news you are entitled to,
 * and the filtering is the server's rather than the HUD's for the reason
 * every other private-floor check is.
 */
export interface MeetingsMessage {
  type: "meetings";
  meetings: MeetingNotice[];
}

export type ServerMessage =
  | WelcomeMessage
  | RejectedMessage
  | PresenceMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | WorldBroadcast
  | SaidMessage
  | BadgeMessage
  | PongBroadcast
  | BoardBroadcast
  | VoiceBroadcast
  | OnlineMessage
  | BasketballBroadcast
  | EggsBroadcast
  | TrafficBroadcast
  | EggFoundMessage
  | MeetingsMessage;

export function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "join" ||
    type === "move" ||
    type === "world" ||
    type === "board" ||
    type === "pong" ||
    type === "voice" ||
    type === "mic" ||
    type === "boarded" ||
    type === "basketball" ||
    type === "egg" ||
    type === "meeting"
  );
}

/** The most a session description may weigh; a real one is a few kilobytes. */
const SDP_LIMIT = 20_000;

export function isVoiceSignal(value: unknown): value is VoiceSignal {
  if (typeof value !== "object" || value === null) return false;
  const { kind, sdp, candidate } = value as Record<string, unknown>;
  if (kind === "hello" || kind === "hi" || kind === "bye") return true;
  if (kind === "offer" || kind === "answer") {
    return typeof sdp === "string" && sdp.length > 0 && sdp.length <= SDP_LIMIT;
  }
  if (kind === "ice") return typeof candidate === "object" && candidate !== null;
  return false;
}

const WORLD_ENTITIES = ["seat"] as const;

export function isWorldChange(value: unknown): value is WorldChange {
  if (typeof value !== "object" || value === null) return false;
  const entity = (value as { entity?: unknown }).entity;
  if (!WORLD_ENTITIES.includes(entity as (typeof WORLD_ENTITIES)[number])) return false;
  const payload = (value as Record<string, unknown>)[entity as string];
  return typeof payload === "object" && payload !== null;
}
