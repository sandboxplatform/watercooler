"use client";

import { onRoomMessage, sendRoom } from "./room-socket";

/**
 * Tell the server this browser has a resident's conversation open, until
 * the function handed back is called.
 *
 * While it is open, and while whoever opened it is standing beside him,
 * the resident stays where he is: see
 * `lib/server/socket/features/conversations`. Whether either is true is
 * the server's to decide; this only says what is on the screen.
 *
 * Said again on every `welcome` while it is open, because the server
 * forgets it on a drop — a reconnection, and a room change too — and a
 * resident who set off down the corridor because the network blinked in
 * the middle of a conversation is the thing this exists to stop. Said
 * before the socket is up it goes nowhere, and the `welcome` is what
 * carries it.
 */
export function talkingTo(residentId: string): () => void {
  const say = () => sendRoom({ type: "talk", to: residentId });
  say();
  const unsubscribe = onRoomMessage((message) => {
    if (message.type === "welcome") say();
  });
  return () => {
    unsubscribe();
    sendRoom({ type: "talk", to: null });
  };
}
