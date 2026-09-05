"use client";

import { FRAME_WIDTH, FRAME_HEIGHT } from "@/components/game/config/animations";
import { asset } from "@/lib/assets";

/**
 * The frame a portrait is cut from: the first idle-down pose.
 *
 * Row and column rather than a frame number, because a frame number depends
 * on how wide the sheet is and a portrait should not. Kept in step with
 * PORTRAIT_ROW and PORTRAIT_COLUMN in lib/pixel/compose.ts, which cuts the
 * same frame on the server; that file cannot be imported here, since it
 * reaches zlib through the PNG codec and would go into the browser bundle.
 */
const PORTRAIT_ROW = 1;
const PORTRAIT_COLUMN = 18;

export default function CharacterPortrait({
  spritePath,
  name,
  large = false,
  small = false,
}: {
  spritePath?: string;
  name: string;
  large?: boolean;
  /** For a list row: the head and shoulders at about half size. */
  small?: boolean;
}) {
  const scale = large ? 2.4 : small ? 0.7 : 1.1;

  if (!spritePath) {
    return <span style={{ fontSize: 8, color: "var(--pixel-muted)" }}>EMPTY</span>;
  }

  /**
   * Scaled by a transform rather than by naming the background's size.
   *
   * Naming it meant naming the whole sheet's width, which meant assuming how
   * many columns a sheet has — so a sheet only as wide as its frames came out
   * stretched. At its natural size the offset to a frame is the same whatever
   * the sheet's width, and the transform does the growing.
   */
  return (
    <div
      aria-label={name}
      style={{
        width: FRAME_WIDTH * scale,
        height: FRAME_HEIGHT * scale,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
          // Hashed: a redrawn sheet keeps its filename, so without this the
          // portrait shows the previous look until the cache lapses.
          backgroundImage: `url(${asset(spritePath)})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: `-${PORTRAIT_COLUMN * FRAME_WIDTH}px -${PORTRAIT_ROW * FRAME_HEIGHT}px`,
          imageRendering: "pixelated",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}
