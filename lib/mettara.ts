/**
 * Where Mettara is served from.
 *
 * One constant, in a file with no imports, because two things need it and
 * they run in different worlds: `next.config.ts` puts it in the CSP's
 * `frame-src`, and the route that hands the browser a conversation URL
 * builds one from it. Written down twice it would be a policy that stops
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
 * Which embed on the page a message from the frame is about. Mettara's
 * embed stamps it on everything it posts and ignores anything posted to it
 * under another, so the route that builds the URL and the panel that
 * answers the frame have to agree on it — which is why it is here.
 */
export const DOC_EMBED_ID = "watercooler-doc";

/**
 * A conversation inside Mettara's embed, by its id.
 *
 * The embed rather than the conversation's own page, because the embed is
 * the one that signs in from a token handed to it. The ordinary page signs
 * in with Mettara's own cookie, and a cookie belonging to another site is
 * exactly what a browser withholds from a frame.
 */
export function mettaraEmbedUrl(id: string): string {
  return `${METTARA_ORIGIN}/embed/convo/${id}?eid=${DOC_EMBED_ID}`;
}
