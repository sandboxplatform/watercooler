import * as Phaser from "phaser";
import { currentRoom } from "@/lib/room-client";
import { flowBars, flowRows, type Flow } from "@/lib/trello/flow";
import { PULSE_REFRESH_MS } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { CountBoard, type CountBay, type CountReading } from "./CountBoard";

const log = createLogger("ProjectFlow");

/**
 * The five stage counts, lit up beside the project board they count.
 *
 * The plate, the bays and the timer are `systems/CountBoard`, the same as
 * the support desk's counts across the corridor. What is particular to this
 * one is where the numbers come from — the building's own board, asked for
 * by room — and that the five are **one bank**, so they hang as one row
 * wrapped rather than two banks with a line between: Backlog through
 * Testing are stages of a single flow and each bar is that stage's share of
 * the work in flight.
 *
 * Which stages, and which board, are the building's business and are read
 * at the moment the numbers are fetched (`flow` in `lib/world/tenants.ts`).
 * So the bays cannot be built until the first answer comes back, which is
 * why this one asks before it draws.
 */
export class ProjectFlow {
  constructor(private scene: Phaser.Scene) {}

  /**
   * Ask the room what it counts, then build the board on it.
   *
   * Hands back a teardown straight away, before the answer: the scene
   * restarts on every lift ride, and a reply that lands afterwards must not
   * draw a plate into a room nobody is in — `stopped` is what keeps it
   * from doing so, and it also carries the board's own teardown once there
   * is one.
   */
  place(box: { tx: number; ty: number; tw: number; th: number }, tile: number): () => void {
    let stop: (() => void) | null = null;
    let stopped = false;

    void fetchFlow().then((flow) => {
      // Nothing to letter the bays with: an unconfigured Trello, a board
      // that could not be read, a room that counts nothing. The wall stays
      // bare rather than showing five headings with dashes under them,
      // which would read as a board that is broken rather than absent.
      if (stopped || !flow || flow.lanes.length === 0) return;
      const rows = flowRows(
        flow.lanes.map(
          (lane): CountBay => ({ id: lane.id, short: lane.short, colour: lane.colour }),
        ),
      );
      const board = new CountBoard(this.scene, {
        rows,
        // One bank wrapped over two rows, so no line: the five compare with
        // each other and a line across the middle would say they do not.
        divider: false,
        read: async () => reading(await fetchFlow()),
        every: PULSE_REFRESH_MS,
        what: "the board",
      });
      stop = board.place(box, tile);
    });

    return () => {
      stopped = true;
      stop?.();
    };
  }
}

/** The stages, from the room's own server. Null where there are none to show. */
async function fetchFlow(): Promise<Flow | null> {
  try {
    const room = encodeURIComponent(currentRoom());
    const response = await fetch(`/api/trello/flow?room=${room}`, { cache: "no-store" });
    const answer = (await response.json()) as { flow?: Flow };
    return answer.flow ?? null;
  } catch (err) {
    log.warn("could not count the board:", (err as Error).message);
    return null;
  }
}

/**
 * What each bay shows.
 *
 * A lane the board has no list for is left out altogether rather than given
 * a figure, so it is drawn dead grey like a board nobody has counted yet:
 * an empty lane and a lane that is not there mean opposite things, and a
 * coloured zero would say the wrong one.
 */
function reading(flow: Flow | null): ReadonlyMap<string, CountReading> | null {
  if (!flow) return null;
  const bars = flowBars(flow);
  const out = new Map<string, CountReading>();
  for (const lane of flow.lanes) {
    if (lane.missing) continue;
    out.set(lane.id, { figure: String(lane.count), fill: bars[lane.id], value: lane.count });
  }
  return out;
}
