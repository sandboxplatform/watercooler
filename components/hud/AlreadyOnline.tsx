"use client";

import "./character-studio.css";
import "./world-ui.css";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { gameEvents } from "@/lib/events";

/**
 * "You are already online somewhere else."
 *
 * One person holds one session, so a second window onto the same code is
 * refused at the door and the socket stands down for good. Without this it
 * stands down silently: the world draws, nobody is in it — not even the
 * person looking at it — and nothing anywhere says why. That reads as the
 * app being broken rather than as the rule working.
 *
 * It covers the screen and offers one way on, which is to take the place
 * back: reloading asks again, and by then the window that had it may have
 * gone. Nothing else can be done from here, so nothing else is offered.
 */
export default function AlreadyOnline() {
  const [refused, setRefused] = useState(false);

  useEffect(() => gameEvents.on("presence-refused", () => setRefused(true)), []);

  if (!refused || typeof document === "undefined") return null;

  return createPortal(
    <div className="studio-overlay">
      <div className="welcome" role="alertdialog" aria-label="Already online">
        <header>
          <h2 className="welcome__title">Already online</h2>
          <p className="welcome__lead">
            You are in the world in another window or on another device. One person walks about as
            one person, so this one has been left at the door.
          </p>
        </header>
        <p className="welcome__hint welcome__hint--block">
          Close the other window, then reload this one to take your place back.
        </p>
        <footer className="welcome__actions">
          <button
            type="button"
            className="pixel-button pixel-button--primary"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
