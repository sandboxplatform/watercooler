import { headers } from "next/headers";

import { docConversationFor, docTokenFor } from "@/lib/server/mettara";
import { identityOf } from "@/lib/server/access";
import { guarded, refuse } from "@/lib/server/route";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("Mettara");

async function identity() {
  return identityOf((await headers()).get("cookie") ?? undefined);
}

/**
 * The conversation Doc is hooked up to, for whoever it belongs to.
 *
 * Plumbing only: which code opened the door is `identityOf`'s to say and
 * whose conversation it is `lib/server/mettara.ts`'s, so both are tested
 * where they live rather than through a request.
 */
export async function GET() {
  const url = docConversationFor(await identity());
  // 403 rather than an empty answer: "not yours" and "not configured" want
  // different things done about them, and the browser tells them apart by
  // the status rather than by guessing from a null.
  if (!url) return refuse("Doc has nothing to say to you.", 403);
  return Response.json({ url });
}

/**
 * A token for the frame to sign in with.
 *
 * A POST rather than a GET because asking is not idempotent: the first
 * token makes the person on Mettara's side if they are not there yet, and
 * every one spends a signed timestamp. The access cookie is `SameSite=Lax`,
 * so another site cannot make somebody's browser ask.
 */
export async function POST() {
  return guarded(
    "open Doc's conversation",
    async () => {
      const token = await docTokenFor(await identity());
      if (!token) return refuse("Doc has nothing to say to you.", 403);
      return Response.json({ token });
    },
    log,
  );
}
