/**
 * The one basketball, on the court on the world map.
 *
 * One for the server rather than one per room, because there is one court:
 * the thing that makes it worth having is that it is the same ball everybody
 * is looking at. In memory, because where a ball is lying is something
 * happening rather than something kept.
 *
 * **On the wire only when it has moved.** It went out every tick while it
 * was "live", and a ball in somebody's hands is live — so a person standing
 * still holding it put the same coordinates on the wire twenty times a
 * second. Now a tick that would say what the last one said says nothing,
 * except the tick it comes to rest, which is always sent so nobody is left
 * drawing it mid-roll.
 */

import { Basketball } from "../../basketball";
import { TICK_MS, type BasketballBroadcast } from "../../../presence-types";
import { WORLD_ROOM_SLUG } from "../../../rooms";
import { onBasket } from "../../badge-rules";
import type { Feature, SocketContext } from "../feature";

type Ball = BasketballBroadcast["ball"];
type Scored = NonNullable<BasketballBroadcast["scored"]>;

const sameBall = (a: Ball | null, b: Ball) =>
  a !== null && a.x === b.x && a.y === b.y && a.z === b.z && a.heldBy === b.heldBy;

export function basketballFeature({ state, out, badges }: SocketContext): Feature {
  const basketball = new Basketball();
  /** The ball as last put on the wire. */
  let sent: Ball | null = null;
  /** Whether it was doing something last tick, so the tick it settles is published. */
  let wasLive = false;

  /** Where somebody is standing, as the world map's own record has them. */
  const carrierOf = (id: string) => {
    const player = state.rooms.get(WORLD_ROOM_SLUG)?.hub.get(id);
    return player ? { x: player.x, y: player.y, facing: player.facing } : null;
  };

  /** The ball, as the wire carries it: whole pixels are plenty for a ball. */
  const ballNow = (): Ball => {
    const ball = basketball.state;
    return {
      x: Math.round(ball.x),
      y: Math.round(ball.y),
      z: Math.round(ball.z),
      heldBy: ball.heldBy,
    };
  };

  /**
   * Tell the world map where the ball is. That room only: it is the one
   * with a court in it. A frame in flight is lossy — the next tick says it
   * again — and a moment somebody is watching for is not.
   */
  const publish = (ball: Ball, { lossy = false, scored }: { lossy?: boolean; scored?: Scored }) => {
    sent = ball;
    out.broadcast(
      WORLD_ROOM_SLUG,
      { type: "basketball", ball, ...(scored ? { scored } : {}) },
      { lossy },
    );
  };

  return {
    name: "basketball",
    room: WORLD_ROOM_SLUG,

    onMessage: {
      basketball(message, { id, player }) {
        const at = { x: player.x, y: player.y, facing: player.facing };
        const power =
          typeof message.power === "number" && Number.isFinite(message.power) ? message.power : 0;
        const acted =
          message.action === "take"
            ? basketball.take(id, at)
            : message.action === "throw"
              ? basketball.release(id, at, power)
              : (basketball.drop(id, at), true);
        // Published at once rather than on the next tick: picking a ball up
        // and throwing it are the two moments somebody is watching for, and
        // a frame of nothing after pressing E reads as the press not landing.
        if (!acted) return;
        wasLive = true;
        publish(ballNow(), {});
      },
    },

    /**
     * Move the ball on, and mark a basket. Only while somebody is out there
     * to see it: the map is never empty — Michael lives on it — so the room
     * existing says nothing, and a ball nobody is watching waits where it is.
     */
    tick() {
      const room = state.rooms.get(WORLD_ROOM_SLUG);
      if (!room || room.sockets.size === 0) return;
      const { scored, live } = basketball.step(TICK_MS, carrierOf);
      if (scored) {
        const by = room.hub.get(scored.by)?.name ?? "Someone";
        publish(ballNow(), { scored: { side: scored.hoop.side, by } });
        wasLive = true;
        const holder = badges.holderOf(scored.by);
        if (holder) badges.announce(WORLD_ROOM_SLUG, onBasket(holder, scored.shot));
        return;
      }
      const settling = wasLive && !live;
      wasLive = live;
      const ball = ballNow();
      if (!settling && sameBall(sent, ball)) return;
      publish(ball, { lossy: live });
    },

    /**
     * Where the ball is lying, for somebody walking onto the map. A still
     * ball is published once and then not again, so without this an arrival
     * would see an empty court until somebody touched it.
     */
    catchUp(slug, _id, socket) {
      if (slug === WORLD_ROOM_SLUG) out.send(socket, { type: "basketball", ball: ballNow() });
    },

    /**
     * A carried ball goes down where its carrier was last seen. Only the
     * person holding it can let go of it, so a ball still in the hands of a
     * closed tab — or of somebody who walked indoors — would hang over the
     * court and never be reachable again.
     */
    onDrop(id) {
      if (!basketball.heldBy(id)) return;
      basketball.drop(id);
      wasLive = true;
    },
  };
}
