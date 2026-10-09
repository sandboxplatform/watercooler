import { createHmac } from "node:crypto";

import type { AccessIdentity } from "../identity";
import { mettaraEmbedUrl } from "../mettara";
import { personaFor } from "./access";
import { outboundSignal } from "./outbound";

/**
 * Which conversation on Mettara Doc is hooked up to, whose it is, and the
 * token that signs them in to it.
 *
 * The conversation is the Customer Success group chat. It already exists
 * on Mettara with these people in it; nothing here makes one.
 *
 * Its id is server-side so that it reaches only the browsers it is for.
 * Written into `lib/world/residents.ts` beside his lines it would read
 * better — it is a fact about Doc — and it would also ship in the browser
 * bundle to every visitor who ever loads the world, since the scenes read
 * the cast out of that module.
 *
 * The secret is the part that matters. The frame signs in with a token,
 * not with Mettara's own cookie (a browser withholds another site's cookie
 * from a frame), and a token is asked of Mettara with a request signed by
 * the platform's secret. That signing happens here and nowhere else: what
 * goes back to the browser is the token, which lasts four hours and is
 * good for nothing beyond Mettara's embed.
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

/**
 * The Mettara team the conversation belongs to, as this world names it.
 *
 * Both halves have to match Mettara before the first token is asked for,
 * and getting either wrong does something on Mettara's side rather than
 * failing here:
 *
 * - `id` is recorded against the team in Mettara's dev portal, under the
 *   Watercooler system. An id Mettara has never seen is taken to be a new
 *   team, and Mettara makes one — empty, with no conversation in it.
 * - `name` is the team's own name there. Mettara renames the team to
 *   whatever is sent, on every request.
 */
const DOC_TEAM = { id: "sandbox-erp", name: "Sandbox" } as const;

/**
 * Which of the platform's systems those ids are recorded under — the key of
 * the one the dev portal shows as "Watercooler". Mettara keeps an id per
 * system, and a request that does not say which is read in `default`,
 * where nobody's email is recorded: it then finds the account by address,
 * sees it is not linked, and refuses with `email_in_use`.
 */
const DOC_NAMESPACE = "watercooler";

/** Where tokens are asked for. The API is its own host, not the one framed. */
const METTARA_API = "https://api.mettara.ai/api/v1";

interface Hookup {
  platformId: string;
  secret: string;
  email: string;
}

/**
 * Everything a token request needs for this person, or null.
 *
 * The email is the whole of who somebody is to Mettara. It is their id
 * there as well as their address: each of the three has it recorded as
 * their id in Mettara's Watercooler system, which is how a token finds the
 * account already in the group chat. One variable each, named the way
 * `ACCESS_CODE_*` is, so the address is not written into a build that
 * ships to npm.
 *
 * Somebody on the list without one is not hooked up, and neither is
 * anybody while the platform's credentials are missing. Both answer null
 * rather than a prompt over Doc that opens onto a refusal.
 */
function hookupFor(identity: AccessIdentity): Hookup | null {
  if (!MAY_TALK.includes(identity)) return null;
  const platformId = process.env.METTARA_WORKSPACE_ID?.trim();
  const secret = process.env.METTARA_API_SECRET?.trim();
  // Lowercased the way Mettara's own library sends it, which is the form
  // Mettara keeps and verifies against.
  const email = process.env[`METTARA_EMAIL_${identity.toUpperCase()}`]?.trim().toLowerCase();
  return platformId && secret && email ? { platformId, secret, email } : null;
}

/** The conversation this person may open, or null if it is not theirs. */
export function docConversationFor(identity: AccessIdentity): string | null {
  if (!hookupFor(identity)) return null;
  // A blank or absent override is no override: an environment variable set
  // to nothing is somebody having meant to unset it, not a request for a
  // conversation with no id.
  return mettaraEmbedUrl(process.env.METTARA_DOC_CONVO?.trim() || DOC_CONVO);
}

/**
 * RFC 3986 percent-encoding, which is what Mettara signs over.
 * `encodeURIComponent` is that except for `!'()*`, which it leaves alone —
 * and a name with an apostrophe in it would then sign as something Mettara
 * never computes.
 */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * The signature on a token request, computed the way Mettara recomputes
 * it: every field sorted by name, each name and value percent-encoded,
 * joined as `key=value&…`, and HMAC-SHA256'd in hex with the secret.
 */
export function signMettara(params: Readonly<Record<string, string>>, secret: string): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${rfc3986(key)}=${rfc3986(params[key])}`)
    .join("&");
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

/**
 * A fresh token for this person's frame, or null if Doc is not theirs.
 *
 * Asked for when the panel opens rather than when the page loads, since
 * every request is a signed timestamp Mettara accepts once, and somebody
 * walking past Doc has not asked for anything. Throws when Mettara says no:
 * a 400 means the signature, the clock or the email, and Mettara keeps the
 * reason in its own logs rather than in the answer.
 */
export async function docTokenFor(identity: AccessIdentity): Promise<string | null> {
  const hookup = hookupFor(identity);
  if (!hookup) return null;

  // Trimmed values only: Mettara trims every field before verifying, so a
  // stray space signed here would be a signature over a different string.
  const params = {
    platform_id: hookup.platformId,
    // The address, not `coop`: it is what the dev portal has recorded.
    source_user_id: hookup.email,
    source_group_id: DOC_TEAM.id,
    source_group_name: DOC_TEAM.name,
    name: personaFor(identity)?.name ?? identity,
    email: hookup.email,
    // Must be within five minutes of Mettara's clock.
    t: new Date().toISOString(),
  };
  const response = await fetch(`${METTARA_API}/embed/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `namespace` rides outside the signature, the way Mettara's own
    // example for this platform sends it.
    body: JSON.stringify({
      ...params,
      sig: signMettara(params, hookup.secret),
      namespace: DOC_NAMESPACE,
    }),
    signal: outboundSignal(),
  });
  if (!response.ok) {
    throw new Error(`Mettara refused a token: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { result?: { access_token?: unknown } };
  const token = body.result?.access_token;
  if (typeof token !== "string" || !token) throw new Error("Mettara answered without a token");
  return token;
}
