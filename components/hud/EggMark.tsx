"use client";

import type { EggKind } from "@/lib/world/eggs";

/**
 * An egg, in the HUD.
 *
 * Drawn rather than lettered, for the reason the voice mark over
 * somebody's head is: an emoji's colour belongs to the font, and the
 * whole of what distinguishes one of these from another is its colour.
 * 🥚 six times over would be six identical rows.
 *
 * It is not the sprite from the props sheet either. That is an atlas
 * frame twelve pixels wide, and pulling one out of it in CSS means the
 * panel knowing where in the sheet each egg sits — a generated number, in
 * a file the HUD has no other business reading. The shell's three tones
 * are on the kind already, because the sprite was drawn from them; a
 * rounded box in those tones is the same egg at the same size.
 */

export default function EggMark({ kind, dim = false }: { kind: EggKind; dim?: boolean }) {
  const { base, shade, lit } = kind.shell;
  return (
    <span
      className={`egg-mark${dim ? " egg-mark--dim" : ""}`}
      aria-hidden="true"
      style={{
        // Light from the top left and the shell curving away to the
        // bottom right, which is exactly how the sprite is shaded — the
        // two are the same picture at two sizes.
        background: `radial-gradient(circle at 34% 28%, ${lit} 0%, ${base} 46%, ${shade} 100%)`,
      }}
    />
  );
}
