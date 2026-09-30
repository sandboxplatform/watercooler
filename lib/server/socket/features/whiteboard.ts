/**
 * The one whiteboard, shared by every room that hangs it.
 *
 * A stroke arrives in pieces while the pen is moving — the whole line so far,
 * a few times a second — and once more when it is lifted, with `done`. Every
 * piece is relayed so the room watches the line appear; only the finished one
 * is written down. It used to be written on every piece, which was a
 * database write per pointer sample for a line that would be replaced by the
 * next one within a fifth of a second.
 */

import { getRoomStore } from "../../room-store";
import { CHATTY, onWhiteboard } from "../../badge-rules";
import { SHARED_BOARD, isStroke, sanitiseStroke } from "../../../whiteboard";
import { createLogger } from "../../../logger";
import type { Feature, SocketContext } from "../feature";

const log = createLogger("Presence");

export function whiteboardFeature({ out, badges }: SocketContext): Feature {
  return {
    name: "whiteboard",
    room: null,

    onMessage: {
      board(message, { id, slug, player }) {
        if (message.action === "clear") {
          // Budgeted by the dispatcher to one every thirty seconds: a wipe
          // is everybody's drawing gone, on every wall that hangs the board.
          getRoomStore().clearBoard(SHARED_BOARD);
          log.info(`${player.name} cleared the board from "${slug}"`);
          // Everyone everywhere, including the author, so a wipe is unambiguous
          out.broadcastAll({ type: "board", action: "clear", by: player.name });
          return;
        }

        if (!isStroke(message.stroke)) return;
        const done = message.done === true;
        const stroke = sanitiseStroke({ ...message.stroke, author: player.name });
        if (done) getRoomStore().addStroke(SHARED_BOARD, stroke.id, stroke);
        // The author already drew it locally; echoing would double the ink
        out.broadcastAll({ type: "board", action: "draw", stroke, done, by: player.name }, id);
        // Only when the pen comes up: a stroke still being drawn is not a
        // drawing yet.
        if (!done) return;
        const holder = badges.holderOf(id);
        if (holder) {
          badges.announce(
            slug,
            badges.once(holder.person, CHATTY.leftAMark, () => onWhiteboard(holder)),
          );
        }
      },
    },
  };
}
