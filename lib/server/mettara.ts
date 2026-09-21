import type { AccessIdentity } from "../identity";
import { mettaraConvoUrl } from "../mettara";

/**
 * Which conversation on Mettara Doc is hooked up to, and whose it is.
 *
 * This is the only place the conversation id exists in the running app,
 * and that is the point of it being server-side at all. Written into
 * `lib/world/residents.ts` beside his lines it would read better — it is a
 * fact about Doc — and it would also ship in the browser bundle to every
 * visitor who ever loads the world, since the scenes read the cast out of
 * that module. Answered per person, it stays on the server for everyone it
 * is not for.
 *
 * It is a link rather than a secret: anybody holding it can open it in
 * their own browser, and Mettara decides for itself who may read it. So
 * what this settles is the **world** — who finds that Doc has anything to
 * say when they walk up to him — rather than who can reach a conversation.
 */

/**
 * Whose Doc is this.
 *
 * A list rather than a name, because the question being asked is "is this
 * person on it" — so somebody else joining is an entry here rather than a
 * rewritten condition, which is what it has already been once. It is one
 * conversation and the same one for all of them: a group chat is a place
 * several people are in, not a conversation each.
 *
 * Everybody else gets a plain no rather than a fallback to somebody's
 * conversation, and what a no means in the world is that Doc says his line
 * and goes back to work.
 */
const MAY_TALK: readonly AccessIdentity[] = ["coop", "rob", "andrew"];

/**
 * The conversation, overridable without a deploy: the id changes when the
 * conversation does, and that is not the same event as shipping a build.
 *
 * Only the id, never a whole URL. The origin is `METTARA_ORIGIN`, which is
 * also what `next.config.ts` puts in the CSP's `frame-src` — and a URL
 * from the environment could name a host the policy has never heard of.
 * The frame would then come up blank, which looks exactly like the app
 * being broken and is nowhere near it.
 */
const DOC_CONVO = "2289f3f8-1635-40f6-8bdd-cb9a958093ce";

/** The conversation this person may open, or null if it is not theirs. */
export function docConversationFor(identity: AccessIdentity): string | null {
  if (!MAY_TALK.includes(identity)) return null;
  // A blank or absent override is no override: an environment variable set
  // to nothing is somebody having meant to unset it, not a request for a
  // conversation with no id.
  return mettaraConvoUrl(process.env.METTARA_DOC_CONVO?.trim() || DOC_CONVO);
}
