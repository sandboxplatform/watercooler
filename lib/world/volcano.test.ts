import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONE,
  VOLCANO_ART,
  VOLCANO_CAVE,
  VOLCANO_ISLAND,
  boatOf,
  coneHalf,
  enterablesOf,
  groundOf,
  landingIn,
  solidsOf,
  volcanoPlace,
  type VolcanoPlace,
} from "./volcano";
import { PROPS, allReachable, propBody, propPicture, type PropSpec } from "./scenery";
import { TILE, type Rect } from "./tenants";
import { clearFor } from "./blob";
import { CAVE_PATH, VOLCANO_PATH, WORLD_PATH } from "./paths";
import { CAVE_ROOM_SLUG, VOLCANO_ROOM_SLUG } from "../rooms";

const PLACES: readonly VolcanoPlace[] = [VOLCANO_ISLAND, VOLCANO_CAVE];

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const inside = (r: Rect, at: { x: number; y: number }) =>
  at.x >= r.x && at.x < r.x + r.width && at.y >= r.y && at.y < r.y + r.height;
const middle = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const bounds = (p: VolcanoPlace) => ({ width: p.columns * TILE, height: p.rows * TILE });

/** Every landing a place can put somebody down at. */
const landings = (p: VolcanoPlace) =>
  p === VOLCANO_CAVE
    ? [landingIn(p, VOLCANO_ROOM_SLUG)]
    : [landingIn(p, null), landingIn(p, CAVE_ROOM_SLUG)];

describe("the volcano's two places", () => {
  it("are two rooms at two addresses, each named for what it is", () => {
    expect(VOLCANO_ISLAND).toMatchObject({ room: VOLCANO_ROOM_SLUG, path: VOLCANO_PATH });
    expect(VOLCANO_CAVE).toMatchObject({ room: CAVE_ROOM_SLUG, path: CAVE_PATH });
    expect(volcanoPlace("island")).toBe(VOLCANO_ISLAND);
    expect(volcanoPlace("cave")).toBe(VOLCANO_CAVE);
  });

  it("lead to each other, and the island back to the world map", () => {
    expect(VOLCANO_ISLAND.ways.map((w) => w.to).sort()).toEqual([CAVE_PATH, WORLD_PATH].sort());
    expect(VOLCANO_CAVE.ways.map((w) => w.to)).toEqual([VOLCANO_PATH]);
  });

  it.each(PLACES.map((p) => [p.room, p] as const))(
    "%s: gets you from every landing to every way out",
    (_room, place) => {
      // Asked of the middle of each way's zone, since the latch fires on
      // the feet being anywhere in it — and a zone against a wall has its
      // top edge in the wall.
      for (const from of landings(place)) {
        expect(
          allReachable(
            bounds(place),
            solidsOf(place),
            from,
            place.ways.map((w) => middle(w.zone)),
          ),
          `from ${from.x},${from.y}`,
        ).toBe(true);
      }
    },
  );

  it.each(PLACES.map((p) => [p.room, p] as const))(
    "%s: puts you down on open ground, clear of every way out",
    (_room, place) => {
      // Standing in a way's zone on arrival would send you straight back
      // through it — the arrival walk is what takes you clear of it.
      for (const at of landings(place)) {
        for (const solid of solidsOf(place))
          expect(inside(solid, at), `${at.x},${at.y}`).toBe(false);
        for (const way of place.ways) expect(inside(way.zone, at), way.name).toBe(false);
      }
    },
  );

  it.each(PLACES.map((p) => [p.room, p] as const))(
    "%s: stands nothing on the lava, the water or in the rock",
    (_room, place) => {
      const ground = groundOf(place);
      for (const prop of place.props) {
        const body = propBody(prop)!;
        for (let ty = Math.floor(body.y / TILE); ty * TILE < body.y + body.height; ty++)
          for (let tx = Math.floor(body.x / TILE); tx * TILE < body.x + body.width; tx++) {
            expect(["lava", "water", "rock"], `${prop.kind} at ${prop.x},${prop.y}`).not.toContain(
              ground[ty][tx],
            );
          }
      }
    },
  );

  it.each(PLACES.map((p) => [p.room, p] as const))(
    "%s: hangs no prop's picture over the path or the dock",
    (_room, place) => {
      // Out of doors everything sorts by the bottom of its own picture, so a
      // picture over a path is a stretch of it somebody disappears along.
      const hard = [...(place.ground.trail ?? []), ...(place.ground.dock ?? [])].map((r) => ({
        x: r.x * TILE,
        y: r.y * TILE,
        width: r.width * TILE,
        height: r.height * TILE,
      }));
      for (const prop of place.props)
        for (const r of hard) expect(overlaps(propPicture(prop), r), prop.kind).toBe(false);
    },
  );

  it("keeps every place's props on the props sheet", () => {
    for (const place of PLACES)
      for (const prop of place.props)
        expect((PROPS[prop.kind] as PropSpec).texture).toBeUndefined();
  });
});

describe("the island", () => {
  const island = VOLCANO_ISLAND;
  const mountain = island.volcano!;

  it("is water all round, with the dock the only way off it", () => {
    const ground = groundOf(island);
    for (let x = 0; x < island.columns; x++) {
      expect(ground[0][x]).toBe("water");
      const bottom = ground[island.rows - 1][x];
      expect(["water", "dock"]).toContain(bottom);
    }
    for (let y = 0; y < island.rows; y++) {
      expect(ground[y][0]).toBe("water");
      expect(ground[y][island.columns - 1]).toBe("water");
    }
  });

  it("walks you off the ferry up the dock, and out of the cave down the path", () => {
    expect(landingIn(island, null).facing).toBe("up");
    expect(landingIn(island, WORLD_PATH).facing).toBe("up");
    const out = landingIn(island, CAVE_ROOM_SLUG);
    expect(out).toEqual({ ...mountain.outside, facing: "down" });
  });

  it("stands the volcano inside the island, its solid inside its picture", () => {
    for (const band of mountain.solids) {
      expect(band.x).toBeGreaterThanOrEqual(mountain.frame.x);
      expect(band.x + band.width).toBeLessThanOrEqual(mountain.frame.x + mountain.frame.width);
      expect(band.y).toBeGreaterThanOrEqual(mountain.frame.y);
      expect(band.y + band.height).toBeLessThanOrEqual(mountain.frame.y + mountain.frame.height);
      // And the mouth is a gap in nothing: nothing solid stands in it.
      expect(overlaps(band, mountain.door)).toBe(false);
    }
    expect(mountain.frame.x + mountain.frame.width).toBeLessThanOrEqual(island.columns * TILE);
  });

  /**
   * The bands are cut from the cone's outline, so none of them reaches out
   * into the sky beside the summit by more than the slope of one band — the
   * difference between a band's middle and its top edge. More than that is
   * an invisible wall on open sand.
   */
  it("follows the cone with its solid, and not the rectangle of the picture", () => {
    for (const band of mountain.solids) {
      const top = band.y - mountain.frame.y;
      const halfAtTop = coneHalf(top);
      const halfAtBottom = coneHalf(top + band.height);
      expect(band.width / 2).toBeGreaterThanOrEqual(halfAtTop - 1);
      expect(band.width / 2).toBeLessThanOrEqual(halfAtBottom + 1);
    }
    // Narrow at the summit, near the whole picture at the foot.
    const widths = mountain.solids.map((b) => b.width);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(widths[0]).toBeLessThan(VOLCANO_ART.width / 2);
    expect(widths[widths.length - 1]).toBeGreaterThan(VOLCANO_ART.width * 0.8);
  });

  it("agrees with the art script about the shape of the cone", () => {
    // The script draws the mountain to its own copy of this outline, which
    // is the only way a `.mjs` can have it. Two copies that disagree is a
    // mountain with walls in the sky beside it, and nothing else would say.
    const script = readFileSync(join(process.cwd(), "scripts", "make-world-art.mjs"), "utf8");
    const line = script.match(/const CONE = (\{[^}]*\});/);
    expect(line, "CONE in make-world-art.mjs").not.toBeNull();
    const art = Function(`return (${line![1]});`)() as typeof CONE;
    expect(art).toEqual(CONE);
  });

  it("is drawn from a picture the size the layout thinks it is", () => {
    const png = readFileSync(
      join(process.cwd(), "public", "sprites", "world", "volcano_576x432.png"),
    );
    expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual(VOLCANO_ART);
  });

  it("offers the volcano and the ferry to a tap, and they do not overlap", () => {
    const [volcano, ferry] = enterablesOf(island);
    expect(volcano).toBe(mountain);
    expect(ferry.frame).toEqual(boatOf(island));
    expect(overlaps(volcano.frame, ferry.frame)).toBe(false);
    // The way into each is its way out of here.
    expect(ferry.door).toEqual(island.ways.find((w) => w.to === WORLD_PATH)!.zone);
    expect(volcano.door).toEqual(island.ways.find((w) => w.to === CAVE_PATH)!.zone);
    // And the standing room outside each is standing room.
    for (const e of [volcano, ferry])
      for (const solid of solidsOf(island)) expect(inside(solid, e.outside)).toBe(false);
  });

  it("keeps the lava off the path, so the walk up is between the pools", () => {
    const ground = groundOf(island);
    for (const r of island.ground.trail ?? [])
      for (let y = r.y; y < r.y + r.height; y++)
        for (let x = r.x - 2; x < r.x + r.width + 2; x++) expect(ground[y][x]).not.toBe("lava");
    expect(ground.flat()).toContain("lava");
  });
});

describe("the cave", () => {
  const cave = VOLCANO_CAVE;

  it("is rock all round but for the passage out at the bottom", () => {
    const ground = groundOf(cave);
    for (let x = 0; x < cave.columns; x++) expect(ground[0][x]).toBe("rock");
    for (let y = 0; y < cave.rows; y++) {
      expect(ground[y][0]).toBe("rock");
      expect(ground[y][cave.columns - 1]).toBe("rock");
    }
    const open = ground[cave.rows - 1].flatMap((g, x) => (g === "cave" ? [x] : []));
    const mouth = cave.ways[0].zone;
    expect(open.map((x) => x * TILE)).toEqual([mouth.x, mouth.x + TILE]);
  });

  it("gives the blob a floor to hop on, with room to stand in the middle of it", () => {
    const arena = cave.arena!;
    const ground = groundOf(cave);
    for (let y = arena.y; y < arena.y + arena.height; y += TILE)
      for (let x = arena.x; x < arena.x + arena.width; x += TILE)
        expect(["cave", "lava"]).toContain(ground[y / TILE][x / TILE]);
    const clear = clearFor(arena, solidsOf(cave));
    expect(clear(middle(arena))).toBe(true);
    // And a good part of it is clear, not a floor full of stalagmites.
    let open = 0;
    let total = 0;
    for (let y = arena.y; y < arena.y + arena.height; y += 12)
      for (let x = arena.x; x < arena.x + arena.width; x += 12) {
        total++;
        if (clear({ x, y })) open++;
      }
    expect(open / total).toBeGreaterThan(0.5);
  });

  it("has no blob on the island, and no ferry or volcano in the cave", () => {
    expect(VOLCANO_ISLAND.arena).toBeUndefined();
    expect(cave.volcano).toBeUndefined();
    expect(boatOf(cave)).toBeNull();
    expect(enterablesOf(cave)).toEqual([]);
  });
});
