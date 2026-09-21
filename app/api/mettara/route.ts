import { headers } from "next/headers";

import { docConversationFor } from "@/lib/server/mettara";
import { identityOf } from "@/lib/server/access";

export const dynamic = "force-dynamic";

/**
 * The conversation Doc is hooked up to, for whoever it belongs to.
 *
 * Plumbing only: which code opened the door is `identityOf`'s to say and
 * whose conversation it is `lib/server/mettara.ts`'s, so both are tested
 * where they live rather than through a request.
 */
export async function GET() {
  const identity = identityOf((await headers()).get("cookie") ?? undefined);
  const url = docConversationFor(identity);
  // 403 rather than an empty answer: "not yours" and "not configured" want
  // different things done about them, and the browser tells them apart by
  // the status rather than by guessing from a null.
  if (!url) return Response.json({ error: "Doc has nothing to say to you." }, { status: 403 });
  return Response.json({ url });
}
