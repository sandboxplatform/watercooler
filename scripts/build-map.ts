/**
 * Generates the maps from their room specs: office3.json (a bare lobby),
 * one lobby per tenant with its game in the corner, and floor.json (the
 * floors above, where the desks go).
 *
 * Writes a new file rather than overwriting office2.json, so the old office
 * stays intact and the scene can be pointed back at it in one line.
 *
 *   pnpm build:map
 */

import { readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { generateMap, type TilesetRef } from "../lib/map/generate";
import { buildOfficeSpec } from "../lib/map/office";
import { buildFloorSpec } from "../lib/map/floor";
import { buildGarageSpec, buildStoreSpec, buildWarehouseSpec } from "../lib/map/premises";
import {
  TENANTS,
  operationsBoards,
  operationsRoomCount,
  storeOf,
  tenantsOf,
} from "../lib/world/tenants";
import { operationsMapFile } from "../lib/world/floors";
import type { SourceMap } from "../lib/map/harvest";

const MAPS = join(process.cwd(), "public", "maps");
const SOURCE = join(MAPS, "office2.json");

const raw = JSON.parse(readFileSync(SOURCE, "utf8")) as SourceMap & { tilesets: TilesetRef[] };

/**
 * Four tilesets in the old map still point at the upstream author's own
 * Pictures folder. They resolve only because the loader takes the basename and
 * looks in /tilesets/ — luck, not design. Rewrite them on the way out.
 */
const tilesets: TilesetRef[] = raw.tilesets.map((ts) => ({
  ...ts,
  image: `../tilesets/${basename(ts.image)}`,
}));

/** Every store, warehouse and garage is its own map, with the doors its business has. */
const premises = TENANTS.filter((t) => t.kind && t.kind !== "office").map((t) => {
  const siblings = tenantsOf(t.org);
  const store = storeOf(t.org)?.slug ?? t.slug;
  const build = () => {
    if (t.kind === "store") {
      return buildStoreSpec({
        self: t.slug,
        warehouse: siblings.find((s) => s.kind === "warehouse")?.slug,
        fieldCrew: siblings.find((s) => s.kind === "garage")?.slug,
      });
    }
    return t.kind === "warehouse" ? buildWarehouseSpec(store) : buildGarageSpec(store);
  };
  return [`room-${t.slug}.json`, build] as const;
});

/**
 * One Operations floor per distinct shape actually in use — the boards on the
 * wall and the number of rooms off the corridor. Two buildings running the
 * same boards with the same number of projects share a map; change either and
 * a new one is written, because both are in the file's name.
 */
const operationsFloors = [
  ...new Map(
    TENANTS.filter((t) => operationsBoards(t).length > 0).map(
      (t) =>
        [
          operationsMapFile(operationsBoards(t), operationsRoomCount(t)),
          { boards: operationsBoards(t), rooms: operationsRoomCount(t) },
        ] as const,
    ),
  ),
].map(([path, { boards, rooms }]) => {
  const file = path.replace("/maps/", "");
  return [file, (src: SourceMap) => buildFloorSpec(src, { boards, rooms })] as const;
});

for (const [file, build] of [
  ["office3.json", (src: SourceMap) => buildOfficeSpec(src)],
  ["lobby.json", (src: SourceMap) => buildOfficeSpec(src)],
  ["lobby-castle-atlantic.json", (src: SourceMap) => buildOfficeSpec(src, { game: "pong" })],
  // The island's house: Castle Atlantic's layout, ping pong table and all.
  ["lobby-apeiron-media.json", (src: SourceMap) => buildOfficeSpec(src, { game: "pong" })],
  // The only lobby with a staffed help desk: Doc works this one.
  [
    "lobby-sandbox-erp.json",
    (src: SourceMap) => buildOfficeSpec(src, { game: "pinball", also: ["arcade"], helpDesk: true }),
  ],
  ["floor.json", buildFloorSpec],
  // An Operations floor per set of boards actually hung anywhere: the same
  // room each time, with those boards on the wall. Named by the boards
  // rather than the building, so two buildings running off the same ones
  // share a map and a third needs no new file.
  ...operationsFloors,
  ...premises,
] as const) {
  const spec = build(raw);
  const map = generateMap(spec, tilesets);
  const output = join(MAPS, file);
  writeFileSync(output, JSON.stringify(map, null, 1));
  console.log(
    `wrote ${output}: ${map.width}x${map.height} tiles · ${spec.placements.length} placed · ` +
      `${spec.spawns.length} spawns · ${spec.transitions.map((t) => t.name).join("+")}`,
  );
}
