import { createLogger } from "@/lib/logger";

const log = createLogger("Mettara");

/**
 * The conversation Doc is hooked up to, or null if it is not ours to open.
 *
 * Asked of the server rather than worked out here, because the answer
 * depends on which code opened the door and the browser is not the side
 * that knows that. A 403 is the ordinary answer for almost everybody and
 * is not a failure: it comes back as null, and what the world does with a
 * null is show no prompt on Doc at all.
 *
 * Asked **once a page**, which is once per session: identity comes from
 * the access cookie, and there is no way to change that without a page
 * load. A room change is not one (see lib/room-travel.ts), so a scene
 * rebuilt at every door would otherwise re-ask on every floor for an
 * answer that cannot have moved.
 */
let asked: Promise<string | null> | null = null;

export function docConversation(): Promise<string | null> {
  asked ??= (async () => {
    try {
      const response = await fetch("/api/mettara", { cache: "no-store" });
      if (!response.ok) return null;
      const body = (await response.json()) as { url?: string };
      return body.url ?? null;
    } catch (err) {
      // Kept as the answer rather than retried: a world that grows a prompt
      // on Doc a minute after somebody walked past him is stranger than one
      // that never had it.
      log.warn("could not ask whether Doc is hooked up:", (err as Error).message);
      return null;
    }
  })();
  return asked;
}
