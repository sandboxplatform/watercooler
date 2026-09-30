"use client";

import type { ComponentProps } from "react";
import { PAD_OWN_ATTR } from "@/lib/gamepad/dialogs";

type PanelOverlayProps = Omit<ComponentProps<"div">, "onClick" | "role" | "aria-label"> & {
  /** What the dialog is called, for a screen reader. */
  label: string;
  onClose: () => void;
  /** The panel reads the controller itself, so the HUD's own pad driver stands aside. */
  padOwn?: boolean;
};

/** A touch screen, where the edge of the screen is where a hand rests. */
const coarse = () => window.matchMedia("(pointer: coarse)").matches;

/**
 * The dark backdrop behind a fixture's panel, and the one rule about it.
 *
 * With a mouse, clicking beside the panel leaves. With a finger that is
 * where a thumb rests while playing — a flipper, a bat — so on a touch
 * screen the X is the way out and the edge of the screen is not a trapdoor.
 * Nine panels wrote that handler out for themselves.
 */
export default function PanelOverlay({
  label,
  onClose,
  padOwn = false,
  children,
  ...rest
}: PanelOverlayProps) {
  return (
    <div
      {...rest}
      role="dialog"
      aria-label={label}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        if (coarse()) return;
        onClose();
      }}
      {...(padOwn ? { [PAD_OWN_ATTR]: "" } : {})}
    >
      {children}
    </div>
  );
}
