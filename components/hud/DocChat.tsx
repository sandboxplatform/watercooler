"use client";

import { useEffect, useRef, useState } from "react";
import { MessagesSquare, X } from "lucide-react";

import { usePanel } from "@/lib/hooks/usePanel";
import PanelOverlay from "./PanelOverlay";
import { docConversation, docToken } from "@/lib/mettara-client";
import { embedIdOf, METTARA_ORIGIN } from "@/lib/mettara";

import FullscreenButton, { useFullscreen } from "./FullscreenButton";

/**
 * Doc's conversation, from walking up to him and pressing E.
 *
 * The one window in this app onto somebody else's site. Everything else in
 * the HUD is drawn here out of what the server hands over; this is
 * Mettara's embed in a frame, signed in by a token this server asked
 * Mettara for, and nothing on this side reads a word of it.
 *
 * Three things follow from it being a frame:
 *
 * - **It can be refused, and from the far end.** A site says who may embed
 *   it (`X-Frame-Options`, `frame-ancestors`), and a refusal is a blank
 *   rectangle with a line in the console — there is no event to catch and
 *   nothing to show instead. The matching half on this side is `frame-src`
 *   in `next.config.ts`, which names `METTARA_ORIGIN` for exactly this.
 * - **The token rides in the fragment.** Mettara's embed reads `#token=`
 *   on load and wipes it off its own address. A fragment never leaves the
 *   browser, so the token is in no request and no log on the way there.
 * - **It goes when the panel goes.** Closed, the frame is unmounted rather
 *   than hidden, so a third party's page is not left running and connected
 *   behind the office for the rest of the session. The cost is that
 *   pressing E again loads the conversation afresh, with a fresh token,
 *   which is the right way round: a page nobody is looking at should not be
 *   a page still open.
 */
export default function DocChat() {
  /**
   * Which conversation, if it is ours to open.
   *
   * It usually arrives on the open event, because the scene had to ask the
   * server before it would show a prompt at all — so by the time E is
   * pressed the answer is already in hand. `?doc=1` names nothing, so that
   * path asks for itself.
   */
  const [url, setUrl] = useState<string | null>(null);
  /** What the frame signs in with; "failed" when the server could not get one. */
  const [token, setToken] = useState<string | "failed" | null>(null);
  /**
   * Which opening an answer belongs to. A token that lands after the panel
   * was shut and opened again is the first opening's, and must not settle
   * the second one's "connecting" as a failure or a success.
   */
  const opening = useRef(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(overlayRef);

  const { open, close } = usePanel("doc-chat", {
    onOpen: (subject) => {
      const mine = ++opening.current;
      setUrl(subject);
      setToken(null);
      if (!subject) void docConversation().then((u) => mine === opening.current && setUrl(u));
      void docToken().then((t) => mine === opening.current && setToken(t ?? "failed"));
    },
  });

  // A few minutes before a token runs out the embed asks its parent for
  // another. Answered by message rather than by a new `src`, which would
  // reload the conversation from the top under whoever is reading it. The
  // embed's id is read off the URL the server built, so the frame and this
  // side cannot have been told two different ones.
  const embedId = url ? embedIdOf(url) : null;
  useEffect(() => {
    if (!open || !embedId) return;
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow;
      if (!frame || event.source !== frame || event.origin !== METTARA_ORIGIN) return;
      const data: unknown = event.data;
      if (typeof data !== "object" || data === null) return;
      const { type, embedId: theirs } = data as { type?: unknown; embedId?: unknown };
      if (type !== "architech:token-refresh-needed" || theirs !== embedId) return;
      void docToken().then((fresh) => {
        if (!fresh) return;
        frame.postMessage(
          { type: "architech:token-refresh", embedId, token: fresh },
          METTARA_ORIGIN,
        );
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, embedId]);

  if (!open) return null;

  const signedIn = url && token && token !== "failed";

  return (
    <PanelOverlay
      ref={overlayRef}
      className="pinball-overlay board-overlay"
      label="Doc"
      onClose={close}
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
          {signedIn ? (
            <iframe
              ref={frameRef}
              src={`${url}#token=${encodeURIComponent(token)}`}
              title="Doc's conversation on Mettara"
              className="doc-frame"
            />
          ) : token === "failed" && !url ? (
            // `?doc=1` from somebody he is not hooked up for: the same no
            // the missing prompt over his head is, said in a window.
            <div className="board-note">
              <p className="board-note__lead">Doc has nothing to say just now.</p>
            </div>
          ) : token === "failed" ? (
            <div className="board-note">
              <p className="board-note__lead">Doc could not get through to Mettara.</p>
              <p>Close this and press E again in a moment.</p>
            </div>
          ) : (
            <div className="board-note">
              <p className="board-note__lead">Doc is getting the conversation up…</p>
            </div>
          )}
        </div>

        <div className="board-foot">
          <span>Mettara, in a window · nothing here is read by the office</span>
        </div>
      </div>
    </PanelOverlay>
  );
}
