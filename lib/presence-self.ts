/**
 * This browser's own player id.
 *
 * The room socket hands it over once, in the welcome frame. Anything that
 * needs to address another player — a ping pong challenge, say — needs to
 * know which of the people in the room is itself, and may well mount long
 * after that frame arrived, so it is kept here rather than announced.
 */

let selfId: string | null = null;

export function rememberSelfId(id: string): void {
  selfId = id;
}

export function getSelfId(): string | null {
  return selfId;
}

/**
 * Which browser tab this is.
 *
 * Minted once and kept in `sessionStorage`, which is exactly the right
 * lifetime: it survives a reload, it is not shared with another tab, and it
 * is gone when the tab is. The socket sends it with every join so the server
 * can tell one person coming back from two people arriving — see `session`
 * on `JoinMessage` for why pinging the incumbent cannot tell them apart.
 *
 * Every read and write is guarded: `sessionStorage` throws outright in some
 * privacy modes, and a browser that cannot keep one is no worse off than
 * before — it is challenged at the door like any other newcomer.
 */
const TAB_KEY = "watercooler:tab";

let tab: string | null = null;

export function tabSession(): string | undefined {
  if (tab) return tab;
  if (typeof window === "undefined") return undefined;
  try {
    const kept = window.sessionStorage.getItem(TAB_KEY);
    if (kept) {
      tab = kept;
      return tab;
    }
    const minted = crypto.randomUUID();
    window.sessionStorage.setItem(TAB_KEY, minted);
    tab = minted;
    return tab;
  } catch {
    return undefined;
  }
}
