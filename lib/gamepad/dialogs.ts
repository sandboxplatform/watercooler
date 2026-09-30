/**
 * Which dialog, if any, has the screen.
 *
 * Every panel that takes over — the welcome, the lift, the terminal, the
 * character studio, the game machines — is marked `role="dialog"`, so the
 * controller can find the one on top without each of them registering. The
 * game machines read the pad themselves and say so with an attribute, and
 * the shared driver leaves those alone.
 */

/** On a dialog that handles the controller itself. */
export const PAD_OWN_ATTR = "data-pad-own";

/**
 * The answer last worked out, and whether anything could have changed it.
 *
 * Asking is a `querySelectorAll` over the whole page and a `getClientRects`
 * on each match, and the second forces a layout whenever the page has moved
 * since the last one. The office asks twice a frame and the controller
 * driver once, so on a busy HUD that was a synchronous layout in the middle
 * of every frame for an answer that changes a few times a session.
 *
 * So it is kept, and thrown away when the page gives a reason to: a node
 * added or removed, an attribute that decides whether a dialog is drawn
 * (its role, a class, a style, `hidden`, `open`), or the window changing
 * size, which is what moves a media query. `takeRecords` hands over any
 * mutation still waiting for its callback, so a dialog put up earlier in
 * the same task is seen now rather than on the next frame.
 */
let cached: HTMLElement[] | null = null;
let observer: MutationObserver | null = null;

function watch(): boolean {
  if (observer) return true;
  if (typeof MutationObserver === "undefined" || !document.documentElement) return false;
  observer = new MutationObserver(() => {
    cached = null;
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["role", "class", "style", "hidden", "open"],
  });
  window.addEventListener("resize", () => {
    cached = null;
  });
  return true;
}

function currentDialogs(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  // Without an observer there is nothing to say the page has moved, so it
  // is asked afresh every time, which is what it always did.
  if (!watch()) return findDialogs();
  if (observer!.takeRecords().length > 0) cached = null;
  return (cached ??= findDialogs());
}

function findDialogs(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(
    (element) => element.getClientRects().length > 0,
  );
}

export function openDialogs(): HTMLElement[] {
  // A copy, so a caller cannot change the answer the next one is given.
  return [...currentDialogs()];
}

/** The dialog on top: the last one in the document, since later ones stack over earlier. */
export function topDialog(): HTMLElement | null {
  const dialogs = currentDialogs();
  return dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
}

/** True while any dialog is up, so the character stands still under it. */
export function dialogOpen(): boolean {
  return currentDialogs().length > 0;
}

/**
 * Whether the keyboard belongs to a field rather than to the character.
 *
 * Shift is a modifier as well as a binding: held over a letter in the chat
 * box it means a capital, and a toggle that fired on it would flip the
 * character between walking and sprinting every time somebody typed a name.
 * The same question the E key has to ask before opening anything.
 */
export function typingInAField(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  if (!el) return false;
  return (
    el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable
  );
}
