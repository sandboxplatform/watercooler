"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GitBranch, RefreshCw, X } from "lucide-react";
import FullscreenButton, { useFullscreen } from "./FullscreenButton";
import { usePanel } from "@/lib/hooks/usePanel";
import { createLogger } from "@/lib/logger";
import { currentRoom } from "@/lib/room-client";
import { flowBars, flowFigure, type Flow } from "@/lib/trello/flow";
import { PULSE_REFRESH_MS } from "@/lib/constants";

const log = createLogger("ProjectFlow");

interface Answer {
  configured?: boolean;
  counts?: boolean;
  flow?: Flow;
  error?: string;
}

/**
 * The stage counts, in words and at a readable size.
 *
 * The board on the wall is the thing you walk in and glance at, and it is
 * drawn in the room at the room's scale — which on a phone is about half
 * size. This is the same five numbers with the stage names spelled out, the
 * board they were counted off, and the lists on it that nobody is counting:
 * the answer to "what does WIP mean" and the answer to "I cannot read
 * that", in one place.
 *
 * A window onto the board and only that. Nothing here moves a card.
 */
export default function ProjectFlow() {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(overlayRef);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // The room is read as it loads rather than at mount: riding the lift
      // changes rooms without rebuilding the HUD.
      const room = encodeURIComponent(currentRoom());
      const response = await fetch(`/api/trello/flow?room=${room}`, { cache: "no-store" });
      setAnswer((await response.json()) as Answer);
    } catch (err) {
      log.warn("could not count the board:", (err as Error).message);
      setAnswer({ configured: true, counts: true, error: "The board could not be reached." });
    } finally {
      setLoading(false);
    }
  }, []);

  const { open, close } = usePanel("project-flow", { onOpen: () => void load() });

  // While it is up, keep the counts current — on the same beat the board
  // behind it uses.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void load(), PULSE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [open, load]);

  if (!open) return null;

  const flow = answer?.flow;
  const bars = flow ? flowBars(flow) : null;

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
      aria-label="Project numbers"
    >
      <div className="pixel-panel board-panel pulse-panel">
        <div className="pinball-head arcade-head">
          <span className="arcade-head__title">
            <GitBranch size={11} aria-hidden /> Project numbers
          </span>
          <span className="arcade-head__buttons">
            <button
              type="button"
              className="pixel-icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={() => void load()}
              title="Count the board again"
              aria-label="Refresh the counts"
            >
              <RefreshCw size={12} className={loading ? "board-spin" : undefined} />
            </button>
            <FullscreenButton control={fullscreen} what="the numbers" />
            <button
              type="button"
              className="pixel-icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={close}
              title="Close (Esc)"
              aria-label="Close the numbers"
            >
              <X size={12} />
            </button>
          </span>
        </div>

        <div className="board-body pulse-body">
          {answer?.counts === false ? (
            <div className="board-note">
              <p className="board-note__lead">Nothing is counted on this wall.</p>
              <p>
                The stage counts hang beside a building&rsquo;s project board, and which stages they
                are is that building&rsquo;s own — see <code>flow</code> in{" "}
                <code>lib/world/tenants.ts</code>.
              </p>
            </div>
          ) : answer?.configured === false ? (
            <div className="board-note">
              <p className="board-note__lead">No Trello board is connected yet.</p>
              <p>
                The counts come off the same board as the cards beside them, so they need the same
                two values in <code>.env.local</code>. The project board explains where to get them.
              </p>
            </div>
          ) : answer?.error ? (
            <div className="board-note">
              <p className="board-note__lead">{answer.error}</p>
              <button type="button" className="pixel-button" onClick={() => void load()}>
                Try again
              </button>
            </div>
          ) : flow && bars ? (
            <>
              <section className="pulse-bank">
                <h3 className="pulse-bank__head">
                  <span className="pulse-bank__name">Standing right now</span>
                  <span className="pulse-bank__aside">
                    {flow.total} card{flow.total === 1 ? "" : "s"} in flight ·{" "}
                    {flow.url ? (
                      <a href={flow.url} target="_blank" rel="noreferrer">
                        {flow.board}
                      </a>
                    ) : (
                      flow.board
                    )}
                  </span>
                </h3>
                <div className="pulse-grid pulse-grid--flow">
                  {flow.lanes.map((lane) => (
                    <article
                      key={lane.id}
                      className="pulse-tile"
                      style={{ ["--pulse-colour" as string]: lane.colour }}
                    >
                      <span className="pulse-tile__label">{lane.name}</span>
                      <span className="pulse-tile__figure">{flowFigure(lane)}</span>
                      <span className="pulse-tile__track">
                        <span
                          className="pulse-tile__bar"
                          style={{ width: `${Math.round(bars[lane.id] * 100)}%` }}
                        />
                      </span>
                      <span className="pulse-tile__note">
                        {/*
                         * "the <name> list", not "in <name>" — half these
                         * stages are called "In something", and the short
                         * way round reads "standing in In Review".
                         */}
                        {lane.missing
                          ? "No list of that name is on the board"
                          : `Cards standing in the ${lane.name} list`}
                      </span>
                    </article>
                  ))}
                </div>
              </section>
              <p className="pulse-legend">
                Each bar is that stage&rsquo;s share of the work in flight, so the five compare with
                each other. Nothing here is a percentage of the whole board.
                {flow.others.length > 0 && (
                  <>
                    {" "}
                    Not counted:{" "}
                    {flow.others.map((other) => `${other.name} (${other.count})`).join(", ")}.
                  </>
                )}
              </p>
            </>
          ) : (
            <div className="board-note">
              <p className="board-note__lead">
                {loading ? "Counting the board…" : "Nothing counted yet."}
              </p>
            </div>
          )}
        </div>

        <div className="board-foot">
          <span>Read-only · nothing here moves a card</span>
        </div>
      </div>
    </div>
  );
}
