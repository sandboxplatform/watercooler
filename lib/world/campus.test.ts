import { describe, expect, it } from "vitest";
import { CAMPUSES, campusMatchesTenants, campusSpawnFor } from "./campus";
import {
  PROPS,
  allReachable,
  groundGrid,
  propBody,
  signBody,
  tilesOf,
  waterBodies,
  type PropSpec,
} from "./scenery";
import { yardArea } from "./residents";
import { BOAT, TILE, hasCampus, ORGANISATIONS } from "./tenants";

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe("campuses", () => {
  it("exist for exactly the organisations whose door is not a lobby", () => {
    const withCampus = ORGANISATIONS.filter((o) => hasCampus(o.slug)).map((o) => o.slug);
    expect(Object.keys(CAMPUSES).sort()).toEqual(withCampus.sort());
  });

  for (const campus of Object.values(CAMPUSES)) {
    describe(campus.slug, () => {
      const bounds = { width: campus.columns * TILE, height: campus.rows * TILE };
      const grid = groundGrid(campus.columns, campus.rows, {
        paved: campus.paved,
        built: campus.buildings.map((b) => tilesOf(b.frame)),
        water: campus.water ?? [],
        dock: campus.dock ?? [],
      });
      const solids = [
        ...campus.buildings.map((b) => b.solid),
        ...campus.props.map(propBody).filter((r) => r !== null),
        ...(campus.signs ?? []).map(signBody),
        ...(campus.boat ? [{ ...campus.boat, ...BOAT }] : []),
        ...waterBodies(grid),
      ];

      /** What a prop actually covers, feet at the bottom centre. A board is one too. */
      const picture = (kind: keyof typeof PROPS, x: number, y: number) => {
        const { width, height } = PROPS[kind] as PropSpec;
        return { x: x - width / 2, y: y - height, width, height };
      };
      const pictures = [
        ...campus.props.map((p) => picture(p.kind, p.x, p.y)),
        ...(campus.signs ?? []).map((s) => picture("board", s.x, s.y)),
      ];

      it("has one little building per lobby, apart from the warehouse behind the store", () => {
        expect(campusMatchesTenants(campus)).toBe(true);
      });

      it("keeps everything inside, apart, and off the road out", () => {
        for (const b of campus.buildings) {
          expect(b.frame.x).toBeGreaterThanOrEqual(TILE);
          expect(b.frame.x + b.frame.width).toBeLessThanOrEqual(bounds.width - TILE);
          expect(b.frame.y + b.frame.height).toBeLessThan(campus.exit.y);
          for (const other of campus.buildings) {
            if (other !== b) expect(overlaps(b.frame, other.frame)).toBe(false);
          }
        }
        for (const s of solids) expect(overlaps(s, campus.exit)).toBe(false);
      });

      it("paves the ground in front of, or beside, every door", () => {
        for (const b of campus.buildings) {
          const col = Math.floor((b.door.x + b.door.width / 2) / TILE);
          const row = Math.floor((b.door.y + b.door.height - 1) / TILE);
          expect(grid[row][col], `${b.tenant.slug} door`).not.toBe("grass");
          expect(overlaps(b.door, b.solid), `${b.tenant.slug} door in its wall`).toBe(false);
        }
        if (!campus.dock)
          expect(grid[campus.rows - 1][Math.floor(campus.columns / 2)]).not.toBe("grass");
      });

      /**
       * A prop is drawn above its own feet, so one standing at the edge of a
       * path is drawn across it and whoever walks there disappears behind it —
       * the rule the wood's trails are planted by. On a campus the paving is
       * all thoroughfare, which is what leaves no room for anything as tall as
       * a tree: the widest run of grass here is a tile deep.
       */
      it("hangs nothing over the paving anybody has to walk on", () => {
        const paving = campus.paved.map((r) => ({
          x: r.x * TILE,
          y: r.y * TILE,
          width: r.width * TILE,
          height: r.height * TILE,
        }));
        for (const pic of pictures)
          for (const p of paving) expect(overlaps(pic, p), JSON.stringify(pic)).toBe(false);
      });

      it("stands nothing in a wall", () => {
        for (const b of campus.buildings)
          for (const s of [...campus.props.map(propBody), ...(campus.signs ?? []).map(signBody)])
            if (s) expect(overlaps(s, b.solid), JSON.stringify(s)).toBe(false);
      });

      /**
       * Nothing collides a resident, so the bounds are the only thing keeping
       * a wanderer out of the furniture: a bench inside them is a bench Mark
       * is drawn straight through.
       */
      const yard = yardArea(campus.slug);
      if (yard.width > 0)
        it("leaves the yard a wanderer paces clear of furniture", () => {
          for (const pic of pictures) expect(overlaps(pic, yard), JSON.stringify(pic)).toBe(false);
        });

      it("lets you walk from the gate to every door, and back out", () => {
        const doors = campus.buildings.map((b) => ({
          x: b.door.x + b.door.width / 2,
          y: b.door.y,
        }));
        expect(allReachable(bounds, solids, campus.entrance, doors)).toBe(true);
        expect(
          allReachable(bounds, solids, campus.entrance, [
            { x: campus.exit.x + campus.exit.width / 2, y: campus.exit.y },
          ]),
        ).toBe(true);
      });

      if (campus.dock) {
        it("is an island: water all round, a dock to the ferry, and a board saying where you are", () => {
          const edge = (x: number, y: number) => grid[y][x];
          for (let x = 0; x < campus.columns; x++) {
            expect(edge(x, 0)).toBe("water");
            expect(edge(x, campus.rows - 1)).not.toBe("grass");
          }
          for (let y = 0; y < campus.rows; y++) {
            expect(edge(0, y)).toBe("water");
            expect(edge(campus.columns - 1, y)).toBe("water");
          }
          // The way out is the end of the dock, and the ferry is moored beside it.
          const col = Math.floor((campus.exit.x + campus.exit.width / 2) / TILE);
          const row = Math.floor((campus.exit.y + campus.exit.height - 1) / TILE);
          expect(grid[row][col]).toBe("dock");
          expect(campus.boat!.x).toBe(campus.exit.x + campus.exit.width);
          // You arrive on the dock too, facing the island.
          expect(
            grid[Math.floor(campus.entrance.y / TILE)][Math.floor(campus.entrance.x / TILE)],
          ).toBe("dock");
          expect(campus.signs?.some((s) => /IRELAND/.test(s.text))).toBe(true);
          expect(campus.place).toBe("Ireland");
        });
      } else {
        it("keeps the bottom edge — the way out from anywhere — clear of solids", () => {
          for (const s of solids) expect(s.y + s.height).toBeLessThanOrEqual(campus.exit.y);
          expect(campus.exit.width).toBe(bounds.width);
        });
      }

      it("stands you outside the building you just left, else at the gate", () => {
        const first = campus.buildings[0];
        expect(campusSpawnFor(campus, first.tenant.slug)).toEqual(first.outside);
        expect(first.outside.y).toBeGreaterThan(first.door.y + first.door.height);
        expect(campusSpawnFor(campus, null)).toEqual(campus.entrance);
      });
    });
  }
});
