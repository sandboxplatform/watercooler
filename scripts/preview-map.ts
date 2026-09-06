/**
 * Draws a generated map to a PNG, so a layout can be checked without running
 * the game.
 *
 *   pnpm tsx scripts/preview-map.ts <file.json> <out.png> [scale]
 *
 * The reason this exists: verifying a map meant starting a dev server and
 * walking around, and only one dev server can hold .next/dev/lock at a time
 * — so with one already running there was no way to look at a floor at all.
 * This reads the tile data and the tilesets and composites them, which is
 * enough to see whether the walls, doorways and corridors are where they
 * were meant to be.
 *
 * It draws only the tile layers, so anything the scene supplies from its own
 * sprites — the boards, the games, the lift car, the help desk counter — is
 * absent. The lift's transition zone is outlined in red and the spawn in
 * green, since where those sit is usually the question.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { decodePng, encodePng, type Bitmap } from "../lib/pixel/png";

const file = process.argv[2];
const out = process.argv[3];
const scale = Number(process.argv[4] ?? 1);
const map = JSON.parse(readFileSync(join(process.cwd(), "public/maps", file), "utf8"));
const T = map.tilewidth as number;

// Tilesets, loaded once each, with the gid range they own.
const sets = (map.tilesets as Array<Record<string, unknown>>).map((ts) => {
  const image = String(ts.image).split("/").pop()!;
  return {
    first: ts.firstgid as number,
    count: ts.tilecount as number,
    columns: ts.columns as number,
    png: decodePng(readFileSync(join(process.cwd(), "public/tilesets", image))),
  };
});
const owner = (gid: number) => sets.find((s) => gid >= s.first && gid < s.first + s.count);

const W = map.width * T;
const H = map.height * T;
const canvas: Bitmap = { width: W, height: H, data: new Uint8Array(W * H * 4) };
for (let i = 3; i < canvas.data.length; i += 4) canvas.data[i] = 255; // opaque black ground

const blit = (gid: number, tx: number, ty: number) => {
  // Tiled's top three bits are flip flags.
  const id = gid & 0x1fffffff;
  const set = owner(id);
  if (!set) return;
  const local = id - set.first;
  const sx = (local % set.columns) * T;
  const sy = Math.floor(local / set.columns) * T;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const s = ((sy + y) * set.png.width + sx + x) * 4;
      if (set.png.data[s + 3] === 0) continue;
      const d = ((ty * T + y) * W + tx * T + x) * 4;
      canvas.data.set(set.png.data.subarray(s, s + 4), d);
    }
  }
};

for (const layer of map.layers) {
  if (layer.type !== "tilelayer") continue;
  for (let ty = 0; ty < map.height; ty++)
    for (let tx = 0; tx < map.width; tx++) {
      const gid = layer.data[ty * map.width + tx];
      if (gid) blit(gid, tx, ty);
    }
}

// Mark the lift and the spawn so their placement is checkable.
const paint = (px: number, py: number, w: number, h: number, rgb: number[]) => {
  for (let y = py; y < py + h; y++)
    for (let x = px; x < px + w; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const onEdge = x < px + 2 || x >= px + w - 2 || y < py + 2 || y >= py + h - 2;
      if (onEdge) canvas.data.set([...rgb, 255], (y * W + x) * 4);
    }
};
for (const layer of map.layers) {
  if (layer.type !== "objectgroup") continue;
  for (const o of layer.objects) {
    if (o.name === "elevator") paint(o.x, o.y, o.width, o.height, [255, 40, 40]);
    if (layer.name === "spawns") paint(o.x - 24, o.y - 24, 48, 48, [40, 200, 40]);
  }
}

const sw = Math.round(W * scale);
const sh = Math.round(H * scale);
const small: Bitmap = { width: sw, height: sh, data: new Uint8Array(sw * sh * 4) };
for (let y = 0; y < sh; y++)
  for (let x = 0; x < sw; x++) {
    const s = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4;
    small.data.set(canvas.data.subarray(s, s + 4), (y * sw + x) * 4);
  }
writeFileSync(out, encodePng(scale === 1 ? canvas : small));
console.log(`${file} -> ${out}  ${map.width}x${map.height} tiles, ${sw}x${sh}px`);
