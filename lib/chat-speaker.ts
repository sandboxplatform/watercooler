import type { ChatMessage } from "@/types/game";

/**
 * Who a chat bubble is from, in words.
 *
 * Everything in the log is somebody in the room talking. A remark is signed
 * with the speaker's presence id and name; one without a signature is from
 * before signing existed, and was only ever this browser's own.
 */
export function speakerLabel(
  msg: Pick<ChatMessage, "actorName" | "authorId">,
  self: { id: string | null; name: string },
): string {
  const mine =
    !msg.authorId ||
    msg.authorId === self.id ||
    (msg.actorName !== undefined && msg.actorName === self.name);
  return mine ? "You" : (msg.actorName ?? "Someone");
}
