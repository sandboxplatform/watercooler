/**
 * The sprint toggle's binding.
 *
 * Sprinting is a mode rather than a held key: one press switches between
 * walking and running and it stays where it was put, so crossing the world
 * map does not mean holding a key down for twenty seconds.
 *
 * The rule is here, away from Phaser, because it is three conditions that are
 * each easy to get wrong and impossible to see from inside the game.
 */

/**
 * The physical key, by `KeyboardEvent.code`.
 *
 * Not Phaser's SHIFT keycode, which cannot tell the two Shifts apart: right
 * Shift is left to mean what it usually means.
 */
export const SPRINT_KEY = "ShiftLeft";

/**
 * Whether this key press should flip between walking and sprinting.
 *
 * @param busy something else has the keyboard — a text field, or a panel
 * over the room. Shift is a modifier as much as a binding, and a toggle that
 * fired while somebody typed a capital would leave them sprinting by
 * accident, several times per sentence.
 */
export function togglesSprint(event: { code: string; repeat: boolean }, busy: boolean): boolean {
  // Holding the key autorepeats, which on a toggle would flicker between the
  // two modes for as long as it is held.
  return event.code === SPRINT_KEY && !event.repeat && !busy;
}
