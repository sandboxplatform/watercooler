import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  CUBICLES_HEIGHT,
  CUBICLE_COLS,
  LOWER_WALL,
  MIN_CUBICLES,
  ROOM_NAMES,
  SHELF_COLS,
  buildCubiclesSpec,
  cubicleCount,
  cubicleDesk,
  cubiclePlant,
  cubicleShelf,
  cubicleSign,
  cubicleWidth,
  cubicles,
  peopleElevator,
  peopleFurnishings,
  peopleRooms,
  peopleWhiteboard,
  roomSign,
} from "../cubicles";
import { buildFloorSpec } from "../floor";
import { deriveCollisions, generateMap, wallCollisions } from "../generate";
import { STANDABLE } from "../office";
import type { SourceMap } from "../harvest";
import type { RoomSpec } from "../spec";

const source = JSON.parse(
  readFileSync(join(process.cwd(), "public/maps/office2.json"), "utf8"),
) as SourceMap & { tilesets: [] };

/** The two banks anything in this world actually draws. */
const FOUR = buildCubiclesSpec(source, 4);
const FIVE = buildCubiclesSpec(source, 5);

describe("a People floor", () => {
  it("is what a count of cubicles asks buildFloorSpec for", () => {
    const spec = buildFloorSpec(source, { cubicles: 5 });
    expect(spec.width).toBe(FIVE.width);
    expect(spec.height).toBe(CUBICLES_HEIGHT);
    // And naming none still gives the plain rectangle the agents sit on.
    expect(buildFloorSpec(source).height).not.toBe(CUBICLES_HEIGHT);
  });

  it("grows sideways as people are added, and never downwards", () => {
    expect(FOUR.width).toBe(cubicleWidth(4));
    expect(FIVE.width).toBe(cubicleWidth(5));
    expect(FIVE.width - FOUR.width).toBe(CUBICLE_COLS + 1);
    expect(FOUR.height).toBe(FIVE.height);
  });

  it("draws a floor of at least four, whoever works there", () => {
    expect(cubicleCount(0)).toBe(MIN_CUBICLES);
    expect(cubicleCount(1)).toBe(MIN_CUBICLES);
    expect(cubicleCount(MIN_CUBICLES + 3)).toBe(MIN_CUBICLES + 3);
  });

  /**
   * The divider between two cubicles, and nothing between a cubicle and
   * the corridor — which is what makes a bank of them a bank rather than a
   * row of cells, and the one thing about this floor that is not an
   * Operations floor with different furniture in it.
   */
  it("walls each cubicle off from its neighbour and none of them off from the corridor", () => {
    const bank = cubicles(5);
    const dividers = (FIVE.partitions ?? []).filter(
      (wall) => wall.orientation === "vertical" && wall.from < LOWER_WALL,
    );
    expect(dividers).toHaveLength(bank.length - 1);
    for (const wall of dividers) {
      expect(wall.doorways ?? []).toEqual([]);
      // It stops at the corridor's first row rather than running into it.
      expect(wall.to).toBeLessThan(LOWER_WALL);
    }
    const across = (FIVE.partitions ?? []).filter((wall) => wall.orientation === "horizontal");
    expect(across).toHaveLength(1);
    expect(across[0].at).toBe(LOWER_WALL);
  });

  it("gives each cubicle a shelf against the wall, a desk under it and its own name over both", () => {
    for (let slot = 0; slot < 5; slot++) {
      const cubicle = cubicles(5)[slot];
      const shelf = cubicleShelf(5, slot)!;
      const desk = cubicleDesk(5, slot)!;
      const sign = cubicleSign(5, slot)!;
      const plant = cubiclePlant(5, slot)!;

      // The shelf is against the back wall, a clear column either side.
      expect(shelf.ty).toBe(cubicle.y);
      expect(shelf.tw).toBe(SHELF_COLS);
      expect(shelf.tx).toBeGreaterThan(cubicle.x);
      expect(shelf.tx + shelf.tw).toBeLessThan(cubicle.x + CUBICLE_COLS);

      // The desk is under it, centred, with a clear row between the two.
      expect(desk.ty).toBeGreaterThan(shelf.ty + 1);
      expect(desk.tx + desk.tw / 2).toBe(cubicle.x + CUBICLE_COLS / 2);

      // The name is on the map's own top wall, centred on this cubicle and
      // wrapped to it — so a long one takes two lines rather than running
      // over the divider into the cubicle next door.
      expect(sign.ty).toBe(0);
      expect(sign.tx).toBe(cubicle.x + CUBICLE_COLS / 2);
      expect(sign.cols).toBe(CUBICLE_COLS);

      // And nothing stands on top of anything else in there.
      for (const [a, b] of [
        [shelf, desk],
        [shelf, { ...plant }],
        [desk, { ...plant }],
      ] as const) {
        const apart =
          a.tx + a.tw <= b.tx || b.tx + b.tw <= a.tx || a.ty + a.th <= b.ty || b.ty + b.th <= a.ty;
        expect(apart, `slot ${slot}`).toBe(true);
      }
    }
  });

  it("asks for nothing in a cubicle a shorter floor does not have", () => {
    expect(cubicleShelf(4, 4)).toBeNull();
    expect(cubicleDesk(4, 9)).toBeNull();
    expect(cubicleSign(4, 4)).toBeNull();
  });

  /**
   * Two rooms off the far side of the corridor, splitting whatever width
   * the bank above them came to, with the lift set into the near one's
   * wall and the whiteboard hanging in the far one's corner.
   */
  it("puts two rooms under the corridor and the lift at the end of it", () => {
    for (const count of [4, 5]) {
      const [copy, lounge] = peopleRooms(count);
      const lift = peopleElevator();
      expect(copy.cols).toBeGreaterThan(CUBICLE_COLS);
      expect(lounge.cols).toBeGreaterThan(CUBICLE_COLS);
      // Side by side, one wall between them, inside the ring.
      expect(copy.x).toBe(1);
      expect(copy.x + copy.cols).toBe(lounge.x - 1);
      expect(lounge.x + lounge.cols).toBe(cubicleWidth(count) - 1);
      // Neither doorway lands on the lift, which is in the same wall.
      for (const room of [copy, lounge]) {
        expect(room.door.from >= lift.tx + lift.tw || room.door.to <= lift.tx).toBe(true);
      }
      // The whiteboard hangs in the break room, left of its own doorway.
      const board = peopleWhiteboard(count);
      expect(board.tx).toBe(lounge.x);
      expect(board.tx + 2).toBeLessThanOrEqual(lounge.door.from);
    }
  });

  /**
   * Corner, name, doorway — the order a working room's wall reads in
   * upstairs. The left-hand corner is the lift car in the near room and
   * the whiteboard in the far one, so the name goes between whichever of
   * those it has and its own way in.
   */
  it("letters each room's name between its corner and its doorway", () => {
    ROOM_NAMES.forEach((_, i) => {
      const room = peopleRooms(5)[i];
      const sign = roomSign(5, i as 0 | 1);
      expect(sign.ty).toBe(room.wallRow);
      expect(sign.tx).toBeGreaterThan(room.x + 2);
      expect(sign.tx).toBeLessThan(room.door.from);
      expect(sign.cols).toBeGreaterThan(0);
      // And the doorway leaves a clear column before the next wall along,
      // or the two read as one gap.
      expect(room.door.to).toBe(room.x + room.cols - 1);
    });
  });

  it("stands every piece of furniture inside the floor, and none of it on the lift", () => {
    const lift = peopleElevator();
    for (const count of [4, 5]) {
      for (const piece of peopleFurnishings(count)) {
        expect(piece.tx, piece.art).toBeGreaterThan(0);
        expect(piece.tx + piece.tw, piece.art).toBeLessThan(cubicleWidth(count));
        expect(piece.ty + piece.th, piece.art).toBeLessThan(CUBICLES_HEIGHT);
        const clearOfLift = piece.ty > lift.ty + lift.th || piece.ty + piece.th <= lift.ty;
        expect(clearOfLift || piece.tx >= lift.tx + lift.tw, piece.art).toBe(true);
      }
    }
  });

  /**
   * And nothing stands in a doorway. A room's own is at the right-hand end
   * of its wall, which is exactly where furniture laid out from that end
   * lands — the plant in the copy room did, and a plant in the way of the
   * way in is the one thing everybody walking through has to go round.
   */
  it("leaves both doorways clear of whatever stands against the back wall", () => {
    for (const count of [4, 5]) {
      const rooms = peopleRooms(count);
      for (const piece of peopleFurnishings(count)) {
        for (const room of rooms) {
          if (piece.ty !== room.y) continue;
          const inTheWay = piece.tx < room.door.to && piece.tx + piece.tw > room.door.from;
          expect(inTheWay, `${piece.art} at ${piece.tx}`).toBe(false);
        }
      }
    }
  });

  /**
   * Every piece of furniture is solid, which is the whole reason the scene
   * and the spec read one list: the picture is the scene's and the box is
   * the map's, and a box the scene has no picture for is an invisible wall.
   */
  it("makes everything standing on it solid", () => {
    const boxes = FIVE.collisions ?? [];
    for (const piece of peopleFurnishings(5)) {
      const box = boxes.find(
        (r) => r.x === piece.tx * 48 && r.y === piece.ty * 48 && r.width === piece.tw * 48,
      );
      expect(box, piece.art).toBeDefined();
    }
    for (let slot = 0; slot < 5; slot++) {
      const shelf = cubicleShelf(5, slot)!;
      expect(boxes.some((r) => r.x === shelf.tx * 48 && r.y === shelf.ty * 48)).toBe(true);
    }
  });
});

/**
 * A doorway is a gap in a wall, and a wall with no gap is a room nobody
 * can reach — which draws perfectly. So the floor is flooded from where
 * the lift puts you, exactly as the Operations floor is.
 */
describe("walking a People floor", () => {
  const walk = (spec: RoomSpec, count: number) => {
    const layer = generateMap(spec, []).layers.find((x) => x.name === "floor")!;
    if (layer.type !== "tilelayer") throw new Error("no floor layer");
    const solid = deriveCollisions(spec).concat(wallCollisions(spec));
    const t = spec.tileSize;
    const W = spec.width;
    const blocked = (x: number, y: number) =>
      solid.some(
        (r) => x * t >= r.x && x * t < r.x + r.width && y * t >= r.y && y * t < r.y + r.height,
      );
    const walkable = (x: number, y: number) =>
      STANDABLE.includes(layer.data[y * W + x]) && !blocked(x, y);

    const start = spec.spawns[0];
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
        if (nx < 0 || ny < 0 || nx >= W || ny >= spec.height) continue;
        const key = ny * W + nx;
        if (seen.has(key) || !walkable(nx, ny)) continue;
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    let total = 0;
    for (let y = 0; y < spec.height; y++) for (let x = 0; x < W; x++) if (walkable(x, y)) total++;
    return { seen, total, walkable, W, count };
  };

  it.each([
    [4, FOUR],
    [5, FIVE],
  ])("lets you reach every tile of a floor of %i from the lift", (count, spec) => {
    const { seen, total, walkable, W } = walk(spec, count);
    expect(seen.size, "reachable of walkable").toBe(total);

    // And specifically: standing room in every cubicle, in front of every
    // shelf, and in the middle of both rooms.
    for (const [slot, cubicle] of cubicles(count).entries()) {
      const shelf = cubicleShelf(count, slot)!;
      for (const [x, y] of [
        [cubicle.x, cubicle.y],
        [shelf.tx + 1, shelf.ty + 1],
      ]) {
        expect(walkable(x, y), `cubicle ${slot} floor`).toBe(true);
        expect(seen.has(y * W + x), `cubicle ${slot} reachable`).toBe(true);
      }
    }
    for (const [i, room] of peopleRooms(count).entries()) {
      const x = room.x + Math.floor(room.cols / 2);
      const y = room.y + 4;
      expect(walkable(x, y), `room ${i} floor`).toBe(true);
      expect(seen.has(y * W + x), `room ${i} reachable`).toBe(true);
    }
  });

  /**
   * And from one room into the other without the corridor: they share a
   * wall and there is a way through it, so crossing is not a walk back out
   * and along. The corridor's own rows are taken out of the flood, or this
   * would pass whether or not the gap is there.
   */
  it("lets you walk from the copy room into the break room without the corridor", () => {
    const [copy, lounge] = peopleRooms(5);
    const layer = generateMap(FIVE, []).layers.find((x) => x.name === "floor")!;
    if (layer.type !== "tilelayer") throw new Error("no floor layer");
    const solid = deriveCollisions(FIVE).concat(wallCollisions(FIVE));
    const W = FIVE.width;
    const walkable = (x: number, y: number) =>
      y >= copy.y &&
      STANDABLE.includes(layer.data[y * W + x]) &&
      !solid.some(
        (r) => x * 48 >= r.x && x * 48 < r.x + r.width && y * 48 >= r.y && y * 48 < r.y + r.height,
      );

    const from = [copy.x + 1, copy.y + 4] as const;
    const seen = new Set([from[1] * W + from[0]]);
    const queue = [from];
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
        if (nx < 0 || ny < 0 || nx >= W || ny >= FIVE.height) continue;
        const key = ny * W + nx;
        if (seen.has(key) || !walkable(nx, ny)) continue;
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    const target = (lounge.y + 4) * W + lounge.x + 1;
    expect(seen.has(target)).toBe(true);
  });
});
