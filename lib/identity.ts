/**
 * Who the door let in.
 *
 * `visitor` is the shared code: anyone who has been given it. The others are
 * one person each, holding a code they never pass on, so the code *is* the
 * identity — presenting it is enough to be brought in as them. See
 * lib/server/access.ts for how a code becomes one of these.
 *
 * It lives on its own, with no imports, because both sides of the app need
 * it: the server to decide, and the browser to know what it was told. The
 * union used to be written out twice — once in the access gate and once in
 * the shape the gate reports to the browser — which is two places to forget
 * when a third person gets a code.
 */

export type AccessIdentity = "visitor" | "coop" | "rob";

/**
 * What to assume before the server has said.
 *
 * A gate that opens while it waits is not a gate, so the answer until the
 * answer arrives is the identity with the fewest privileges.
 */
export const UNKNOWN_IDENTITY: AccessIdentity = "visitor";
