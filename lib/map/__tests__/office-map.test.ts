import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildOfficeSpec,
  CUTOUT,
  HEIGHT,
  HELP_COUNTER,
  PLAYER_START,
  STANDABLE,
  TILE,
  WALLS,
  WIDTH,
} from "../office";
import { PLAYER_SPAWN_OFFSET_X } from "../../constants";
import {
  deriveCollisions,
  generateMap,
  paintShell,
  topWallRows,
  wallCollisions,
} from "../generate";
import type { SourceMap } from "../harvest";
import { findExterior } from "../../map-perimeter";

const source = JSON.parse(
  readFileSync(join(process.cwd(), "public/maps/office2.json"), "utf8"),
) as SourceMap & { tilesets: [] };

const spec = buildOfficeSpec(source);
const map = generateMap(spec, []);

const tileLayer = (name: string) => {
  const l = map.layers.find((x) => x.name === name);
  if (!l || l.type !== "tilelayer") throw new Error(`no tile layer ${name}`);
  return l;
};
const objects = (name: string) => {
  const l = map.layers.find((x) => x.name === name);
  if (!l || l.type !== "objectgroup") throw new Error(`no object layer ${name}`);
  return l.objects;
};

describe("generated office map", () => {
  it("emits every layer the scene reads", () => {
    // OfficeScene calls createLayer / getObjectLayer for each of these and does
    // not check for null, so a missing layer is a crash or a silent blank.
    for (const name of ["floor", "walls", "ground", "furniture", "objects", "overhead"]) {
      expect(tileLayer(name).data).toHaveLength(WIDTH * HEIGHT);
    }
    for (const name of ["props", "props-over", "collisions", "pois", "spawns"]) {
      expect(() => objects(name)).not.toThrow();
    }
  });

  it("closes the wall ring on every edge", () => {
    const floor = tileLayer("floor").data;
    const at = (x: number, y: number) => floor[y * WIDTH + x];
    for (let x = 0; x < WIDTH; x++) {
      expect(at(x, 0), `top edge at x=${x}`).not.toBe(0);
      // The bottom edge is the notch's left of it, the room's right of it.
      const bottomRow = x < CUTOUT.x + CUTOUT.width ? CUTOUT.y - 1 : HEIGHT - 1;
      expect(at(x, bottomRow), `bottom edge at x=${x}`).not.toBe(0);
    }
    for (let y = 0; y < HEIGHT; y++) {
      // Beside the notch the left edge is the notch's right-hand side.
      const leftCol = y >= CUTOUT.y ? CUTOUT.x + CUTOUT.width : 0;
      expect(at(leftCol, y), `left edge at y=${y}`).not.toBe(0);
      expect(at(WIDTH - 1, y), `right edge at y=${y}`).not.toBe(0);
    }
  });

  it("leaves the notch empty", () => {
    const floor = tileLayer("floor").data;
    for (let y = CUTOUT.y; y < CUTOUT.y + CUTOUT.height; y++) {
      for (let x = CUTOUT.x; x < CUTOUT.x + CUTOUT.width; x++) {
        expect(floor[y * WIDTH + x], `notch at ${x},${y}`).toBe(0);
      }
    }
  });

  it("lets nothing in from outside the map", () => {
    // The perimeter sealer floods inward from the map edge and stops at
    // anything standable. With the ring closed it should never get in, so
    // there is no exterior tile to seal — and no way to walk out of the room.
    const floor = tileLayer("floor").data;
    const floored = Array.from({ length: HEIGHT }, (_, y) =>
      Array.from({ length: WIDTH }, (_, x) => floor[y * WIDTH + x] !== 0),
    );
    const exterior = findExterior(floored);
    // The only outside within the map's box is the notch; the flood must
    // never get past its walls into the room.
    exterior.forEach((row, y) =>
      row.forEach((outside, x) => {
        const inNotch =
          x >= CUTOUT.x &&
          x < CUTOUT.x + CUTOUT.width &&
          y >= CUTOUT.y &&
          y < CUTOUT.y + CUTOUT.height;
        expect(outside, `exterior at ${x},${y}`).toBe(inNotch);
      }),
    );
  });

  it("fills the room with floor rather than leaving gaps", () => {
    const floor = tileLayer("floor").data;
    // Most of the room is floor: only the wall ring is not.
    expect(floor.filter((g) => g === WALLS.floor).length).toBeGreaterThan(WIDTH * HEIGHT * 0.55);
  });
});

describe("the room is empty", () => {
  it("has one interaction point: the whiteboard", () => {
    expect(spec.pois.map((p) => p.name)).toEqual(["Whiteboard"]);
    expect(objects("pois").map((o) => o.name)).toEqual(["Whiteboard"]);
  });

  it("creates no agents", () => {
    // The scene builds its roster from every spawn but the player's, so a
    // single spawn is an empty office rather than a crowded one.
    expect(spec.spawns).toHaveLength(1);
  });

  it("still gives the player somewhere to stand", () => {
    const floor = tileLayer("floor").data;
    const tile = floor[PLAYER_START.ty * WIDTH + PLAYER_START.tx];
    expect(STANDABLE).toContain(tile);
  });

  it("keeps nothing on the floor", () => {
    // Only wall-mounted art survives; anything a person could walk into is gone.
    const onFloor = spec.placements.filter((p) => p.layer !== "walls");
    expect(onFloor).toEqual([]);
  });

  it("keeps the pictures on the walls", () => {
    expect(spec.placements.length).toBeGreaterThan(0);
    expect(spec.placements.every((p) => p.layer === "walls")).toBe(true);
  });

  it("carries no collision boxes over from the old furniture", () => {
    expect(spec.collisions).toEqual([]);
  });
});

describe("wall collisions", () => {
  const rects = wallCollisions(spec);
  const T = spec.tileSize;
  const solid = (tx: number, ty: number) =>
    rects.some(
      (r) => tx * T >= r.x && tx * T < r.x + r.width && ty * T >= r.y && ty * T < r.y + r.height,
    );

  it("makes every wall tile solid", () => {
    // Nothing else does this. The scene treats any tile in the "floor" layer
    // as walkable, and the wall ring lives there — so without these the walls
    // are scenery you stroll through.
    for (let x = 0; x < WIDTH; x++) {
      expect(solid(x, 0), `top wall at x=${x}`).toBe(true);
      expect(solid(x, HEIGHT - 1), `bottom wall at x=${x}`).toBe(true);
    }
    for (let y = 0; y < HEIGHT; y++) {
      expect(solid(0, y), `left wall at y=${y}`).toBe(true);
      expect(solid(WIDTH - 1, y), `right wall at y=${y}`).toBe(true);
    }
  });

  it("makes the whole depth of the top wall solid, not just its cap", () => {
    for (let y = 0; y < topWallRows(spec); y++) {
      expect(solid(13, y), `top wall row ${y}`).toBe(true);
    }
  });

  it("leaves the floor clear", () => {
    const firstFloorRow = topWallRows(spec) + 1;
    for (let y = firstFloorRow; y < HEIGHT - 1; y++) {
      for (let x = 1; x < WIDTH - 1; x++) {
        // The notch, and the wall bent around it, are not floor.
        const notchWalls = y >= CUTOUT.y - 1 && x <= CUTOUT.x + CUTOUT.width;
        if (notchWalls) continue;
        expect(solid(x, y), `floor at ${x},${y} should be walkable`).toBe(false);
      }
    }
  });

  it("does not wall off the row the player spawns on", () => {
    expect(solid(PLAYER_START.tx, PLAYER_START.ty)).toBe(false);
  });

  it("writes them into the map for the scene to read", () => {
    expect(objects("collisions").length).toBe(rects.length);
  });
});

describe("transitions", () => {
  it("has a door at the top left and the lift straight below it at the bottom", () => {
    const door = spec.transitions.find((t) => t.name === "door")!;
    const lift = spec.transitions.find((t) => t.name === "elevator")!;
    expect(door.tx).toBeLessThan(WIDTH / 2);
    expect(door.ty).toBe(0);
    // Holding "down" from the door walks into the lift: the door's column
    // is one of the lift's.
    expect(door.tx).toBeGreaterThanOrEqual(lift.tx);
    expect(door.tx).toBeLessThan(lift.tx + (lift.tw ?? 1));
    // At the bottom of the left part, which ends where the notch begins.
    expect(lift.ty + (lift.th ?? 1)).toBe(CUTOUT.y);
  });

  it("gives each doorway floor to stand on", () => {
    // A zone wholly inside the wall ring can never fire — the wall is solid,
    // so nobody reaches it and the doorway is just scenery.
    const floor = tileLayer("floor").data;
    for (const t of spec.transitions) {
      let standable = 0;
      for (let y = t.ty; y < t.ty + (t.th ?? 1); y++) {
        for (let x = t.tx; x < t.tx + (t.tw ?? 1); x++) {
          if (STANDABLE.includes(floor[y * WIDTH + x])) standable++;
        }
      }
      expect(standable, `${t.name} has no reachable tile`).toBeGreaterThan(0);
    }
  });

  it("gives each one a target to load", () => {
    for (const t of spec.transitions) expect(t.target).toBeTruthy();
  });

  it("writes the target where the scene can read it", () => {
    for (const o of objects("transitions")) {
      expect(o.properties?.some((p) => p.name === "target" && p.value)).toBe(true);
    }
  });
});

describe("collisions", () => {
  it("merges solid placements into runs rather than one box per tile", () => {
    const runs = deriveCollisions({
      ...spec,
      placements: [
        { tx: 3, ty: 5, gid: 1, layer: "furniture", solid: true },
        { tx: 4, ty: 5, gid: 1, layer: "furniture", solid: true },
        { tx: 5, ty: 5, gid: 1, layer: "furniture", solid: true },
        { tx: 9, ty: 5, gid: 1, layer: "furniture", solid: true },
      ],
    });
    expect(runs).toEqual([
      { x: 144, y: 240, width: 144, height: 48 },
      { x: 432, y: 240, width: 48, height: 48 },
    ]);
  });
});

describe("with a help desk on the floor", () => {
  const staffed = buildOfficeSpec(source, { helpDesk: true });
  const { dx, dy, sw, sh } = HELP_COUNTER.region;
  const box = { x: dx * TILE, y: dy * TILE, width: sw * TILE, height: sh * TILE };
  const boxes = staffed.collisions ?? [];

  it("is a lobby's choice, so the plain lobby has neither the point nor the box", () => {
    expect(spec.pois.some((poi) => /counter/i.test(poi.name))).toBe(false);
    expect(spec.collisions ?? []).toHaveLength(0);
  });

  it("brings a point of interest and a solid footprint, and no tiles of its own", () => {
    expect(staffed.pois.map((poi) => poi.name)).toContain("Help desk counter");
    expect(boxes).toContainEqual(box);
    // Drawn by the scene from its own sprite, like the games.
    expect(staffed.placements.length).toBe(spec.placements.length);
  });

  /**
   * The Operations floor's support-queue board is called "Help desk", and the
   * scene finds it by that name. A counter whose name merely contains it
   * would have the board drawn on top of it in the lobby.
   */
  it("is not called what the Operations board is called", () => {
    const name = HELP_COUNTER.poi.name;
    expect(/^help desk$/i.test(name)).toBe(false);
    expect(/^help desk counter$/i.test(name)).toBe(true);
  });

  it("leaves the point to stand at on the floor rather than inside the counter", () => {
    const poi = HELP_COUNTER.poi;
    const inside = poi.tx >= dx && poi.tx < dx + sw && poi.ty >= dy && poi.ty < dy + sh;
    expect(inside).toBe(false);
    // Below it, and inside the room.
    expect(poi.ty).toBeGreaterThanOrEqual(dy + sh);
    expect(poi.ty).toBeLessThan(HEIGHT - 1);
  });

  /**
   * Two things pass through a lobby: the player, who appears beside the
   * spawn, and anyone walking the column under the door down to the lift.
   * Furniture in either place is furniture you are standing in.
   */
  it("stands clear of where the player appears", () => {
    const x = PLAYER_START.tx * TILE + TILE / 2 + PLAYER_SPAWN_OFFSET_X;
    const y = PLAYER_START.ty * TILE + TILE / 2;
    const clear =
      x + TILE / 2 < box.x ||
      x - TILE / 2 >= box.x + box.width ||
      y + TILE / 2 < box.y ||
      y - TILE / 2 >= box.y + box.height;
    expect(clear).toBe(true);
  });

  it("stands clear of the column between the door and the lift", () => {
    const door = staffed.transitions.find((t) => t.name === "door")!;
    const lift = staffed.transitions.find((t) => t.name === "elevator")!;
    for (const tx of [door.tx, lift.tx, lift.tx + 1]) {
      expect(tx < dx || tx >= dx + sw, `column ${tx}`).toBe(true);
    }
  });

  /**
   * Down in the wide bottom of the room, which is where it was asked to be:
   * past the bitten-out corner, so it needs the part of the floor that only
   * the long side of the 7 has.
   */
  it("stands in the bottom of the room, and not in the corner that was cut out", () => {
    expect(dy).toBeGreaterThan(CUTOUT.y - 1);
    for (let tx = dx; tx < dx + sw; tx++) expect(tx).toBeGreaterThanOrEqual(CUTOUT.width + 1);
    // A row of floor in front to walk up to it from, inside the bottom wall.
    expect(dy + sh).toBeLessThan(HEIGHT - 1);
  });

  /**
   * The pacing patch is bounds for a sprite's centre and nothing collides a
   * resident, so every corner of it has to be floor and outside every solid
   * box — including the counter's own, which they would otherwise walk
   * through and be drawn on top of.
   */
  it("gives whoever works it a patch to pace that is all floor", () => {
    const paces = HELP_COUNTER.paces;
    const built = generateMap(staffed, []);
    const floor = built.layers.find((l) => l.name === "floor");
    if (!floor || floor.type !== "tilelayer") throw new Error("no floor");
    const corners = [
      [paces.x, paces.y],
      [paces.x + paces.width, paces.y],
      [paces.x, paces.y + paces.height],
      [paces.x + paces.width, paces.y + paces.height],
    ] as const;
    for (const [x, y] of corners) {
      const label = `${x},${y}`;
      const tile = floor.data[Math.floor(y / TILE) * WIDTH + Math.floor(x / TILE)];
      expect(STANDABLE.includes(tile), label).toBe(true);
      for (const b of boxes) {
        const inside = x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
        expect(inside, `${label} inside ${b.x},${b.y}`).toBe(false);
      }
    }
    // Behind the counter, never over it: the lowest a centre may go is the
    // post, half a sheet above the counter's top edge.
    expect(paces.y + paces.height).toBe(HELP_COUNTER.post.y);
    expect(paces.y + paces.height + 48).toBe(box.y);
  });

  it("is still an open room to walk about in", () => {
    const built = generateMap(staffed, []);
    const floor = built.layers.find((l) => l.name === "floor");
    if (!floor || floor.type !== "tilelayer") throw new Error("no floor");
    const solid = new Set<number>();
    for (const b of boxes)
      for (let ty = b.y / TILE; ty < (b.y + b.height) / TILE; ty++)
        for (let tx = b.x / TILE; tx < (b.x + b.width) / TILE; tx++) solid.add(ty * WIDTH + tx);
    const walkable = floor.data.filter(
      (tile, i) => STANDABLE.includes(tile) && !solid.has(i),
    ).length;
    // The room is 20 x 19 with a corner bitten out; the counter takes eight
    // tiles of it, which should barely dent what is left.
    expect(walkable).toBeGreaterThan(150);
  });
});

describe("paintShell", () => {
  it("puts the wall stack above the first walkable row", () => {
    const grid = paintShell(spec);
    const col = 5;
    expect(grid[0 * WIDTH + col]).toBe(WALLS.topCap);
    expect(grid[1 * WIDTH + col]).toBe(WALLS.topFace[0]);
    expect(grid[2 * WIDTH + col]).toBe(WALLS.topBase);
    expect(grid[3 * WIDTH + col]).toBe(WALLS.topShadow);
    expect(grid[4 * WIDTH + col]).toBe(WALLS.floor);
  });

  describe("with a game in the corner", () => {
    for (const [game, name] of [
      ["pong", /pong/i],
      ["pinball", /pinball/i],
    ] as const) {
      it(`${game}: brings the art, a point the scene knows by name, and something solid`, () => {
        const withGame = buildOfficeSpec(source, { game });
        const built = generateMap(withGame, []);
        const poiLayer = built.layers.find((l) => l.name === "pois");
        if (!poiLayer || poiLayer.type !== "objectgroup") throw new Error("no pois");
        expect(poiLayer.objects.some((o) => name.test(o.name))).toBe(true);
        // Both games are drawn by the scene, so neither adds tiles.
        {
          expect(withGame.placements.length).toBe(spec.placements.length);
        }
        expect(withGame.collisions?.length).toBeGreaterThan(0);
        // The point to play from is on the floor, not inside the solid art.
        const point = poiLayer.objects.find((o) => name.test(o.name))!;
        for (const box of withGame.collisions ?? []) {
          const inside =
            point.x >= box.x &&
            point.x < box.x + box.width &&
            point.y >= box.y &&
            point.y < box.y + box.height;
          expect(inside).toBe(false);
        }
        // Below the top wall and inside the room.
        for (const p of withGame.placements.filter((pl) => pl.ty >= 3)) {
          expect(p.tx).toBeGreaterThan(0);
          expect(p.tx).toBeLessThan(WIDTH - 1);
          expect(p.ty).toBeLessThan(HEIGHT - 1);
        }
      });
    }
  });
});
