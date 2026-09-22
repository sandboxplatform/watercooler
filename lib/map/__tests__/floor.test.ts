import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BOARDROOM_TABLE,
  buildFloorSpec,
  HEIGHT,
  HELP_DESK,
  OPS_HEIGHT,
  OPS_ROOM_COUNT,
  type OpsRoom,
  opsBoardroom,
  opsBoardroomTable,
  opsDeployed,
  opsIncident,
  opsElevator,
  opsProjectFlow,
  opsProjectRooms,
  opsProjectSign,
  opsRoadblock,
  opsRooms,
  opsSign,
  opsSupportRoom,
  opsSupportSign,
  opsWallRun,
  opsWallRuns,
  opsLastWeekCounts,
  opsWeekCounts,
  opsWhiteboardRoom,
  opsWidth,
  PLAYER_START,
  PROJECT_BOARD,
  PROJECT_FLOW,
  ROOM_COLS,
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
      poi.tx >= room.x && poi.tx < room.x + ROOM_COLS && poi.ty === room.wallRow + 2;

    it("hangs the project board in Operations and the queue and counts in Support", () => {
      expect(inRoom(named("Project board 1"), operations)).toBe(true);
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
     * A clear stretch beside the board for the room's name, which the scene
     * letters at the size every other name in the world is drawn at. A name
     * across a picture labels the picture, so the gap is what this holds
     * down — and beside the board rather than in the middle of the wall,
     * because in a project room what is lettered is the board's own name.
     */
    it("leaves room beside the board for the name", () => {
      const queue = named("Help desk").tx;
      const counts = named("Support pulse").tx;
      const { tx: sign, cols } = opsSupportSign(6);
      // Half of each board's own width either side of its point, from the
      // spec the map was generated off.
      const queueRight = queue + Math.ceil(HELP_DESK.region.sw / 2);
      const countsLeft = counts - Math.floor(SUPPORT_PULSE.region.sw / 2);
      expect(sign).toBeGreaterThan(queueRight);
      expect(sign).toBeLessThan(countsLeft);
      // The name has the whole gap, hard against the board and clear of it.
      expect(sign - cols / 2).toBeGreaterThanOrEqual(queueRight);
      expect(sign + cols / 2).toBeLessThanOrEqual(countsLeft);
      expect(sign - cols / 2).toBe(support.x + HELP_DESK.region.sw);
    });

    /**
     * The name in the middle of the gap, not in the middle of a band of
     * its own hard against the board.
     *
     * They were the same tile only while the band and the gap were the
     * same four tiles. Downstairs the gap is six — the doorway takes the
     * right-hand end of the wall — so a fixed band lettered every project
     * room's board a whole tile left of the wall it was written on, with
     * the doorway's edge beside it to compare against.
     */
    it("centres a room's name on the clear stretch it is written on", () => {
      for (const slot of [1, 2, 3]) {
        const sign = opsProjectSign(6, slot)!;
        const room = opsProjectRooms(6, slot)[slot - 1];
        const board = room.x + PROJECT_BOARD.region.sw;
        // Downstairs the doorway is what the wall gives up next; upstairs
        // it is cut elsewhere, so the counts are.
        const next =
          room.rank === "lower" ? room.door.from : room.x + ROOM_COLS - PROJECT_FLOW.region.sw;
        expect(sign.tx).toBe((board + next) / 2);
        expect(sign.cols).toBe(next - board);
      }
    });

    /**
     * The doorway is a hole in the same wall the lower rank hangs its
     * boards on — the upper rank's boards are on the map's top wall and its
     * doorway is cut through another wall entirely. So downstairs the wall
     * has four things wanting a share of it, and the one that breaks is
     * silent: the plate draws fine over a gap, and only walking in shows
     * the counts hanging across a doorway.
     */
    it("keeps everything on a lower room's wall clear of its doorway", () => {
      const spec = buildFloorSpec(source, {
        boards: ["trello", "zoho"],
        rooms: 6,
        projects: [{ counts: true }, { counts: true }, { counts: true }],
      });
      const widths: Record<string, number> = {
        "Project board": PROJECT_BOARD.region.sw,
        "Project flow": PROJECT_FLOW.region.sw,
      };
      for (const room of opsRooms(6).filter((r) => r.rank === "lower")) {
        const onThisWall = spec.pois.filter(
          (poi) => poi.ty === room.wallRow + 2 && poi.tx > room.x && poi.tx < room.x + ROOM_COLS,
        );
        for (const poi of onThisWall) {
          const sw = widths[poi.name.replace(/ d+$/, "")] ?? 1;
          const left = poi.tx - Math.floor(sw / 2);
          const right = poi.tx + Math.ceil(sw / 2);
          expect(
            right <= room.door.from || left >= room.door.to,
            `${poi.name} runs through the doorway`,
          ).toBe(true);
        }
        // And the name between them, which is drawn rather than a point.
        const sign = opsProjectSign(6, 2);
        if (sign && sign.tx > room.x && sign.tx < room.x + ROOM_COLS) {
          expect(sign.tx + sign.cols / 2).toBeLessThanOrEqual(room.door.from);
        }
      }
    });

    /**
     * The roadblock stands in the middle of the room's floor.
     *
     * The middle both ways, and the same answer for either rank: it is
     * the one spot in an empty room that belongs to the room rather than
     * to one of its edges, and everything else in here is on the wall.
     */
    it("stands the roadblock in the middle of the room", () => {
      for (const slot of [1, 2, 3]) {
        const at = opsRoadblock(6, slot)!;
        const room = opsProjectRooms(6, slot)[slot - 1];
        expect(at.tx).toBe(room.x + ROOM_COLS / 2);
        expect(at.ty).toBe(room.y + 3);
        // Clear of both side walls, and inside the room's own rows.
        expect(at.tx).toBeGreaterThan(room.x);
        expect(at.tx).toBeLessThan(room.x + ROOM_COLS);
        expect(at.ty).toBeGreaterThanOrEqual(room.y);
        expect(at.ty).toBeLessThan(room.y + 7);
      }
      expect(opsRoadblock(6, 9)).toBeNull();
    });

    /**
     * What has shipped is stacked in the far corner of the room.
     *
     * The barrier's opposite number and placed as its opposite: the
     * middle of the floor is where a thing in the way stands, and the
     * corner across the room from the board is where finished work goes.
     * Two columns in, so the two-tile stack keeps a clear column between
     * itself and the wall rather than reading as shoved through it.
     */
    it("stacks what has shipped in the far corner", () => {
      for (const slot of [1, 2, 3]) {
        const at = opsDeployed(6, slot)!;
        const room = opsProjectRooms(6, slot)[slot - 1];
        expect(at.tx).toBe(room.x + ROOM_COLS - 2);
        expect(at.ty).toBe(room.y + 6);
        // The picture is two tiles wide and drawn centred on the point, so
        // a clear column either side of it and inside the room's own rows.
        expect(at.tx - 1).toBeGreaterThan(room.x);
        expect(at.tx + 1).toBeLessThan(room.x + ROOM_COLS);
        expect(at.ty).toBeLessThan(room.y + 7);
        // And nowhere near the barrier, which has the middle of the floor.
        const stuck = opsRoadblock(6, slot)!;
        expect(at.tx - stuck.tx).toBeGreaterThan(2);
        expect(at.ty).toBeGreaterThan(stuck.ty);
      }
      expect(opsDeployed(6, 9)).toBeNull();
    });

    /**
     * The beacon stands in the near corner, mirroring the crates.
     *
     * The same two columns off its own wall that they are off theirs and
     * the same last row, because the two are read against each other from
     * the doorway: what has gone out in the far corner, whether the server
     * is on fire in the one you walk in past.
     */
    it("stands the beacon in the near corner, mirroring the crates", () => {
      for (const slot of [1, 2, 3]) {
        const at = opsIncident(6, slot)!;
        const room = opsProjectRooms(6, slot)[slot - 1];
        expect(at.tx).toBe(room.x + 2);
        expect(at.ty).toBe(room.y + 6);
        // A clear column between it and the wall, as the crates have.
        expect(at.tx - 1).toBeGreaterThan(room.x);
        expect(at.ty).toBeLessThan(room.y + 7);
        // Mirrored: the same offset from its wall that they have from theirs,
        // on the same row, with the barrier's middle between the two.
        const shipped = opsDeployed(6, slot)!;
        const stuck = opsRoadblock(6, slot)!;
        expect(at.tx - room.x).toBe(room.x + ROOM_COLS - shipped.tx);
        expect(at.ty).toBe(shipped.ty);
        expect(at.tx).toBeLessThan(stuck.tx - 2);
      }
      expect(opsIncident(6, 9)).toBeNull();
    });

    it("runs the counts to Support's right-hand corner", () => {
      const counts = named("Support pulse").tx + Math.ceil(SUPPORT_PULSE.region.sw / 2);
      expect(counts).toBe(support.x + ROOM_COLS);
    });
  });

  /**
   * What is lettered on the corridor's upper wall, and where.
   *
   * Nothing here is in the map — a name and two numbers are paint on a wall
   * the map already made solid, so the scene draws them off these. Which
   * makes the geometry the only thing there is to check: a figure two tiles
   * off centre, or one written across a doorway, looks like a rendering
   * fault and is arithmetic.
   */
  describe("the lettering on the corridor wall", () => {
    /** Sandbox ERP's floor: five projects, three bays, forty-six tiles. */
    const rooms = 5;
    const doors = opsRooms(rooms)
      .filter((room) => room.rank === "upper")
      .map((room) => room.door);
    const clear = (tx: number) =>
      doors.every((door) => tx <= door.from || tx >= door.to) && tx > 0 && tx < opsWidth(rooms);

    it("splits the wall at every doorway through it", () => {
      const runs = opsWallRuns(rooms);
      // One run to the left of each upper doorway and one past the last,
      // read off the rooms rather than written down — the wall is as wide
      // as the floor and the floor grows with ROOM_COLS.
      const upper = opsRooms(rooms).filter((room) => room.rank === "upper");
      expect(runs).toEqual([
        { from: 0, to: upper[0].door.from },
        { from: upper[0].door.to, to: upper[1].door.from },
        { from: upper[1].door.to, to: upper[2].door.from },
        { from: upper[2].door.to, to: opsWidth(rooms) },
      ]);
      // Every run is wall, and between them is the way into a room.
      for (const run of runs) expect(run.to).toBeGreaterThan(run.from);
      for (const door of doors) {
        expect(runs.some((run) => run.from < door.to && run.to > door.from)).toBe(false);
      }
    });

    /**
     * The wall does not stop where the room does. It carries on past the
     * divider between the bays to the next doorway along, and the middle of
     * that stretch is the middle of what anybody standing in the corridor
     * is looking at — which is what "centred" has to mean out there.
     */
    it("centres the floor's name on the stretch of wall it is written on", () => {
      const [operations] = opsRooms(rooms);
      const run = opsWallRun(rooms, operations);
      expect(opsSign(rooms).tx).toBe((run.from + run.to) / 2);
      expect(clear(opsSign(rooms).tx)).toBe(true);
      // The larger half of Operations' frontage: the side away from its door.
      expect(run.from).toBe(operations.door.to);
    });

    /**
     * The week hangs outside the room it counts, which is the whole reason
     * it is out here rather than on the plate inside: a stretch of wall
     * belongs to the room behind it, so the numbers say whose they are by
     * where they are.
     */
    it("letters the week on the stretch of wall Support fronts", () => {
      const week = opsWeekCounts(rooms)!;
      const run = opsWallRun(rooms, opsSupportRoom(rooms));
      expect(week.ty).toBe(opsSign(rooms).ty);
      const width = run.to - run.from;
      expect(week.tx).toEqual([run.from + width / 4, run.from + (width * 3) / 4]);
      for (const tx of week.tx) {
        expect(tx).toBeGreaterThan(run.from);
        expect(tx).toBeLessThan(run.to);
        expect(clear(tx)).toBe(true);
      }
      // Evenly spaced on their own stretch: each figure is centred under
      // its own heading, so the pair reads as two things and not one.
      expect(week.tx[0] - run.from).toBe(run.to - week.tx[1]);
    });

    /**
     * And the net between them, which is the difference of the two — so it
     * goes where it belongs to both of them rather than to either: the
     * middle of the stretch, equidistant from each.
     */
    it("letters the net at the middle of the two it is taken from", () => {
      const week = opsWeekCounts(rooms)!;
      const run = opsWallRun(rooms, opsSupportRoom(rooms));
      expect(week.net).toBe((run.from + run.to) / 2);
      expect(clear(week.net)).toBe(true);
      for (let count = 3; count <= 12; count++) {
        const at = opsWeekCounts(count);
        if (!at) continue;
        expect(at.net - at.tx[0], `${count} rooms`).toBe(at.tx[1] - at.net);
      }
    });

    /** And never on the stretch the floor has written its name on. */
    it("keeps the week clear of the floor's name", () => {
      for (let count = 1; count <= 12; count++) {
        const week = opsWeekCounts(count);
        if (!week) continue;
        const name = opsSign(count);
        for (const tx of week.tx) expect(Math.abs(tx - name.tx)).toBeGreaterThan(6);
      }
    });

    /**
     * Two floors have nowhere to put them, and the desk keeps its five
     * counts on both: one room, where Operations and Support are the same
     * room and the name already has that wall; and two, where Support is in
     * the lower rank, whose wall is the lift's and its own boards'.
     */
    it("letters nothing where there is no clear wall for it", () => {
      expect(opsWeekCounts(1)).toBeNull();
      expect(opsSupportRoom(2).rank).toBe("lower");
      expect(opsWeekCounts(2)).toBeNull();
      for (let count = 3; count <= 12; count++) {
        expect(opsWeekCounts(count), `${count} rooms`).not.toBeNull();
      }
    });

    /**
     * Last week hangs on the next stretch along, so the corridor reads away
     * from the lift as it reads back in time: the floor's name, then this
     * week, then the week before it.
     */
    it("letters last week on the next clear stretch along", () => {
      const week = opsWeekCounts(rooms)!;
      const last = opsLastWeekCounts(rooms)!;
      const runs = opsWallRuns(rooms);
      const here = runs.find((run) => (run.from + run.to) / 2 === week.net)!;
      const next = runs.find((run) => run.from >= here.to)!;
      expect(last.ty).toBe(week.ty);
      expect(last.net).toBe((next.from + next.to) / 2);
      for (const tx of last.tx) {
        expect(tx).toBeGreaterThan(next.from);
        expect(tx).toBeLessThan(next.to);
        expect(clear(tx)).toBe(true);
      }
      // Laid out exactly as this week's, since they are the same three
      // figures asked about a different pair of Mondays.
      expect(last.net - last.tx[0]).toBe(last.tx[1] - last.net);
      expect(last.tx[0] - next.from).toBe(next.to - last.tx[1]);
    });

    /**
     * And never on this week's stretch, nor on the floor's own name, which
     * is what "the next one along" is for: six figures crowded onto one
     * wall would be the arrangement the week was moved out here to avoid.
     */
    it("keeps the two weeks on stretches of their own", () => {
      for (let count = 1; count <= 12; count++) {
        const last = opsLastWeekCounts(count);
        if (!last) continue;
        const week = opsWeekCounts(count)!;
        const name = opsSign(count);
        expect(last.net, `${count} rooms`).toBeGreaterThan(week.net);
        for (const tx of last.tx) {
          for (const other of week.tx) expect(Math.abs(tx - other)).toBeGreaterThan(6);
          expect(Math.abs(tx - name.tx)).toBeGreaterThan(6);
        }
      }
    });

    /**
     * A floor of three or four rooms has Support fronting the last stretch
     * there is, so there is nowhere for last week to go and this week has
     * the wall to itself — the same answer, one floor up, as the desk
     * keeping its five counts where there is no wall for the week at all.
     */
    it("letters last week only where there is a second stretch", () => {
      expect(opsLastWeekCounts(1)).toBeNull();
      expect(opsLastWeekCounts(2)).toBeNull();
      expect(opsWeekCounts(3)).not.toBeNull();
      expect(opsLastWeekCounts(3)).toBeNull();
      expect(opsLastWeekCounts(4)).toBeNull();
      for (let count = 5; count <= 12; count++) {
        expect(opsLastWeekCounts(count), `${count} rooms`).not.toBeNull();
      }
    });

    /**
     * The narrowest stretch the week is ever lettered on, which is what the
     * headings are sized against (see `pulse.test.ts`). The last run of a
     * floor with an odd number of rooms is the short one: nine tiles.
     */
    it("never letters the week on less than nine tiles", () => {
      for (let count = 3; count <= 12; count++) {
        if (!opsWeekCounts(count)) continue;
        const run = opsWallRun(count, opsSupportRoom(count));
        expect(run.to - run.from, `${count} rooms`).toBeGreaterThanOrEqual(9);
      }
      // Last week's is held to the same, since it is lettered the same way.
      for (let count = 3; count <= 12; count++) {
        const last = opsLastWeekCounts(count);
        if (!last) continue;
        expect((last.tx[1] - last.tx[0]) * 2, `${count} rooms`).toBeGreaterThanOrEqual(9);
      }
    });
  });

  /**
   * A project board to a room, its stage counts beside it, and the name of
   * the board in the middle of the wall between them.
   */
  describe("a room per project board", () => {
    const one = [{ counts: true }];
    const three = [{ counts: true }, { counts: true }, { counts: true }];
    const withFlow = buildFloorSpec(source, {
      boards: ["trello", "zoho"],
      rooms: 6,
      projects: one,
    });
    const many = buildFloorSpec(source, { boards: ["trello", "zoho"], rooms: 6, projects: three });
    const without = buildFloorSpec(source, { boards: ["trello", "zoho"], rooms: 6 });
    const [operations] = opsRooms(6);
    const named = (spec: RoomSpec, name: string) => spec.pois.find((p) => p.name === name);

    it("hangs the counts beside the board they count, in the same room", () => {
      const flow = named(withFlow, "Project flow 1")!;
      expect(flow.ty).toBe(operations.wallRow + 2);
      expect(flow.tx).toBeGreaterThan(named(withFlow, "Project board 1")!.tx);
      // And where the scene draws its picture is the footprint the map made
      // solid, which is the only way the two agree.
      const box = opsProjectFlow(6, 1)!;
      expect(box.tx).toBe(operations.x + ROOM_COLS - PROJECT_FLOW.region.sw);
      expect(flow.tx).toBe(box.tx + Math.floor(PROJECT_FLOW.region.sw / 2));
    });

    it("runs them to the room's right-hand corner, clear of the board", () => {
      const flow = named(withFlow, "Project flow 1")!;
      const board = named(withFlow, "Project board 1")!;
      const flowLeft = flow.tx - Math.floor(PROJECT_FLOW.region.sw / 2);
      const boardRight = board.tx + Math.ceil(PROJECT_BOARD.region.sw / 2);
      expect(flow.tx + Math.ceil(PROJECT_FLOW.region.sw / 2)).toBe(operations.x + ROOM_COLS);
      expect(flowLeft).toBeGreaterThanOrEqual(boardRight);
    });

    it("leaves that wall bare in a building that counts none", () => {
      expect(named(without, "Project flow 1")).toBeUndefined();
      expect(named(without, "Project board 1")).toBeDefined();
    });

    /**
     * Three boards is three rooms: the first above the lift and the rest
     * along the lower rank. The whole point of the arrangement, so it is
     * asserted as rooms rather than as coordinates.
     */
    it("gives each board a room of its own, Operations first then the lower rank", () => {
      const rooms = opsProjectRooms(6, 3);
      expect(rooms).toHaveLength(3);
      expect(rooms[0]).toEqual(operations);
      expect(rooms.slice(1).map((r) => r.rank)).toEqual(["lower", "lower"]);
      expect(rooms[2].x).toBeGreaterThan(rooms[1].x);
      for (const [i, room] of rooms.entries()) {
        const board = named(many, `Project board ${i + 1}`)!;
        const flow = named(many, `Project flow ${i + 1}`)!;
        expect(board.tx).toBeGreaterThanOrEqual(room.x);
        expect(board.tx).toBeLessThan(room.x + ROOM_COLS);
        expect(board.ty).toBe(room.wallRow + 2);
        expect(flow.ty).toBe(room.wallRow + 2);
      }
    });

    /** No two boards may share a room, or one is hung over the other. */
    it("keeps the project rooms clear of Support, the whiteboard and the table", () => {
      const rooms = opsProjectRooms(6, 3);
      const taken = new Set(rooms.map((r) => `${r.rank}:${r.x}`));
      expect(taken.size).toBe(3);
      const support = opsSupportRoom(6);
      expect(taken.has(`${support.rank}:${support.x}`)).toBe(false);
      const whiteboard = opsWhiteboardRoom(6);
      expect(taken.has(`${whiteboard.rank}:${whiteboard.x}`)).toBe(false);
    });

    /**
     * The name goes between the two, which is the one stretch of that wall
     * nothing else wants — and is where Support letters its own name, so
     * the two kinds of working room read alike from the corridor.
     */
    it("letters the board's name between the board and its counts", () => {
      for (let slot = 1; slot <= 3; slot++) {
        const sign = opsProjectSign(6, slot)!;
        const board = named(many, `Project board ${slot}`)!;
        const flow = named(many, `Project flow ${slot}`)!;
        expect(sign.ty).toBe(board.ty - 2);
        expect(sign.tx).toBeGreaterThan(board.tx + PROJECT_BOARD.region.sw / 2);
        expect(sign.tx).toBeLessThan(flow.tx - PROJECT_FLOW.region.sw / 2);
      }
      // Exactly where Support's own name hangs, one room over.
      expect(opsProjectSign(6, 1)!.tx - opsRooms(6)[0].x).toBe(
        opsSupportSign(6).tx - opsSupportRoom(6).x,
      );
    });

    it("asks for no more rooms than the floor has", () => {
      // A floor of two rooms has Operations and the lift's room, and the
      // lift's room hangs nothing — so a second board has nowhere to go.
      expect(opsProjectRooms(2, 3)).toHaveLength(1);
      expect(opsProjectFlow(2, 2)).toBeNull();
      expect(opsProjectSign(2, 2)).toBeNull();
    });

    /**
     * The lift is three tiles of car hanging a tile below the cap of the
     * lower wall, which is the first lower room's own wall face — so a
     * board on the left of it would be a board with a lift drawn across
     * the end. Nothing else on the floor would notice: the map generates,
     * the room walks and the panel opens.
     */
    it("keeps the boards off the wall the lift is set into", () => {
      const lift = opsElevator(6);
      for (const room of opsProjectRooms(6, 3)) {
        if (room.rank !== "lower") continue;
        const left = room.x + 2;
        expect(lift.tx + lift.tw <= left || lift.tx >= room.x + ROOM_COLS).toBe(true);
      }
    });
  });
});

/**
 * The boardroom table: the one thing on this floor that is furniture rather
 * than a picture on a wall, so the things worth pinning are different —
 * where it stands, that you can get at it, and that it is solid.
 */
describe("the boardroom table", () => {
  const long = buildFloorSpec(source, { boards: ["trello", "zoho"], rooms: 6 });
  const table = opsBoardroomTable(6);
  const room = opsBoardroom(6);

  it("stands in the far room at the top, which is as far from the lift as the floor goes", () => {
    const upper = opsRooms(6).filter((r) => r.rank === "upper");
    expect(room).toEqual(upper[upper.length - 1]);
    // And that is the room the whiteboard hangs in: a table to sit round
    // and a board to draw on is what makes it a meeting room.
    expect(room).toEqual(opsWhiteboardRoom(6));
  });

  it("is centred in it, with clear floor on every side", () => {
    expect(table.tx).toBeGreaterThan(room.x);
    expect(table.tx + table.tw).toBeLessThan(room.x + ROOM_COLS);
    expect(table.ty).toBeGreaterThan(room.y);
    expect(table.ty + table.th).toBeLessThan(room.y + 7);
    // Dead centre down the room; across it, as near as five tiles can sit
    // in a room of seventeen — a tile of the odd one over where it does not
    // divide, not a table against a wall.
    expect(table.ty - room.y).toBe(room.y + 7 - (table.ty + table.th));
    const left = table.tx - room.x;
    const right = room.x + ROOM_COLS - (table.tx + table.tw);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  /**
   * Below the table rather than under the middle of it. A board is a
   * picture you stand in front of; a table is furniture, and standing
   * inside it is not a thing anybody does.
   */
  it("is used from the tile below it", () => {
    const poi = long.pois.find((p) => p.name === BOARDROOM_TABLE.poi.name)!;
    expect(poi).toBeDefined();
    expect(poi.ty).toBe(table.ty + table.th);
    expect(poi.tx).toBe(table.tx + Math.floor(table.tw / 2));
    // And that tile is inside the room, not in the wall below it.
    expect(poi.ty).toBeLessThan(room.y + 7);
  });

  it("is solid, so the room is walked round it", () => {
    const t = long.tileSize;
    const box = (long.collisions ?? []).find((r) => r.x === table.tx * t && r.y === table.ty * t);
    expect(box).toEqual({
      x: table.tx * t,
      y: table.ty * t,
      width: table.tw * t,
      height: table.th * t,
    });
  });

  /**
   * Every Operations floor has one, however short. A floor with rooms to
   * hold meetings in and nowhere to hold one is the odder answer, and it
   * is what keeps this off the map's file name.
   */
  it("is on every Operations floor, whatever its shape", () => {
    for (const rooms of [1, 2, 3, 4, 6, 10]) {
      const spec = buildFloorSpec(source, { boards: ["trello"], rooms });
      const poi = spec.pois.find((p) => p.name === BOARDROOM_TABLE.poi.name);
      expect(poi, `${rooms} rooms`).toBeDefined();
      const here = opsBoardroomTable(rooms);
      const its = opsBoardroom(rooms);
      expect(here.tx, `${rooms} rooms`).toBeGreaterThanOrEqual(its.x);
      expect(here.tx + here.tw, `${rooms} rooms`).toBeLessThanOrEqual(its.x + ROOM_COLS);
    }
  });

  /** A floor without one is a floor that is not an Operations floor at all. */
  it("is nowhere on a plain floor, which has no rooms to hold one in", () => {
    const plain = buildFloorSpec(source);
    expect(plain.pois.find((p) => p.name === BOARDROOM_TABLE.poi.name)).toBeUndefined();
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
