import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildFloorSpec,
  HEIGHT,
  OPS_DIVIDE,
  OPS_DOORWAYS,
  OPS_HEIGHT,
  OPS_WIDTH,
  PLAYER_START,
  WIDTH,
} from "../floor";
import { deriveCollisions, generateMap, paintShell, solidRuns, wallCollisions } from "../generate";
import { STANDABLE } from "../office";
import type { SourceMap } from "../harvest";
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

  it("is taller than an ordinary floor, which is left alone", () => {
    expect([ops.width, ops.height]).toEqual([OPS_WIDTH, OPS_HEIGHT]);
    expect(ops.height).toBeGreaterThan(HEIGHT);
    const plain = buildFloorSpec(source);
    expect([plain.width, plain.height]).toEqual([WIDTH, HEIGHT]);
    expect(plain.partitions ?? []).toEqual([]);
  });

  it("divides the space with a wall between the rooms and one above the hallway", () => {
    const kinds = (ops.partitions ?? []).map((p) => p.orientation);
    expect(kinds.sort()).toEqual(["horizontal", "vertical"]);
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

    // And specifically: a tile well inside each room.
    expect(seen.has(6 * W + 4), "inside Operations").toBe(true);
    expect(seen.has(6 * W + 14), "inside the project room").toBe(true);
  });

  it("puts the boards in Operations and the whiteboard in the project room", () => {
    const named = (name: string) => ops.pois.find((p) => p.name === name)!;
    expect(named("Project board").tx).toBeLessThan(OPS_DIVIDE);
    expect(named("Help desk").tx).toBeLessThan(OPS_DIVIDE);
    expect(named("Whiteboard").tx).toBeGreaterThan(OPS_DIVIDE);
  });

  /** Operations is the room over the lift, which is what makes the ride make sense. */
  it("puts Operations directly above the lift", () => {
    const lift = ops.transitions.find((t) => t.name === "elevator")!;
    expect(lift.tx).toBeLessThan(OPS_DIVIDE);
    expect(OPS_DOORWAYS.operations.from).toBeLessThan(OPS_DIVIDE);
    expect(OPS_DOORWAYS.project.from).toBeGreaterThan(OPS_DIVIDE);
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
