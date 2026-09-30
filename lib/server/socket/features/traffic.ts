/**
 * The cars on the highway at the east edge of the world map.
 *
 * Stepped off the socket's one ticker, and published only when the road
 * changes — a car setting off, a car leaving. See `TrafficBroadcast`.
 */

import { Traffic } from "../../traffic";
import { CHATTY, onRunThrough } from "../../badge-rules";
import { TICK_MS } from "../../../presence-types";
import { WORLD_ROOM_SLUG } from "../../../rooms";
import { carBox } from "../../../world/traffic";
import type { PresenceHub } from "../../presence-hub";
import type { Feature, SocketContext } from "../feature";

export function trafficFeature({ state, out, badges }: SocketContext): Feature {
  const traffic = new Traffic();

  /**
   * Anybody a car is currently driving through.
   *
   * Nothing collides with the traffic and nothing should — see
   * `onRunThrough` — so this only notices. Every tick, because the person
   * standing still in the road is exactly the case: the car does the moving.
   * Cheap on purpose: the road is read as kept rather than copied, it is
   * nearly always empty, and `peopleIn` allocates nothing until there is
   * somebody to name.
   */
  const runOver = (hub: PresenceHub) => {
    for (const car of traffic.driving) {
      for (const id of hub.peopleIn(carBox(car))) {
        const holder = badges.holderOf(id);
        if (!holder) continue;
        badges.announce(
          WORLD_ROOM_SLUG,
          badges.once(holder.person, CHATTY.rightOfWay, () => onRunThrough(holder)),
        );
      }
    }
  };

  return {
    name: "traffic",
    room: WORLD_ROOM_SLUG,

    /**
     * Move the traffic on, and say so when the road has changed. Only while
     * a person is out there: the map is never empty — the residents take the
     * air on it all day — so the room existing is no sign of anybody
     * watching, and a road nobody is looking at can wait.
     */
    tick(now) {
      const room = state.rooms.get(WORLD_ROOM_SLUG);
      if (!room || room.sockets.size === 0) return;
      const news = traffic.step(TICK_MS, now);
      runOver(room.hub);
      if (news) out.broadcast(WORLD_ROOM_SLUG, { type: "traffic", cars: traffic.onTheRoad });
    },

    /** What is on the road, which is published only when it changes. */
    catchUp(slug, _id, socket) {
      if (slug === WORLD_ROOM_SLUG) out.send(socket, { type: "traffic", cars: traffic.onTheRoad });
    },
  };
}
