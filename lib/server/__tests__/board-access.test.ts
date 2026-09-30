import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mintToken, ACCESS_COOKIE, type AccessIdentity } from "../access";
import { forgetBoards, mayPickBoards, mayReadDesk, mayReadRoomBoards } from "../boards";
import * as trelloRoute from "../../../app/api/trello/route";
import * as flowRoute from "../../../app/api/trello/flow/route";
import * as zohoRoute from "../../../app/api/zoho/route";
import * as pulseRoute from "../../../app/api/zoho/pulse/route";
import * as customersRoute from "../../../app/api/zoho/customers/route";

/**
 * The boards hang on private floors, and what is on them is as private as
 * the floor. The lift refused to carry anybody up while the routes behind
 * the walls answered whoever asked — a visitor with `?desk=1` read the whole
 * support queue, customers and all.
 */

const CODES: Record<string, string> = {
  ACCESS_CODE: "visitor-code-1111",
  ACCESS_CODE_COOP: "coop-code-2222",
  ACCESS_CODE_HUNTER: "hunter-code-3333",
  ACCESS_CODE_NATHAN: "nathan-code-4444",
};
const OTHER = ["TRELLO_API_KEY", "TRELLO_TOKEN", "TRELLO_BOARD_ID", "ZOHO_CLIENT_ID"];
const saved = Object.fromEntries([...Object.keys(CODES), ...OTHER].map((k) => [k, process.env[k]]));

beforeEach(() => {
  Object.assign(process.env, CODES);
  for (const k of OTHER) delete process.env[k];
  forgetBoards();
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});

const ask = (path: string, who: AccessIdentity, init: RequestInit = {}) =>
  new Request(`http://localhost${path}`, {
    ...init,
    headers: { cookie: `${ACCESS_COOKIE}=${mintToken(who)}`, ...(init.headers ?? {}) },
  });

describe("who may read what hangs on an Operations floor", () => {
  it("lets the desk be read by whoever rides Sandbox ERP's lift, and nobody else", () => {
    expect(mayReadDesk("coop")).toBe(true);
    expect(mayReadDesk("nathan")).toBe(true);
    expect(mayReadDesk("hunter")).toBe(false);
    expect(mayReadDesk("nick")).toBe(false);
    expect(mayReadDesk("visitor")).toBe(false);
  });

  it("asks a room's boards of the building the room is in", () => {
    expect(mayReadRoomBoards("sandbox-erp-floor-3", "nathan")).toBe(true);
    expect(mayReadRoomBoards("sandbox-erp-floor-3", "hunter")).toBe(false);
    expect(mayReadRoomBoards("castle-atlantic-floor-3", "hunter")).toBe(true);
    expect(mayReadRoomBoards("castle-atlantic-floor-3", "visitor")).toBe(false);
    // No building's room hangs no board, so there is nothing to keep back.
    expect(mayReadRoomBoards("world", "visitor")).toBe(true);
  });

  it("keeps the picker for those who can reach the wall it hangs on", () => {
    expect(mayPickBoards("hunter")).toBe(true);
    expect(mayPickBoards("coop")).toBe(true);
    expect(mayPickBoards("nathan")).toBe(false);
    expect(mayPickBoards("visitor")).toBe(false);
  });
});

describe("the routes behind the walls", () => {
  it("refuse the desk and its counts to somebody who cannot ride up to them", async () => {
    for (const get of [zohoRoute.GET, pulseRoute.GET]) {
      const refused = await get(ask("/api/zoho", "visitor"));
      expect(refused.status).toBe(403);
      expect(typeof (await refused.json()).error).toBe("string");
      expect((await get(ask("/api/zoho", "hunter"))).status).toBe(403);
      // Allowed through: with no desk configured, that is what it says.
      const allowed = await get(ask("/api/zoho", "nathan"));
      expect(allowed.status).toBe(200);
      expect((await allowed.json()).configured).toBe(false);
    }
  });

  it("refuse a room's board and its counts to somebody from another building", async () => {
    const path = "/api/trello?room=sandbox-erp-floor-3&slot=1";
    expect((await trelloRoute.GET(ask(path, "hunter"))).status).toBe(403);
    expect((await flowRoute.GET(ask(path, "visitor"))).status).toBe(403);
    expect((await trelloRoute.GET(ask(path, "nathan"))).status).toBe(200);
    expect((await flowRoute.GET(ask(path, "coop"))).status).toBe(200);
  });

  it("keep naming a board, the full list and the office's pick for the picker's wall", async () => {
    expect((await trelloRoute.GET(ask("/api/trello?board=anything", "nathan"))).status).toBe(403);
    expect((await trelloRoute.GET(ask("/api/trello", "visitor"))).status).toBe(403);
    expect((await trelloRoute.GET(ask("/api/trello", "hunter"))).status).toBe(200);
    const pick = (who: AccessIdentity, board: string) =>
      trelloRoute.POST(
        ask("/api/trello", who, {
          method: "POST",
          body: JSON.stringify({ board }),
          headers: { "Content-Type": "application/json" },
        }),
      );
    expect((await pick("nathan", "Sandbox ERP")).status).toBe(403);
    expect((await pick("hunter", "x".repeat(500))).status).toBe(400);
  });

  it("leave the mailboxes' counts open, since they stand on the public map", async () => {
    const answer = await customersRoute.GET();
    expect(answer.status).toBe(200);
    expect(Object.keys(await answer.json())).toEqual(["configured"]);
  });
});

describe("a room's board, once somebody may read it", () => {
  const BOARD_ID = "aaaaaaaa11111111";
  beforeEach(() => {
    process.env.TRELLO_API_KEY = "key";
    process.env.TRELLO_TOKEN = "token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("/members/me/boards")) {
          return Response.json([
            { id: BOARD_ID, name: "Sandbox ERP", url: "https://trello.com/b/x" },
            { id: "bbbbbbbb22222222", name: "Somebody else's", url: "https://trello.com/b/y" },
          ]);
        }
        if (url.includes(`/boards/${BOARD_ID}`)) {
          return Response.json({
            id: BOARD_ID,
            name: "Sandbox ERP",
            url: "",
            lists: [],
            cards: [],
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  /** A named wall has no picker, so it has no business handing out the list. */
  it("is that board alone, without every other board the token can see", async () => {
    const answer = await trelloRoute.GET(
      ask("/api/trello?room=sandbox-erp-floor-3&slot=1", "coop"),
    );
    const body = await answer.json();
    expect(body.board?.name).toBe("Sandbox ERP");
    expect(body.boards).toBeUndefined();
  });

  /**
   * A slot with no board behind it used to fall through to the office's
   * pick — or, with none, to the whole list — for anybody who asked for a
   * room that is nobody's building.
   */
  it("is nothing at all for a room that hangs no board", async () => {
    const answer = await trelloRoute.GET(ask("/api/trello?room=world&slot=1", "visitor"));
    expect(answer.status).toBe(404);
    const body = await answer.json();
    expect(body.board).toBeUndefined();
    expect(body.boards).toBeUndefined();
  });
});
