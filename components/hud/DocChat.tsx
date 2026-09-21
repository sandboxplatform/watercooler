"use client";

import { useRef, useState } from "react";
import { MessagesSquare, X } from "lucide-react";

import { usePanel } from "@/lib/hooks/usePanel";
import { docConversation } from "@/lib/mettara-client";

import FullscreenButton, { useFullscreen } from "./FullscreenButton";

/**
 * Doc's conversation, from walking up to him and pressing E.
 *
 * The one window in this app onto somebody else's site. Everything else in
 * the HUD is drawn here out of what the server hands over; this is Mettara
 * in a frame, signed in as whoever is signed in to Mettara, and nothing on
 * this side reads a word of it.
 *
 * Two things follow from it being a frame:
 *
 * - **It can be refused, and from the far end.** A site says who may embed
 *   it (`X-Frame-Options`, `frame-ancestors`), and a refusal is a blank
 *   rectangle with a line in the console — there is no event to catch and
 *   nothing to show instead. The matching half on this side is `frame-src`
 *   in `next.config.ts`, which names `METTARA_ORIGIN` for exactly this.
 * - **It goes when the panel goes.** Closed, the frame is unmounted rather
 *   than hidden, so a third party's page is not left running and connected
 *   behind the office for the rest of the session. The cost is that
 *   pressing E again loads the conversation afresh, which is the right way
 *   round: a page nobody is looking at should not be a page still open.
 */
export default function DocChat() {
  /**
   * Which conversation, if it is ours to open.
   *
   * It usually arrives on the open event, because the scene had to ask the
   * server before it would show a prompt at all — so by the time E is
   * pressed the answer is already in hand and the frame starts loading on
   * the first render. `?doc=1` names nothing, so that path asks for itself.
   */
  const [url, setUrl] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(overlayRef);

  const { open, close } = usePanel("doc-chat", {
    onOpen: (subject) => {
      setUrl(subject);
      if (!subject) void docConversation().then(setUrl);
    },
  });

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="pinball-overlay board-overlay"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        if (window.matchMedia("(pointer: coarse)").matches) return;
        close();
      }}
      role="dialog"
      aria-label="Doc"
    >
      <div className="pixel-panel board-panel">
        <div className="pinball-head arcade-head">
          <span className="arcade-head__title">
            <MessagesSquare size={11} aria-hidden /> Doc
          </span>
          <span className="arcade-head__buttons">
            <span className="board-count">Mettara</span>
            <FullscreenButton control={fullscreen} what="the conversation" />
            <button
              type="button"
              className="pixel-icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={close}
              title="Close (Esc)"
              aria-label="Close the conversation"
            >
              <X size={12} />
            </button>
          </span>
        </div>

        <div className="board-body">
          {url ? (
            <iframe src={url} title="Doc's conversation on Mettara" className="doc-frame" />
          ) : (
            <div className="board-note">
              <p className="board-note__lead">Doc has nothing to say just now.</p>
              <p>
                He is hooked up to a conversation on Mettara, and this browser has not been given
                one.
              </p>
            </div>
          )}
        </div>

        <div className="board-foot">
          <span>Mettara, in a window · nothing here is read by the office</span>
        </div>
      </div>
    </div>
  );
}
