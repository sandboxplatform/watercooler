/**
 * Where Mettara is served from.
 *
 * One constant, in a file with no imports, because two things need it and
 * they run in different worlds: `next.config.ts` puts it in the CSP's
 * `frame-src`, and the route that hands the browser a conversation URL
 * holds that URL to it. Written down twice it would be a policy that stops
 * naming the site the moment somebody moves it — which is the same
 * argument `lib/voice/ice.ts` is already under for the STUN servers, and
 * for the same reason: a frame the policy does not name is not refused
 * loudly, it is simply blank.
 *
 * It is the origin and only the origin. Which conversation is a fact about
 * Doc, it is answered per person, and it stays on the server — see
 * `app/api/mettara/route.ts`.
 */
export const METTARA_ORIGIN = "https://app.mettara.ai";

/**
 * The query parameter Mettara's embed takes its id from. The embed stamps
 * that id on everything it posts to its parent and ignores anything posted
 * to it under another, so the URL the server builds and the panel that
 * answers the frame have to agree on it — which is why the panel reads it
 * back off the URL rather than being told it separately.
 */
const EMBED_ID = "eid";

/**
 * A conversation in Mettara's embed, stamped with the embed's id, or null
 * if `chat` is not one.
 *
 * The embed rather than the conversation's own page, because the embed is
 * the one that signs in from a token handed to it. The ordinary page signs
 * in with Mettara's own cookie, and a cookie belonging to another site is
 * exactly what a browser withholds from a frame — so a conversation's own
 * address is refused here rather than framed as a sign-in page.
 *
 * Held to `METTARA_ORIGIN` because `chat` comes from the environment, and
 * the CSP is fixed when the app is built: a host it does not name would
 * come up blank, which looks exactly like the app being broken. Any
 * fragment is dropped, since the panel puts the token there.
 */
export function mettaraEmbedUrl(chat: string, embedId: string): string | null {
  let url: URL;
  try {
    url = new URL(chat);
  } catch {
    return null;
  }
  if (url.origin !== METTARA_ORIGIN || !url.pathname.startsWith("/embed/convo/")) return null;
  url.searchParams.set(EMBED_ID, embedId);
  url.hash = "";
  return url.href;
}

/** The embed id a URL from `mettaraEmbedUrl` carries, or null. */
export function embedIdOf(url: string): string | null {
  try {
    return new URL(url).searchParams.get(EMBED_ID) || null;
  } catch {
    return null;
  }
}
