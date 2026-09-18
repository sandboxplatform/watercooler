"use client";

import Image from "next/image";
import MusicControls from "./MusicControls";
import LockButton from "./LockButton";
import { asset } from "@/lib/assets";
import { useBgm } from "@/lib/useBgm";

interface SidebarFooterProps {
  /** Whether the volume slider is up. Held by the page, so a controller can reach it. */
  musicOpen: boolean;
  onToggleMusic: () => void;
}

/**
 * The foot of the column: the music, and the door.
 *
 * Both used to sit in the top-right corner of the office, where they were
 * on screen the whole time — two buttons nobody presses twice a session,
 * pinned over the one thing you came here to look at. They belong with the
 * column, which is the part of the HUD you open when you want the app
 * rather than the world: open it and they are there, close it and they are
 * not.
 *
 * The slider is a popover rather than a row of its own, because the footer
 * is a strip and a volume slider is the rarer of the two things in it.
 */
export default function SidebarFooter({ musicOpen, onToggleMusic }: SidebarFooterProps) {
  const bgm = useBgm();
  // Muted is a state of the music, not of the button, so it wins over open:
  // a volume of nothing has to read as nothing whether or not the slider is up.
  const icon =
    bgm.volume <= 0
      ? asset("/ui/icons/icon-music-muted.png")
      : musicOpen
        ? asset("/ui/icons/icon-music-active.png")
        : asset("/ui/icons/icon-music.png");

  return (
    <div className="app-sidebar__footer">
      {musicOpen && (
        <div className="hud-music-flyout">
          <MusicControls bgm={bgm} />
        </div>
      )}
      <button
        type="button"
        data-dock-id="music"
        className={`topbar-tool-btn ${musicOpen ? "topbar-tool-btn--active" : ""}`}
        onClick={onToggleMusic}
        title={bgm.volume <= 0 ? "Music — off" : `Music — ${Math.round(bgm.volume * 100)}%`}
        aria-label="Music volume"
        aria-pressed={musicOpen}
      >
        <Image
          src={icon}
          alt=""
          width={24}
          height={24}
          style={{ imageRendering: "pixelated", display: "block" }}
          unoptimized
        />
      </button>
      {/* The door, last in the row: the one button that takes you out of the world. */}
      <LockButton />
    </div>
  );
}
