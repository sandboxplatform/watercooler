import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildFloorSpec,
  HEIGHT,
  HELP_DESK,
  OPS_HEIGHT,
  OPS_ROOM_COUNT,
  type OpsRoom,
  opsProjectFlow,
  opsRooms,
  opsSupportRoom,
  opsSupportSign,
  opsWhiteboardRoom,
  opsWidth,
  PLAYER_START,
  PROJECT_BOARD,
  PROJECT_FLOW,
  SUPPORT_PULSE,
  WIDTH,
} from "../floor";
import { deriveCollisions, generateMap, paintShell, solidRuns, wallCollisions } from "../generate";
import { STANDABLE } from "../office";
import type { SourceMap } from "../harvest";
import type { RoomSpec } from "../spec";
import { DESK_SLOTS, deskBox, standingSpot } from "../../world/desks";

const source = JSON.parse(
  readFileSync(join(process.cwd(), "public/maps/office2.json"), "utf8"),
) as SourceMap & { tilesets: [] };

const spec = buildFloorSpec(source);
const map = generateMap(spec, []);
const objects = (name: string) => {
  const l = map.layers.find((x) => x.name === name);
  if (!l || l.type !== "objectgroup") throw new Error(`no object layer ${name}`);
  return l.objects;
};

describe("a floor", () => {
  it("is a room with the same layers as the lobby", () => {
    expect(map.width).toBe(WIDTH);
    expect(map.height).toBe(HEIGHT);
    for (const name of ["floor", "walls", "ground", "furniture", "objects", "overhead"]) {
      expect(map.layers.find((x) => x.name === name)?.type).toBe("tilelayer");
    }
  });

  it("has the whiteboard on the wall, with its point in reach of the floor", () => {
    const board = objects("pois").find((o) => /whiteboard/i.test(o.name))!;
    expect(board).toBeDefined();
    expect(board.y).toBeLessThan(3 * 48);
  });

  it("has a lift and no door", () => {
    const transitions = objects("transitions");
    expect(transitions.map((t) => t.name)).toEqual(["elevator"]);
    expect(transitions[0].y! + transitions[0].height!).toBe(HEIGHT * 48);
  });

  it("stands the person on the floor, not in a wall", () => {
    const shell = paintShell(spec);
    expect(STANDABLE).toContain(shell[PLAYER_START.ty * WIDTH + PLAYER_START.tx]);
  });

  it("has room for every desk, off the walls, clear of the lift and the spawn", () => {
    const walls = wallCollisions(spec);
    const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const lift = objects("transitions")[0];
    const liftBox = { x: lift.x!, y: lift.y!, width: lift.width!, height: lift.height! };
    DESK_SLOTS.forEach((_, i) => {
      const box = deskBox(i);
      for (const wall of walls) expect(overlaps(box, wall), `desk ${i} in a wall`).toBe(false);
      expect(overlaps(box, liftBox), `desk ${i} in the lift`).toBe(false);
      const spot = standingSpot(i);
      expect(spot.x).toBeGreaterThan(48);
      expect(spot.y).toBeLessThan((HEIGHT - 1) * 48);
      for (const wall of walls) {
        const inside =
          spot.x >= wall.x &&
          spot.x < wall.x + wall.width &&
          spot.y >= wall.y &&
          spot.y < wall.y + wall.height;
        expect(inside, `spot ${i} in a wall`).toBe(false);
      }
    });
  });
});

/**
 * An Operations floor is two rooms off a hallway rather than one open space.
 *
 * The lift lands you in the hallway; Operations is the room directly above
 * it, with the boards on its wall, and the project room is beside it. What
 * these hold down is that both rooms can actually be got into — a doorway is
 * a gap in a wall, and a wall with no gap is a room nobody can reach, which
 * looks perfectly fine on the map.
 */
describe("an Operations floor", () => {
  const ops = buildFloorSpec(source, { boards: ["trello", "zoho"] });
  const map = generateMap(ops, []);
  const W = ops.width;
  const floorLayer = () => {
    const l = map.layers.find((x) => x.name === "floor");
    if (!l || l.type !== "tilelayer") throw new Error("no floor layer");
    return l.data;
  };

  it("is its own size, and leaves an ordinary floor alone", () => {
    expect([ops.width, ops.height]).toEqual([opsWidth(OPS_ROOM_COUNT), OPS_HEIGHT]);
    expect(ops.height).toBeGreaterThan(HEIGHT);
    const plain = buildFloorSpec(source);
    expect([plain.width, plain.height]).toEqual([WIDTH, HEIGHT]);
    expect(plain.partitions ?? []).toEqual([]);
  });

  /** A wall above the corridor and one below it, each with its rank's doors. */
  it("walls the corridor off from both ranks", () => {
    const across = (ops.partitions ?? []).filter((p) => p.orientation === "horizontal");
    expect(across).toHaveLength(2);
    for (const wall of across) expect(wall.doorways?.length).toBeGreaterThan(0);
  });

  /**
   * The shape's whole point: more projects, a longer corridor, nothing else
   * redrawn. Two rooms to a bay, and the height never changes.
   */
  it("grows sideways as rooms are added, and not downwards", () => {
    // Two rooms to a bay, so an odd count is as wide as the even one above it.
    expect(opsWidth(1)).toBe(opsWidth(2));
    expect(opsWidth(3)).toBe(opsWidth(4));
    expect(opsWidth(4)).toBeGreaterThan(opsWidth(2));
    expect(opsWidth(6)).toBeGreaterThan(opsWidth(4));
    for (const n of [2, 4, 6]) {
      const laid = opsRooms(n);
      expect(laid).toHaveLength(n);
      expect(laid.filter((r) => r.rank === "upper")).toHaveLength(n / 2);
      expect(laid.filter((r) => r.rank === "lower")).toHaveLength(n / 2);
    }
  });

  /**
   * The ride has to land you somewhere that says where you are, so the lift
   * is set into the lower wall directly beneath the door to Operations — the
   * room the floor is named after. You step out facing it.
   */
  it("sets the lift into the lower wall under the door to Operations", () => {
    const lift = ops.transitions.find((t) => t.name === "elevator")!;
    const [operations] = opsRooms(OPS_ROOM_COUNT);
    expect(lift.tx).toBe(operations.door.from);
    expect(lift.tw ?? 1).toBe(operations.door.to - operations.door.from);

    const [upper, lower] = (ops.partitions ?? []).filter((p) => p.orientation === "horizontal");
    // Standing room in the corridor, reaching into the wall below it.
    expect(lift.ty).toBeGreaterThan(upper.at);
    expect(lift.ty + (lift.th ?? 0)).toBeGreaterThan(lower.at);
  });

  /**
   * And the wall it is set into has to be solid there, or the lift would sit
   * in a doorway. The lower rank's doors are offset for exactly this reason.
   */
  it("keeps the lower rank's doorways clear of the lift", () => {
    const lift = ops.transitions.find((t) => t.name === "elevator")!;
    const lower = (ops.partitions ?? []).find(
      (p) => p.orientation === "horizontal" && p.at > lift.ty,
    )!;
    for (const door of lower.doorways ?? []) {
      const overlaps = door.from < lift.tx + (lift.tw ?? 1) && lift.tx < door.to;
      expect(overlaps, `door ${door.from}-${door.to} vs lift ${lift.tx}`).toBe(false);
    }
  });

  /** Every tile you can stand on has to be reachable from where the lift puts you. */
  it("lets you walk from the lift into both rooms", () => {
    const data = floorLayer();
    const solid = deriveCollisions(ops).concat(wallCollisions(ops));
    const t = ops.tileSize;
    const blocked = (x: number, y: number) =>
      solid.some(
        (r) => x * t >= r.x && x * t < r.x + r.width && y * t >= r.y && y * t < r.y + r.height,
      );
    const walkable = (x: number, y: number) =>
      STANDABLE.includes(data[y * W + x]) && !blocked(x, y);

    const start = ops.spawns[0];
    expect(walkable(start.tx, start.ty), "the spawn itself").toBe(true);

    const seen = new Set([start.ty * W + start.tx]);
    const queue = [[start.tx, start.ty] as const];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= ops.height) continue;
        const key = ny * W + nx;
        if (seen.has(key) || !walkable(nx, ny)) continue;
        seen.add(key);
        queue.push([nx, ny]);
      }
    }

    let total = 0;
    for (let y = 0; y < ops.height; y++) for (let x = 0; x < W; x++) if (walkable(x, y)) total++;
    expect(seen.size, "reachable of walkable").toBe(total);

    // And specifically: a tile in the middle of every room.
    for (const [i, room] of opsRooms(OPS_ROOM_COUNT).entries()) {
      const x = room.x + 3;
      const y = room.y + 2;
      expect(walkable(x, y), `room ${i} floor`).toBe(true);
      expect(seen.has(y * W + x), `room ${i} reachable`).toBe(true);
    }
  });

  /**
   * And along a rank, without the corridor: neighbouring rooms share a wall
   * and there is a doorway through it, so crossing the floor is not a walk
   * back out to the hallway and along it. Six rooms, because with the pair
   * above there are no neighbours to connect.
   *
   * The corridor's own rows are taken out of the flood, or it would pass
   * whether or not the shared walls have a gap in them.
   */
  it("lets you walk from one room into the next without the corridor", () => {
    const six = buildFloorSpec(source, { boards: ["trello", "zoho"], rooms: 6 });
    const between = (six.partitions ?? []).filter((p) => p.orientation === "vertical");
    expect(between).toHaveLength(4);
    for (const wall of between) expect(wall.doorways?.length).toBeGreaterThan(0);

    const width = six.width;
    const layer = generateMap(six, []).layers.find((x) => x.name === "floor")!;
    if (layer.type !== "tilelayer") throw new Error("no floor layer");
    const solid = deriveCollisions(six).concat(wallCollisions(six));
    const t = six.tileSize;
    const rooms = opsRooms(6);
    const [upper] = (six.partitions ?? []).filter((p) => p.orientation === "horizontal");
    const corridor = { from: upper.at, to: rooms.find((r) => r.rank === "lower")!.y };
    const walkable = (x: number, y: number) =>
      y < corridor.from &&
      STANDABLE.includes(layer.data[y * width + x]) &&
      !solid.some(
        (r) => x * t >= r.x && x * t < r.x + r.width && y * t >= r.y && y * t < r.y + r.height,
      );

    const [start] = rooms;
    const seen = new Set<number>();
    const queue = [[start.x + 3, start.y + 2] as const];
    seen.add(queue[0][1] * width + queue[0][0]);
    while (queue.length) {
      const [x, y] = queue.pop()!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= six.height) continue;
        const key = ny * width + nx;
        if (seen.has(key) || !walkable(nx, ny)) continue;
        seen.add(key);
        queue.push([nx, ny]);
      }
    }

    for (const [i, room] of rooms.entries()) {
      if (room.rank !== "upper") continue;
      const x = room.x + 3;
      const y = room.y + 2;
      expect(seen.has(y * width + x), `room ${i} from Operations, along the rank`).toBe(true);
    }
  });

  /**
   * A board hangs in the room it is about, and no room carries the lot.
   *
   * Six rooms rather than the pair above, because that is the shape the
   * rule is for: with one bay Support and the room next door to it are the
   * same wall's worth of columns, so nothing here could tell them apart.
   * Six is what Sandbox ERP runs.
   */
  describe("with a room for each of its projects", () => {
    const long = buildFloorSpec(source, { boards: ["trello", "zoho"], rooms: 6 });
    const [operations] = opsRooms(6);
    const support = opsSupportRoom(6);
    const nextDoor = opsWhiteboardRoom(6);
    const named = (name: string) => long.pois.find((p) => p.name === name)!;
    /** A board's own room: its columns, and the wall of its own rank. */
    const inRoom = (poi: { tx: number; ty: number }, room: OpsRoom) =>
      poi.tx >= room.x && poi.tx < room.x + 14 && poi.ty === room.wallRow + 2;

    it("hangs the project board in Operations and the queue and counts in Support", () => {
      expect(inRoom(named("Project board"), operations)).toBe(true);
      // The support queue is what makes a room Support, so it hangs there
      // and not on the Operations wall it used to share with the board.
      expect(inRoom(named("Help desk"), support)).toBe(true);
      expect(inRoom(named("Help desk"), operations)).toBe(false);
      // The counts are the same desk counted, so they hang with it.
      expect(inRoom(named("Support pulse"), support)).toBe(true);
    });

    it("hangs the whiteboard in the empty room next door to Support", () => {
      expect(nextDoor.x).toBeGreaterThan(support.x);
      expect(nextDoor.rank).toBe(support.rank);
      expect(inRoom(named("Whiteboard"), nextDoor)).toBe(true);
      expect(inRoom(named("Whiteboard"), support)).toBe(false);
    });

    /**
     * The point of moving it: four clear tiles in the middle of Support's
     * wall for the room's name, which the scene letters at the size every
     * other name in the world is drawn at. A name across a picture labels
     * the picture, so the gap is what this holds down.
     */
    it("leaves the middle of Support's wall clear for its name", () => {
      const queue = named("Help desk").tx;
      const counts = named("Support pulse").tx;
      const sign = opsSupportSign(6).tx;
      // Half of each board's own width either side of its point, from the
      // spec the map was generated off.
      const queueRight = queue + Math.ceil(HELP_DESK.region.sw / 2);
      const countsLeft = counts - Math.floor(SUPPORT_PULSE.region.sw / 2);
      expect(countsLeft - queueRight).toBeGreaterThanOrEqual(4);
      expect(sign).toBeGreaterThan(queueRight);
      expect(sign).toBeLessThan(countsLeft);
      // The middle of the wall, which is also the middle of that gap.
      expect(sign).toBe(support.x + 7);
      expect(sign - queueRight).toBe(countsLeft - sign);
    });

    it("runs the counts to Support's right-hand corner", () => {
      const counts = named("Support pulse").tx + Math.ceil(SUPPORT_PULSE.region.sw / 2);
      expect(counts).toBe(support.x + 14);
    });
  });

  /**
   * The stage counts: the same arrangement one room along, and only where
   * the building asked for them.
   */
  describe("counting the project board's stages", () => {
    const withFlow = buildFloorSpec(source, { boards: ["trello", "zoho"], rooms: 6, flow: true });
    const without = buildFloorSpec(source, { boards: ["trello", "zoho"], rooms: 6 });
    const [operations] = opsRooms(6);
    const named = (spec: RoomSpec, name: string) => spec.pois.find((p) => p.name === name);

    it("hangs them in Operations, beside the board they count", () => {
      const flow = named(withFlow, "Project flow")!;
      expect(flow.ty).toBe(operations.wallRow + 2);
      expect(flow.tx).toBeGreaterThan(named(withFlow, "Project board")!.tx);
      // And where the scene draws its picture is the footprint the map made
      // solid, which is the only way the two agree.
      const box = opsProjectFlow(6);
      expect(box.tx).toBe(operations.x + 14 - PROJECT_FLOW.region.sw);
      expect(flow.tx).toBe(box.tx + Math.floor(PROJECT_FLOW.region.sw / 2));
    });

    it("runs them to the room's right-hand corner, clear of the board", () => {
      const flow = named(withFlow, "Project flow")!;
      const board = named(withFlow, "Project board")!;
      const flowLeft = flow.tx - Math.floor(PROJECT_FLOW.region.sw / 2);
      const boardRight = board.tx + Math.ceil(PROJECT_BOARD.region.sw / 2);
      expect(flow.tx + Math.ceil(PROJECT_FLOW.region.sw / 2)).toBe(operations.x + 14);
      expect(flowLeft).toBeGreaterThanOrEqual(boardRight);
    });

    it("leaves that wall bare in a building that counts none", () => {
      expect(named(without, "Project flow")).toBeUndefined();
      expect(named(without, "Project board")).toBeDefined();
    });
  });
});

describe("solidRuns", () => {
  const wall = { orientation: "horizontal" as const, at: 5, from: 1, to: 19 };

  it("is the whole wall when there are no doorways", () => {
    expect(solidRuns(wall)).toEqual([[1, 19]]);
  });

  it("subtracts each doorway", () => {
    expect(solidRuns({ ...wall, doorways: [{ from: 4, to: 6 }] })).toEqual([
      [1, 4],
      [6, 19],
    ]);
  });

  it("does not care what order the doorways come in", () => {
    const gaps = [
      { from: 14, to: 16 },
      { from: 4, to: 6 },
    ];
    expect(solidRuns({ ...wall, doorways: gaps })).toEqual([
      [1, 4],
      [6, 14],
      [16, 19],
    ]);
  });

  it("copes with a doorway at either end", () => {
    expect(solidRuns({ ...wall, doorways: [{ from: 1, to: 3 }] })).toEqual([[3, 19]]);
    expect(solidRuns({ ...wall, doorways: [{ from: 17, to: 19 }] })).toEqual([[1, 17]]);
  });
});
