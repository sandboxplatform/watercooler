"use client";

import { Fragment, useId } from "react";
import type { EggKind } from "@/lib/world/eggs";

/**
 * An egg, in the HUD.
 *
 * Drawn rather than lettered, for the reason the voice mark over somebody's
 * head is: an emoji's colour belongs to the font, and 🥚 once a rung
 * would be a ladder of identical rows.
 *
 * **And drawn with its markings, not just its colour.** It was a rounded
 * box in a gradient of the shell's three tones, which is the difference
 * between a hen's egg and a jade one written in hue alone — a column of
 * pale ovals in shades of one light, at thirteen pixels across, in a list whose
 * whole job is to say that the bottom of it is worth crossing the park for.
 * So every kind's `mark` in `scripts/make-world-art.mjs` has its
 * counterpart here: freckles, a hammered sheen, veins lit from within, gold
 * leaf in panels, the flat faces of a cut stone, the curved chips glass
 * breaks into, and the whole spectrum wound round the shell. The sprite
 * in the grass and the egg in the panel are one egg, and now they are one
 * egg twice rather than an egg and a bead.
 *
 * It is not the sprite from the props sheet itself. That is an atlas frame,
 * and pulling one out of it in CSS means the panel knowing where in a
 * generated sheet each egg sits — and it would be twenty-two pixels tall
 * wherever it was shown, where this is the same egg at a list's size and at
 * the size of the card that opens when one is pressed.
 */

/** The shell, in an eighteen by twenty-four box. Narrow at the crown. */
const SHELL =
  "M9 1.2 C12.2 1.8 15.5 7.2 15.8 13.6 C16.1 19.6 12.9 22.9 9 22.9 " +
  "C5.1 22.9 1.9 19.6 2.2 13.6 C2.5 7.2 5.8 1.8 9 1.2 Z";

/** The bands on the one egg nobody can account for, crown to base. */
const RAINBOW = ["#e26a6a", "#e8a05c", "#f2e07a", "#7ec480", "#7aa8e0", "#ac7cd6"];

/** Where the freckles are. Written down, so every speckled egg is the one egg. */
const FRECKLES: readonly [number, number, number][] = [
  [6.2, 5.4, 0.7],
  [10.4, 4.6, 0.55],
  [4.8, 8.6, 0.85],
  [8.4, 7.8, 0.6],
  [12.2, 8.2, 0.75],
  [6.6, 11.4, 0.9],
  [10.8, 12.2, 0.65],
  [3.9, 13.8, 0.7],
  [13.3, 14.6, 0.8],
  [7.8, 15.4, 0.85],
  [11.2, 17.4, 0.7],
  [5.4, 18.2, 0.6],
  [9.2, 19.6, 0.75],
  [13.0, 11.0, 0.5],
  [8.0, 3.4, 0.45],
];

/**
 * One flat face of a cut stone, struck from the middle of it.
 *
 * Wedges rather than a drawn outline, because what makes a stone read as
 * cut at this size is that each face takes the light as a whole — a facet
 * that graded into its neighbour is a marble, and a marble is a pebble
 * with the lights on. Six of them; a seventh at eighteen pixels across is
 * a stripe.
 */
function facet(from: number, to: number): string {
  const [cx, cy] = [9, 12.5];
  const R = 17;
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(cx + R * Math.cos(a)).toFixed(2)} ${(cy + R * Math.sin(a)).toFixed(2)}`;
  };
  return `M${cx} ${cy} L${at(from)} L${at(to)} Z`;
}

/** The faces, clockwise from the crown: which tone each takes, and how much. */
const FACETS: readonly [number, number, "lit" | "shade", number][] = [
  [-90, -30, "lit", 0.34],
  [-30, 30, "shade", 0.4],
  [30, 90, "shade", 0.72],
  [90, 150, "shade", 0.24],
  [150, 210, "lit", 0.14],
  [210, 270, "lit", 0.58],
];

/** A four-pointed glint, the same one the sprite gets two of. */
function star(x: number, y: number, r: number): string {
  const w = r * 0.26;
  return (
    `M${x} ${y - r} L${x + w} ${y - w} L${x + r} ${y} L${x + w} ${y + w} ` +
    `L${x} ${y + r} L${x - w} ${y + w} L${x - r} ${y} L${x - w} ${y - w} Z`
  );
}

/** What is painted on the shell, under the modelling and over the base. */
function Marking({ kind, ids }: { kind: EggKind; ids: (name: string) => string }) {
  const { shade, lit } = kind.shell;
  switch (kind.id) {
    case "speckled":
      return (
        <g fill={shade} opacity="0.72">
          {FRECKLES.map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
      );
    // Two highlights, because one on a curved thing reads as plastic: the
    // sheen down the lit side, and the light of the park bounced back along
    // the shadowed edge. The dimples are the hammering.
    case "copper":
      return (
        <g>
          <ellipse cx="6.1" cy="12" rx="1.5" ry="6.2" fill={lit} opacity="0.7" />
          <ellipse
            cx="6.4"
            cy="12"
            rx="9"
            ry="11.4"
            fill="none"
            stroke={lit}
            strokeWidth="1.3"
            opacity="0.55"
          />
          <g fill={shade} opacity="0.3">
            <circle cx="10.6" cy="6.4" r="1.4" />
            <circle cx="12.4" cy="12.6" r="1.6" />
            <circle cx="8.6" cy="17.4" r="1.5" />
            <circle cx="5.2" cy="19.4" r="1.2" />
          </g>
        </g>
      );
    // Lit from somewhere in the middle of itself, with the veins of the
    // quarry still in it.
    case "jade":
      return (
        <g>
          <ellipse cx="8.6" cy="14.4" rx="4.6" ry="5.4" fill={`url(#${ids("glow")})`} />
          <g fill="none" stroke={lit} strokeWidth="0.7" opacity="0.6" strokeLinecap="round">
            <path d="M5.4 4.2 C7.2 8 5.6 11.4 7.4 15.2 C8.4 17.4 7.6 19.6 6.4 21" />
            <path d="M11.8 3.6 C10.4 7.6 12.6 10.4 11.4 14.2" />
            <path d="M13.4 16.4 C12.2 18.4 12.6 20.2 11.4 21.6" />
          </g>
        </g>
      );
    // Leaf rather than paint: the seams between the panels, and each panel
    // taking the light a little differently.
    case "gilded":
      return (
        <g>
          <g fill={lit} opacity="0.45">
            <path d="M2.4 10.5 L9.2 2.2 L13 6.4 L5.6 15.6 Z" />
            <path d="M9.6 17.4 L15.6 12 L15.2 18.6 L11 22.4 Z" />
          </g>
          <g stroke={shade} strokeWidth="0.55" opacity="0.65" fill="none">
            <path d="M1.6 11 L10 1" />
            <path d="M4.6 17.4 L14 6" />
            <path d="M9 23 L16.6 13.4" />
            <path d="M2 14.6 L11.6 23" />
            <path d="M5.4 4 L16 13.2" />
          </g>
        </g>
      );
    // Cut, which is not a thing that happens to a shell: flat faces meeting
    // at hard edges, and the table across the crown a jeweller would have
    // put there. The table is what says the stone was *worked* — without it
    // the wedges all run to one point and it reads as a beach ball in red.
    case "ruby":
      return (
        <g>
          {FACETS.map(([from, to, tone, opacity]) => (
            <path
              key={from}
              d={facet(from, to)}
              fill={tone === "lit" ? lit : shade}
              opacity={opacity}
            />
          ))}
          <path d="M5.2 6.6 L9 3.5 L12.8 6.6 L9 9.5 Z" fill={lit} opacity="0.72" />
        </g>
      );
    // Volcanic glass: conchoidal fracture — the curved chips glass breaks
    // into, rather than the straight flakes a stone gives — and the sheen
    // rolling across the break, which is the only bright thing on it and
    // the whole reason it is not a black oval.
    case "obsidian":
      return (
        <g>
          <path
            d="M4.2 2.6 C2 8 2.4 14.2 4.6 19.8 L8.4 22.8 C5.6 16 5.4 8.8 8.2 1.8 Z"
            fill={lit}
            opacity="0.42"
          />
          <g fill="none" stroke={lit} strokeWidth="0.75" strokeLinecap="round">
            <path d="M1.2 9.2 C5 6.2 9.8 7 12.6 11 C14.8 14.2 14.9 18.6 13.4 22.4" opacity="0.5" />
            <path d="M3.4 21 C4.3 17.2 7.4 14.4 11.2 14" opacity="0.34" />
          </g>
        </g>
      );
    default:
      // The rainbow is its own base fill, and a hen's egg is a shell and
      // nothing on it.
      return null;
  }
}

export default function EggMark({
  kind,
  size = 20,
  dim = false,
}: {
  kind: EggKind;
  /** How tall the egg is drawn, in pixels. The width follows the shell. */
  size?: number;
  dim?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ids = (name: string) => `egg-${name}-${uid}`;
  const { base, shade, lit } = kind.shell;
  const rainbow = kind.id === "rainbow";
  // The modelling is the shell's own two tones, except on the two eggs whose
  // bright tone is a colour in its own right. On the rainbow that is the six
  // bands, three of which the shell's own `lit` would fight; on the obsidian
  // it is the violet sheen, and a highlight painted in it turns the one black
  // egg on the ladder lilac. Both get plain light and plain shadow instead,
  // which on polished glass is what a highlight is anyway.
  const ownColour = rainbow || kind.id === "obsidian";
  const hi = ownColour ? "#ffffff" : lit;
  const lo = rainbow ? "#2a2036" : shade;
  const twinkles = rainbow ? [star(12.4, 8.4, 2.2), star(6, 16.6, 1.7)] : [];
  if (kind.id === "gilded") twinkles.push(star(12.2, 7.6, 2), star(6.4, 17.4, 1.5));
  // A cut stone flashes; black glass does not — its answer to the light is
  // the sheen, and a twinkle on it would read as a chip of something else.
  if (kind.id === "ruby") twinkles.push(star(11.8, 8.2, 1.9), star(6.2, 17, 1.5));

  return (
    <span className={`egg-mark${dim ? " egg-mark--dim" : ""}`} aria-hidden="true">
      <svg
        width={size * 0.75}
        height={size}
        viewBox="0 0 18 24"
        xmlns="http://www.w3.org/2000/svg"
        role="presentation"
      >
        <defs>
          <clipPath id={ids("clip")}>
            <path d={SHELL} />
          </clipPath>
          {/* Light from the top left and the shell curving away to the
              bottom right, which is exactly how the sprite is shaded. Over
              the marking rather than under it, so a freckle on the shadowed
              side is in shadow. */}
          <radialGradient id={ids("model")} cx="32%" cy="26%" r="82%">
            <stop offset="0%" stopColor={hi} stopOpacity="0.95" />
            <stop offset="42%" stopColor={hi} stopOpacity="0" />
            <stop offset="72%" stopColor={lo} stopOpacity="0.18" />
            <stop offset="100%" stopColor={lo} stopOpacity="0.9" />
          </radialGradient>
          <radialGradient id={ids("glow")}>
            <stop offset="0%" stopColor={lit} stopOpacity="0.95" />
            <stop offset="100%" stopColor={lit} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={ids("gloss")}>
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          {/* Diagonal rather than stacked: bands straight across the middle
              read as a beach ball. */}
          <linearGradient id={ids("bands")} x1="0" y1="0" x2="0.85" y2="1">
            {RAINBOW.map((colour, at) => (
              // Two stops at the band's own edges, so the gradient steps
              // rather than blends: six colours blurred into each other is
              // an oil slick, and the point of this one is its bands.
              <Fragment key={colour}>
                <stop offset={at / RAINBOW.length} stopColor={colour} />
                <stop offset={(at + 1) / RAINBOW.length} stopColor={colour} />
              </Fragment>
            ))}
          </linearGradient>
        </defs>

        <path d={SHELL} fill={rainbow ? `url(#${ids("bands")})` : base} />
        <g clipPath={`url(#${ids("clip")})`}>
          <Marking kind={kind} ids={ids} />
          <path d={SHELL} fill={`url(#${ids("model")})`} />
          <ellipse cx="6.3" cy="7.2" rx="2" ry="3" fill={`url(#${ids("gloss")})`} />
          {twinkles.map((d) => (
            <path key={d} d={d} fill="#fffdf2" opacity="0.92" />
          ))}
        </g>
        <path d={SHELL} fill="none" stroke="#2c2c40" strokeWidth="0.9" opacity="0.8" />
      </svg>
    </span>
  );
}
