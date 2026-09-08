/**
 * Who opens the line between two people on voice.
 *
 * Shared by the voice chat and its tests; nothing here touches the browser.
 *
 * This file was the proximity in proximity voice: a fade by distance, full
 * within three tiles (`NEAR_PX`), silent past nine (`FAR_PX`), a straight
 * line between. Voice is one conversation for the whole server now, and
 * distance is the wrong measure across rooms — a floor above has
 * coordinates of its own, so the same numbers mean a different thing in
 * every place. The fade went with it rather than being kept unused; those
 * three numbers are the whole of it if it comes back.
 */

/**
 * Of two people who both have a microphone on, which one opens the
 * connection. Both must agree without talking, so the lower id offers.
 */
export function offers(myId: string, peerId: string): boolean {
  return myId < peerId;
}
