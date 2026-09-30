/**
 * Who opens the line between two people on voice.
 *
 * Shared by the voice chat and its tests; nothing here touches the browser.
 *
 * This was `proximity.ts` while it also held the fade by distance that made
 * it proximity voice: full within three tiles, silent past nine, a straight
 * line between. Voice is one conversation for the whole server now, and
 * distance is the wrong measure across rooms — a floor above has coordinates
 * of its own, so the same numbers mean a different thing in every place. The
 * fade went rather than being kept unused; those three numbers are the whole
 * of it if it comes back.
 */

/**
 * Of two people who both have a microphone on, which one opens the
 * connection. Both must agree without talking, so the lower id offers.
 */
export function offers(myId: string, peerId: string): boolean {
  return myId < peerId;
}
