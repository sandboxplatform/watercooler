"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Headset, RefreshCw, User, X } from "lucide-react";
import FullscreenButton, { useFullscreen } from "./FullscreenButton";
import { gameEvents } from "@/lib/events";
import { createLogger } from "@/lib/logger";
import { PRIORITY_COLOURS, type DeskTicket, type DeskView } from "@/lib/zoho/tickets";

const log = createLogger("HelpDesk");

/** Matches the server's hold on the queue, so a refresh is never wasted. */
const REFRESH_MS = 30_000;

interface Answer {
  configured?: boolean;
  desk?: DeskView;
  departments?: { id: string; name: string }[];
  error?: string;
}

function dueLabel(due: string): string {
  const at = new Date(due);
  if (Number.isNaN(at.getTime())) return "";
  const today = new Date();
  const sameDay =
    at.getDate() === today.getDate() &&
    at.getMonth() === today.getMonth() &&
    at.getFullYear() === today.getFullYear();
  return sameDay
    ? at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : at.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function Ticket({ ticket }: { ticket: DeskTicket }) {
  return (
    <article className="board-card desk-ticket">
      <div className="desk-ticket__top">
        <span
          className="desk-priority"
          style={{ background: PRIORITY_COLOURS[ticket.priority] }}
          title={ticket.priority === "none" ? "No priority" : ticket.priority}
        />
        <span className="desk-ticket__number">{ticket.number}</span>
        {ticket.channel && <span className="desk-ticket__channel">{ticket.channel}</span>}
      </div>
      <div className="board-card__title">{ticket.subject}</div>
      <div className="board-card__meta">
        {ticket.due && (
          <span className={`board-due board-due--${ticket.dueState}`}>
            <Clock size={8} aria-hidden />
            {dueLabel(ticket.due)}
          </span>
        )}
        {ticket.contact && (
          <span className="board-chip" title="Who asked">
            <User size={8} aria-hidden />
            {ticket.contact}
          </span>
        )}
        {ticket.assignee ? (
          <span className="board-card__who">
            <span className="board-avatar" title={`With ${ticket.assignee}`}>
              {ticket.assignee
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase() ?? "")
                .join("")}
            </span>
          </span>
        ) : (
          <span className="desk-ticket__unassigned">unassigned</span>
        )}
      </div>
    </article>
  );
}

/**
 * The support queue from Zoho Desk, on the wall of Sandbox ERP's third
 * floor beside the project board.
 *
 * A window onto the desk, and only that: nothing here replies to a ticket
 * or changes one. The server holds the credentials and the answer for half
 * a minute, so a floor full of people reading it is one request.
 */
export default function HelpDesk() {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(overlayRef);

  const close = useCallback(() => {
    setOpen(false);
    gameEvents.emit("help-desk-closed");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/zoho", { cache: "no-store" });
      setAnswer((await response.json()) as Answer);
    } catch (err) {
      log.warn("could not read the desk:", (err as Error).message);
      setAnswer({ configured: true, error: "The desk could not be reached." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = gameEvents.on("open-help-desk", () => {
      setOpen(true);
      void load();
    });
    if (new URLSearchParams(window.location.search).get("desk") === "1") {
      gameEvents.emit("open-help-desk");
    }
    return unsubscribe;
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  if (!open) return null;

  const desk = answer?.desk;

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
      aria-label="Help desk"
    >
      <div className="pixel-panel board-panel">
        <div className="pinball-head arcade-head">
          <span className="arcade-head__title">
            <Headset size={11} aria-hidden /> Help desk
          </span>
          <span className="arcade-head__buttons">
            {desk && (
              <span className="board-count">
                {desk.openCount} open
                {desk.overdueCount > 0 && (
                  <span className="desk-overdue"> · {desk.overdueCount} overdue</span>
                )}
              </span>
            )}
            <button
              type="button"
              className="pixel-icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={() => void load()}
              title="Read the queue again"
              aria-label="Refresh the queue"
            >
              <RefreshCw size={12} className={loading ? "board-spin" : undefined} />
            </button>
            <FullscreenButton control={fullscreen} what="the help desk" />
            <button
              type="button"
              className="pixel-icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={close}
              title="Close (Esc)"
              aria-label="Close the help desk"
            >
              <X size={12} />
            </button>
          </span>
        </div>

        <div className="board-body">
          {answer?.configured === false ? (
            <div className="board-note">
              <p className="board-note__lead">No Zoho Desk is connected yet.</p>
              <p>
                Zoho uses OAuth, so it needs four values in <code>.env.local</code>, then a server
                restart:
              </p>
              <pre className="board-note__keys">
                ZOHO_CLIENT_ID=…{"\n"}ZOHO_CLIENT_SECRET=…{"\n"}ZOHO_REFRESH_TOKEN=…{"\n"}
                ZOHO_ORG_ID=…{"\n"}ZOHO_REGION=com (or eu, in, com.au, jp){"\n"}
                ZOHO_DEPARTMENT_ID=… (optional)
              </pre>
              <p>
                Make a Self Client in Zoho&rsquo;s API console, generate a code for the scope
                <code> Desk.tickets.READ,Desk.basic.READ</code>, and trade it once for a refresh
                token. The README has the steps.
              </p>
            </div>
          ) : answer?.error ? (
            <div className="board-note">
              <p className="board-note__lead">{answer.error}</p>
              <button type="button" className="pixel-button" onClick={() => void load()}>
                Try again
              </button>
            </div>
          ) : desk ? (
            desk.columns.length === 0 ? (
              <div className="board-note">
                <p className="board-note__lead">Nothing in the queue.</p>
                <p>Either the desk is quiet, or this department has no tickets.</p>
              </div>
            ) : (
              <div className="board-columns">
                {desk.columns.map((column) => (
                  <section
                    key={column.name}
                    className={`board-column${column.closed ? " board-column--closed" : ""}`}
                  >
                    <header className="board-column__head">
                      <span className="board-column__name">{column.name}</span>
                      <span className="board-column__count">{column.tickets.length}</span>
                    </header>
                    <div className="board-column__cards">
                      {column.tickets.map((ticket) => (
                        <Ticket key={ticket.id} ticket={ticket} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )
          ) : (
            <div className="board-note">
              <p className="board-note__lead">{loading ? "Reading the queue…" : "No queue yet."}</p>
            </div>
          )}
        </div>

        <div className="board-foot">
          <span>Read-only · nothing here answers or changes a ticket</span>
          {desk && <span>{desk.ticketCount} shown</span>}
        </div>
      </div>
    </div>
  );
}
