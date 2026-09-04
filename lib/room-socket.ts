"use client";

/**
 * The room's single WebSocket.
 *
 * Presence and world changes share one connection: they concern the same room,
 * and a second socket would double the reconnect logic for no benefit. This
 * module owns connecting, reconnecting and fan-out to subscribers; the hooks
 * above it decide what the messages mean.
 */

import type { ClientMessage, ServerMessage } from "./presence-types";
import { createLogger } from "./logger";

const log = createLogger("RoomSocket");

const RECONNECT_MS = 2000;

type Handler = (message: ServerMessage) => void;
type OpenHandler = () => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let disposed = false;
let refCount = 0;

const handlers = new Set<Handler>();
const openHandlers = new Set<OpenHandler>();

function url(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/room/socket`;
}

function open() {
  if (disposed || socket) return;

  let next: WebSocket;
  try {
    next = new WebSocket(url());
  } catch (err) {
    log.warn("could not open:", (err as Error).message);
    return;
  }
  socket = next;

  next.onopen = () => {
    for (const handler of openHandlers) handler();
  };

  next.onmessage = (event) => {
    let message: ServerMessage;
    try {
      message = JSON.parse(event.data as string) as ServerMessage;
    } catch {
      return;
    }
    for (const handler of handlers) handler(message);
  };

  next.onclose = () => {
    socket = null;
    if (disposed || refCount === 0) return;
    reconnectTimer = setTimeout(open, RECONNECT_MS);
  };

  next.onerror = () => next.close();
}

/**
 * Hang up when the page goes away.
 *
 * A browser usually closes a socket as it navigates, but usually leaves a
 * window where the server still has you standing in the room you have just
 * left, and its sweeper does not collect a quiet player for fifteen seconds.
 * That is long enough to walk out of a building and meet yourself at the
 * door. Closing it here is immediate and costs nothing when the browser was
 * going to do it anyway.
 *
 * `pagehide` covers a navigation and a closed tab alike, where `unload`
 * fires reliably on neither. But it also fires for a page being put into the
 * back-forward cache, which is not leaving at all — a hidden tab, or a phone
 * backgrounding the browser — and hanging up on that would take somebody out
 * of the room for looking away. `persisted` is what tells the two apart, and
 * it was worth finding out the hard way: without this guard, backgrounding
 * the tab emptied the room.
 */
function hangUp(event: PageTransitionEvent) {
  if (event.persisted) return;
  socket?.close();
}

/** Open the socket, or join an existing one. Returns a release function. */
export function acquireRoomSocket(): () => void {
  disposed = false;
  refCount += 1;
  if (refCount === 1) window.addEventListener("pagehide", hangUp);
  open();

  return () => {
    refCount = Math.max(0, refCount - 1);
    if (refCount > 0) return;
    disposed = true;
    window.removeEventListener("pagehide", hangUp);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    socket?.close();
    socket = null;
  };
}

export function onRoomMessage(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function onRoomOpen(handler: OpenHandler): () => void {
  openHandlers.add(handler);
  return () => openHandlers.delete(handler);
}

/** Send a message if the socket is up. Returns whether it went out. */
export function sendRoom(message: ClientMessage): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(message));
    return true;
  } catch (err) {
    log.warn("send failed:", (err as Error).message);
    return false;
  }
}

export function isRoomSocketOpen(): boolean {
  return socket?.readyState === WebSocket.OPEN;
}

/** Test seam: drop all state between cases. */
export function resetRoomSocket() {
  disposed = true;
  refCount = 0;
  handlers.clear();
  openHandlers.clear();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  socket?.close();
  socket = null;
}
