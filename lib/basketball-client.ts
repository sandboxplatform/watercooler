"use client";

/**
 * The basketball, from the browser's side.
 *
 * Thin on purpose. The server holds the ball, runs its flight and judges a
 * basket; this asks for the two things a person can do to it and passes on
 * what comes back. Nothing here works out where the ball is going — a
 * browser that guessed would be a browser that could be wrong about whether
 * a shot went in, which is the whole reason the flight is the server's.
 *
 * It sits in `lib/` with `meeting.ts` and the rest of the socket's
 * customers rather than in the scene, so the game layer asks for a ball the
 * way it asks for anything else and the socket stays in one place.
 */

import { onRoomMessage, sendRoom } from "./room-socket";
import type { BasketballBroadcast } from "./presence-types";

export type Ball = BasketballBroadcast["ball"];
export type Basket = NonNullable<BasketballBroadcast["scored"]>;

/**
 * Where the ball was when the server last said.
 *
 * Kept module-side rather than handed only to whoever was listening at the
 * time, because a scene is built after the message that told it: walking
 * out of a building onto the world map takes a moment, and the ball is
 * published once when it settles and then not again. Without this, arriving
 * to a court with a ball lying on it would show no ball at all until
 * somebody touched it.
 */
let latest: Ball | null = null;

type Listener = (ball: Ball, scored: Basket | null) => void;
const listeners = new Set<Listener>();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  onRoomMessage((message) => {
    if (message.type !== "basketball") return;
    latest = message.ball;
    for (const listener of listeners) listener(message.ball, message.scored ?? null);
  });
}

/** Follow the ball. The current position, if there is one, arrives at once. */
export function onBall(listener: Listener): () => void {
  listen();
  listeners.add(listener);
  if (latest) listener(latest, null);
  return () => {
    listeners.delete(listener);
  };
}

/** Pick it up. Refused unless you are standing over it, which is the server's call. */
export function takeBall(): void {
  sendRoom({ type: "basketball", action: "take" });
}

/**
 * Throw it, at the power the meter was on.
 *
 * Where from and which way are not said: the server has both from the room,
 * and a throw aimed from somewhere nobody is standing is the one thing a
 * message like this could otherwise be made to do.
 */
export function throwBall(power: number): void {
  sendRoom({ type: "basketball", action: "throw", power });
}

/** Put it down without throwing it — walking away with it in hand. */
export function dropBall(): void {
  sendRoom({ type: "basketball", action: "drop" });
}

/** Test seam: forget the last ball between cases. */
export function resetBall(): void {
  latest = null;
  listeners.clear();
}
