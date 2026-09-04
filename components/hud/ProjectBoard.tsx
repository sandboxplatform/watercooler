"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckSquare, Clock, MessageSquare, Paperclip, RefreshCw, Text, X } from "lucide-react";
import FullscreenButton, { useFullscreen } from "./FullscreenButton";
import { gameEvents } from "@/lib/events";
import { createLogger } from "@/lib/logger";
import type { BoardCard, BoardSummary, BoardView } from "@/lib/trello/board";

const log = createLogger("ProjectBoard");

/** Matches the server's hold on the board, so a refresh is never wasted. */
const REFRESH_MS = 30_000;
const PICKED_BOARD = "watercooler:board";

interface Answer {
  configured?: boolean;
  board?: BoardView;
  boards?: BoardSummary[];
  error?: string;
  fetchedAt?: number;
}

/** "Tue 9 Sep", or the time when it is today. */
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

function Card({ card }: { card: BoardCard }) {
  const badges = card.comments + card.attachments + (card.hasDescription ? 1 : 0);
  return (
    <article className="board-card">
      {card.labels.length > 0 && (
        <div className="board-card__labels">
          {card.labels.map((label, i) => (
            <span
              key={`${label.name}-${i}`}
              className="board-card__label"
              style={{ background: label.colour }}
              title={label.name || "Label"}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}
      <div className="board-card__title">{card.title}</div>
      {(card.due || card.checklist || badges > 0 || card.members.length > 0) && (
        <div className="board-card__meta">
          {card.due && (
            <span className={`board-due board-due--${card.dueState}`}>
              <Clock size={8} aria-hidden />
              {dueLabel(card.due)}
            </span>
          )}
          {card.checklist && (
            <span
              className={`board-chip${
                card.checklist.done === card.checklist.total ? " board-chip--done" : ""
              }`}
            >
              <CheckSquare size={8} aria-hidden />
              {card.checklist.done}/{card.checklist.total}
            </span>
          )}
          {card.hasDescription && (
            <span className="board-chip" title="Has a description">
              <Text size={8} aria-hidden />
            </span>
          )}
          {card.comments > 0 && (
            <span className="board-chip">
              <MessageSquare size={8} aria-hidden />
              {card.comments}
            </span>
          )}
          {card.attachments > 0 && (
            <span className="board-chip">
              <Paperclip size={8} aria-hidden />
              {card.attachments}
            </span>
          )}
          <span className="board-card__who">
            {card.members.map((initials) => (
              <span key={initials} className="board-avatar" title={initials}>
                {initials}
              </span>
            ))}
          </span>
        </div>
      )}
    </article>
  );
}

/**
 * The team's Trello board, on the wall of Sandbox ERP's third floor.
 *
 * A window onto the board, and only that: nothing here writes back, so
 * what is on the wall is what is on Trello a moment ago. The server holds
 * the credentials and the answer for half a minute, so a floor full of
 * people reading it is one request.
 */
export default function ProjectBoard() {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(overlayRef);

  const close = useCallback(() => {
    setOpen(false);
    gameEvents.emit("project-board-closed");
  }, []);

  const load = useCallback(async (boardId: string | null) => {
    setLoading(true);
    try {
      const query = boardId ? `?board=${encodeURIComponent(boardId)}` : "";
      const response = await fetch(`/api/trello${query}`, { cache: "no-store" });
      const body = (await response.json()) as Answer;
      setAnswer(body);
    } catch (err) {
      log.warn("could not read the board:", (err as Error).message);
      setAnswer({ configured: true, error: "The board could not be reached." });
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Opening: the scene says when somebody walks up to the board ──
  useEffect(() => {
    const unsubscribe = gameEvents.on("open-project-board", () => {
      let remembered: string | null = null;
      try {
        remembered = localStorage.getItem(PICKED_BOARD);
      } catch {
        // Storage off: the board is picked again each time.
      }
      setPicked(remembered);
      setOpen(true);
      void load(remembered);
    });
    if (new URLSearchParams(window.location.search).get("board") === "1") {
      gameEvents.emit("open-project-board");
    }
    return unsubscribe;
  }, [load]);

  // While it is on the wall, keep it current.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void load(picked), REFRESH_MS);
    return () => clearInterval(timer);
  }, [open, picked, load]);

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

  const choose = (id: string) => {
    try {
      localStorage.setItem(PICKED_BOARD, id);
    } catch {
      // As above.
    }
    setPicked(id);
    void load(id);
  };

  if (!open) return null;

  const board = answer?.board;
  const boards = answer?.boards ?? [];

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
      aria-label="Project board"
    >
      <div className="pixel-panel board-panel">
        <div className="pinball-head arcade-head">
          <span className="arcade-head__title">{board ? board.name : "Project board"}</span>
          <span className="arcade-head__buttons">
            {board && (
              <span className="board-count">
                {board.cardCount} card{board.cardCount === 1 ? "" : "s"}
              </span>
            )}
            <button
              type="button"
              className="pixel-icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={() => void load(picked)}
              title="Read the board again"
              aria-label="Refresh the board"
            >
              <RefreshCw size={12} className={loading ? "board-spin" : undefined} />
            </button>
            <FullscreenButton control={fullscreen} what="the board" />
            <button
              type="button"
              className="pixel-icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={close}
              title="Close (Esc)"
              aria-label="Close the project board"
            >
              <X size={12} />
            </button>
          </span>
        </div>

        <div className="board-body">
          {answer?.configured === false ? (
            <div className="board-note">
              <p className="board-note__lead">No Trello board is connected yet.</p>
              <p>
                Add a Trello API key and token to <code>.env.local</code>, then restart the server:
              </p>
              <pre className="board-note__keys">
                TRELLO_API_KEY=…{"\n"}TRELLO_TOKEN=…{"\n"}TRELLO_BOARD_ID=… (optional)
              </pre>
              <p>
                The key comes from Trello&rsquo;s developer portal and the token is generated from
                it. Leave the board id out and this wall will offer every board the token can see.
              </p>
            </div>
          ) : answer?.error ? (
            <div className="board-note">
              <p className="board-note__lead">{answer.error}</p>
              <button type="button" className="pixel-button" onClick={() => void load(picked)}>
                Try again
              </button>
            </div>
          ) : board ? (
            <div className="board-columns">
              {board.columns.length === 0 ? (
                <div className="board-note">
                  <p className="board-note__lead">This board has no lists yet.</p>
                </div>
              ) : (
                board.columns.map((column) => (
                  <section key={column.id} className="board-column">
                    <header className="board-column__head">
                      <span className="board-column__name">{column.name}</span>
                      <span className="board-column__count">{column.cards.length}</span>
                    </header>
                    <div className="board-column__cards">
                      {column.cards.length === 0 ? (
                        <p className="board-column__empty">Nothing here</p>
                      ) : (
                        column.cards.map((card) => <Card key={card.id} card={card} />)
                      )}
                    </div>
                  </section>
                ))
              )}
            </div>
          ) : boards.length > 0 ? (
            <div className="board-note">
              <p className="board-note__lead">Which board should hang on this wall?</p>
              <div className="board-picker">
                {boards.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="pixel-button board-picker__item"
                    onClick={() => choose(option.id)}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
              <p>
                Remembered in this browser. Set <code>TRELLO_BOARD_ID</code> to fix it for everyone.
              </p>
            </div>
          ) : (
            <div className="board-note">
              <p className="board-note__lead">
                {loading ? "Reading the board…" : "No boards found."}
              </p>
            </div>
          )}
        </div>

        <div className="board-foot">
          <span>Read-only · nothing here changes Trello</span>
          {boards.length > 1 && board && (
            <button
              type="button"
              className="board-foot__switch"
              onClick={() => setAnswer({ configured: true, boards })}
            >
              Another board
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
