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

/** A conversation's page, by its id. */
export function mettaraConvoUrl(id: string): string {
  return `${METTARA_ORIGIN}/convo/${id}`;
}
