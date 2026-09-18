/**
 * Where voice chat looks for a route between two browsers.
 *
 * Its own file, importing nothing, because two very different places need
 * the same list: `voice-chat.ts` hands it to every `RTCPeerConnection`, and
 * `next.config.ts` has to name the same servers in `connect-src`. A
 * Content-Security-Policy applies to ICE servers exactly as it does to a
 * fetch, and one the policy does not name is **dropped without a word** —
 * leaving the browser with only the candidates it can see on its own
 * network, which is why two people on one wifi could hear each other and
 * nobody else ever could. Written down twice, that is a policy that stops
 * naming a server the moment somebody changes one of them.
 */

/** The public STUN server: enough for most networks, and free. */
export const STUN_URL = "stun:stun.l.google.com:19302";

/**
 * The relay for the networks STUN cannot get through — a symmetric NAT on
 * either side and there is no route to find, only one to be lent.
 *
 * `NEXT_PUBLIC_`, so it is inlined into the browser bundle **at build
 * time**: setting it on a running server does nothing whatever, and on a
 * Dockerfile build it has to arrive as a build argument (see `Dockerfile`).
 */
export const TURN_URL = process.env.NEXT_PUBLIC_TURN_URL ?? "";

/** Every ICE server this app uses, for the policy that has to allow them. */
export function iceUrls(): string[] {
  return TURN_URL ? [STUN_URL, TURN_URL] : [STUN_URL];
}
