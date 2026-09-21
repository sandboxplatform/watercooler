"use client";

import { useEffect, useRef } from "react";
import type * as PhaserTypes from "phaser";
import { createLogger } from "@/lib/logger";

const log = createLogger("PhaserGame");

/** The faces the scenes paint with, and how long to wait for them before going ahead without. */
const GAME_FONTS = ['18px "ArkPixel"', '18px "Press Start 2P"'];
const FONT_WAIT_MS = 3000;

async function fontsReady(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const loads = GAME_FONTS.map((font) => document.fonts.load(font).catch(() => []));
  await Promise.race([
    Promise.all(loads),
    new Promise<void>((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
  ]);
}

export default function PhaserGame() {
  const gameRef = useRef<PhaserTypes.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    let observer: ResizeObserver | null = null;

    async function initGame() {
      if (!containerRef.current) return;

      const { gameConfig } = await import("./config");
      const Phaser = await import("phaser");
      // Phaser paints text onto a canvas once, when the text is made. If the
      // pixel fonts have not arrived by then the first scene's signs are
      // painted in the fallback face — a different size from every scene
      // after it. So wait for them, briefly, before the first scene starts.
      await fontsReady();

      if (!mounted) return;

      const game = new Phaser.Game({
        ...gameConfig,
        parent: containerRef.current,
      });
      gameRef.current = game;

      // Phaser only checks its parent's size twice a second, which is a
      // visible lag while the column is being dragged or sliding. Watching
      // the container puts the canvas on the same frame as the stage.
      let lastWidth = 0;
      let lastHeight = 0;
      let pending: { width: number; height: number } | null = null;

      observer = new ResizeObserver(([entry]) => {
        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);
        // A drag fires this on every frame with sub-pixel differences, and
        // each call rebuilds the WebGL framebuffer. Only act on real changes.
        if (width <= 0 || height <= 0) return;
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width;
        lastHeight = height;
        pending = { width, height };
      });
      observer.observe(containerRef.current);

      /*
        Taken up at the head of Phaser's own step, not in the observer, and
        that is the whole of why the office does not go black while the
        column moves.

        Resizing a WebGL canvas clears its drawing buffer, and resize
        observations are broadcast *after* the frame's animation callbacks
        and before it is painted — so a refresh done where it is noticed
        lands after Phaser has drawn and throws that frame's picture away.
        One of those is a flicker nobody sees. Sixty a second, which is what
        a drag of the handle is and what the column's slide became, is an
        office that is simply black for as long as it is moving.

        PRE_STEP is the other side of that line: the clear happens first and
        Phaser draws into the fresh buffer in the same frame. It is where
        the scale manager does its own twice-a-second poll, for what is
        presumably the same reason.
      */
      const applyPending = () => {
        if (!pending) return;
        const { width, height } = pending;
        pending = null;
        // In RESIZE mode the scale manager derives the game size from what it
        // believes the parent to be, and it only re-reads that on a window
        // resize or its own twice-a-second poll. A column that slides is
        // neither: the stage reflows and no window event fires — so telling
        // it the parent size directly, and refreshing, is what actually
        // moves the canvas.
        game.scale.setParentSize(width, height);
        game.scale.refresh();
        log.debug(`canvas -> ${width}x${height}`);
      };
      game.events.on(Phaser.Core.Events.PRE_STEP, applyPending);
    }

    initGame().catch((err) => {
      log.error("init failed:", err);
    });

    return () => {
      mounted = false;
      observer?.disconnect();
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        imageRendering: "pixelated",
      }}
    />
  );
}
