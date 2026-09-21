/**
 * The column's binding.
 *
 * Tab opens the People column and puts it away again — the same door the
 * Online pill is, at the other end of the keyboard, because the pill is in
 * the corner of the office and a key is wherever your hands already are.
 *
 * The rule is here, away from the page, for the reason `lib/sprint.ts` is
 * away from Phaser: it is a handful of conditions that are each easy to get
 * wrong and impossible to see from the call site.
 */

/**
 * The key, by `KeyboardEvent.key`.
 *
 * `key` rather than `code`, which is the other way round from the sprint
 * toggle and for the reason that one is: there is exactly one Tab, so there
 * is no left and right to tell apart, and `key` is what the browser's own
 * focus navigation reads. `code` also comes through empty from anything
 * synthesising a press rather than typing one.
 */
export const SIDEBAR_KEY = "Tab";

/** What the rule needs of a key press, which is less than a `KeyboardEvent`. */
export interface SidebarKeyPress {
  key: string;
  repeat: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * Whether this key press should open the column, or put it away.
 *
 * Tab already means something to the browser, so three of the four checks
 * are about giving it back:
 *
 * - **A modifier is somebody else's.** Shift+Tab walks focus backwards,
 *   Ctrl+Tab and Alt+Tab belong to the browser and the desktop. Only the
 *   bare key is ours.
 * - **Autorepeat is not a second press.** Held down, a toggle would flicker
 *   the column open and shut for as long as the finger is on it.
 * - **`busy` is a field or a dialog.** Tab is how anybody gets from one
 *   control of a panel to the next, and the whole point of a text field is
 *   that the keyboard belongs to it.
 *
 * @param busy something else has the keyboard — a text field, or a panel
 * over the room.
 */
export function togglesSidebar(event: SidebarKeyPress, busy: boolean): boolean {
  if (event.key !== SIDEBAR_KEY) return false;
  if (event.repeat) return false;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
  return !busy;
}
