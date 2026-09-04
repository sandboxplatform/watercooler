#!/usr/bin/env node
/**
 * Boards MCP server — what the office is working on, for the agents.
 *
 * The two boards on Sandbox ERP's third floor: the Trello project board and
 * the Zoho Desk support queue. An agent asked "what is on the board?" or
 * "any urgent tickets?" can answer from the same wall a person reads,
 * rather than guessing or being told.
 *
 * Read-only, and it cannot be otherwise: the tools here only ask, and the
 * endpoint behind them only reads. Nothing an agent does can move a card or
 * answer a ticket.
 *
 * Credentials stay in the office server. This process holds none: it asks
 * `/api/internal/boards` over the loopback with the same shared secret the
 * dispatch tool uses, and that endpoint owns the keys and the cache.
 *
 * Protocol: JSON-RPC 2.0 over stdin/stdout (MCP stdio transport).
 */

import { createInterface } from "node:readline";

const BOARDS_URL = `http://127.0.0.1:${process.env.WATERCOOLER_PORT ?? 3000}/api/internal/boards`;
const SECRET = process.env.WATERCOOLER_DISPATCH_SECRET ?? "";

/** A wall of cards is cheap to read and expensive to print; keep it short. */
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_CHARS = 12000;

// ── Reading the wall ───────────────────────────────────

async function ask(what, board) {
  const query = board ? `&board=${encodeURIComponent(board)}` : "";
  const response = await fetch(`${BOARDS_URL}?what=${what}${query}`, {
    headers: SECRET ? { "x-dispatch-secret": SECRET } : {},
  });
  if (!response.ok) {
    throw new Error(`the office server answered ${response.status} for the ${what}`);
  }
  return response.json();
}

// ── Choosing what to show (pure, so it can be tested) ──

const matches = (haystack, needle) =>
  !needle ||
  String(haystack ?? "")
    .toLowerCase()
    .includes(needle.toLowerCase());

const sameName = (a, b) =>
  !b ||
  String(a ?? "")
    .trim()
    .toLowerCase() === b.trim().toLowerCase();

export function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/** Cards from the board, narrowed by column, label or a word in the title. */
export function filterCards(board, { column, label, query } = {}) {
  const out = [];
  for (const col of board?.columns ?? []) {
    if (!sameName(col.name, column)) continue;
    for (const card of col.cards) {
      if (!matches(card.title, query)) continue;
      if (label && !card.labels.some((l) => sameName(l.name, label))) continue;
      out.push({ ...card, column: col.name });
    }
  }
  return out;
}

/** Tickets from the queue, narrowed by status, priority, who has it, or a word. */
export function filterTickets(desk, { status, priority, assignee, query, openOnly } = {}) {
  const out = [];
  for (const col of desk?.columns ?? []) {
    if (!sameName(col.name, status)) continue;
    if (openOnly && col.closed) continue;
    for (const ticket of col.tickets) {
      if (!matches(ticket.subject, query)) continue;
      if (priority && !sameName(ticket.priority, priority)) continue;
      if (assignee && !matches(ticket.assignee, assignee)) continue;
      out.push(ticket);
    }
  }
  return out;
}

// ── Saying what is there ───────────────────────────────

function cap(text) {
  return text.length > MAX_CHARS
    ? `${text.slice(0, MAX_CHARS)}\n… truncated. Narrow it with a column, label, status or search word.`
    : text;
}

export function describeBoard(answer) {
  if (answer.configured === false) return "No Trello board is connected to this office.";
  if (answer.error) return `The board could not be read: ${answer.error}`;
  const board = answer.board;
  if (!board) {
    const names = (answer.boards ?? []).map((b) => b.name).join(", ");
    return names
      ? `No board is chosen yet. The office can see: ${names}.`
      : "No board is chosen, and none are visible.";
  }
  const lines = board.columns.map((c) => `  ${c.name}: ${c.cards.length}`);
  return `Project board "${board.name}" — ${board.cardCount} cards\n${lines.join("\n")}`;
}

export function renderCards(cards) {
  if (cards.length === 0) return "No cards match.";
  return cap(
    cards
      .map((card) => {
        const bits = [`[${card.column}] ${card.title}`];
        if (card.labels.length)
          bits.push(`labels: ${card.labels.map((l) => l.name || "—").join(", ")}`);
        if (card.members.length) bits.push(`with: ${card.members.join(", ")}`);
        if (card.due)
          bits.push(`due ${card.due}${card.dueState === "overdue" ? " (OVERDUE)" : ""}`);
        if (card.checklist) bits.push(`checklist ${card.checklist.done}/${card.checklist.total}`);
        return `- ${bits.join(" · ")}`;
      })
      .join("\n"),
  );
}

export function describeDesk(answer) {
  if (answer.configured === false) return "No Zoho Desk is connected to this office.";
  if (answer.error) return `The queue could not be read: ${answer.error}`;
  const desk = answer.desk;
  if (!desk) return "The queue is empty.";
  const lines = desk.columns.map(
    (c) => `  ${c.name}: ${c.tickets.length}${c.closed ? " (closed)" : ""}`,
  );
  return `Help desk — ${desk.openCount} open of ${desk.ticketCount}, ${desk.overdueCount} overdue\n${lines.join("\n")}`;
}

export function renderTickets(tickets) {
  if (tickets.length === 0) return "No tickets match.";
  return cap(
    tickets
      .map((t) => {
        const bits = [`${t.number} ${t.subject}`, `status: ${t.status}`, `priority: ${t.priority}`];
        if (t.assignee) bits.push(`with: ${t.assignee}`);
        else bits.push("unassigned");
        if (t.contact) bits.push(`asked by: ${t.contact}`);
        if (t.due) bits.push(`due ${t.due}${t.dueState === "overdue" ? " (OVERDUE)" : ""}`);
        return `- ${bits.join(" · ")}`;
      })
      .join("\n"),
  );
}

// ── The tools ──────────────────────────────────────────

export const TOOLS = [
  {
    name: "board_summary",
    description:
      "The office's Trello project board: its name, its columns and how many cards are in each. Start here before asking for cards.",
    inputSchema: {
      type: "object",
      properties: {
        board: {
          type: "string",
          description: "Which board, by name or id. Defaults to the one the office is looking at.",
        },
      },
      required: [],
    },
  },
  {
    name: "board_cards",
    description:
      "Cards on the project board, with their labels, who they are with, due dates and checklist progress. Narrow with a column name, a label or a search word.",
    inputSchema: {
      type: "object",
      properties: {
        board: {
          type: "string",
          description: "Which board, by name or id. Defaults to the one the office is looking at.",
        },
        column: { type: "string", description: "Only this column, e.g. 'In Progress'" },
        label: { type: "string", description: "Only cards carrying this label" },
        query: { type: "string", description: "Only cards whose title contains this" },
        limit: {
          type: "number",
          description: `How many to return (default ${DEFAULT_LIMIT}, most ${MAX_LIMIT})`,
        },
      },
      required: [],
    },
  },
  {
    name: "desk_summary",
    description:
      "The office's Zoho Desk support queue: how many tickets are open, how many overdue, and how they sit across the statuses.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "desk_tickets",
    description:
      "Support tickets, with their number, status, priority, who they are with and who asked. Narrow by status, priority, assignee or a search word.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Only this status, e.g. 'New'" },
        priority: { type: "string", description: "urgent, high, medium, low or none" },
        assignee: { type: "string", description: "Only tickets with this person" },
        query: { type: "string", description: "Only tickets whose subject contains this" },
        open_only: { type: "boolean", description: "Leave out the closed ones (default true)" },
        limit: {
          type: "number",
          description: `How many to return (default ${DEFAULT_LIMIT}, most ${MAX_LIMIT})`,
        },
      },
      required: [],
    },
  },
];

async function runTool(name, args) {
  switch (name) {
    case "board_summary":
      return describeBoard(await ask("board", args.board));

    case "board_cards": {
      const answer = await ask("board", args.board);
      if (!answer.board) return describeBoard(answer);
      const cards = filterCards(answer.board, args);
      const shown = cards.slice(0, clampLimit(args.limit));
      const more =
        cards.length > shown.length ? `\n… ${cards.length - shown.length} more match.` : "";
      return renderCards(shown) + more;
    }

    case "desk_summary":
      return describeDesk(await ask("desk"));

    case "desk_tickets": {
      const answer = await ask("desk");
      if (!answer.desk) return describeDesk(answer);
      const tickets = filterTickets(answer.desk, {
        ...args,
        openOnly: args.open_only !== false,
      });
      const shown = tickets.slice(0, clampLimit(args.limit));
      const more =
        tickets.length > shown.length ? `\n… ${tickets.length - shown.length} more match.` : "";
      return renderTickets(shown) + more;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ── JSON-RPC plumbing ──────────────────────────────────

function sendResponse(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function sendError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
}

async function handleRequest(req) {
  const { id, method, params } = req;

  switch (method) {
    case "initialize":
      sendResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "boards", version: "1.0.0" },
      });
      break;

    case "notifications/initialized":
      break;

    case "tools/list":
      sendResponse(id, { tools: TOOLS });
      break;

    case "tools/call": {
      const { name, arguments: args } = params ?? {};
      try {
        sendResponse(id, { content: [{ type: "text", text: await runTool(name, args ?? {}) }] });
      } catch (err) {
        sendResponse(id, {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        });
      }
      break;
    }

    default:
      if (id !== undefined) sendError(id, -32601, `Method not found: ${method}`);
  }
}

/** Only listen when run as a server; importing this for tests must not. */
if (process.argv[1] && process.argv[1].endsWith("boards-mcp.mjs")) {
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    try {
      void handleRequest(JSON.parse(line));
    } catch {
      /* ignore malformed input */
    }
  });
}
