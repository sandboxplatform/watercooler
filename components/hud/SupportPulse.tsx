"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, RefreshCw, X } from "lucide-react";
import FullscreenButton, { useFullscreen } from "./FullscreenButton";
import { usePanel } from "@/lib/hooks/usePanel";
import { createLogger } from "@/lib/logger";
import { PULSE_METRICS, pulseBars, pulseFigure, type Pulse } from "@/lib/zoho/pulse";
import { PULSE_REFRESH_MS } from "@/lib/constants";

const log = createLogger("SupportPulse");

interface Answer {
  configured?: boolean;
  pulse?: Pulse;
  error?: string;
}

/**
 * The two groups, and what each says for itself.
 *
 * The wall splits the five the same way, one bank above the other, because
 * the split is what makes the bars mean anything: three numbers that are
 * standing there right now, and two that are a day's traffic. Naming the
 * groups here saves the paragraph that used to have to explain which three
 * were which.
 */
const BANKS = [
  {
    bank: "standing" as const,
    name: "Standing right now",
    aside: (pulse: Pulse) => `${pulse.statuses.join(" · ")} on the desk`,
  },
  {
    bank: "today" as const,
    name: "Today",
    aside: (pulse: Pulse) => `since ${sinceLabel(pulse.since)}`,
  },
];

/** "since midnight" is only true if you know which midnight. */
function sinceLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The five counts on Support's wall, in words and at a readable size.
 *
 * The board itself is the thing you walk in and glance at, and it is drawn
 * in the room at the room's scale — which on a phone is about half size.
 * This is the same five numbers with the headings spelled out, what each
 * one counts, and which midnight "today" is measured from: the answer to
 * "what does WIP mean" and the answer to "I cannot read that", in one
 * place.
 *
 * A window onto the desk and only that. Nothing here answers a ticket.
 */
export default function SupportPulse() {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(overlayRef);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/zoho/pulse", { cache: "no-store" });
      setAnswer((await response.json()) as Answer);
    } catch (err) {
      log.warn("could not count the desk:", (err as Error).message);
      setAnswer({ configured: true, error: "The desk could not be reached." });
    } finally {
      setLoading(false);
    }
  }, []);

  const { open, close } = usePanel("support-pulse", { onOpen: () => void load() });

  // While it is up, keep the counts current — on the same beat the wall
  // behind it uses, which is the beat the server holds them for.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void load(), PULSE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [open, load]);

  if (!open) return null;

  const pulse = answer?.pulse;
  const bars = pulse ? pulseBars(pulse.counts) : null;

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
      aria-label="Support numbers"
    >
      <div className="pixel-panel board-panel pulse-panel">
        <div className="pinball-head arcade-head">
          <span className="arcade-head__title">
            <Activity size={11} aria-hidden /> Support numbers
          </span>
          <span className="arcade-head__buttons">
            <button
              type="button"
              className="pixel-icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={() => void load()}
              title="Count the desk again"
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
          {answer?.configured === false ? (
            <div className="board-note">
              <p className="board-note__lead">No Zoho Desk is connected yet.</p>
              <p>
                The counts come off the same desk as the queue next to them, so they need the same
                four values in <code>.env.local</code>. The help desk board explains where to get
                them.
              </p>
            </div>
          ) : answer?.error ? (
            <div className="board-note">
              <p className="board-note__lead">{answer.error}</p>
              <button type="button" className="pixel-button" onClick={() => void load()}>
                Try again
              </button>
            </div>
          ) : pulse && bars ? (
            <>
              {BANKS.map((bank) => (
                <section key={bank.bank} className="pulse-bank">
                  <h3 className="pulse-bank__head">
                    <span className="pulse-bank__name">{bank.name}</span>
                    <span className="pulse-bank__aside">{bank.aside(pulse)}</span>
                  </h3>
                  <div className={`pulse-grid pulse-grid--${bank.bank}`}>
                    {PULSE_METRICS.filter((metric) => metric.bank === bank.bank).map((metric) => {
                      const capped = pulse.capped.includes(metric.id);
                      return (
                        <article
                          key={metric.id}
                          className="pulse-tile"
                          style={{ ["--pulse-colour" as string]: metric.colour }}
                        >
                          <span className="pulse-tile__label">{metric.label}</span>
                          <span className="pulse-tile__figure">
                            {pulseFigure(pulse.counts[metric.id], capped)}
                          </span>
                          <span className="pulse-tile__track">
                            <span
                              className="pulse-tile__bar"
                              style={{ width: `${Math.round(bars[metric.id] * 100)}%` }}
                            />
                          </span>
                          <span className="pulse-tile__note">{metric.note}</span>
                          {capped && (
                            <span className="pulse-tile__capped">
                              More than we counted — a floor, not a total
                            </span>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
              <p className="pulse-legend">
                Each bar is that number&rsquo;s share of its own group, so the three above compare
                with each other and the two below compare with each other. Nothing here is a
                percentage of anything else.
              </p>
            </>
          ) : (
            <div className="board-note">
              <p className="board-note__lead">
                {loading ? "Counting the desk…" : "Nothing counted yet."}
              </p>
            </div>
          )}
        </div>

        <div className="board-foot">
          <span>Read-only · nothing here answers or changes a ticket</span>
        </div>
      </div>
    </div>
  );
}
