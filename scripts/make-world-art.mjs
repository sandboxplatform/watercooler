/**
 * Draws the world map's pieces into public/sprites/world/.
 *
 * The project ships interior tilesets only, so the outside is generated —
 * but in the interiors' own palette, sampled from the Modern Office and
 * Generic sheets: dark navy outlines (#3a3a50 / #46465e), lilac-grey stone
 * (#d8d0e0 / #c6bdd5 / #a79796), warm wood (#ca8854 / #dbcaa9), and the
 * yellow and blue accents the furniture uses. Every object gets a three-tone
 * ramp and an outline, the way the furniture does, so it sits beside the
 * borrowed café props without a seam.
 *
 *   node scripts/make-world-art.mjs
 */

import { deflateSync } from "zlib";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), "public", "sprites", "world");
mkdirSync(OUT, { recursive: true });

// The interiors' palette.
const P = {
  ink: [58, 58, 80, 255],
  ink2: [70, 70, 94, 255],
  slab: [216, 208, 224, 255],
  slabLit: [235, 228, 242, 255],
  grout: [198, 189, 213, 255],
  stone: [167, 151, 150, 255],
  stoneDark: [139, 139, 171, 255],
  steel: [108, 110, 133, 255],
  steelDark: [86, 89, 114, 255],
  wood: [202, 136, 84, 255],
  woodLit: [219, 202, 169, 255],
  woodDark: [139, 81, 77, 255],
  grass: [116, 160, 96, 255],
  grassDark: [100, 140, 80, 255],
  grassLit: [132, 176, 108, 255],
  leaf: [104, 145, 131, 255],
  leafLit: [130, 172, 150, 255],
  leafDark: [72, 108, 96, 255],
  water: [80, 167, 232, 255],
  waterLit: [204, 230, 236, 255],
  waterDark: [73, 149, 227, 255],
  yellow: [224, 184, 112, 255],
  yellowDark: [195, 170, 87, 255],
  red: [179, 94, 63, 255],
  blue: [73, 133, 204, 255],
  teal: [47, 125, 120, 255],
  tealDark: [31, 94, 90, 255],
  glass: [204, 230, 236, 255],
  glassLit: [240, 248, 250, 255],
  shadow: [40, 40, 60, 70],
  // The basketball court: a green-slate sport surface out of the teal family,
  // with its lines in the paving's own off-white so the painted markings read
  // as paint rather than as a light.
  court: [78, 116, 110, 255],
  courtDark: [68, 104, 98, 255],
  courtLine: [226, 232, 236, 255],
  // A woodland trail: trodden earth out of the wood family, warmer and
  // lighter than the tree trunks so a path reads against them.
  trail: [150, 122, 92, 255],
  trailDark: [128, 102, 76, 255],
  trailLit: [176, 150, 118, 255],
  // The shingle on the far bank of the Gold River: wet stone, greyer and
  // cooler than the trail, which is dry earth — the two are a few tiles
  // apart in places and a beach that read as brown would read as more path.
  // Four stone tones rather than one, because a pebble beach is pebbles of
  // different stone; one tone with a highlight on it is a gravel path.
  shingle: [118, 112, 104, 255],
  shingleDark: [95, 90, 84, 255],
  shingleLit: [140, 134, 124, 255],
  stonePale: [200, 194, 182, 255],
  stoneMid: [170, 163, 150, 255],
  stoneDim: [142, 136, 127, 255],
  stoneDeep: [100, 96, 94, 255],
  rim: [214, 122, 62, 255],
  ball: [206, 116, 58, 255],
  ballLit: [228, 148, 88, 255],
  ballDark: [162, 84, 38, 255],
};

function canvas(w, h) {
  const px = new Uint8Array(w * h * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    if (c[3] === 255) {
      px.set(c, i);
      return;
    }
    const a = c[3] / 255;
    px[i] = px[i] * (1 - a) + c[0] * a;
    px[i + 1] = px[i + 1] * (1 - a) + c[1] * a;
    px[i + 2] = px[i + 2] * (1 - a) + c[2] * a;
    px[i + 3] = Math.max(px[i + 3], c[3]);
  };
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c);
  };
  const outline = (x0, y0, x1, y1, c = P.ink) => {
    for (let x = x0; x < x1; x++) {
      set(x, y0, c);
      set(x, y1 - 1, c);
    }
    for (let y = y0; y < y1; y++) {
      set(x0, y, c);
      set(x1 - 1, y, c);
    }
  };
  const disc = (cx, cy, r, c) => {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) set(cx + x, cy + y, c);
  };
  const ring = (cx, cy, r, c) => {
    for (let y = -r - 1; y <= r + 1; y++)
      for (let x = -r - 1; x <= r + 1; x++) {
        const d = x * x + y * y;
        if (d <= (r + 1) * (r + 1) && d > (r - 0.5) * (r - 0.5)) set(cx + x, cy + y, c);
      }
  };
  const ellipse = (cx, cy, rx, ry, c) => {
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++)
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) set(cx + x, cy + y, c);
  };
  return { w, h, px, set, rect, outline, disc, ring, ellipse };
}
const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
};

// ── Ground tiles ──
function grass() {
  const c = canvas(48, 48);
  c.rect(0, 0, 48, 48, P.grass);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) if (hash(x, y) < 0.05) c.set(x, y, P.grassDark);
  // a few tufts: three-pixel vees
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(hash(i, 11) * 42) + 2,
      y = Math.floor(hash(i, 23) * 42) + 3;
    c.set(x, y, P.grassLit);
    c.set(x - 1, y + 1, P.grassLit);
    c.set(x + 1, y + 1, P.grassLit);
    c.set(x, y + 1, P.grassDark);
  }
  return c;
}
/**
 * The same grass, eight tiles square.
 *
 * Not a different picture — the same noise, the same tufts, drawn over a
 * bigger square — and it exists for one reason: the world map is 186
 * columns by 69, and laying grass a tile at a time is ten thousand
 * pictures on the display list before anything is standing on them. At
 * eight tiles a block it is a hundred and sixty, and `layGround` lays the
 * carpet first and then draws only what is not grass on top.
 *
 * It also makes the grass look like grass rather than like a tile: the
 * tufts repeated every 48 pixels were a pattern anybody could see once the
 * map had a meadow in it, and the period is eight times longer here.
 */
function grassBlock() {
  const size = 48 * 8;
  const c = canvas(size, size);
  c.rect(0, 0, size, size, P.grass);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) if (hash(x, y) < 0.05) c.set(x, y, P.grassDark);
  for (let i = 0; i < 7 * 64; i++) {
    const x = Math.floor(hash(i, 11) * (size - 6)) + 2,
      y = Math.floor(hash(i, 23) * (size - 6)) + 3;
    c.set(x, y, P.grassLit);
    c.set(x - 1, y + 1, P.grassLit);
    c.set(x + 1, y + 1, P.grassLit);
    c.set(x, y + 1, P.grassDark);
  }
  return c;
}

/**
 * The highway's tarmac: the car park's asphalt without the bay line.
 *
 * A separate tile rather than the same one, and that line is the whole
 * reason. It is drawn down the left edge of `asphalt()` on purpose — tiled,
 * it reads as a row of parking bays — and a road paved out of it would have
 * a white line across every lane every forty-eight pixels. What makes this
 * one a road is painted over it in one piece; see `highwayMarks`.
 */
function highway() {
  const c = canvas(48, 48);
  c.rect(0, 0, 48, 48, [80, 83, 108, 255]);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const n = hash(x + 11, y + 5);
      if (n < 0.06) c.set(x, y, [72, 74, 98, 255]);
      else if (n > 0.975) c.set(x, y, [92, 95, 120, 255]);
    }
  return c;
}

/**
 * The markings, four tiles across and one deep: transparent but for the
 * paint.
 *
 * One strip laid per row down the road rather than baked into the tarmac,
 * for the reason the basketball court's lines are a picture: the paint runs
 * across the road and the tiles run down it, so a tile that carried its own
 * share of the markings would be four different tiles and a rule about which
 * column each one goes in.
 *
 * The dash is half on and half off over the strip's own height, so the
 * broken line comes out evenly broken however long the road is.
 */
function highwayMarks() {
  const c = canvas(192, 48);
  const paint = [226, 232, 236, 255];
  const centre = [224, 184, 112, 255];
  // The solid edge lines, a little in from the tarmac's own edges.
  c.rect(7, 0, 10, 48, paint);
  c.rect(182, 0, 185, 48, paint);
  // And the broken line down the middle. **One stroke, not two.** Two dashed
  // strokes side by side is not a marking any road carries — a double centre
  // line is solid, which says the opposite of what this road is — and at the
  // zoom the map opens at the pair read as a single fat dash with a crack
  // down it.
  c.rect(93, 6, 97, 30, centre);
  return c;
}

function paving() {
  // 2x2 slabs per tile with grout, a lit top-left corner each
  const c = canvas(48, 48);
  c.rect(0, 0, 48, 48, P.slab);
  for (const [sx, sy] of [
    [0, 0],
    [24, 0],
    [0, 24],
    [24, 24],
  ]) {
    c.rect(sx + 1, sy + 1, sx + 8, sy + 3, P.slabLit);
    c.rect(sx + 1, sy + 1, sx + 3, sy + 8, P.slabLit);
  }
  for (let i = 0; i < 48; i++) {
    c.set(i, 23, P.grout);
    c.set(23, i, P.grout);
    c.set(i, 47, P.grout);
    c.set(47, i, P.grout);
  }
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) if (hash(x + 7, y + 3) < 0.02) c.set(x, y, P.grout);
  return c;
}
function kerb() {
  // paving with a stone kerb along the top edge, for where paving meets grass
  const c = paving();
  c.rect(0, 0, 48, 6, P.stone);
  c.rect(0, 0, 48, 2, P.slabLit);
  c.rect(0, 6, 48, 7, P.ink2);
  return c;
}

function asphalt() {
  const c = canvas(48, 48);
  c.rect(0, 0, 48, 48, [86, 89, 114, 255]);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) if (hash(x + 3, y + 9) < 0.06) c.set(x, y, [78, 80, 104, 255]);
  // a bay line down the left edge: repeated, the tiles read as parking bays
  c.rect(0, 4, 3, 44, [216, 208, 224, 255]);
  return c;
}

/**
 * A woodland trail: trodden earth, with grit and a few stones in it.
 *
 * Plain and seamless like the grass it runs through, because a trail is a
 * dozen tiles long and anything with an edge on it would repeat down the
 * whole length. No kerb either — that is a thing a town lays along a road.
 */
function trail() {
  const c = canvas(48, 48);
  c.rect(0, 0, 48, 48, P.trail);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      const n = hash(x + 21, y + 7);
      if (n < 0.1) c.set(x, y, P.trailDark);
      else if (n > 0.93) c.set(x, y, P.trailLit);
    }
  }
  // A handful of stones, each two pixels across so they read at this size.
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(hash(i + 31, 5) * 44) + 2;
    const y = Math.floor(hash(7, i + 41) * 44) + 2;
    c.rect(x, y, x + 2, y + 2, P.trailLit);
    c.set(x, y + 1, P.trailDark);
  }
  return c;
}

/**
 * A rocky beach: pebbles, packed, with wet grit showing between them.
 *
 * Seamless like the grass and the trail, and for the same reason — a beach
 * is half a dozen tiles long and an edge on the tile repeats the whole way
 * down it. So every pebble is drawn wrapped round the tile's edges rather
 * than inset, or the seam between two of them would be a line of bare grit.
 *
 * **What makes it read as stones is their shape, their spread and their
 * size — in that order**, and it took three goes to find that out:
 *
 * | Go  | What went in                          | What it read as                                                  |
 * | --- | ------------------------------------- | ---------------------------------------------------------------- |
 * | 1   | One- and two-pixel flecks, one tone   | Concrete. Nothing in it was big enough to be a thing             |
 * | 2   | Five-pixel stones, few, at random     | Bare floor in three places and a clump in the corner             |
 * | 3   | The same, packed, drawn as ellipses   | Diamonds. A five-wide ellipse comes out of the arithmetic a plus |
 *
 * So the stones are **drawn** rather than solved — half a dozen little
 * masks, wider than they are tall, which is what a pebble lying in a bed of
 * them looks like from above. They go down on a jittered grid rather than at
 * random: one to a cell, moved off its centre by up to half of one, which
 * covers the tile evenly and still lands nothing on a lattice. Smaller ones
 * fill the gaps on a grid of their own, offset half a cell so the two do not
 * line up.
 *
 * Each stone is its own tone with a crown and an underside struck off *that*
 * tone rather than off one shared pair: at four or five pixels across a lit
 * top row and a dark bottom row is the whole of saying a stone is round and
 * lying on something, and a shared highlight would make every pebble the
 * same stone in a different shirt.
 */
function shingle() {
  const c = canvas(48, 48);
  c.rect(0, 0, 48, 48, P.shingle);
  // The wet grit the stones lie in. It shows only in the gaps, so it is
  // sparse: any busier and it reads through the pebbles as static.
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      const n = hash(x + 53, y + 11);
      if (n < 0.09) c.set(x, y, P.shingleDark);
      else if (n > 0.94) c.set(x, y, P.shingleLit);
    }
  }
  const shade = (colour, by) =>
    colour.map((v, i) => (i === 3 ? v : Math.max(0, Math.min(255, v + by))));
  // Pebbles, drawn. Wider than tall, and the bigger ones lopsided, because
  // a stone that is symmetrical about both axes is a bead.
  const BIG = [
    [".XXX.", "XXXXX", "XXXXX", ".XXX."],
    ["..XX.", ".XXXX", "XXXXX", ".XXX."],
    [".XXX.", "XXXXX", ".XXXX", "..XX."],
    [".XX.", "XXXX", "XXXX", ".XX."],
  ];
  const SMALL = [["XX", "XX"], [".XX.", "XXXX", ".XX."], ["XXX", ".XX"], ["XX"]];
  const TONES = [P.stonePale, P.stoneMid, P.stoneMid, P.stoneDim, P.stoneDim, P.stoneDeep];
  const pebble = (cx, cy, mask, tone) => {
    const crown = shade(tone, 34);
    const under = shade(tone, -34);
    const left = cx - (mask[0].length >> 1);
    const top = cy - (mask.length >> 1);
    mask.forEach((line, row) => {
      const colour = row === 0 ? crown : row === mask.length - 1 ? under : tone;
      for (let col = 0; col < line.length; col++) {
        if (line[col] !== "X") continue;
        c.set((left + col + 48) % 48, (top + row + 48) % 48, colour);
      }
    });
  };
  /** A pass of stones, one to a cell of the grid, jittered off the middle. */
  const pass = (cell, shapes, offset, seed) => {
    for (let gy = 0; gy < 48 / cell; gy++)
      for (let gx = 0; gx < 48 / cell; gx++) {
        const jx = Math.round((hash(gx + seed, gy + 5) - 0.5) * cell);
        const jy = Math.round((hash(gy + seed, gx + 17) - 0.5) * cell);
        const mask = shapes[Math.floor(hash(gx + seed + 3, gy + 23) * shapes.length)];
        const tone = TONES[Math.floor(hash(gx + seed + 7, gy + 31) * TONES.length)];
        pebble(gx * cell + offset + jx, gy * cell + offset + jy, mask, tone);
      }
  };
  // The big stones, then smaller ones half a cell off them, in the gaps.
  pass(8, BIG, 4, 3);
  pass(8, SMALL, 0, 61);
  return c;
}

/**
 * The basketball court's surface: plain, because the lines go over it.
 *
 * A tile cannot carry the markings — a centre circle and two keys are one
 * picture nine tiles wide — so the court is laid as ground the way the car
 * park's asphalt is, and `courtLines` below is painted on top of it in one
 * piece. Which is also why this has no line of its own anywhere: the seam
 * between two tiles is the one thing a repeated pattern would give away.
 */
function court() {
  const c = canvas(48, 48);
  c.rect(0, 0, 48, 48, P.court);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) if (hash(x + 5, y + 17) < 0.07) c.set(x, y, P.courtDark);
  return c;
}

/**
 * The markings, as one transparent picture the size of the whole court.
 *
 * Takes the court's size in tiles, matching COURT in
 * lib/world/basketball.ts — sixteen by eight as it stands, and it was nine
 * by six, so nothing here may be a number that only suits one of them. The
 * boundary is inset a little from the tarmac's edge, the way a real one is,
 * so the court reads as a surface with a court painted on it rather than as
 * a rectangle of a different colour.
 *
 * **Every distance on it is struck off the real thing**, which is 28 metres
 * by 15: the key is 5.8 of them deep and 4.9 across, the centre circle is
 * 1.8 in radius and the arc is 6.75 from the basket. Written as pixels they
 * were four numbers that happened to suit a 432-wide court, and a court of
 * another size would have had them re-guessed rather than re-derived.
 */
function courtLines(tilesW, tilesH) {
  const W = tilesW * 48;
  const H = tilesH * 48;
  const alongM = W / 28;
  const acrossM = H / 15;
  const inset = 8;
  const keyDepth = Math.round(5.8 * alongM);
  const keyHalf = Math.round(2.45 * acrossM);
  const circle = Math.round(1.8 * alongM);
  // The arc is kept clear of the sidelines. A real one runs into a straight
  // line down each side rather than closing; ours is a plain semicircle, so
  // at full radius on a court this shape it would come out on the sideline
  // and read as a second boundary.
  const arc = Math.min(Math.round(6.75 * alongM), H / 2 - inset - 16);
  const c = canvas(W, H);
  const line = P.courtLine;
  const band = (cx, cy, r, from, to) => {
    for (let a = from; a <= to; a += 0.002) {
      for (const rr of [r, r + 1]) {
        c.set(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), line);
      }
    }
  };
  // The boundary, two pixels thick.
  for (const i of [0, 1]) c.outline(inset + i, inset + i, W - inset - i, H - inset - i, line);
  // The half-way line and the centre circle.
  c.rect(W / 2 - 1, inset, W / 2 + 1, H - inset, line);
  band(W / 2, H / 2, circle, 0, Math.PI * 2);
  // A key at each end, and the arc over it, struck from the rim.
  for (const dir of [1, -1]) {
    const end = dir > 0 ? inset : W - inset;
    const key = end + keyDepth * dir;
    c.rect(Math.min(end, key), H / 2 - keyHalf - 2, Math.max(end, key), H / 2 - keyHalf, line);
    c.rect(Math.min(end, key), H / 2 + keyHalf, Math.max(end, key), H / 2 + keyHalf + 2, line);
    c.rect(
      Math.min(key, key - 2 * dir),
      H / 2 - keyHalf - 2,
      Math.max(key, key - 2 * dir),
      H / 2 + keyHalf + 2,
      line,
    );
    // Struck from the rim, which is 50px in from the end line — the same
    // point lib/world/basketball.ts drops the ball through.
    const rim = dir > 0 ? 50 : W - 50;
    band(
      rim,
      H / 2,
      arc,
      dir > 0 ? -Math.PI / 2 : Math.PI / 2,
      dir > 0 ? Math.PI / 2 : (Math.PI * 3) / 2,
    );
  }
  return c;
}

/** A pond: water with ripples, a stone rim, and reeds at the edge. */
function pond() {
  const c = canvas(288, 192);
  c.ellipse(144, 140, 136, 44, P.shadow);
  c.ellipse(144, 110, 140, 70, P.ink);
  c.ellipse(144, 110, 138, 68, P.stoneDark);
  c.ellipse(144, 108, 132, 62, P.slab);
  c.ellipse(144, 108, 126, 56, P.ink);
  c.ellipse(144, 108, 124, 54, P.waterDark);
  c.ellipse(144, 104, 110, 44, P.water);
  for (const [rx, ry, cx, cy] of [
    [60, 20, 110, 100],
    [40, 14, 190, 96],
    [24, 8, 150, 120],
  ]) {
    for (let a = 0; a < 360; a += 4) {
      const x = Math.round(cx + Math.cos((a * Math.PI) / 180) * rx);
      const y = Math.round(cy + Math.sin((a * Math.PI) / 180) * ry);
      c.set(x, y, P.waterLit);
    }
  }
  // reeds
  for (const [x, y] of [
    [30, 120],
    [40, 128],
    [250, 118],
    [262, 126],
    [140, 160],
  ]) {
    for (let i = 0; i < 18; i++) c.set(x + (i % 3) - 1, y - i, i > 12 ? P.leafLit : P.leafDark);
    c.rect(x - 1, y - 20, x + 2, y - 15, P.wood);
  }
  // lily pads
  for (const [x, y] of [
    [120, 92],
    [176, 112],
    [96, 118],
  ]) {
    c.disc(x, y, 6, P.leafDark);
    c.disc(x - 1, y - 1, 4, P.leaf);
  }
  return c;
}

// ── Props: one sheet, each prop in a named rectangle ──
const props = canvas(2560, 128);
const frames = {};
let cursor = 0;
function slot(name, w, h, draw) {
  const x0 = cursor;
  frames[name] = { x: x0, y: 0, width: w, height: h };
  draw((x, y, c) => props.set(x0 + x, y, c), {
    rect: (a, b, c2, d, e) => props.rect(x0 + a, b, x0 + c2, d, e),
    outline: (a, b, c2, d, e) => props.outline(x0 + a, b, x0 + c2, d, e),
    disc: (a, b, r, e) => props.disc(x0 + a, b, r, e),
    ring: (a, b, r, e) => props.ring(x0 + a, b, r, e),
    ellipse: (a, b, rx, ry, e) => props.ellipse(x0 + a, b, rx, ry, e),
  });
  cursor += w + 8;
  // `set` clips what falls off the canvas without a word, so a prop added
  // past the right-hand edge would come out as an empty frame and nothing
  // would say why. Widen the sheet: nothing measures it but this.
  if (cursor > props.w) throw new Error(`props sheet full at "${name}": widen it`);
}
slot("tree", 96, 120, (set, d) => {
  d.ellipse(48, 112, 30, 8, P.shadow);
  d.rect(42, 80, 54, 112, P.woodDark);
  d.rect(45, 80, 50, 112, P.wood);
  d.outline(41, 80, 55, 113);
  d.disc(48, 50, 34, P.ink);
  d.disc(48, 50, 32, P.leafDark);
  d.disc(44, 44, 26, P.leaf);
  d.disc(38, 36, 14, P.leafLit);
  d.disc(66, 58, 12, P.ink);
  d.disc(66, 58, 10, P.leaf);
  d.disc(28, 62, 11, P.ink);
  d.disc(28, 62, 9, P.leafDark);
});
slot("bush", 64, 48, (set, d) => {
  d.ellipse(32, 44, 24, 5, P.shadow);
  d.ellipse(32, 26, 28, 16, P.ink);
  d.ellipse(32, 26, 26, 14, P.leafDark);
  d.ellipse(28, 22, 18, 10, P.leaf);
  d.ellipse(24, 18, 9, 5, P.leafLit);
  for (const [fx, fy, col] of [
    [16, 26, P.red],
    [40, 30, P.yellow],
    [46, 20, P.blue],
  ]) {
    set(fx, fy, col);
    set(fx + 1, fy, col);
    set(fx, fy + 1, col);
    set(fx + 1, fy + 1, col);
  }
});
slot("lamp", 32, 96, (set, d) => {
  d.ellipse(16, 92, 10, 3, P.shadow);
  d.rect(13, 20, 19, 90, P.steelDark);
  d.rect(14, 20, 16, 90, P.steel);
  d.outline(12, 20, 20, 91);
  d.rect(8, 86, 24, 92, P.steelDark);
  d.outline(8, 86, 24, 92);
  d.rect(6, 6, 26, 22, P.ink);
  d.rect(8, 8, 24, 20, P.yellow);
  d.rect(10, 10, 16, 14, P.slabLit);
  d.rect(12, 2, 20, 6, P.ink2);
});
slot("bench", 96, 48, (set, d) => {
  d.ellipse(48, 44, 40, 4, P.shadow);
  d.rect(6, 30, 12, 44, P.ink);
  d.rect(84, 30, 90, 44, P.ink);
  d.rect(7, 31, 11, 43, P.steelDark);
  d.rect(85, 31, 89, 43, P.steelDark);
  for (const y of [14, 20]) {
    d.rect(4, y, 92, y + 4, P.wood);
    d.rect(4, y, 92, y + 1, P.woodLit);
    d.outline(3, y - 1, 93, y + 5);
  }
  d.rect(4, 26, 92, 32, P.wood);
  d.rect(4, 26, 92, 27, P.woodLit);
  d.outline(3, 25, 93, 33);
});
slot("fountain", 144, 96, (set, d) => {
  d.ellipse(72, 88, 66, 8, P.shadow);
  d.ellipse(72, 60, 66, 30, P.ink);
  d.ellipse(72, 60, 64, 28, P.stoneDark);
  d.ellipse(72, 58, 60, 24, P.slab);
  d.ellipse(72, 56, 56, 20, P.ink);
  d.ellipse(72, 56, 54, 18, P.waterDark);
  d.ellipse(72, 54, 46, 14, P.water);
  for (const rx of [30, 16]) d.ring(72, 54, rx, P.waterLit);
  d.rect(64, 20, 80, 56, P.ink);
  d.rect(66, 20, 78, 56, P.stone);
  d.rect(66, 20, 70, 56, P.slab);
  d.ellipse(72, 20, 14, 5, P.ink);
  d.ellipse(72, 20, 12, 3, P.water);
  d.rect(70, 4, 74, 20, P.waterLit);
  d.rect(71, 2, 73, 6, P.glassLit);
});
slot("fountain2", 144, 96, (set, d) => {
  d.ellipse(72, 88, 66, 8, P.shadow);
  d.ellipse(72, 60, 66, 30, P.ink);
  d.ellipse(72, 60, 64, 28, P.stoneDark);
  d.ellipse(72, 58, 60, 24, P.slab);
  d.ellipse(72, 56, 56, 20, P.ink);
  d.ellipse(72, 56, 54, 18, P.waterDark);
  d.ellipse(72, 54, 46, 14, P.water);
  for (const rx of [38, 22, 8]) d.ring(72, 54, rx, P.waterLit);
  d.rect(64, 20, 80, 56, P.ink);
  d.rect(66, 20, 78, 56, P.stone);
  d.rect(66, 20, 70, 56, P.slab);
  d.ellipse(72, 20, 14, 5, P.ink);
  d.ellipse(72, 20, 12, 3, P.waterLit);
  d.rect(70, 2, 74, 20, P.waterLit);
  d.rect(68, 0, 76, 4, P.glassLit);
});
slot("planter", 64, 48, (set, d) => {
  d.ellipse(32, 44, 26, 4, P.shadow);
  d.rect(8, 22, 56, 44, P.wood);
  d.rect(8, 22, 56, 26, P.woodLit);
  d.rect(8, 40, 56, 44, P.woodDark);
  d.outline(7, 21, 57, 45);
  d.ellipse(32, 18, 22, 8, P.ink);
  d.ellipse(32, 18, 20, 6, P.leafDark);
  d.ellipse(28, 16, 12, 4, P.leaf);
  for (const [fx, col] of [
    [16, P.red],
    [26, P.yellow],
    [36, P.blue],
    [46, P.red],
  ]) {
    set(fx, 14, col);
    set(fx + 1, 14, col);
    set(fx, 15, col);
    set(fx + 1, 15, col);
  }
});
// A log cabin for the far bank of the Gold River: about as tall as a person
// and a little wider, so it reads as a building at a glance without looking
// like one of the town's. Logs rather than boards, a steep dark roof, one lit
// window and a door nobody opens — see `WOOD_CABIN` in lib/world/wood.ts,
// which is across the water and reachable by nothing.
slot("cabin", 64, 72, (set, d) => {
  d.ellipse(32, 69, 24, 3, P.shadow);
  // The walls: courses of logs, the lower ones in shadow.
  d.rect(8, 32, 56, 68, P.wood);
  for (let y = 34; y < 68; y += 6) d.rect(8, y, 56, y + 1, P.woodDark);
  d.rect(8, 58, 56, 68, P.woodDark);
  d.outline(8, 32, 56, 68);
  // The roof: a steep gable, overhanging both walls, in the leaf-dark green
  // the trees are so it sits in the wood rather than on it.
  for (let i = 0; i < 22; i++) {
    d.rect(4 + i, 32 - i, 60 - i, 33 - i, i < 2 ? P.ink : P.leafDark);
  }
  for (let i = 2; i < 20; i += 4) d.rect(6 + i, 31 - i, 58 - i, 32 - i, P.leaf);
  d.rect(4, 30, 60, 33, P.ink);
  // The door, shut, with a step.
  d.rect(26, 46, 38, 68, P.ink);
  d.rect(27, 47, 37, 68, P.woodDark);
  d.rect(33, 57, 35, 59, P.yellow);
  d.rect(25, 66, 39, 68, P.stone);
  // One window, lit, with a sill.
  d.rect(13, 44, 23, 54, P.ink);
  d.rect(14, 45, 22, 53, P.yellow);
  d.rect(17, 45, 19, 53, P.ink2);
  d.rect(14, 48, 22, 50, P.ink2);
  d.rect(12, 54, 24, 56, P.woodLit);
  // A chimney on the far side, with a curl of smoke: the one thing on it
  // that says somebody is in, which is the point of a cabin you cannot
  // reach.
  d.rect(44, 8, 52, 24, P.stoneDark);
  d.rect(45, 9, 51, 23, P.stone);
  d.outline(44, 8, 52, 24);
  d.disc(49, 5, 3, P.slabLit);
  d.disc(54, 2, 2, P.slabLit);
});
/**
 * A boulder in the shallows at the foot of the shoulder beach, with a cross
 * daubed on it — see `WOOD_BOULDER` in lib/world/wood.ts, which stands it
 * in the river a step off the shingle's western corner.
 *
 * **It is the same stone as the beach it stands beside.** The four
 * `stone*` tones are the shingle's own pebble ramp, because a rock in this
 * river and the stones washed up at its foot are the same rock broken up;
 * drawn out of the lilac-grey furniture stone it read as masonry somebody
 * had dropped in the water.
 *
 * **Four lumps rather than one ellipse.** A boulder drawn as a single dome
 * is a bush with no leaves on it, and at forty rows there is no shading
 * that rescues a symmetrical outline. The union is cut off flat at the
 * waterline, since what is below that is river.
 *
 * **The cross is paint and is drawn as paint**: a stroke three pixels
 * thick with bits worn off it and two tones through it, kept out of the wet
 * band at the foot because paint does not survive down there. Printed
 * cleanly it reads as a sign rather than as something somebody daubed on a
 * rock, which is the whole of what it is for.
 */
slot("boulder", 64, 56, (set, d) => {
  const WATERLINE = 49;
  // A wide slab at the water and a mass narrowing over it: broad where it
  // goes in, so it reads as a rock standing in the river rather than one
  // floating on it.
  const LUMPS = [
    [32, 44, 27, 13],
    [31, 31, 22, 17],
    [16, 33, 11, 12],
    [48, 34, 12, 12],
    [27, 20, 13, 10],
  ];
  const rock = (x, y) =>
    y <= WATERLINE &&
    LUMPS.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  const inside = (x, y) =>
    rock(x, y) && rock(x - 1, y) && rock(x + 1, y) && rock(x, y - 1) && rock(x, y + 1);
  // Its shadow on the surface, under everything else.
  d.ellipse(32, WATERLINE + 1, 27, 5, P.shadow);
  for (let y = 0; y <= WATERLINE; y++)
    for (let x = 0; x < 64; x++) {
      if (!rock(x, y)) continue;
      // Outlined everywhere but along the waterline: ink there reads as a
      // rock cut off rather than as one going into water, and the wet band
      // above it does that job instead.
      if (!inside(x, y) && !(y === WATERLINE && rock(x - 1, y) && rock(x + 1, y))) {
        set(x, y, P.ink);
        continue;
      }
      if (WATERLINE - y <= 3) {
        set(x, y, P.stoneDeep);
        continue;
      }
      // Lit from a point off the top left, as a distance rather than as
      // bands: a boulder shaded by rows comes out striped, and stripes
      // across a rock read as strata nobody drew.
      const lit = Math.hypot(x - 16, y - 8);
      const tone = lit < 27 ? P.stonePale : lit < 45 ? P.stoneMid : P.stoneDim;
      set(x, y, hash(x + 31, y + 5) < 0.06 ? P.stoneDim : tone);
    }
  // The cross: two bands four pixels across, measured **across** the
  // stroke rather than stepped along it. Stepping a diagonal by whole
  // pixels either side leaves the run of it a pixel and a half apart, and
  // what comes out is two rails with daylight down the middle rather than
  // one stroke. Worn at the edges only, so it is old paint and not dotted
  // paint, and kept out of the wet band at the foot, where none would last.
  const ARM = 16;
  const HALF = 3.1;
  for (let y = 0; y <= WATERLINE; y++)
    for (let x = 0; x < 64; x++) {
      const u = (x - 31 + (y - 29)) / Math.SQRT2;
      const v = (x - 31 - (y - 29)) / Math.SQRT2;
      const across = Math.min(Math.abs(u), Math.abs(v));
      const along = Math.max(Math.abs(u), Math.abs(v));
      if (across > HALF || along > ARM) continue;
      if (!inside(x, y) || y > WATERLINE - 7) continue;
      // The rim of a stroke is where a daub thins out and where the weather
      // gets at it: darker, and half of it gone.
      const rim = across > HALF - 1.2 || along > ARM - 1.5;
      if (rim ? hash(x + 19, y + 7) < 0.45 : hash(x + 43, y + 3) < 0.05) continue;
      set(x, y, rim ? P.woodDark : P.red);
    }
  // The river lapping at its foot: dashes along the waterline and a little
  // way out on the water, rather than a ring — a closed ripple round
  // something that never moves reads as a splash it never made.
  const lap = (rx, ry, seed) => {
    for (let a = 0; a < 360; a += 2) {
      const r = (a * Math.PI) / 180;
      const x = Math.round(32 + rx * Math.cos(r));
      const y = Math.round(WATERLINE + ry * Math.sin(r));
      if (y < WATERLINE - 1 || hash(x + seed, y + seed) < 0.45) continue;
      set(x, y, P.waterLit);
    }
  };
  lap(29, 5, 41);
  lap(23, 3, 13);
});
slot("signpost", 48, 96, (set, d) => {
  d.ellipse(24, 92, 8, 3, P.shadow);
  d.rect(21, 30, 27, 90, P.woodDark);
  d.rect(22, 30, 25, 90, P.wood);
  d.outline(20, 30, 28, 91);
  d.rect(4, 8, 44, 30, P.woodLit);
  d.rect(4, 8, 44, 11, P.slabLit);
  d.outline(3, 7, 45, 31);
  d.rect(10, 16, 38, 18, P.ink2);
  d.rect(10, 22, 30, 24, P.ink2);
});
slot("sheep", 48, 40, (set, d) => {
  d.ellipse(24, 37, 14, 3, P.shadow);
  // legs
  for (const lx of [12, 19, 29, 36]) d.rect(lx, 26, lx + 3, 36, P.ink2);
  // the fleece: a cloud of white
  d.ellipse(24, 20, 17, 11, P.ink);
  d.ellipse(24, 20, 15, 9, P.slabLit);
  d.ellipse(16, 16, 7, 5, [250, 250, 250, 255]);
  d.ellipse(30, 14, 6, 5, [250, 250, 250, 255]);
  // the head, looking left, with an ear and an eye
  d.ellipse(8, 20, 7, 5, P.ink);
  d.ellipse(8, 20, 6, 4, P.ink2);
  d.rect(4, 14, 8, 17, P.ink2);
  set(5, 19, [250, 250, 250, 255]);
  set(6, 19, [250, 250, 250, 255]);
});
slot("board", 144, 88, (set, d) => {
  d.ellipse(72, 84, 60, 4, P.shadow);
  for (const px of [18, 120]) {
    d.rect(px, 36, px + 6, 82, P.woodDark);
    d.rect(px + 1, 36, px + 3, 82, P.wood);
    d.outline(px - 1, 36, px + 7, 83);
  }
  d.rect(6, 8, 138, 52, P.woodLit);
  d.rect(6, 8, 138, 12, [240, 232, 210, 255]);
  d.rect(6, 48, 138, 52, P.wood);
  d.outline(5, 7, 139, 53);
  d.outline(9, 11, 135, 49, P.wood);
  // nail heads
  for (const [nx, ny] of [
    [11, 13],
    [132, 13],
    [11, 46],
    [132, 46],
  ])
    set(nx, ny, P.ink2);
});
/**
 * A basketball hoop, seen from the side so its rim points into the court.
 *
 * `dir` is which way that is: +1 for the west end, whose rim reaches east,
 * −1 for the east end. Both are the same drawing about the pole, which is
 * what keeps the two ends of the court identical furniture rather than two
 * pictures that have to be kept in step.
 *
 * The numbers are the ones in lib/world/basketball.ts and have to stay
 * them: the pole stands at the middle of the frame, on the bottom row, and
 * the rim sits RIM_REACH across and RIM_Z up from it — which is where a
 * falling ball is judged to have gone in. A rim drawn anywhere else is a
 * hoop the ball passes through beside.
 *
 * The board is the same bargain and is now three numbers rather than a
 * picture: a ball bounces off the pane it stands on, so its middle column
 * is BOARD_BEHIND_RIM back from the rim (POST + 4 here, the middle of the
 * skewed face), and its face runs between BOARD_BOTTOM_Z and BOARD_TOP_Z —
 * BASE minus the top edge, and that less TALL. Redraw it taller, lower or
 * further back and the ball comes off thin air beside it.
 */
function hoop(dir) {
  const POST = 56;
  const BASE = 128;
  const RIM_X = POST + 30 * dir;
  const RIM_Y = BASE - 64;
  return (set, d) => {
    // An elliptical ring, for the rim: the disc helpers fill, and a filled
    // rim is a plate. Drawn as a band of the normalised radius.
    const rimRing = (cx, cy, rx, ry, c) => {
      for (let y = -ry - 1; y <= ry + 1; y++) {
        for (let x = -rx - 1; x <= rx + 1; x++) {
          const n = (x * x) / (rx * rx) + (y * y) / (ry * ry);
          if (n <= 1 && n > 0.5) set(cx + x, cy + y, c);
        }
      }
    };
    d.ellipse(POST, BASE - 4, 13, 3, P.shadow);
    // The pole, and the plate it is bolted down with.
    d.rect(POST - 4, 26, POST + 5, BASE - 3, P.steelDark);
    d.rect(POST - 3, 26, POST, BASE - 3, P.steel);
    d.outline(POST - 5, 26, POST + 6, BASE - 2);
    d.rect(POST - 11, BASE - 11, POST + 12, BASE - 3, P.stoneDark);
    d.outline(POST - 12, BASE - 12, POST + 13, BASE - 2);
    // The board, at three quarters: a column at a time, each one a little
    // lower than the last, so the face turns towards the court. Drawn flat
    // on it read as a white slab on a stick and nothing like a backboard.
    const BACK = 10;
    const WIDE = 28;
    const SKEW = 9;
    const TALL = 40;
    for (let i = 0; i <= WIDE; i++) {
      const x = POST + (BACK * -dir + i * dir);
      const top = 6 + Math.round((i / WIDE) * SKEW);
      const edge = i === 0 || i === WIDE;
      for (let y = top; y <= top + TALL; y++) {
        const rim = edge || y === top || y === top + TALL;
        set(x, y, rim ? P.ink : i > WIDE - 7 ? P.slabLit : i < 6 ? P.stoneDark : P.slab);
      }
      // The square painted on the face, over the rim.
      if (i > WIDE - 20 && i < WIDE - 2) {
        const sq = top + TALL - 20;
        for (let y = sq; y <= sq + 16; y++) {
          const onIt = i === WIDE - 19 || i === WIDE - 3 || y === sq || y === sq + 16;
          if (onIt) set(x, y, P.ink2);
        }
      }
    }
    // The bracket from the board's lower front corner across to the rim.
    // Struck as a short diagonal rather than a bar, or it lands behind the
    // rim and the hoop reads as hanging in the air beside the board.
    for (let t = 0; t <= 20; t++) {
      const k = t / 20;
      const x = Math.round(POST + 16 * dir + (RIM_X - 14 * dir - (POST + 16 * dir)) * k);
      const y = Math.round(56 + (RIM_Y - 56) * k);
      for (let dy = 0; dy < 3; dy++) set(x, y + dy, dy === 0 ? P.steel : P.ink2);
    }
    rimRing(RIM_X, RIM_Y, 17, 5, P.ink);
    rimRing(RIM_X, RIM_Y, 16, 4, P.rim);
    // The net: strands from the rim, gathered underneath it.
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sx = RIM_X + Math.round(Math.cos(a) * 15);
      const sy = RIM_Y + Math.round(Math.sin(a) * 4);
      for (let t = 1; t <= 16; t++) {
        const k = t / 16;
        set(Math.round(sx + (RIM_X - sx) * k * 0.8), sy + t, k > 0.6 ? P.slab : P.slabLit);
      }
    }
  };
}
slot("hoopWest", 112, 128, hoop(1));
slot("hoopEast", 112, 128, hoop(-1));
/**
 * The basketball, drawn at the size it is judged at — BALL_RADIUS in
 * lib/world/basketball.ts — so a pixel of ground is a pixel of its own
 * circumference and the roll in BasketballCourt needs nothing tuned.
 *
 * It is a rolling ball, so everything about the drawing has to survive
 * being turned. The shading is therefore **rim darkening** — a ring, the
 * one kind of shading that is the same at every angle — rather than a lit
 * patch up one side, which would swing round the ball like a torch
 * strapped to it. The one highlight is small enough to read as a mark on
 * the leather rather than as a light that ought to have stayed put.
 *
 * And the seams are what make the turning visible at all. There were four
 * lines in a cross, which is a pattern with a cross's symmetry: turn it a
 * quarter and it is the same picture, so a rolling ball read as a sliding
 * one. The two arcs break that. They were meant to be there and never
 * were — the arithmetic put them at 5 plus a bulge, which is a curve
 * outside the eight-pixel body at every row, so every pixel of both of
 * them was clipped and the cross was the whole of it.
 *
 * A seam is a great circle seen at an angle, which projects to an ellipse
 * with the ball's own radius for its long axis — so the arcs meet the
 * meridian exactly at the poles, which is where the real seams meet.
 */
slot("ball", 20, 20, (set, d) => {
  const C = 10;
  const R = 9;
  d.disc(C, C, R, P.ink);
  d.disc(C, C, R - 1, P.ballDark);
  d.disc(C, C, R - 2, P.ball);
  d.disc(C - 3, C - 3, 2, P.ballLit);
  // The equator and the meridian.
  for (let i = -(R - 1); i <= R - 1; i++) {
    set(C + i, C, P.ink2);
    set(C, C + i, P.ink2);
  }
  // The two arcs, walked round their own curve rather than down the rows.
  // Stepping by row and joining the gaps up gives three pixels on a row
  // near the poles, where a row of height is most of two pixels of width
  // — which is a cap on the top of the ball rather than a seam.
  const RX = 5;
  const RY = R - 1;
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * Math.PI;
    const x = Math.round(RX * Math.sin(t));
    const y = Math.round(RY * Math.cos(t));
    set(C + x, C + y, P.ink2);
    set(C - x, C + y, P.ink2);
  }
});
/**
 * Michael's eggs, one frame per rung of the ladder.
 *
 * The shells are the `shell` colours in lib/world/eggs.ts, which is a `.ts`
 * this script cannot import — the same arrangement the basketball's board
 * and rim numbers are under, where what is written there is a measurement
 * of what is drawn here. Change a shell in one and change it in the other,
 * or the egg in the grass and the egg in the panel stop being the same egg.
 *
 * **The frame is centred on the ground the egg lies on**, not on the egg:
 * the egg's base sits on the middle row and the rest of the frame is empty
 * under it. An egg drawn hard against the top of its frame would need the
 * scene to know where in the frame the ground was, which is a number to
 * keep in step in two places for the sake of half a kilobyte.
 *
 * **A colour is not a kind.** Six ovoids in six shades of one light read as
 * one egg printed six times, and half the point of the ladder is that the
 * rare ones are worth crossing the park for. So every kind carries a `mark`
 * as well as its three tones — freckles, hammered metal, a veined stone lit
 * from the inside, gold leaf, bands of the whole spectrum — and the mark is
 * what somebody sees in the grass from the far side of the meadow. Drawn at
 * the size that difference can be seen at, which is half as tall again as
 * they were.
 */
const EGGS = [
  {
    id: "plain",
    mark: "smooth",
    base: [232, 220, 192],
    shade: [194, 177, 145],
    lit: [246, 240, 222],
  },
  {
    id: "speckled",
    mark: "freckled",
    base: [221, 208, 174],
    shade: [138, 111, 74],
    lit: [239, 230, 204],
  },
  {
    id: "copper",
    mark: "hammered",
    base: [192, 122, 68],
    shade: [142, 83, 38],
    lit: [226, 164, 110],
  },
  {
    id: "jade",
    mark: "veined",
    base: [111, 174, 154],
    shade: [72, 121, 108],
    lit: [162, 214, 194],
  },
  {
    id: "gilded",
    mark: "leafed",
    base: [233, 180, 28],
    shade: [156, 116, 16],
    lit: [255, 234, 148],
  },
  {
    id: "ruby",
    mark: "cut",
    base: [192, 36, 64],
    shade: [115, 18, 42],
    lit: [244, 112, 140],
  },
  {
    id: "obsidian",
    mark: "glassy",
    base: [69, 62, 94],
    shade: [38, 32, 54],
    lit: [155, 138, 216],
  },
  {
    id: "rainbow",
    mark: "banded",
    base: [122, 168, 224],
    shade: [180, 94, 168],
    lit: [242, 224, 122],
  },
];

/** The bands on the one egg nobody can account for, crown to base. */
const RAINBOW = [
  [226, 106, 106],
  [232, 160, 92],
  [242, 224, 122],
  [126, 196, 128],
  [122, 168, 224],
  [172, 124, 214],
];

const EGG_W = 22;
const EGG_H = 44;
/** The row the egg's base sits on, which is the middle of the frame. */
const EGG_BASE = 22;
/** How tall the egg itself is, and how wide at its widest. */
const EGG_TALL = 22;
const EGG_WIDE = 9;

/**
 * A tone stepped toward white or black, for a marking drawn off a shell.
 *
 * Markings are derived rather than declared so that a shell recoloured in
 * lib/world/eggs.ts carries its freckles, its veins and its gold leaf with
 * it: a fourth and fifth colour per kind would be two more numbers to keep
 * in step with a file this one cannot read.
 */
function tint(colour, amount) {
  const to = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  return colour.map((v) => Math.round(v + (to - v) * k));
}

/**
 * Half the egg's width at a row, in the ovoid's own coordinates.
 *
 * An ellipse taken in at the top: `v` runs -1 at the crown to 1 at the
 * base, the ellipse gives the round part, and the taper is what makes it
 * an egg rather than a bead. A plain ellipse reads as a pebble, which is
 * the whole difficulty of drawing one this small — and too shy a taper
 * reads as a potato, which is the other way of getting it wrong. Two
 * thirds to one at the crown puts the widest part of the shell below the
 * middle, where an egg's is.
 */
function eggHalf(v) {
  const round = Math.sqrt(Math.max(0, 1 - v * v));
  return EGG_WIDE * round * (0.66 + 0.34 * ((v + 1) / 2));
}

/** A modulo that behaves at negative x, which every marking below wants. */
const wrap = (n, m) => ((n % m) + m) % m;

/**
 * What colour a pixel of the shell is.
 *
 * `u` runs -1 at the left edge of the row to 1 at the right, so a marking
 * written in it winds round the curve of the shell rather than sliding off
 * the side of it; `rim` is how many pixels in from the outline it is.
 *
 * The one rule every kind shares is the light: top left, with the shadow
 * hugging the right-hand edge and widening along the bottom. A boundary
 * drawn anywhere further in comes out as a seam, because at eight pixels
 * of half-width there is no room for a gradient to be anything else.
 */
function shellTone(egg, x, y, u, v, rim) {
  const shaded = (x > 0 && rim <= 2) || (v > 0.55 && rim <= 3);
  switch (egg.mark) {
    // Freckles: mostly single pixels with the odd pair, rather than the
    // blotches a hashed two-by-two cell gives — a freckled egg covered in
    // two-pixel patches reads as a muddy one. Settled rather than random,
    // so every speckled egg in the world is the same egg and two lying side
    // by side are not two different kinds.
    case "freckled": {
      const fleck = hash(x * 3 + 17, y * 7 + 5) < 0.15;
      const pair = hash(x + 40, Math.floor((y + 12) / 2) + 9) < 0.07;
      if ((fleck || pair) && rim >= 2) return tint(egg.shade, -0.08);
      return shaded ? egg.shade : egg.base;
    }
    // Metal, which is two highlights rather than one: a hard sheen down the
    // lit side and a band of bounced light along the shadowed edge. One
    // highlight on a curved thing reads as plastic, and it is the second
    // that says the surface is polished. The sheen is pinched at both ends
    // rather than run down as a stripe of even width, because a stripe is
    // a painted line and a sheen is the shape of what it is reflecting.
    // The mottle under both is the hammering — a coarse cell rather than
    // per-pixel noise, or it reads as dirt on an ordinary egg.
    case "hammered": {
      if (x > 0 && rim === 1 && v > -0.5 && v < 0.8) return tint(egg.base, 0.3);
      const along = (v + 0.72) / 1.3;
      if (along > 0 && along < 1) {
        const wide = 0.2 * Math.sin(along * Math.PI);
        if (u > -0.58 - wide && u < -0.34 + wide) return tint(egg.lit, 0.16);
      }
      const beaten = hash(Math.round(x / 3) + 9, Math.round(y / 3) + 4);
      return tint(shaded ? egg.shade : egg.base, beaten < 0.34 ? -0.13 : beaten > 0.8 ? 0.1 : 0);
    }
    // A stone: lit from somewhere inside it, with the veins of the quarry
    // still in it. The glow is a soft core low in the shell rather than a
    // highlight on the surface, which is what makes it read as coming
    // through the jade instead of off it.
    case "veined": {
      const seam = wrap(x * 1.35 + 3.1 * Math.sin(y * 0.5 + 1.1), 7);
      if (seam < 1.2 && rim >= 2) return tint(egg.lit, 0.1);
      const glow = Math.hypot(x * 1.05, (y - 3) * 0.8);
      if (glow < 2) return egg.lit;
      if (glow < 3.6 && !shaded) return tint(egg.base, 0.25);
      return shaded ? egg.shade : egg.base;
    }
    // Gold leaf: laid on in panels, so what says leaf rather than paint is
    // the seams between them and each panel taking the light a little
    // differently. Two sets of straight lines at opposing angles, and the
    // panel's own tone off which side of each it falls.
    //
    // The slopes are fractions rather than whole steps, which is the whole
    // of whether this reads as leaf: `x * 2 - y` taken modulo an integer
    // lands on one pixel every other row and comes out as a scatter of
    // dots, where half a step per row is a line somebody can follow.
    case "leafed": {
      const a = x - y * 0.5;
      const b = x + y * 0.45;
      if (wrap(a, 5.5) < 0.8 || wrap(b, 6.5) < 0.8) return tint(egg.shade, -0.1);
      const panel = (Math.floor(a / 5.5) + Math.floor(b / 6.5)) % 2 === 0;
      return shaded ? egg.shade : panel ? tint(egg.base, 0.16) : egg.base;
    }
    // A stone that has been cut, which is the one thing a shell is not.
    // Facets are flat, so the wedges are stepped in whole jumps of tone
    // with nothing between them — a facet that graded into its neighbour
    // is a marble, and a marble is a pebble with the lights on. Six of
    // them, because at nine pixels of half-width a seventh is a stripe.
    //
    // The table is the flat across the crown a cut stone is given to look
    // into, and it is where this reads as cut rather than merely angular:
    // without it the wedges all meet at a point and it is a beach ball
    // again, in one colour.
    case "cut": {
      const wedge = Math.floor(wrap(Math.atan2(y - 1, x * 1.5) / Math.PI + 1, 2) * 3);
      const step = [0.26, -0.04, 0.14, -0.14, 0.32, -0.1][wedge];
      if (rim >= 2 && v < -0.26 && u > -0.66 && u < 0.3) return tint(egg.lit, 0.12);
      return tint(shaded ? egg.shade : egg.base, shaded ? step * 0.4 : step);
    }
    // Volcanic glass, broken the way glass breaks: conchoidal, which is to
    // say in curved chips struck from a point off the shell rather than in
    // straight flakes. Two arcs, because one is a scratch and three is a
    // cracked egg.
    //
    // The sheen is the whole of why this is not a black ovoid. It is the
    // violet the light picks out of the break, laid across the shell as a
    // band with a bright edge — and it is drawn off `lit`, which is the
    // one tone on this kind bright enough for the beacon and the fireworks
    // to be made of.
    case "glassy": {
      const chip = Math.abs(Math.hypot((x + 7) * 0.85, (y + 3) * 0.62) - 8.2);
      const chip2 = Math.abs(Math.hypot((x - 8) * 0.85, (y - 7) * 0.62) - 9);
      if ((chip < 0.8 || chip2 < 0.8) && rim >= 1) return tint(egg.lit, -0.2);
      const sheen = u * 0.62 + v;
      if (sheen > -0.78 && sheen < -0.14 && rim >= 2)
        return tint(egg.lit, sheen < -0.46 ? 0.14 : -0.24);
      return shaded ? egg.shade : egg.base;
    }
    // The whole spectrum, wound round the shell. Diagonal rather than
    // stacked — bands straight across the middle read as a beach ball — and
    // taken in `u` rather than in x, so they follow the curve instead of
    // running off the side of it. The shading is the band's own colour
    // darkened, or the shadowed edge would be one grey stripe through six
    // coloured ones.
    case "banded": {
      const t = ((v + 1) / 2) * 0.74 + ((u + 1) / 2) * 0.26;
      const at = Math.min(RAINBOW.length - 1, Math.max(0, Math.floor(t * RAINBOW.length)));
      const band = RAINBOW[at];
      if (x < 0 && rim === 1 && v < 0.6) return tint(band, 0.28);
      return shaded ? tint(band, -0.26) : band;
    }
    default:
      return shaded ? egg.shade : egg.base;
  }
}

/**
 * A four-pointed twinkle, for the kinds with any business twinkling.
 *
 * Arms rather than a blob: a bright pixel on a bright shell is nothing, and
 * a plus sign is the smallest thing that reads as a glint. Three across and
 * no more — the arms went out to two and what came out was a white cross
 * painted over a third of the shell.
 */
function sparkle(set, cx, cy, at, inside) {
  const arms = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of arms) {
    const x = at[0] + dx;
    const y = at[1] + dy;
    if (!inside(x, y)) continue;
    const tip = dx !== 0 || dy !== 0;
    set(cx + x, cy + y, tip ? [255, 250, 228, 190] : [255, 255, 255, 255]);
  }
}

for (const egg of EGGS) {
  slot(`egg-${egg.id}`, EGG_W, EGG_H, (set, d) => {
    const cx = EGG_W / 2;
    const ry = EGG_TALL / 2;
    const cy = EGG_BASE - ry;
    /** Whether a point is in the shell with the outline clear of it. */
    const inside = (x, y) => Math.abs(y) < ry && Math.abs(x) < Math.round(eggHalf(y / ry));
    // The shadow it casts on whatever it is lying on, baked in: an egg does
    // not move, so unlike the ball's there is nothing for the scene to keep
    // in step. Wider than the egg, or it is hidden behind it.
    // Two rows rather than an ellipse: a flat ellipse comes to a point, and
    // at this height its last row is the one pixel at the middle — which
    // reads as a spike growing out of the bottom of the egg.
    d.rect(cx - 7, EGG_BASE - 1, cx + 8, EGG_BASE + 1, P.shadow);
    d.rect(cx - 4, EGG_BASE + 1, cx + 5, EGG_BASE + 2, P.shadow);
    /** What the shell is at a point, before the gloss goes over it. */
    const tone = (x, y) => {
      const half = Math.round(eggHalf(y / ry));
      return shellTone(egg, x, y, x / half, y / ry, half - Math.abs(x));
    };
    for (let y = -ry; y <= ry; y++) {
      const half = Math.round(eggHalf(y / ry));
      if (half < 1) continue;
      for (let x = -half; x <= half; x++) {
        const row = cy + y;
        if (Math.abs(x) >= half) set(cx + x, row, P.ink);
        else set(cx + x, row, [...tone(x, y), 255]);
      }
    }
    // The gloss, up on the narrow end where the light would catch it.
    //
    // It **lightens what is underneath** rather than being painted on in
    // the shell's own pale tone, which is the difference between a shine
    // and a hole: a flat patch of cream over the rainbow's bands wiped out
    // three of the six, and over the gold leaf it read as a spill. Clipped
    // to the body rather than trusted to fit, the crown being the narrowest
    // part of the egg.
    for (let y = -8; y <= -2; y++)
      for (let x = -5; x <= -1; x++) {
        if (!inside(x, y)) continue;
        const r = Math.hypot((x + 3) / 2.1, (y + 5) / 3.1);
        if (r > 1) continue;
        set(cx + x, cy + y, [...tint(tone(x, y), r > 0.55 ? 0.3 : 0.62), 255]);
      }
    // And a glint on the two that have earned one.
    if (egg.id === "ruby")
      for (const at of [
        [4, -2],
        [-3, 6],
      ])
        sparkle(set, cx, cy, at, inside);
    if (egg.id === "gilded")
      for (const at of [
        [3, -3],
        [-2, 5],
      ])
        sparkle(set, cx, cy, at, inside);
    if (egg.id === "rainbow")
      for (const at of [
        [4, -1],
        [-3, 4],
      ])
        sparkle(set, cx, cy, at, inside);
  });
}

/**
 * A car on the highway, seen from above and a little behind — the same
 * angle everything else out of doors is drawn at.
 *
 * Drawn once with the front at the bottom and flipped for the lane going
 * the other way, rather than drawn twice: a car going north is the same car
 * going south turned round, and two drawings of it is two chances for the
 * headlights to end up at different ends.
 *
 * Three colours, because one is a car that passes again and again and
 * three is traffic.
 */
function car(body, dark, facing) {
  const H = 88;
  // Front at the bottom in these coordinates; north flips them over.
  const fy = (y) => (facing === "south" ? y : H - y);
  const band = (y0, y1, colour, d) =>
    d.rect(6, Math.min(fy(y0), fy(y1)), 38, Math.max(fy(y0), fy(y1)), colour);
  return (set, d) => {
    d.ellipse(22, H - 3, 17, 4, P.shadow);
    // The wheels, showing either side of the body.
    for (const [a, b] of [
      [16, 30],
      [56, 70],
    ]) {
      d.rect(1, fy(b), 7, fy(a), P.ink);
      d.rect(37, fy(b), 43, fy(a), P.ink);
    }
    // The body, with its own outline: a car with no edge reads as a smudge
    // at the size it is seen from.
    d.rect(4, 4, 40, H - 4, P.ink);
    d.rect(5, 5, 39, H - 5, body);
    // The roof and the glass. The windscreen is the wide one and it is at
    // the front, which is the whole of what says which way the car is going.
    band(30, 50, dark, d);
    d.rect(9, Math.min(fy(50), fy(62)), 35, Math.max(fy(50), fy(62)), P.ink);
    d.rect(10, Math.min(fy(51), fy(61)), 34, Math.max(fy(51), fy(61)), P.glass);
    d.rect(10, Math.min(fy(51), fy(55)), 20, Math.max(fy(51), fy(55)), P.glassLit);
    d.rect(11, Math.min(fy(22), fy(30)), 33, Math.max(fy(22), fy(30)), P.ink);
    d.rect(12, Math.min(fy(23), fy(29)), 32, Math.max(fy(23), fy(29)), P.glass);
    // Lights: pale at the front, red at the back.
    for (const x of [8, 28]) {
      d.rect(x, Math.min(fy(78), fy(83)), x + 8, Math.max(fy(78), fy(83)), [240, 232, 190, 255]);
      d.rect(x, Math.min(fy(6), fy(10)), x + 8, Math.max(fy(6), fy(10)), P.red);
    }
    d.outline(4, 4, 40, H - 4);
  };
}

for (const [name, body, dark] of [
  ["red", P.red, [148, 76, 50, 255]],
  ["blue", P.blue, [58, 106, 164, 255]],
  ["pale", [214, 210, 222, 255], [176, 172, 190, 255]],
]) {
  slot(`car-${name}-north`, 44, 88, car(body, dark, "north"));
  slot(`car-${name}-south`, 44, 88, car(body, dark, "south"));
}

/**
 * The mailbox outside a customer's building, and the only prop on this sheet
 * whose whole job is to be somewhere to hang a number.
 *
 * 40 by 72, which is written down again in `lib/world/mailboxes.ts` — a
 * `.mjs` cannot import a `.ts`, so the size is in both places, the
 * arrangement the eggs' shell tones and the basketball board's measurements
 * are already under. The bubble over it is measured off that height, so the
 * two have to agree.
 *
 * Bold rather than detailed. It is looked at from the far side of a road, on
 * grass at four of the six and on paving at the others, so what it needs is a
 * silhouette that is neither: a dark barrel-topped tin on a pale post, with
 * the flag up in the desk's own warning red.
 */
slot("mailbox", 40, 72, (set, d) => {
  d.ellipse(18, 69, 12, 3, P.shadow);

  // The post. Lit down one side, which is what stops a six-pixel column
  // reading as a stick somebody drew.
  d.rect(14, 32, 22, 70, P.woodDark);
  d.rect(15, 32, 21, 70, P.wood);
  d.rect(15, 32, 17, 70, P.woodLit);
  d.outline(14, 32, 22, 70);

  // The tin: a barrel top stepped a row at a time, for the reason the
  // incident lamp's dome is — an antialiased curve is the one shape in this
  // world that would not belong to it. Each step is capped in ink across the
  // whole of what it exposes rather than at its corner pixel, or the dome
  // comes out with daylight along the top of every step in it.
  const ARCH = [7, 4, 3, 2, 1, 1, 0, 0];
  const LEFT = 3;
  const RIGHT = 31;
  const TOP = 4;
  const BASE = 36;
  const inset = (row) => ARCH[row - TOP] ?? 0;
  for (let y = TOP; y < BASE; y++) {
    const x0 = LEFT + inset(y);
    const x1 = RIGHT - inset(y);
    // The lid catches the light, the belly falls away from it.
    d.rect(x0, y, x1, y + 1, y < TOP + 3 ? P.slabLit : y > BASE - 7 ? P.steelDark : P.steel);
    const above = y === TOP ? Infinity : inset(y - 1);
    d.rect(x0, y, Math.min(LEFT + above, x1), y + 1, P.ink);
    d.rect(Math.max(RIGHT - above, x0), y, x1, y + 1, P.ink);
    set(x0, y, P.ink);
    set(x1 - 1, y, P.ink);
  }
  d.rect(LEFT, BASE - 1, RIGHT, BASE, P.ink);

  // The door at the near end, and the slot in it. Two lines, which at this
  // size is the whole difference between a mailbox and a cistern.
  d.rect(LEFT + 2, TOP + 7, LEFT + 3, BASE - 1, P.ink);
  d.rect(LEFT + 7, TOP + 12, RIGHT - 5, TOP + 14, P.ink2);

  // The flag, up. Red because that is what a flag up means, and it is the one
  // warm thing on the prop — from the far side of a road it is what says the
  // box is a box rather than a bin.
  d.rect(RIGHT, TOP + 2, RIGHT + 2, BASE - 4, P.ink);
  d.rect(RIGHT + 1, TOP - 1, RIGHT + 8, TOP + 8, P.ink);
  d.rect(RIGHT + 1, TOP, RIGHT + 7, TOP + 7, P.red);
});

// ── Volcano Island ──
//
// The island across the water from the second dock, and the cave under its
// volcano — see `lib/world/volcano.ts`. Its own ramps rather than the town's,
// because nothing out there is the town's: black sand and basalt in place of
// grass and slabs, lava for water, and in the cave a purple-brown rock lit by
// cyan crystal. Still three tones and an ink outline to everything, so the
// people walking about on it look like they belong on it.
const V = {
  ash: [64, 57, 61, 255],
  ashDark: [50, 45, 50, 255],
  ashLit: [84, 76, 78, 255],
  grain: [110, 99, 96, 255],
  obsidian: [30, 28, 38, 255],
  basalt: [70, 62, 70, 255],
  basaltLit: [98, 88, 94, 255],
  basaltDark: [46, 41, 49, 255],
  basaltDeep: [30, 27, 34, 255],
  lavaDeep: [166, 40, 24, 255],
  lava: [222, 86, 30, 255],
  lavaLit: [250, 160, 48, 255],
  lavaHot: [255, 224, 122, 255],
  rock: [54, 47, 60, 255],
  rockLit: [74, 66, 80, 255],
  rockDark: [38, 34, 44, 255],
  rockDeep: [24, 22, 30, 255],
  face: [88, 78, 92, 255],
  faceLit: [108, 97, 110, 255],
  cave: [80, 72, 82, 255],
  caveDark: [64, 58, 68, 255],
  caveLit: [98, 90, 100, 255],
  crystal: [110, 214, 226, 255],
  crystalLit: [214, 252, 255, 255],
  crystalDark: [52, 128, 164, 255],
  gel: [120, 208, 92, 255],
  gelLit: [192, 244, 152, 255],
  gelDark: [72, 148, 62, 255],
  gelDeep: [44, 102, 46, 255],
};

/** A thick stroke from one point to another, a disc at every step: branches and streaks. */
function stroke(set, x0, y0, x1, y1, r, c) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) set(x + dx, y + dy, c);
  }
}

/**
 * A lump of black cinder on the sand, pitted, with a crack still glowing in
 * it. Two lumps rather than one oval, because a single ellipse on the ground
 * is a saucer; the smaller one leaning on the larger is a rock.
 */
slot("cinder", 64, 48, (set, d) => {
  d.ellipse(32, 44, 27, 5, P.shadow);
  d.ellipse(26, 31, 21, 13, P.ink);
  d.ellipse(44, 35, 14, 9, P.ink);
  d.ellipse(26, 31, 19, 11, V.basaltDark);
  d.ellipse(44, 35, 12, 7, V.basaltDark);
  d.ellipse(23, 28, 14, 8, V.basalt);
  d.ellipse(42, 33, 8, 4, V.basalt);
  d.ellipse(19, 24, 7, 3, V.basaltLit);
  d.ellipse(39, 31, 3, 2, V.basaltLit);
  for (const [px, py] of [
    [16, 30],
    [30, 24],
    [34, 34],
    [24, 37],
    [12, 27],
    [48, 36],
  ]) {
    set(px, py, V.basaltDeep);
    set(px + 1, py, V.basaltDeep);
  }
  // The crack: a short run, its hot middle a shade brighter.
  for (let i = 0; i < 8; i++) set(26 + i, 31 + (i >> 2), i % 3 === 1 ? V.lavaHot : V.lavaLit);
  for (let i = 0; i < 4; i++) set(30 + (i >> 1), 33 + i, V.lava);
});

/**
 * A tree the lava killed: a trunk and a few bare branches, nothing on them.
 *
 * Bleached rather than charred. Burnt black is what happened to it, and on
 * black sand it is also a tree nobody can see — the grey of old driftwood
 * is what a dead tree on a beach actually looks like, and it carries.
 */
const DEADWOOD = [150, 138, 128, 255];
const DEADWOOD_LIT = [184, 172, 160, 255];
const DEADWOOD_DARK = [104, 94, 90, 255];
slot("snag", 64, 96, (set, d) => {
  d.ellipse(32, 92, 16, 4, P.shadow);
  const limbs = [
    [32, 90, 32, 36, 4],
    [32, 60, 16, 38, 2],
    [32, 50, 50, 26, 2],
    [18, 40, 12, 22, 1],
    [46, 30, 54, 16, 1],
    [32, 38, 26, 14, 2],
  ];
  // Outlines first, so every limb's ink sits under every other's fill.
  for (const [x0, y0, x1, y1, r] of limbs) stroke(set, x0, y0, x1, y1, r + 1, P.ink);
  for (const [x0, y0, x1, y1, r] of limbs) stroke(set, x0, y0, x1, y1, r, DEADWOOD);
  // Light down the left of the trunk, shade down the right, and the foot
  // blackened where the flow went past it.
  stroke(set, 30, 88, 30, 40, 1, DEADWOOD_LIT);
  stroke(set, 35, 88, 35, 40, 0, DEADWOOD_DARK);
  for (let y = 78; y < 91; y++) d.rect(28, y, 37, y + 1, y > 84 ? V.basaltDark : V.basalt);
  set(33, 82, V.lavaLit);
  set(34, 83, V.lava);
});

/**
 * A stalagmite, with a smaller one beside it: cave rock, lit from the left,
 * lumpy where it grew in fits and starts. A clean cone was the first go, and
 * a clean cone on a cave floor is a traffic cone.
 */
slot("stalagmite", 48, 72, (set, d) => {
  d.ellipse(24, 68, 18, 4, P.shadow);
  const spire = (cx, top, foot, base) => {
    for (let y = top; y < foot; y++) {
      const s = (y - top) / (foot - top);
      // Swelling towards the foot, with a knuckle here and there.
      const half = Math.max(1, Math.round(base * s ** 0.8 + Math.sin(s * 11) * 1.2));
      d.rect(cx - half - 1, y, cx + half + 1, y + 1, P.ink);
      for (let x = cx - half; x < cx + half; x++) {
        const t = (x - (cx - half)) / (half * 2);
        set(x, y, t < 0.32 ? V.faceLit : t < 0.72 ? V.face : V.rockLit);
      }
    }
    d.rect(cx - 1, top - 1, cx + 1, top, P.ink);
  };
  spire(33, 34, 68, 8);
  spire(20, 6, 68, 13);
  // A drip of damp down the lit side of the big one.
  d.rect(15, 26, 16, 50, V.caveLit);
  set(15, 51, V.caveLit);
});

/** Crystal growing out of the cave floor: three cyan prisms, glowing. */
slot("crystal", 48, 56, (set, d) => {
  d.ellipse(24, 50, 22, 8, [110, 214, 226, 50]);
  d.ellipse(24, 52, 16, 4, P.shadow);
  const prism = (cx, top, foot, half) => {
    for (let y = top; y < foot; y++) {
      // Pointed: the tip narrows over its first few rows.
      const w = Math.min(half, Math.round(((y - top) / 5) * half));
      if (w <= 0) continue;
      d.rect(cx - w - 1, y, cx + w + 1, y + 1, P.ink);
      d.rect(cx - w, y, cx, y + 1, V.crystalLit);
      d.rect(cx, y, cx + w, y + 1, V.crystal);
      set(cx + w - 1, y, V.crystalDark);
    }
    d.rect(cx - half - 1, foot, cx + half + 1, foot + 1, P.ink);
  };
  prism(15, 22, 50, 5);
  prism(34, 18, 50, 5);
  prism(24, 6, 51, 7);
});

/**
 * The blob: a dome of green jelly with a flat bottom, a shine on its top and
 * two big eyes. Hurt, the eyes screw shut and the mouth goes wide.
 *
 * No shadow of its own: the scene draws one on the floor under it, which is
 * what says how high it is — the same arrangement as the basketball's.
 */
function blobFrame(hurt) {
  return (set, d) => {
    const CX = 22;
    const TOP = 4;
    const FOOT = 35;
    const RX = 20;
    const MID = 20;
    const half = (y) =>
      y < MID
        ? Math.round(RX * Math.sqrt(Math.max(0, 1 - ((MID - y) / (MID - TOP)) ** 2)))
        : y > FOOT - 4
          ? RX - (y - (FOOT - 4))
          : RX;
    for (let y = TOP; y <= FOOT; y++) {
      const w = half(y);
      if (w <= 0) continue;
      d.rect(CX - w - 1, y, CX + w + 1, y + 1, P.ink);
    }
    d.rect(CX - 6, TOP - 1, CX + 6, TOP, P.ink);
    for (let y = TOP + 1; y < FOOT; y++) {
      const w = half(y) - 1;
      if (w <= 0) continue;
      d.rect(CX - w, y, CX + w, y + 1, V.gel);
      // Darker toward the bottom and the right, where the light does not reach.
      if (y > FOOT - 8) d.rect(CX - w, y, CX + w, y + 1, V.gelDark);
      d.rect(CX + w - 3, y, CX + w, y + 1, V.gelDark);
    }
    d.rect(CX - 16, FOOT - 1, CX + 16, FOOT, V.gelDeep);
    // The shine.
    d.ellipse(CX - 8, TOP + 8, 5, 3, V.gelLit);
    set(CX - 11, TOP + 7, [255, 255, 255, 255]);
    set(CX - 10, TOP + 7, [255, 255, 255, 255]);
    if (!hurt) {
      for (const ex of [CX - 6, CX + 5]) {
        d.ellipse(ex, 19, 3, 4, [255, 255, 255, 255]);
        d.rect(ex, 18, ex + 2, 22, P.ink);
        set(ex, 18, [255, 255, 255, 255]);
      }
      d.rect(CX - 2, 26, CX + 3, 27, V.gelDeep);
    } else {
      // Screwed shut: a > and a <.
      for (let i = 0; i < 3; i++) {
        set(CX - 8 + i, 17 + i, P.ink);
        set(CX - 8 + i, 21 - i, P.ink);
        set(CX + 7 - i, 17 + i, P.ink);
        set(CX + 7 - i, 21 - i, P.ink);
      }
      d.ellipse(CX, 27, 3, 2, V.gelDeep);
      d.rect(CX - 1, 27, CX + 2, 28, P.ink);
    }
  };
}
slot("blob", 44, 36, blobFrame(false));
slot("blob-hurt", 44, 36, blobFrame(true));

frames.fountain.animateWith = "fountain2";

/** Open water: two frames, the glints shifting between them so it moves. */
function water(frame) {
  const c = canvas(48, 48);
  c.rect(0, 0, 48, 48, P.waterDark);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) if (hash(x + 7, y + 3) < 0.05) c.set(x, y, [66, 140, 214, 255]);
  // glints: short dashes, each tile the same so the sea tiles seamlessly
  for (const [gx, gy, len, lit] of [
    [4, 6, 12, false],
    [28, 10, 10, true],
    [14, 22, 14, true],
    [36, 26, 8, false],
    [6, 38, 10, true],
    [26, 42, 12, false],
  ]) {
    const x0 = (gx + frame * 4) % 48;
    for (let i = 0; i < len; i++) c.set((x0 + i) % 48, gy, lit ? P.waterLit : P.water);
    c.set((x0 + len) % 48, gy + 1, P.water);
  }
  return c;
}
/** Foam along the top edge, laid over a water tile where it meets land; turned for the other sides. */
function foam() {
  const c = canvas(48, 48);
  for (let x = 0; x < 48; x++) {
    c.set(x, 0, [236, 244, 248, 230]);
    c.set(x, 1, hash(x, 1) < 0.7 ? [236, 244, 248, 200] : [204, 230, 236, 160]);
    if (hash(x, 2) < 0.45) c.set(x, 2, [204, 230, 236, 150]);
    if (hash(x, 3) < 0.2) c.set(x, 3, [204, 230, 236, 110]);
  }
  return c;
}
/** Dock planking: boards across the walk, a darker gap between each. */
function dock() {
  const c = canvas(48, 48);
  c.rect(0, 0, 48, 48, P.woodDark);
  for (let y = 0; y < 48; y += 12) {
    c.rect(0, y + 1, 48, y + 11, P.wood);
    c.rect(0, y + 1, 48, y + 2, P.woodLit);
    for (let x = 0; x < 48; x++) if (hash(x, y) < 0.08) c.set(x, y + 4 + (x % 5), P.woodDark);
  }
  // the beams along both edges
  c.rect(0, 0, 3, 48, P.woodDark);
  c.rect(45, 0, 48, 48, P.woodDark);
  c.rect(0, 0, 1, 48, P.ink2);
  c.rect(47, 0, 48, 48, P.ink2);
  return c;
}
/**
 * The ferry, moored bow-up beside the dock with a gangway out to the left:
 * a white hull with a teal band, a cabin amidships, a stack, a life ring,
 * and a name board along the near side left blank for the scene.
 */
function boat() {
  const BW = 192,
    BH = 168;
  const c = canvas(BW, BH);
  const white = [235, 228, 242, 255];
  const whiteDark = [204, 194, 216, 255];
  c.ellipse(104, 156, 66, 8, P.shadow);
  // the hull: pointed at the bow, square at the stern
  for (let y = 12; y < 44; y++) {
    const half = Math.round(((y - 12) / 32) * 44) + 4;
    c.rect(104 - half, y, 104 + half, y + 1, P.ink);
  }
  c.rect(56, 44, 152, 148, P.ink);
  for (let y = 14; y < 44; y++) {
    const half = Math.round(((y - 14) / 30) * 44) + 3;
    c.rect(104 - half, y, 104 + half, y + 1, white);
  }
  c.rect(58, 44, 150, 146, white);
  c.rect(58, 128, 150, 146, whiteDark);
  c.rect(58, 108, 150, 116, P.teal);
  c.rect(58, 116, 150, 118, P.tealDark);
  // the deck, planked
  c.rect(66, 34, 142, 104, P.woodLit);
  for (let y = 36; y < 104; y += 8) c.rect(66, y, 142, y + 1, P.wood);
  c.outline(65, 33, 143, 105, P.wood);
  // the bow deck narrows with the hull
  for (let y = 22; y < 34; y++) {
    const half = Math.round(((y - 14) / 30) * 44) - 6;
    if (half > 2) c.rect(104 - half, y, 104 + half, y + 1, P.woodLit);
  }
  // the cabin, with windows all round and a teal roof
  c.rect(80, 50, 128, 96, P.ink);
  c.rect(82, 52, 126, 94, whiteDark);
  c.rect(82, 52, 126, 60, P.teal);
  c.rect(82, 52, 126, 54, [66, 150, 144, 255]);
  for (const wx of [86, 100, 114]) {
    c.rect(wx, 64, wx + 10, 76, P.ink);
    c.rect(wx + 1, 65, wx + 9, 75, P.glass);
    c.rect(wx + 1, 65, wx + 4, 69, P.glassLit);
  }
  c.rect(98, 80, 110, 94, P.ink);
  c.rect(100, 82, 108, 94, [64, 52, 46, 255]);
  // the stack, with a puff of smoke
  c.rect(114, 32, 124, 52, P.ink);
  c.rect(116, 34, 122, 50, P.red);
  c.rect(116, 34, 122, 37, P.ink2);
  c.disc(119, 26, 5, [216, 208, 224, 200]);
  c.disc(124, 19, 4, [216, 208, 224, 150]);
  // the life ring on the stern rail
  c.ring(140, 122, 7, P.ink);
  c.ring(140, 122, 6, P.red);
  c.ring(140, 122, 4, white);
  c.set(140, 116, white);
  c.set(140, 128, white);
  c.set(134, 122, white);
  c.set(146, 122, white);
  // the gangway to the dock on the left, with a rope rail
  c.rect(4, 100, 60, 108, P.wood);
  c.rect(4, 100, 60, 102, P.woodLit);
  c.outline(3, 99, 61, 109);
  for (let x = 6; x < 58; x += 6) c.rect(x, 104, x + 1, 106, P.woodDark);
  c.rect(6, 92, 58, 93, P.yellowDark);
  for (const px of [8, 32, 56]) c.rect(px - 1, 90, px + 1, 100, P.ink2);
  // fenders along the dock side
  for (const fy of [56, 76, 96]) {
    c.rect(52, fy, 58, fy + 10, P.ink);
    c.rect(53, fy + 1, 57, fy + 9, P.ink2);
  }
  // the name board along the near side: left blank for the scene
  c.rect(64, 128, 144, 144, P.yellow);
  c.rect(64, 128, 144, 131, P.slabLit);
  c.outline(63, 127, 145, 145);
  // waterline ripple
  for (let x = 40; x < 170; x += 9) c.rect(x, 150, x + 5, 151, P.waterLit);
  return c;
}
/**
 * Apeiron Media's house on the island: whitewashed walls on a stone footing,
 * a thatched roof with a chimney, green door and trim, flower boxes under
 * the windows, a shamrock over the door and the tricolour on a pole.
 */
function siteIrish() {
  return site((c) => {
    const white = [246, 242, 236, 255];
    const whiteDark = [214, 206, 200, 255];
    const thatch = [204, 170, 96, 255];
    const thatchDark = [166, 132, 70, 255];
    const thatchLit = [226, 198, 128, 255];
    const green = [46, 139, 87, 255];
    const greenDark = [30, 100, 62, 255];
    const orange = [255, 136, 62, 255];
    // stone footing
    c.rect(14, 104, 130, 128, P.stone);
    for (let y = 106; y < 128; y += 8)
      for (let x = 14 + ((y / 8) % 2) * 8; x < 130; x += 16) {
        c.rect(x + 1, y, x + 15, y + 6, P.stoneDark);
        c.rect(x + 1, y, x + 15, y + 1, [190, 176, 175, 255]);
      }
    // whitewashed wall
    c.rect(14, 46, 130, 106, white);
    for (let y = 50; y < 104; y += 9) c.rect(14, y, 130, y + 1, whiteDark);
    // green trim under the eaves
    c.rect(14, 46, 130, 50, green);
    c.rect(14, 50, 130, 51, greenDark);
    // thatched roof, overhanging, with the strands drawn
    for (let i = 0; i < 26; i++) {
      const x0 = 10 + Math.round(i * 0.35);
      const x1 = 134 - Math.round(i * 0.35);
      c.rect(x0, 20 + i, x1, 21 + i, i % 4 === 0 ? thatchDark : i % 4 === 2 ? thatchLit : thatch);
    }
    for (let x = 12; x < 132; x += 5)
      for (let y = 22; y < 44; y += 7)
        c.rect(x + ((y / 7) % 2), y, x + 1 + ((y / 7) % 2), y + 4, thatchDark);
    c.rect(8, 44, 136, 48, thatchDark);
    c.outline(8, 44, 136, 49);
    // the ridge, tied down
    c.rect(18, 18, 126, 21, thatchDark);
    c.outline(17, 17, 127, 22);
    // chimney with smoke
    c.rect(108, 4, 120, 26, P.stone);
    c.rect(108, 4, 120, 7, P.stoneDark);
    c.outline(107, 3, 121, 27);
    c.disc(116, 0, 3, [216, 208, 224, 160]);
    // sign band across the wall, blank for the scene
    c.rect(26, 56, 118, 72, P.yellow);
    c.rect(26, 56, 118, 59, P.slabLit);
    c.outline(25, 55, 119, 73);
    // windows with green frames and flower boxes
    for (const wx of [24, 98]) {
      c.rect(wx, 80, wx + 22, 102, greenDark);
      c.rect(wx + 2, 82, wx + 20, 100, P.glass);
      c.rect(wx + 2, 82, wx + 8, 88, P.glassLit);
      c.rect(wx + 10, 82, wx + 12, 100, greenDark);
      c.rect(wx + 2, 90, wx + 20, 92, greenDark);
      c.rect(wx - 2, 102, wx + 24, 108, P.woodDark);
      c.rect(wx - 2, 102, wx + 24, 104, P.wood);
      c.outline(wx - 3, 101, wx + 25, 109);
      for (const [fx, col] of [
        [wx + 1, P.red],
        [wx + 7, P.yellow],
        [wx + 13, orange],
        [wx + 19, P.red],
      ]) {
        c.rect(fx, 98, fx + 3, 101, col);
        c.rect(fx - 1, 100, fx + 4, 102, greenDark);
      }
    }
    // the green door, arched, with a brass knob and a fanlight
    c.disc(72, 92, 14, P.ink);
    c.rect(58, 92, 86, 128, P.ink);
    c.disc(72, 92, 12, green);
    c.rect(60, 92, 84, 128, green);
    c.rect(60, 92, 84, 94, greenDark);
    c.rect(71, 92, 73, 128, greenDark);
    c.disc(72, 88, 8, P.ink);
    c.disc(72, 88, 6, P.glass);
    c.rect(66, 88, 78, 90, P.ink);
    c.rect(66, 96, 70, 112, greenDark);
    c.rect(74, 96, 78, 112, greenDark);
    c.rect(66, 116, 70, 126, greenDark);
    c.rect(74, 116, 78, 126, greenDark);
    c.set(76, 110, P.yellow);
    c.set(77, 110, P.yellow);
    c.rect(54, 128, 90, 134, P.slab);
    c.rect(54, 128, 90, 130, P.slabLit);
    c.outline(54, 127, 90, 135);
    // shamrock over the door
    for (const [sx, sy] of [
      [68, 78],
      [76, 78],
      [72, 74],
    ]) {
      c.disc(sx, sy, 3, greenDark);
      c.disc(sx, sy, 2, green);
    }
    c.rect(71, 78, 73, 84, greenDark);
    // the tricolour on a pole at the corner
    c.rect(136, 4, 139, 60, P.ink2);
    c.rect(139, 6, 143, 18, green);
    c.rect(143, 6, 144, 18, white);
    c.rect(133, 6, 136, 18, orange);
    c.rect(133, 6, 139, 18, [0, 0, 0, 0]);
    c.rect(139, 6, 144, 10, green);
    c.rect(139, 10, 144, 14, white);
    c.rect(139, 14, 144, 18, orange);
    c.outline(138, 5, 144, 19);
    c.outline(14, 46, 130, 129);
  });
}

// ── Buildings ──
const W = 288,
  H = 288;
function castle() {
  const c = canvas(W, H);
  c.rect(0, 252, W, 268, P.shadow);
  // keep
  c.rect(48, 96, 240, 258, P.stoneDark);
  for (let y = 100; y < 258; y += 12)
    for (let x = 48 + ((y / 12) % 2) * 12; x < 240; x += 24) {
      c.rect(x + 1, y, x + 22, y + 10, [176, 177, 196, 255]);
      c.rect(x + 1, y, x + 22, y + 2, P.slabLit);
    }
  // towers
  for (const tx of [12, 228]) {
    c.rect(tx, 60, tx + 48, 258, P.stoneDark);
    for (let y = 64; y < 258; y += 12)
      for (let x = tx + ((y / 12) % 2) * 6; x < tx + 44; x += 24) {
        c.rect(x + 1, y, x + 20, y + 10, [176, 177, 196, 255]);
        c.rect(x + 1, y, x + 20, y + 2, P.slabLit);
      }
    c.rect(tx - 4, 48, tx + 52, 60, P.tealDark);
    c.rect(tx + 2, 30, tx + 46, 48, P.teal);
    c.rect(tx + 6, 30, tx + 20, 48, [66, 150, 144, 255]);
    c.outline(tx - 4, 48, tx + 52, 60);
    c.outline(tx + 2, 30, tx + 46, 49);
    c.outline(tx, 58, tx + 48, 258);
    // banner
    c.rect(tx + 18, 8, tx + 30, 30, P.yellow);
    c.rect(tx + 18, 8, tx + 30, 12, P.red);
    c.outline(tx + 17, 7, tx + 31, 31);
    c.rect(tx + 23, 2, tx + 25, 8, P.ink);
  }
  // battlements + roof
  for (let x = 48; x < 240; x += 24) {
    c.rect(x, 82, x + 12, 96, P.stoneDark);
    c.rect(x + 1, 82, x + 11, 85, P.slabLit);
    c.outline(x, 82, x + 12, 97);
  }
  c.rect(60, 70, 228, 82, P.teal);
  c.rect(60, 70, 228, 73, [66, 150, 144, 255]);
  c.outline(60, 70, 228, 83);
  // windows with sills
  for (const wx of [84, 132, 180]) {
    c.rect(wx - 2, 158, wx + 20, 162, P.slabLit);
    c.outline(wx - 2, 158, wx + 20, 163);
    c.rect(wx, 126, wx + 18, 158, P.ink);
    c.rect(wx + 3, 129, wx + 15, 150, P.glass);
    c.rect(wx + 3, 129, wx + 8, 136, P.glassLit);
  }
  for (const tx of [22, 238]) {
    c.rect(tx, 90, tx + 14, 116, P.ink);
    c.rect(tx + 3, 93, tx + 11, 108, P.glass);
    c.rect(tx + 3, 93, tx + 6, 98, P.glassLit);
  }
  // arched door with stone ring and steps
  const dx = (W - 48) / 2;
  c.disc(dx + 24, 206, 30, P.ink);
  c.disc(dx + 24, 206, 28, P.stone);
  c.rect(dx - 6, 206, dx + 54, 258, P.stone);
  c.outline(dx - 6, 206, dx + 54, 258);
  c.disc(dx + 24, 206, 22, P.ink);
  c.rect(dx + 2, 206, dx + 46, 258, P.ink);
  c.disc(dx + 24, 206, 20, [64, 52, 46, 255]);
  c.rect(dx + 4, 206, dx + 44, 258, [64, 52, 46, 255]);
  c.rect(dx + 22, 190, dx + 26, 258, [42, 34, 30, 255]);
  c.rect(dx - 12, 258, dx + 60, 266, P.slab);
  c.rect(dx - 12, 258, dx + 60, 260, P.slabLit);
  c.outline(dx - 12, 257, dx + 60, 267);
  // sign
  c.rect(dx - 40, 166, dx + 88, 184, P.yellow);
  c.rect(dx - 40, 166, dx + 88, 169, P.slabLit);
  c.outline(dx - 40, 165, dx + 88, 185);
  c.outline(48, 82, 240, 259);
  return c;
}
function office() {
  const c = canvas(W, H);
  c.rect(0, 252, W, 268, P.shadow);
  const wall = [94, 127, 163, 255],
    wallDark = [70, 99, 131, 255];
  c.rect(24, 48, 264, 258, wall);
  c.rect(24, 48, 264, 60, P.ink2);
  c.rect(24, 60, 264, 64, wallDark);
  // rooftop unit
  c.rect(200, 30, 240, 48, P.steelDark);
  c.rect(202, 32, 238, 40, P.steel);
  c.outline(200, 30, 240, 49);
  c.rect(206, 24, 212, 30, P.ink2);
  // ground floor band, darker
  c.rect(24, 208, 264, 258, wallDark);
  // window grid with sills
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 5; col++) {
      const wx = 40 + col * 44,
        wy = 74 + row * 34;
      c.rect(wx, wy, wx + 32, wy + 24, P.ink);
      c.rect(wx + 2, wy + 2, wx + 30, wy + 22, P.glass);
      c.rect(wx + 2, wy + 2, wx + 12, wy + 9, P.glassLit);
      c.rect(wx - 2, wy + 24, wx + 34, wy + 27, P.slabLit);
      c.outline(wx - 2, wy + 24, wx + 34, wy + 28);
    }
  // awning over the door: yellow and white stripes
  for (let x = 84; x < 204; x += 12) {
    c.rect(x, 200, x + 6, 216, P.yellow);
    c.rect(x + 6, 200, x + 12, 216, P.slabLit);
  }
  c.rect(84, 196, 204, 200, P.yellowDark);
  c.outline(84, 196, 204, 217);
  // sign band
  c.rect(96, 178, 192, 194, P.yellow);
  c.rect(96, 178, 192, 181, P.slabLit);
  c.outline(96, 177, 192, 195);
  // glass double door
  const dx = (W - 72) / 2;
  c.rect(dx - 4, 214, dx + 76, 258, P.ink);
  c.rect(dx, 218, dx + 72, 258, [159, 211, 234, 255]);
  c.rect(dx + 34, 218, dx + 38, 258, P.ink);
  c.rect(dx + 4, 222, dx + 20, 236, P.glassLit);
  c.rect(dx + 42, 222, dx + 58, 236, P.glassLit);
  c.rect(dx - 8, 258, dx + 80, 266, P.slab);
  c.rect(dx - 8, 258, dx + 80, 260, P.slabLit);
  c.outline(dx - 8, 257, dx + 80, 267);
  c.outline(24, 48, 264, 259);
  return c;
}

// ── More buildings ──
const wood = P.wood;
const woodLit = P.woodLit;
const woodDark = P.woodDark;

/** A timber-yard store: a broad shed with a pitched roof and lumber stacked beside it. */
function supply() {
  const c = canvas(W, H);
  c.rect(0, 252, W, 268, P.shadow);
  // walls: horizontal boards
  c.rect(24, 120, 264, 258, wood);
  for (let y = 124; y < 258; y += 8) c.rect(24, y, 264, y + 1, woodDark);
  c.rect(24, 120, 264, 124, woodLit);
  // pitched roof, corrugated
  for (let i = 0; i < 60; i++) {
    const x0 = 12 + i,
      x1 = 276 - i;
    c.rect(x0, 120 - i, x1, 121 - i, i % 6 < 3 ? P.steel : P.steelDark);
  }
  c.rect(12, 118, 276, 124, P.ink);
  for (let i = 0; i < 60; i++) {
    c.set(12 + i, 120 - i, P.ink);
    c.set(275 - i, 120 - i, P.ink);
  }
  c.rect(72, 60, 216, 62, P.ink);
  // big double door, open onto a dark interior, with lumber inside
  c.rect(104, 172, 184, 258, P.ink);
  c.rect(108, 176, 180, 258, [64, 52, 46, 255]);
  for (let y = 214; y < 258; y += 10) c.rect(112, y, 176, y + 6, woodLit);
  c.rect(142, 176, 146, 258, P.ink);
  // windows either side
  for (const wx of [40, 220]) {
    c.rect(wx, 150, wx + 28, 176, P.ink);
    c.rect(wx + 3, 153, wx + 25, 173, P.glass);
    c.rect(wx + 3, 153, wx + 10, 160, P.glassLit);
    c.rect(wx - 2, 176, wx + 30, 179, P.slabLit);
  }
  // sign board on the roof face
  c.rect(84, 76, 204, 108, P.yellow);
  c.rect(84, 76, 204, 79, P.slabLit);
  c.outline(83, 75, 205, 109);
  // lumber stack beside the shed
  for (let row = 0; row < 4; row++)
    for (let k = 0; k < 3; k++) {
      const x = 2 + k * 8 + (row % 2) * 4,
        y = 226 - row * 8;
      c.rect(x, y, x + 8, y + 8, wood);
      c.rect(x + 1, y + 1, x + 7, y + 3, woodLit);
      c.outline(x, y, x + 8, y + 8);
    }
  c.rect(24 - 2, 258, 264 + 2, 266, P.slab);
  c.rect(22, 258, 266, 260, P.slabLit);
  c.outline(22, 257, 266, 267);
  c.outline(24, 120, 264, 259);
  return c;
}

/** A concrete-block builder's merchant: heavy, square, with a red awning and stacked blocks. */
function blocks() {
  const c = canvas(W, H);
  c.rect(0, 252, W, 268, P.shadow);
  c.rect(24, 72, 264, 258, P.stoneDark);
  for (let y = 76; y < 258; y += 10)
    for (let x = 24 + ((y / 10) % 2) * 10; x < 264; x += 20) {
      c.rect(x + 1, y, x + 19, y + 8, P.stone);
      c.rect(x + 1, y, x + 19, y + 2, [190, 176, 175, 255]);
    }
  c.rect(24, 60, 264, 72, P.ink2);
  c.rect(30, 52, 258, 60, P.steelDark);
  c.outline(30, 52, 258, 61);
  // awning over the door and window band
  for (let x = 60; x < 228; x += 12) {
    c.rect(x, 190, x + 6, 208, P.red);
    c.rect(x + 6, 190, x + 12, 208, P.slabLit);
  }
  c.rect(60, 186, 228, 190, [140, 70, 50, 255]);
  c.outline(60, 186, 228, 209);
  // wide window band
  c.rect(40, 100, 248, 150, P.ink);
  c.rect(44, 104, 244, 146, P.glass);
  c.rect(44, 104, 100, 118, P.glassLit);
  for (const wx of [110, 176]) c.rect(wx, 104, wx + 4, 146, P.ink);
  // sign
  c.rect(80, 156, 208, 182, P.yellow);
  c.rect(80, 156, 208, 159, P.slabLit);
  c.outline(79, 155, 209, 183);
  // door
  const dx = (W - 72) / 2;
  c.rect(dx - 4, 210, dx + 76, 258, P.ink);
  c.rect(dx, 214, dx + 72, 258, [159, 211, 234, 255]);
  c.rect(dx + 34, 214, dx + 38, 258, P.ink);
  // stacked blocks by the door
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 2; k++) {
      const x = 4 + k * 12 + (row % 2) * 6,
        y = 240 - row * 10;
      c.rect(x, y, x + 12, y + 10, P.stone);
      c.rect(x + 1, y + 1, x + 11, y + 3, [190, 176, 175, 255]);
      c.outline(x, y, x + 12, y + 10);
    }
  c.rect(dx - 8, 258, dx + 80, 266, P.slab);
  c.rect(dx - 8, 258, dx + 80, 260, P.slabLit);
  c.outline(dx - 8, 257, dx + 80, 267);
  c.outline(24, 60, 264, 259);
  return c;
}

/**
 * A shopfront on the west road: fascia, sign board, awning, two windows and
 * a door in the middle, with the business's stock stacked outside it.
 *
 * **One drawing with four sets of numbers, rather than four drawings.** The
 * four newer stores are the same kind of building — a shop you walk into
 * with a warehouse out the back — and what tells them apart on the map is
 * their colour, what their walls are made of and what is stacked at the
 * door. Drawn four times over they would have drifted apart in the parts
 * that are supposed to be the same, and the sign band is the one that would
 * have hurt: it is where the scene letters the name, so one of them landing
 * six pixels lower is a name sitting off its own board.
 *
 * Which is also why there is one `SIGN_Y` for all four in `WorldScene`: the
 * board is at the same height on every one of them because it is the same
 * line of this function.
 */
function shop({ wall, wallDark, wallLit, roof, roofDark, awning, cladding, yard }) {
  const c = canvas(W, H);
  c.rect(0, 252, W, 268, P.shadow);

  // The fascia across the top, and the wall under it.
  c.rect(16, 56, 272, 84, roof);
  c.rect(16, 56, 272, 62, roofDark);
  c.rect(16, 78, 272, 84, roofDark);
  c.outline(16, 56, 272, 85);
  c.rect(24, 84, 264, 258, wall);

  if (cladding === "clapboard") {
    for (let y = 90; y < 258; y += 9) c.rect(24, y, 264, y + 1, wallDark);
    c.rect(24, 84, 264, 87, wallLit);
  } else if (cladding === "brick") {
    for (let y = 88; y < 258; y += 9)
      for (let x = 24 + ((y / 9) % 2 < 1 ? 0 : 9); x < 264; x += 18) {
        c.rect(x + 1, y, Math.min(x + 17, 264), y + 7, wallLit);
      }
  } else {
    // Board and batten: uprights rather than courses.
    for (let x = 30; x < 264; x += 12) c.rect(x, 84, x + 3, 258, wallDark);
  }

  // The sign board. Blank: the scene letters it with the business's name.
  c.rect(72, 96, 216, 128, P.yellow);
  c.rect(72, 96, 216, 100, P.slabLit);
  c.outline(71, 95, 217, 129);

  // The awning over the front, striped in the shop's own colour.
  if (awning) {
    for (let x = 36; x < 252; x += 14) {
      c.rect(x, 142, x + 7, 164, roof);
      c.rect(x + 7, 142, x + 14, 164, P.slabLit);
    }
    c.rect(36, 138, 252, 142, roofDark);
    c.outline(36, 138, 252, 165);
  }

  // Two windows with the shop's stock behind them, and the door between.
  for (const wx of [40, 188]) {
    c.rect(wx, 172, wx + 60, 232, P.ink);
    c.rect(wx + 3, 175, wx + 57, 229, P.glass);
    c.rect(wx + 3, 175, wx + 24, 190, P.glassLit);
    c.rect(wx + 29, 175, wx + 31, 229, P.ink);
    c.rect(wx + 3, 200, wx + 57, 202, P.ink);
    c.rect(wx - 2, 232, wx + 62, 236, P.slabLit);
    c.outline(wx - 3, 231, wx + 63, 237);
  }
  const dx = (W - 72) / 2;
  c.rect(dx - 4, 186, dx + 76, 258, P.ink);
  c.rect(dx, 190, dx + 72, 258, roofDark);
  c.rect(dx + 4, 196, dx + 32, 222, P.glass);
  c.rect(dx + 40, 196, dx + 68, 222, P.glass);
  c.rect(dx + 4, 196, dx + 14, 204, P.glassLit);
  c.rect(dx + 34, 190, dx + 38, 258, P.ink);
  c.set(dx + 30, 236, P.yellow);
  c.set(dx + 42, 236, P.yellow);
  c.rect(dx - 10, 258, dx + 82, 266, P.slab);
  c.rect(dx - 10, 258, dx + 82, 260, P.slabLit);
  c.outline(dx - 10, 257, dx + 82, 267);

  // And what the business sells, stacked at the end of the front.
  stock(c, yard);
  c.outline(24, 84, 264, 259);
  return c;
}

/** The stock stacked outside a shop: what it sells, in a pile by the wall. */
function stock(c, kind) {
  if (kind === "timber") {
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 3; k++) {
        const x = 2 + k * 8 + (row % 2) * 4,
          y = 232 - row * 8;
        c.rect(x, y, x + 8, y + 8, wood);
        c.rect(x + 1, y + 1, x + 7, y + 3, woodLit);
        c.outline(x, y, x + 8, y + 8);
      }
    return;
  }
  if (kind === "blocks") {
    for (let row = 0; row < 3; row++)
      for (let k = 0; k < 2; k++) {
        const x = 4 + k * 12 + (row % 2) * 6,
          y = 238 - row * 10;
        c.rect(x, y, x + 12, y + 10, P.stone);
        c.rect(x + 1, y + 1, x + 11, y + 3, [190, 176, 175, 255]);
        c.outline(x, y, x + 12, y + 10);
      }
    return;
  }
  if (kind === "drums") {
    for (const [x, y] of [
      [6, 226],
      [24, 232],
      [14, 240],
    ]) {
      c.rect(x, y, x + 14, y + 22, P.red);
      c.rect(x, y, x + 14, y + 4, [216, 128, 92, 255]);
      c.rect(x, y + 9, x + 14, y + 12, [148, 76, 50, 255]);
      c.outline(x, y, x + 14, y + 22);
    }
    return;
  }
  // Pallets, stacked flat.
  for (let row = 0; row < 5; row++) {
    const y = 244 - row * 6;
    c.rect(4, y, 34, y + 5, wood);
    c.rect(4, y, 34, y + 1, woodLit);
    for (let x = 6; x < 34; x += 7) c.rect(x, y + 1, x + 2, y + 5, woodDark);
    c.outline(4, y, 34, y + 6);
  }
}

/**
 * The four of them, west to east along the road. Colours far enough apart
 * that which shop you are walking up to is answered from across the map,
 * before the name over the door is big enough to read.
 */
const SHOPS = {
  targetts: {
    wall: [166, 96, 84, 255],
    wallDark: [136, 76, 68, 255],
    wallLit: [190, 118, 104, 255],
    roof: [90, 62, 76, 255],
    roofDark: [68, 48, 60, 255],
    awning: true,
    cladding: "brick",
    yard: "timber",
  },
  masstown: {
    wall: [226, 222, 214, 255],
    wallDark: [192, 188, 184, 255],
    wallLit: [242, 240, 234, 255],
    roof: [62, 112, 88, 255],
    roofDark: [44, 88, 68, 255],
    awning: true,
    cladding: "clapboard",
    yard: "pallets",
  },
  maccallum: {
    wall: [126, 140, 168, 255],
    wallDark: [100, 114, 142, 255],
    wallLit: [150, 164, 190, 255],
    roof: [72, 74, 98, 255],
    roofDark: [56, 58, 80, 255],
    awning: false,
    cladding: "board",
    yard: "blocks",
  },
  "happy-harrys": {
    wall: [214, 176, 104, 255],
    wallDark: [184, 146, 80, 255],
    wallLit: [234, 202, 138, 255],
    roof: [168, 84, 62, 255],
    roofDark: [138, 64, 48, 255],
    awning: true,
    cladding: "clapboard",
    yard: "drums",
  },
};

/**
 * The campus gate: three of the organisation's buildings standing back from
 * the road, behind a low wall with a gateway through it.
 *
 * Two things about the ground here were wrong. The wall stopped at 232 with
 * grass under it and the picture's own shadow band twenty pixels lower
 * again — a fence hanging in the air — and the path through the gateway
 * stopped with it, leaving the doorstep as a slab of paving on its own down
 * at the bottom. Everything along the front now finishes at `BASE`, which is
 * where every other building on the map meets the ground, and the path runs
 * from the gate to the step.
 *
 * The buildings are meant to stand further back than the wall and do — in
 * this projection further back is higher up. What made them read as cut-outs
 * propped on the grass is that they had no shadow at their own feet, which
 * is a different fix from moving them, so they each get one.
 */
function campus() {
  const CW = 384;
  const c = canvas(CW, H);
  /** Where the front of the picture meets the ground, as on every building. */
  const BASE = 258;
  c.rect(0, 252, CW, 268, P.shadow);
  // A shadow at each building's own feet, out on the lawn behind the wall.
  for (const [x0, x1] of [
    [20, 124],
    [146, 238],
    [260, 364],
  ])
    c.rect(x0, 170, x1, 184, P.shadow);
  // three buildings behind the wall, each its own kind
  const wallA = [94, 127, 163, 255];
  c.rect(24, 60, 120, 176, wallA);
  c.rect(24, 60, 120, 68, P.ink2);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const wx = 36 + col * 40;
      const wy = 78 + row * 30;
      c.rect(wx, wy, wx + 28, wy + 20, P.ink);
      c.rect(wx + 2, wy + 2, wx + 26, wy + 18, P.glass);
      c.rect(wx + 2, wy + 2, wx + 10, wy + 8, P.glassLit);
    }
  }
  c.outline(24, 60, 120, 177);
  c.rect(150, 40, 234, 176, P.stoneDark);
  for (let y = 44; y < 176; y += 10) {
    for (let x = 150 + ((y / 10) % 2) * 8; x < 234; x += 16) {
      c.rect(x + 1, y, x + 15, y + 8, P.stone);
      c.rect(x + 1, y, x + 15, y + 2, [190, 176, 175, 255]);
    }
  }
  c.rect(146, 30, 238, 40, P.teal);
  c.rect(146, 30, 238, 33, [66, 150, 144, 255]);
  c.outline(146, 30, 238, 41);
  for (const wx of [162, 200]) {
    c.rect(wx, 60, wx + 22, 96, P.ink);
    c.rect(wx + 3, 63, wx + 19, 93, P.glass);
  }
  // No band on the tower: the name hangs on the gateway's lintel, and a
  // second one up here was a blank yellow rectangle that read as a fault.
  c.outline(150, 40, 234, 177);
  c.rect(264, 76, 360, 176, P.steelDark);
  for (let x = 266; x < 360; x += 6) c.rect(x, 80, x + 3, 176, P.steel);
  for (let i = 0; i < 16; i++) {
    c.rect(258 + i, 76 - i, 366 - i, 77 - i, i % 4 < 2 ? P.stoneDark : P.steelDark);
  }
  c.rect(288, 120, 336, 176, P.ink);
  c.rect(291, 123, 333, 176, [64, 52, 46, 255]);
  c.outline(264, 76, 360, 177);
  // trees between them, on the lawn, each with its own shadow
  for (const [tx, ty] of [
    [136, 150],
    [250, 140],
    [372, 160],
    [12, 150],
  ]) {
    c.ellipse(tx, ty + 24, 11, 3, P.shadow);
    c.disc(tx, ty, 14, P.ink);
    c.disc(tx, ty, 12, P.leafDark);
    c.disc(tx - 3, ty - 3, 7, P.leaf);
    c.rect(tx - 2, ty + 10, tx + 2, ty + 24, P.woodDark);
  }
  // The low wall along the front, with a gateway and lamps. Its base is the
  // ground line, not two tiles above it.
  for (const [x0, x1] of [
    [0, 150],
    [234, CW],
  ]) {
    c.rect(x0, 226, x1, BASE, P.stone);
    c.rect(x0, 226, x1, 232, P.slabLit);
    c.rect(x0, 252, x1, BASE, P.stoneDark);
    c.outline(x0, 225, x1, BASE + 1);
  }
  // A pier at each end, so the wall finishes rather than being severed by
  // the edge of the picture.
  for (const px of [0, 370]) {
    c.rect(px, 216, px + 14, BASE, P.stoneDark);
    c.rect(px, 216, px + 14, 220, P.stone);
    c.outline(px, 216, px + 14, BASE + 1);
  }
  // The two posts, in the bluer stone so they read against the wall rather
  // than merging into it, and standing a good deal proud of it.
  for (const px of [140, 232]) {
    c.rect(px, 170, px + 12, BASE, P.stoneDark);
    c.rect(px, 170, px + 12, 174, P.stone);
    c.outline(px, 170, px + 12, BASE + 1);
  }
  c.rect(130, 186, 254, 202, P.yellow);
  c.rect(130, 186, 254, 189, P.slabLit);
  c.outline(129, 185, 255, 203);
  // A lamp on each post top, which is why the posts run past the beam
  // rather than stopping under it: the name is lettered over the beam at
  // run time, on a plate of its own wider than the beam is, so anything
  // level with it is a thing nobody ever sees.
  for (const px of [140, 232]) {
    c.rect(px + 2, 160, px + 10, 170, P.yellow);
    c.outline(px + 1, 159, px + 11, 171);
  }
  // The path through the gate, which reaches the doorstep.
  c.rect(152, 202, 232, BASE, P.slab);
  for (let y = 208; y < BASE; y += 12) c.rect(152, y, 232, y + 1, P.grout);
  c.rect(144, BASE, 240, 266, P.slab);
  c.rect(144, BASE, 240, 260, P.slabLit);
  c.outline(144, BASE - 1, 240, 267);
  return c;
}

/** A field crew van, seen from above: white, with the business's stripe, roof rack and mirrors. */
function van() {
  const c = canvas(96, 144);
  c.rect(10, 130, 86, 140, P.shadow);
  // tyres
  for (const [x, y] of [
    [8, 26],
    [8, 106],
    [80, 26],
    [80, 106],
  ])
    c.rect(x, y, x + 8, y + 18, P.ink);
  // body
  c.rect(14, 6, 82, 134, P.ink);
  c.rect(16, 8, 80, 132, [235, 228, 242, 255]);
  c.rect(16, 8, 80, 12, [250, 250, 250, 255]);
  // windscreen and rear window
  c.rect(20, 14, 76, 34, P.ink);
  c.rect(22, 16, 74, 32, P.glass);
  c.rect(22, 16, 40, 22, P.glassLit);
  c.rect(20, 118, 76, 128, P.ink);
  c.rect(22, 120, 74, 126, P.glass);
  // roof: a stripe and a ladder rack
  c.rect(16, 40, 80, 48, P.teal);
  c.rect(16, 40, 80, 42, [66, 150, 144, 255]);
  c.rect(16, 100, 80, 108, P.teal);
  c.rect(16, 100, 80, 102, [66, 150, 144, 255]);
  for (const y of [52, 92]) c.rect(20, y, 76, y + 3, P.steelDark);
  for (const x of [22, 72]) c.rect(x, 52, x + 3, 95, P.steelDark);
  for (let y = 58; y < 92; y += 8) c.rect(25, y, 71, y + 2, P.steel);
  // mirrors and lights
  c.rect(8, 30, 14, 36, P.ink);
  c.rect(82, 30, 88, 36, P.ink);
  c.rect(18, 9, 26, 12, P.yellow);
  c.rect(70, 9, 78, 12, P.yellow);
  c.rect(18, 128, 26, 131, P.red);
  c.rect(70, 128, 78, 131, P.red);
  c.outline(14, 6, 82, 134);
  return c;
}

/** The lab: white walls, a teal dome with a lit lens, an aerial, and a big round window. */
function lab() {
  const c = canvas(W, H);
  c.rect(0, 252, W, 268, P.shadow);
  const white = [235, 228, 242, 255];
  const whiteDark = [204, 194, 216, 255];
  c.rect(30, 110, 258, 258, white);
  for (let y = 116; y < 258; y += 14) c.rect(30, y, 258, y + 1, whiteDark);
  c.rect(30, 110, 258, 116, [250, 250, 250, 255]);
  // the dome
  c.disc(144, 110, 70, P.ink);
  c.disc(144, 110, 68, P.tealDark);
  c.disc(144, 110, 62, P.teal);
  c.disc(126, 92, 22, [66, 150, 144, 255]);
  c.rect(30, 110, 258, 114, P.ink);
  for (let a = -80; a <= 80; a += 20) {
    const x = Math.round(144 + Math.cos(((a - 90) * Math.PI) / 180) * 64);
    const y = Math.round(110 + Math.sin(((a - 90) * Math.PI) / 180) * 64);
    c.rect(x - 1, y, x + 2, y + 6, P.tealDark);
  }
  // the lens at the top, lit
  c.disc(144, 48, 12, P.ink);
  c.disc(144, 48, 10, P.glass);
  c.disc(141, 45, 4, P.glassLit);
  // the aerial
  c.rect(206, 8, 210, 70, P.ink);
  for (const y of [14, 26, 38]) c.rect(196, y, 220, y + 2, P.steel);
  c.disc(208, 6, 3, P.red);
  // the round window
  c.disc(144, 172, 30, P.ink);
  c.disc(144, 172, 27, P.glass);
  c.disc(134, 162, 10, P.glassLit);
  c.rect(142, 145, 146, 199, P.ink);
  c.rect(117, 170, 171, 174, P.ink);
  // side windows, teal-framed
  for (const wx of [52, 208]) {
    c.rect(wx, 140, wx + 28, 176, P.tealDark);
    c.rect(wx + 3, 143, wx + 25, 173, P.glass);
    c.rect(wx + 3, 143, wx + 10, 150, P.glassLit);
  }
  // sign band
  c.rect(78, 150, 210, 168, P.yellow);
  c.rect(78, 150, 210, 153, P.slabLit);
  c.outline(77, 149, 211, 169);
  // the door: a teal airlock
  const dx = (W - 48) / 2;
  c.rect(dx - 8, 208, dx + 56, 258, P.tealDark);
  c.rect(dx - 4, 212, dx + 52, 258, P.ink);
  c.rect(dx, 216, dx + 48, 258, [159, 211, 234, 255]);
  c.rect(dx + 22, 216, dx + 26, 258, P.ink);
  c.rect(dx + 4, 220, dx + 18, 232, P.glassLit);
  c.rect(dx - 12, 258, dx + 60, 266, P.slab);
  c.rect(dx - 12, 258, dx + 60, 260, P.slabLit);
  c.outline(dx - 12, 257, dx + 60, 267);
  // ground-floor vents
  for (const vx of [40, 232]) {
    c.rect(vx, 224, vx + 16, 244, P.steelDark);
    for (let y = 227; y < 244; y += 4) c.rect(vx + 2, y, vx + 14, y + 1, P.steel);
    c.outline(vx, 224, vx + 16, 245);
  }
  c.outline(30, 110, 258, 259);
  return c;
}

// ── Little buildings on a campus: 144px square, sign band blank ──
const S = 144;
function site(draw) {
  const c = canvas(S, S);
  c.rect(0, 126, S, 136, P.shadow);
  draw(c);
  return c;
}
function siteWarehouse() {
  return site((c) => {
    c.rect(12, 44, 132, 128, P.steelDark);
    for (let x = 14; x < 132; x += 6) c.rect(x, 48, x + 3, 128, P.steel);
    for (let i = 0; i < 24; i++) {
      c.rect(6 + i, 44 - i, 138 - i, 45 - i, i % 4 < 2 ? P.stoneDark : P.steelDark);
      c.set(6 + i, 44 - i, P.ink);
      c.set(137 - i, 44 - i, P.ink);
    }
    c.rect(30, 20, 114, 22, P.ink);
    c.rect(48, 78, 96, 128, P.ink);
    c.rect(51, 81, 93, 128, [64, 52, 46, 255]);
    for (let y = 84; y < 128; y += 8) c.rect(51, y, 93, y + 2, P.steelDark);
    c.rect(36, 52, 108, 70, P.yellow);
    c.rect(36, 52, 108, 55, P.slabLit);
    c.outline(35, 51, 109, 71);
    c.rect(40, 128, 104, 134, P.slab);
    c.outline(40, 127, 104, 135);
    c.outline(12, 44, 132, 129);
  });
}
function siteStore() {
  return site((c) => {
    c.rect(12, 34, 132, 128, P.woodLit);
    c.rect(12, 34, 132, 42, P.ink2);
    c.rect(20, 50, 124, 68, P.yellow);
    c.rect(20, 50, 124, 53, P.slabLit);
    c.outline(19, 49, 125, 69);
    for (let x = 16; x < 128; x += 12) {
      c.rect(x, 74, x + 6, 90, P.red);
      c.rect(x + 6, 74, x + 12, 90, P.slabLit);
    }
    c.outline(16, 72, 128, 91);
    c.rect(20, 92, 56, 122, P.ink);
    c.rect(23, 95, 53, 119, P.glass);
    c.rect(23, 95, 36, 104, P.glassLit);
    c.rect(88, 92, 124, 122, P.ink);
    c.rect(91, 95, 121, 119, P.glass);
    c.rect(60, 92, 84, 128, P.ink);
    c.rect(63, 95, 81, 128, [159, 211, 234, 255]);
    c.rect(71, 95, 73, 128, P.ink);
    c.rect(56, 128, 88, 134, P.slab);
    c.outline(56, 127, 88, 135);
    c.outline(12, 34, 132, 129);
  });
}
function siteGarage() {
  return site((c) => {
    c.rect(8, 50, 136, 128, P.stoneDark);
    for (let y = 54; y < 128; y += 10)
      for (let x = 8 + ((y / 10) % 2) * 8; x < 136; x += 16)
        c.rect(x + 1, y, x + 15, y + 8, P.stone);
    c.rect(4, 42, 140, 50, P.steelDark);
    c.rect(4, 42, 140, 44, P.steel);
    c.outline(4, 42, 140, 51);
    for (const gx of [16, 80]) {
      c.rect(gx, 78, gx + 48, 128, P.ink);
      c.rect(gx + 3, 81, gx + 45, 128, P.steel);
      for (let y = 86; y < 128; y += 8) c.rect(gx + 3, y, gx + 45, y + 2, P.steelDark);
    }
    c.rect(40, 54, 104, 72, P.yellow);
    c.rect(40, 54, 104, 57, P.slabLit);
    c.outline(39, 53, 105, 73);
    // a hazard stripe along the base
    for (let x = 8; x < 136; x += 8) c.rect(x, 128, x + 4, 132, P.yellow);
    c.rect(8, 132, 136, 134, P.ink);
    c.outline(8, 50, 136, 129);
  });
}
function siteOffice() {
  return site((c) => {
    const wall = [94, 127, 163, 255];
    c.rect(16, 24, 128, 128, wall);
    c.rect(16, 24, 128, 32, P.ink2);
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 3; col++) {
        const wx = 24 + col * 34,
          wy = 40 + row * 30;
        c.rect(wx, wy, wx + 24, wy + 20, P.ink);
        c.rect(wx + 2, wy + 2, wx + 22, wy + 18, P.glass);
        c.rect(wx + 2, wy + 2, wx + 10, wy + 8, P.glassLit);
      }
    c.rect(28, 100, 116, 118, P.yellow);
    c.rect(28, 100, 116, 103, P.slabLit);
    c.outline(27, 99, 117, 119);
    c.rect(56, 108, 88, 128, P.ink);
    c.rect(59, 111, 85, 128, [159, 211, 234, 255]);
    c.rect(71, 111, 73, 128, P.ink);
    c.rect(52, 128, 92, 134, P.slab);
    c.outline(52, 127, 92, 135);
    c.outline(16, 24, 128, 129);
  });
}

/** Sales: blue glass, a wide window band, a teal roofline. */
function siteOfficeSales() {
  return site((c) => {
    const wall = [94, 127, 163, 255];
    c.rect(16, 28, 128, 128, wall);
    c.rect(12, 20, 132, 30, P.teal);
    c.rect(12, 20, 132, 23, [66, 150, 144, 255]);
    c.outline(12, 20, 132, 31);
    c.rect(22, 38, 122, 62, P.ink);
    c.rect(24, 40, 120, 60, P.glass);
    c.rect(24, 40, 60, 48, P.glassLit);
    for (const x of [56, 88]) c.rect(x, 40, x + 2, 60, P.ink);
    for (let col = 0; col < 3; col++) {
      const wx = 24 + col * 34;
      c.rect(wx, 70, wx + 24, 90, P.ink);
      c.rect(wx + 2, 72, wx + 22, 88, P.glass);
    }
    c.rect(28, 100, 116, 118, P.yellow);
    c.rect(28, 100, 116, 103, P.slabLit);
    c.outline(27, 99, 117, 119);
    c.rect(56, 108, 88, 128, P.ink);
    c.rect(59, 111, 85, 128, [159, 211, 234, 255]);
    c.rect(71, 111, 73, 128, P.ink);
    c.rect(52, 128, 92, 134, P.slab);
    c.outline(52, 127, 92, 135);
    c.outline(16, 28, 128, 129);
  });
}
/** Finance: a sandstone bank with columns and a pediment. */
function siteOfficeFinance() {
  return site((c) => {
    const sand = [219, 202, 169, 255];
    const sandDark = [192, 158, 128, 255];
    c.rect(14, 44, 130, 128, sand);
    for (let y = 48; y < 128; y += 10) c.rect(14, y, 130, y + 1, sandDark);
    for (let i = 0; i < 18; i++) c.rect(22 + i * 3, 44 - i, 122 - i * 3, 45 - i, sand);
    for (let i = 0; i < 18; i++) {
      c.set(22 + i * 3, 44 - i, P.ink);
      c.set(23 + i * 3, 44 - i, P.ink);
      c.set(121 - i * 3, 44 - i, P.ink);
      c.set(122 - i * 3, 44 - i, P.ink);
    }
    c.rect(22, 44, 122, 46, P.ink);
    for (const cx of [24, 46, 90, 112]) {
      c.rect(cx, 52, cx + 8, 128, [235, 228, 210, 255]);
      c.rect(cx + 6, 52, cx + 8, 128, sandDark);
      c.outline(cx, 52, cx + 8, 129);
      c.rect(cx - 2, 50, cx + 10, 54, sandDark);
    }
    c.rect(56, 92, 88, 110, P.yellow);
    c.rect(56, 92, 88, 95, P.slabLit);
    c.outline(55, 91, 89, 111);
    c.rect(58, 60, 86, 84, P.ink);
    c.rect(61, 63, 83, 81, P.glass);
    c.rect(60, 112, 84, 128, P.ink);
    c.rect(63, 115, 81, 128, [64, 52, 46, 255]);
    c.rect(71, 115, 73, 128, P.ink);
    c.rect(48, 128, 96, 134, P.slab);
    c.outline(48, 127, 96, 135);
    c.outline(14, 44, 130, 129);
  });
}
/** Operations: a steel-clad block with a red band and a rooftop unit. */
function siteOfficeOperations() {
  return site((c) => {
    c.rect(14, 36, 130, 128, P.steelDark);
    for (let x = 16; x < 130; x += 6) c.rect(x, 40, x + 3, 128, P.steel);
    c.rect(14, 36, 130, 40, P.ink2);
    c.rect(96, 26, 122, 36, P.stoneDark);
    c.outline(96, 26, 122, 37);
    c.rect(100, 20, 104, 26, P.ink2);
    c.rect(14, 62, 130, 72, P.red);
    c.rect(14, 62, 130, 64, [210, 120, 90, 255]);
    for (const wy of [44, 78]) {
      for (let col = 0; col < 3; col++) {
        const wx = 24 + col * 34;
        c.rect(wx, wy, wx + 24, wy + 14, P.ink);
        c.rect(wx + 2, wy + 2, wx + 22, wy + 12, P.glass);
      }
    }
    c.rect(28, 96, 116, 112, P.yellow);
    c.rect(28, 96, 116, 99, P.slabLit);
    c.outline(27, 95, 117, 113);
    c.rect(56, 108, 88, 128, P.ink);
    c.rect(59, 111, 85, 128, [159, 211, 234, 255]);
    c.rect(71, 111, 73, 128, P.ink);
    c.rect(52, 128, 92, 134, P.slab);
    c.outline(52, 127, 92, 135);
    c.outline(14, 36, 130, 129);
  });
}

/** Volcano Island's sand: black grains, a few lighter, the odd glint of obsidian. */
function ash() {
  const c = canvas(48, 48);
  c.rect(0, 0, 48, 48, V.ash);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const h = hash(x * 3 + 11, y * 5 + 7);
      if (h < 0.1) c.set(x, y, V.ashDark);
      else if (h < 0.15) c.set(x, y, V.ashLit);
      else if (h < 0.165) c.set(x, y, V.grain);
      else if (h < 0.172) c.set(x, y, V.obsidian);
    }
  return c;
}

/**
 * A hash for the noise lattice below, mixed with `Math.imul` so it stays in
 * 32 bits. The sheet's own `hash` multiplies in floating point, which is
 * fine for scattering speckles and skewed for small whole numbers — every
 * value off a lattice of eight came out under a half, and the noise over it
 * flattened into stripes.
 */
function latticeHash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Value noise that tiles: a lattice of `cells` by `cells` random heights over
 * the 48-pixel tile, wrapped at the edges and smoothly interpolated between.
 * What organic ground wants and a per-pixel hash cannot give — patches and
 * veins the size of something, running on from one tile into the next.
 */
function tiledNoise(x, y, cells, seed) {
  const size = 48 / cells;
  const gx = x / size;
  const gy = y / size;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const wrap = (n) => ((n % cells) + cells) % cells;
  const at = (i, j) => latticeHash(wrap(i) + seed * 31, wrap(j));
  const ease = (t) => t * t * (3 - 2 * t);
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * ease(fx);
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * ease(fx);
  return top + (bottom - top) * ease(fy);
}

/**
 * Lava: two frames, the bright veins shifting between them so it moves.
 *
 * Veins rather than glints: the hot seams are where a tiling noise crosses
 * its middle, which draws them as lines that wander and run on from one tile
 * into the next — a flow is a thing that runs on. The first go was two sine
 * waves and came out as polka dots. The second frame is the same field with
 * the seams taken at a slightly different height, so they creep rather than
 * jump.
 */
function lava(frame) {
  const c = canvas(48, 48);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const n = tiledNoise(x, y, 4, 7) * 0.65 + tiledNoise(x, y, 8, 11) * 0.35;
      const seam = Math.abs(n - (0.5 + frame * 0.04));
      const tone =
        seam < 0.018
          ? V.lavaHot
          : seam < 0.05
            ? V.lavaLit
            : n > 0.66
              ? V.lavaDeep
              : n < 0.3
                ? V.lavaLit
                : V.lava;
      c.set(x, y, tone);
      // Scraps of crust riding on the cooler patches.
      if (n > 0.62 && hash(x + frame * 5, y + 13) < 0.05) c.set(x, y, V.basaltDark);
    }
  return c;
}

/** The cooled crust along the edge of a flow where it meets the sand; turned for the other sides. */
function crust() {
  const c = canvas(48, 48);
  for (let x = 0; x < 48; x++) {
    const depth = 3 + Math.floor(hash(x, 9) * 3);
    for (let y = 0; y < depth; y++) c.set(x, y, y === depth - 1 ? V.basalt : V.basaltDark);
    c.set(x, depth, [255, 224, 122, 200]);
    if (hash(x, 10) < 0.5) c.set(x, depth + 1, [250, 160, 48, 120]);
  }
  return c;
}

/** The top of a cave wall: rock, speckled, with a crack or two across it. */
function rockTop() {
  const c = canvas(48, 48);
  c.rect(0, 0, 48, 48, V.rock);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const h = hash(x * 7 + 3, y * 3 + 17);
      if (h < 0.12) c.set(x, y, V.rockDark);
      else if (h < 0.18) c.set(x, y, V.rockLit);
    }
  for (let i = 0; i < 10; i++) c.set(6 + i, 12 + (i >> 2), V.rockDeep);
  for (let i = 0; i < 8; i++) c.set(30 + (i >> 1), 30 + i, V.rockDeep);
  return c;
}

/**
 * The face of a cave wall where the floor runs up to it: the top of it for
 * the first few rows, then the rock standing up — lighter, since it faces the
 * way the light comes from — in cracked, uneven slabs, and the shadow it
 * throws at its foot. Slabs from a tiling noise rather than bands across it,
 * which the first go had and which read as panelling.
 */
function rockFace() {
  const c = rockTop();
  for (let y = 10; y < 44; y++)
    for (let x = 0; x < 48; x++) {
      const n = tiledNoise(x, y * 0.7, 4, 3) * 0.7 + tiledNoise(x, y, 8, 5) * 0.3;
      const crack = Math.abs(n - 0.5) < 0.02;
      c.set(x, y, crack ? V.rockDark : n > 0.6 ? V.faceLit : n < 0.38 ? V.rockLit : V.face);
      if (!crack && hash(x * 5 + 1, y * 7 + 2) < 0.05) c.set(x, y, V.rockLit);
    }
  c.rect(0, 10, 48, 11, V.rockDeep);
  c.rect(0, 11, 48, 12, V.faceLit);
  c.rect(0, 44, 48, 48, V.rockDeep);
  return c;
}

/** The cave's floor: stone worn flat, a shade lighter than the walls, with pebbles. */
function caveFloor() {
  const c = canvas(48, 48);
  c.rect(0, 0, 48, 48, V.cave);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const h = hash(x * 11 + 5, y * 13 + 1);
      if (h < 0.08) c.set(x, y, V.caveDark);
      else if (h < 0.11) c.set(x, y, V.caveLit);
    }
  for (const [px, py] of [
    [8, 10],
    [30, 6],
    [20, 28],
    [40, 34],
    [6, 40],
  ]) {
    c.disc(px, py, 1, V.caveLit);
    c.set(px + 1, py + 1, V.caveDark);
  }
  return c;
}

/**
 * The volcano: a cone of basalt twelve tiles across, lit from the left, with
 * a glowing crater at the top, gullies running down it from the rim, lava
 * running down both flanks to meet the flows on the ground, and the cave's
 * mouth at the foot of it.
 *
 * The flanks flare: steep under the summit and spreading at the foot, which
 * is the one thing that makes a cone a mountain rather than a lampshade — a
 * straight edge from the rim to the ground was the first go at this, and it
 * was a bucket upside down. `CONE` is that curve, and it is written twice:
 * here, and in `lib/world/volcano.ts`, which cuts the solid bands from it. A
 * `.mjs` cannot import a `.ts`, which is the arrangement the basketball's
 * board already lives under; change one and change the other, or the island
 * has invisible walls in the sky.
 */
const CONE = { summitY: 40, summitHalf: 74, baseY: 431, baseHalf: 278, flare: 1.7 };
function coneHalf(y) {
  const s = Math.min(1, Math.max(0, (y - CONE.summitY) / (CONE.baseY - CONE.summitY)));
  return CONE.summitHalf + (CONE.baseHalf - CONE.summitHalf) * s ** CONE.flare;
}
function volcano() {
  const W = 576;
  const H = 432;
  const c = canvas(W, H);
  const cx = W / 2;
  /** Across the flank at a height: 0 at the left edge, 1 at the right. */
  const across = (t, y) => cx + (t - 0.5) * 2 * coneHalf(y);
  c.ellipse(cx, H - 4, 274, 8, P.shadow);

  // The cone, a row at a time, with a ragged edge and three bands of light.
  for (let y = CONE.summitY; y <= CONE.baseY; y++) {
    const half = coneHalf(y);
    const l = Math.round(cx - half + (hash(1, y) - 0.5) * 4);
    const r = Math.round(cx + half + (hash(2, y) - 0.5) * 4);
    for (let x = l; x <= r; x++) {
      const t = (x - l) / Math.max(1, r - l) + (hash(x, y) - 0.5) * 0.1;
      c.set(x, y, t < 0.3 ? V.basaltLit : t < 0.68 ? V.basalt : V.basaltDark);
      if (hash(x * 3, y * 7) < 0.025) c.set(x, y, V.basaltDeep);
    }
    c.set(l - 1, y, P.ink);
    c.set(r + 1, y, P.ink);
  }

  // Gullies: from the rim to the foot, each keeping its place across the
  // flank, so they fan out from the summit the way a mountain's do. A dark
  // line with the light catching its left lip.
  for (const [t, phase] of [
    [0.1, 0.4],
    [0.24, 1.3],
    [0.4, 2.1],
    [0.52, 0.2],
    [0.66, 2.7],
    [0.8, 1.1],
    [0.92, 1.9],
  ]) {
    for (let y = CONE.summitY + 14; y < CONE.baseY - 4; y++) {
      const wobble = Math.sin((y / 38) * Math.PI + phase) * 3;
      const x = Math.round(across(t, y) + wobble);
      if (hash(x, y) < 0.12) continue;
      c.set(x, y, V.basaltDeep);
      c.set(x - 1, y, t < 0.5 ? V.basaltLit : V.basalt);
    }
  }

  // The crater: a rim of dark rock round a bowl of lava, hottest in the middle.
  const cy = CONE.summitY + 8;
  c.ellipse(cx, cy, CONE.summitHalf + 4, 15, P.ink);
  c.ellipse(cx, cy, CONE.summitHalf + 2, 13, V.basaltDark);
  c.ellipse(cx - 18, cy - 7, 40, 4, V.basaltLit);
  c.ellipse(cx, cy + 1, 60, 9, V.lavaDeep);
  c.ellipse(cx, cy + 1, 48, 7, V.lava);
  c.ellipse(cx, cy + 1, 32, 4, V.lavaLit);
  c.ellipse(cx, cy + 1, 14, 2, V.lavaHot);

  // Lava down both flanks: a rivulet spilling over the rim, drifting out
  // across the flank as it goes and widening towards the foot, where it
  // meets the flow on the ground — see `lava` in `lib/world/volcano.ts`.
  const flow = (tFrom, tTo, yTo, phase) => {
    const path = [];
    for (let y = cy + 6; y <= yTo; y++) {
      const s = (y - cy) / (yTo - cy);
      const t = tFrom + (tTo - tFrom) * s;
      const x = across(t, y) + Math.sin(s * Math.PI * 4 + phase) * 5;
      path.push([Math.round(x), y, 1 + Math.round(s * 2.4)]);
    }
    for (const [x, y, w] of path) c.rect(x - w - 1, y, x + w + 2, y + 1, V.lavaDeep);
    for (const [x, y, w] of path) {
      c.rect(x - w, y, x + w + 1, y + 1, V.lava);
      c.set(x, y, hash(x, y) < 0.5 ? V.lavaHot : V.lavaLit);
    }
  };
  flow(0.3, 0.08, H - 4, 0.3);
  flow(0.7, 0.92, H - 4, 2.2);
  flow(0.55, 0.62, 190, 1.2);

  // The cave's mouth: an arch of dark at the foot, a rim of fallen stone
  // round it, and the faintest warmth at the back where the cave goes in.
  const mouthTop = H - 64;
  for (let y = mouthTop; y < H; y++) {
    const rise = y - mouthTop;
    const half = rise < 26 ? Math.round(32 * Math.sqrt(1 - ((26 - rise) / 26) ** 2)) : 32;
    c.rect(cx - half - 2, y, cx + half + 2, y + 1, P.ink);
    const warmth = Math.max(0, (y - (H - 22)) / 22);
    const dark = [
      Math.round(14 + 50 * warmth),
      Math.round(12 + 18 * warmth),
      Math.round(18 + 8 * warmth),
      255,
    ];
    c.rect(cx - half, y, cx + half, y + 1, dark);
  }
  for (const [bx, by, br] of [
    [cx - 40, H - 10, 7],
    [cx + 40, H - 12, 8],
    [cx - 32, H - 44, 5],
    [cx + 33, H - 46, 5],
    [cx - 14, mouthTop - 3, 5],
    [cx + 12, mouthTop - 4, 6],
  ]) {
    c.disc(bx, by, br + 1, P.ink);
    c.disc(bx, by, br, V.basalt);
    c.disc(bx - 1, by - 1, br - 2, V.basaltLit);
  }
  return c;
}

/** The same picture at twice the size, each pixel doubled: still pixel art. */
function doubled(c) {
  const out = canvas(c.w * 2, c.h * 2);
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const i = (y * c.w + x) * 4;
      const px = [c.px[i], c.px[i + 1], c.px[i + 2], c.px[i + 3]];
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          out.px.set(px, ((y * 2 + dy) * out.w + x * 2 + dx) * 4);
        }
      }
    }
  }
  return out;
}

// ── PNG ──
let T = null;
const crc32 = (buf) => {
  if (!T) {
    T = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let x = n;
      for (let k = 0; k < 8; k++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1;
      T[n] = x;
    }
  }
  let x = -1;
  for (const b of buf) x = T[(x ^ b) & 0xff] ^ (x >>> 8);
  return (x ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function save(name, c) {
  const raw = Buffer.alloc(c.h * (c.w * 4 + 1));
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * 4 + 1)] = 0;
    Buffer.from(c.px.buffer, y * c.w * 4, c.w * 4).copy(raw, y * (c.w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0);
  ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  writeFileSync(
    join(OUT, name),
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
  console.log(`wrote ${name} ${c.w}x${c.h}`);
}
save("grass_48.png", grass());
save("grass_384.png", grassBlock());
save("highway_48.png", highway());
save("highway_marks_192x48.png", highwayMarks());
for (const [slug, spec] of Object.entries(SHOPS)) save(`building_${slug}.png`, shop(spec));
save("paving_48.png", paving());
save("kerb_48.png", kerb());
save("props.png", props);
writeFileSync(join(OUT, "props.json"), JSON.stringify(frames, null, 2));
save("building_castle.png", castle());
save("building_office.png", office());
save("building_supply.png", supply());
save("building_blocks.png", blocks());
save("building_campus.png", campus());
save("site_warehouse.png", siteWarehouse());
save("site_store.png", siteStore());
save("site_garage.png", siteGarage());
save("site_office.png", siteOffice());
save("site_office_sales.png", siteOfficeSales());
save("site_office_finance.png", siteOfficeFinance());
save("site_office_operations.png", siteOfficeOperations());
save("van_96x144.png", van());
save("asphalt_48.png", asphalt());
save("court_48.png", court());
save("trail_48.png", trail());
save("shingle_48.png", shingle());
save("court_lines_768x384.png", courtLines(16, 8));
save("pond_288x192.png", pond());
save("site_office_sales_2x.png", doubled(siteOfficeSales()));
save("site_office_finance_2x.png", doubled(siteOfficeFinance()));
save("site_office_operations_2x.png", doubled(siteOfficeOperations()));
save("site_store_2x.png", doubled(siteStore()));
save("site_garage_2x.png", doubled(siteGarage()));
save("site_warehouse_2x.png", doubled(siteWarehouse()));
save("building_lab.png", lab());
save("water_48.png", water(0));
save("water2_48.png", water(1));
save("foam_48.png", foam());
save("dock_48.png", dock());
save("boat_192x168.png", boat());
save("site_irish.png", siteIrish());
save("site_irish_2x.png", doubled(siteIrish()));
// Volcano Island's ground, and the volcano.
save("ash_48.png", ash());
save("lava_48.png", lava(0));
save("lava2_48.png", lava(1));
save("crust_48.png", crust());
save("rock_48.png", rockTop());
save("rock_face_48.png", rockFace());
save("cave_48.png", caveFloor());
save("volcano_576x432.png", volcano());
