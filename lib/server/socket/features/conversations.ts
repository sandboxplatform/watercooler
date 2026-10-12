/**
 * Who has a resident's conversation open, so that resident stays put.
 *
 * Walk up to Doc and press E and a window opens onto his conversation —
 * and the panel holds the keys, so whoever opened it stands still. He did
 * not: he carried on pacing Support underneath it, off to the far end of
 * the counter or out of the door to the map, and somebody in the middle of
 * talking to him looked up to find him gone. He stays where he is now for
 * as long as the window is open, turned to whoever is talking to him.
 *
 * The browser says one word — whose conversation is open — and the server
 * settles the rest, because the resident is the simulation's and the
 * simulation is the server's. Three things have to be true, and only the
 * first is settled when the message arrives:
 *
 * | Rule                       | Why                                                                                                                     |
 * | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
 * | Hooked up to it            | The same answer that put the prompt over his head. Anybody else could type the message out and stop him for good        |
 * | In the room he is in       | Rooms are separate worlds; somebody two floors up is not talking to him                                                 |
 * | Standing within reach      | Asked every tick. `?doc=1` opens the window from anywhere, and having it open across the map is not talking to him      |
 *
 * Forgotten on a drop, which is a reconnection and also every room change:
 * the browser says it again on the `welcome` that follows either (see
 * `lib/conversation-client`), so what is held here is never older than the
 * connection's current room.
 */

import type { AccessIdentity } from "../../access";
import { docConversationFor } from "../../mettara";
import { fixture, type FixtureId } from "../../../fixtures";
import type { Point } from "../../../world/route";
import type { Feature, SocketContext } from "../feature";

interface Conversation {
  /** The fixture whose prompt opens it, for how near is near enough. */
  fixture: FixtureId;
  /** Whether this person is hooked up to it. */
  mayOpen(identity: AccessIdentity): boolean;
}

/**
 * Everybody with a conversation behind them, by resident id. One, today —
 * the same one `systems/TalkTo` hangs a prompt over.
 *
 * A Map rather than an object literal because the key is whatever a
 * browser sent: `"constructor"` looked up on a plain object finds a
 * function, and calling it answers something truthy.
 */
const CONVERSATIONS: ReadonlyMap<string, Conversation> = new Map([
  ["doc", { fixture: "doc-chat", mayOpen: (identity) => docConversationFor(identity) !== null }],
]);

/**
 * How much further than the prompt's reach somebody may stand and still
 * be holding him, as a multiple of it.
 *
 * The prompt is measured against where he is _drawn_, which trails where
 * he is by about half a tile while he paces, and he takes a step or two
 * more before the message reaches the server. So the room's record of the
 * two of them is further apart than the browser's was when E was pressed,
 * and the prompt's own radius would turn down a press it had just taken.
 * Twice it is still somebody standing in front of him.
 */
export const REACH_SLACK = 2;

export interface ConversationsFeature extends Feature {
  /**
   * The simulation's `talking`: where somebody standing within reach of
   * this resident, with his conversation open, is standing — or null.
   */
  listener(residentId: string, slug: string, at: Point): Point | null;
}

export function conversationsFeature({
  state,
}: Pick<SocketContext, "state">): ConversationsFeature {
  /** Whose conversation each connection has open, by resident id. Only the open ones. */
  const open = new Map<string, string>();

  return {
    name: "conversations",
    room: null,

    onMessage: {
      talk(message, { id, identity }) {
        if (message.to === null) {
          open.delete(id);
          return;
        }
        if (typeof message.to !== "string") return;
        if (!CONVERSATIONS.get(message.to)?.mayOpen(identity)) return;
        open.set(id, message.to);
      },
    },

    onDrop(id) {
      open.delete(id);
    },

    listener(residentId, slug, at) {
      // Asked of every resident on every tick of the simulation, so the
      // ordinary answer — nobody has anything open — is one comparison.
      if (open.size === 0) return null;
      const conversation = CONVERSATIONS.get(residentId);
      const hub = state.rooms.get(slug)?.hub;
      if (!conversation || !hub) return null;
      const reach = fixture(conversation.fixture).radius * REACH_SLACK;
      for (const [id, to] of open) {
        if (to !== residentId || state.roomOf.get(id) !== slug) continue;
        const person = hub.get(id);
        if (!person || person.hidden) continue;
        if (Math.hypot(person.x - at.x, person.y - at.y) > reach) continue;
        return { x: person.x, y: person.y };
      }
      return null;
    },
  };
}
