import * as Phaser from "phaser";
import type { DoorZone } from "@/lib/doors";
import { FRAME_WIDTH, FRAME_HEIGHT, SHEET_COLUMNS, type Direction } from "../config/animations";
import { exteriorRects } from "@/lib/map-perimeter";
import { addSolid } from "./solids";

export interface POIDef {
  name: string;
  x: number;
  y: number;
  facing: Direction | null;
}

/**
 * How many frames wide a loaded sheet is.
 *
 * Counted from the image rather than assumed, so a sheet holding only the
 * frames the game animates is as valid as one of the pack's wide ones. Falls
 * back to the pack's width if the texture is not there to measure, which
 * keeps a missing sheet from producing a zero-column grid.
 */
export function sheetColumns(scene: Phaser.Scene, key: string): number {
  const source = scene.textures.get(key)?.source?.[0];
  if (!source?.width) return SHEET_COLUMNS;
  return Math.max(1, Math.floor(source.width / FRAME_WIDTH));
}

export function buildSpriteFrames(scene: Phaser.Scene, key: string) {
  const tex = scene.textures.get(key);
  if (!tex.source.length) return;
  const columns = sheetColumns(scene, key);
  const rows = Math.floor(tex.source[0].height / FRAME_HEIGHT);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      tex.add(
        row * columns + col,
        0,
        col * FRAME_WIDTH,
        row * FRAME_HEIGHT,
        FRAME_WIDTH,
        FRAME_HEIGHT,
      );
    }
  }
}

/**
 * Where the character starts: the map's `boss` spawn, or failing a name the
 * right-most spawn, or failing any the middle of the map.
 *
 * There used to be a seat for every other spawn, one per worker. Every map
 * this world generates has exactly one, so that list was always empty and
 * went with the workers.
 */
export function parseSpawns(map: Phaser.Tilemaps.Tilemap) {
  const spawnsLayer = map.getObjectLayer("spawns");
  const fallback: { x: number; y: number; facing: Direction } = {
    x: map.widthInPixels / 2,
    y: map.heightInPixels / 2,
    facing: "down",
  };

  const bossObj =
    spawnsLayer?.objects.find((o) => o.name === "boss") ??
    [...(spawnsLayer?.objects ?? [])].sort((a, b) => a.x! - b.x!).pop();
  if (!bossObj) return { bossSpawn: fallback };

  const props = bossObj.properties as Array<{ name: string; value: string }> | undefined;
  const facing = (props?.find((p) => p.name === "facing")?.value as Direction) ?? "down";
  return { bossSpawn: { x: bossObj.x!, y: bossObj.y!, facing } };
}

export function parsePOIs(map: Phaser.Tilemaps.Tilemap): POIDef[] {
  const layer = map.getObjectLayer("pois");
  if (!layer) return [];

  const pois: POIDef[] = [];
  for (const obj of layer.objects) {
    if (obj.name && typeof obj.x === "number" && typeof obj.y === "number") {
      const props = obj.properties as Array<{ name: string; value: string }> | undefined;
      const fp = props?.find((p) => p.name === "facing");
      const facing = (fp?.value as Direction) ?? null;
      pois.push({ name: obj.name, x: obj.x, y: obj.y, facing });
    }
  }
  return pois;
}

/**
 * Doorways out of the room, read from the map's "transitions" layer.
 *
 * Each carries the scene it leads to, so adding a room becomes a change to the
 * map spec rather than to this code. A transition with no target is skipped —
 * a door that leads nowhere is decoration, and should not swallow the player.
 */
export function parseTransitions(map: Phaser.Tilemaps.Tilemap): DoorZone[] {
  const layer = map.getObjectLayer("transitions");
  if (!layer) return [];

  const zones: DoorZone[] = [];
  for (const obj of layer.objects) {
    const props = obj.properties as Array<{ name: string; value: string }> | undefined;
    const target = props?.find((p) => p.name === "target")?.value;
    const facing = props?.find((p) => p.name === "facing")?.value as DoorZone["facing"];
    if (!obj.name || !target) continue;
    if (typeof obj.x !== "number" || typeof obj.y !== "number") continue;
    zones.push({
      name: obj.name,
      target,
      x: obj.x,
      y: obj.y,
      width: obj.width ?? 0,
      height: obj.height ?? 0,
      facing,
    });
  }
  return zones;
}

/**
 * Where there is something to stand on, tile by tile.
 *
 * Both layers count: `floor` is the rooms, `ground` is the odd patch of
 * different surface laid over them. Anything either one covers is inside.
 */
function floorGrid(map: Phaser.Tilemaps.Tilemap): boolean[][] {
  return Array.from({ length: map.height }, (_, y) =>
    Array.from(
      { length: map.width },
      (_, x) =>
        map.getTileAt(x, y, false, "floor") !== null ||
        map.getTileAt(x, y, false, "ground") !== null,
    ),
  );
}

export function buildCollisionRects(
  map: Phaser.Tilemaps.Tilemap,
  collisionGroup: Phaser.Physics.Arcade.StaticGroup,
) {
  const collisionRects: { x: number; y: number; width: number; height: number }[] = [];
  const collisionLayer = map.getObjectLayer("collisions");

  if (collisionLayer) {
    for (const obj of collisionLayer.objects) {
      const ox = obj.x ?? 0;
      const oy = obj.y ?? 0;
      const ow = obj.width ?? 0;
      const oh = obj.height ?? 0;
      if (ow === 0 || oh === 0) continue;

      addSolid(collisionGroup, { x: ox, y: oy, width: ow, height: oh });
      collisionRects.push({ x: ox, y: oy, width: ow, height: oh });
    }
  }

  // Make the outside of the building solid.
  //
  // This used to be a rectangle around the extent of the walls, and it was
  // only ever given to the pathfinder — which is why the workers stayed
  // inside and the player could stroll out through any gap the walls happened
  // to have. Now the exterior is worked out from the map and made solid for
  // everyone, physics included.
  for (const rect of exteriorRects(floorGrid(map), map.tileWidth)) {
    addSolid(collisionGroup, rect);
    collisionRects.push(rect);
  }

  return collisionRects;
}

export function renderTileObjectLayer(
  scene: Phaser.Scene,
  map: Phaser.Tilemaps.Tilemap,
  layerName: string,
  tilesets: Phaser.Tilemaps.Tileset[],
  depth: number,
) {
  const objectLayer = map.getObjectLayer(layerName);
  if (!objectLayer) return;

  for (const obj of objectLayer.objects) {
    if (!obj.gid) continue;

    let tileset: Phaser.Tilemaps.Tileset | null = null;
    for (let i = tilesets.length - 1; i >= 0; i--) {
      if (obj.gid >= tilesets[i].firstgid) {
        tileset = tilesets[i];
        break;
      }
    }
    if (!tileset) continue;

    const localId = obj.gid - tileset.firstgid;

    const tileW = tileset.tileWidth;
    const tileH = tileset.tileHeight;
    const srcX = (localId % tileset.columns) * tileW;
    const srcY = Math.floor(localId / tileset.columns) * tileH;

    // Cut the tile out of its sheet the first time it is used. This asked
    // whether a texture named after the frame existed, which none ever does,
    // so every object on the layer asked the sheet to add the frame again.
    const baseTexture = scene.textures.get(tileset.name);
    if (!baseTexture.has(String(localId))) baseTexture.add(localId, 0, srcX, srcY, tileW, tileH);

    scene.add
      .image(obj.x!, obj.y! - tileH, tileset.name, localId)
      .setOrigin(0, 0)
      .setDepth(depth);
  }
}
