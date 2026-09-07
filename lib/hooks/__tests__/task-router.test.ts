// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, settle, type RenderedHook } from "./render-hook";
import { useTaskRouter, type TaskRouterRefs } from "../useTaskRouter";
import { gameEvents } from "../../events";
import { MAIN_SESSION_KEY } from "../../reducer";
import type { Action } from "../../reducer";
import type { GatewayClient } from "../../gateway";
import type { GatewayFrame } from "../../gateway-types";
import type { SeatState, TaskItem } from "@/types/game";

/**
 * How a task gets from somebody pressing send to an agent working on it, and
 * what happens when two arrive at once.
 *
 * One task runs per session at a time and the rest wait in line, which is
 * the piece worth holding down: nothing else in the app knows that a second
 * task has to be held, and the queue only drains because three separate
 * events say a run has ended. None of it had a test, because a hook cannot
 * run without a DOM — see `render-hook.ts` for the harness that gives it one.
 */

const SESSION = MAIN_SESSION_KEY;
const OTHER_SESSION = "session-2";

let dispatched: Action[] = [];
let requests: { method: string; params: Record<string, unknown> }[] = [];
/** How the gateway answers `chat.send`; replaced per test. */
let reply: () => Promise<GatewayFrame>;
let status: GatewayClient["status"];
let refs: TaskRouterRefs;
let rendered: RenderedHook<ReturnType<typeof useTaskRouter>> | null = null;
let idCounter = 0;

function seat(seatId: string, label: string): SeatState {
  return { seatId, label, roleTitle: "Worker", assigned: true } as SeatState;
}

function task(taskId: string, extra: Partial<TaskItem> = {}): TaskItem {
  return {
    taskId,
    message: `do ${taskId}`,
    status: "queued",
    sessionKey: SESSION,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...extra,
  };
}

/** Every dispatch of one kind, in order. */
const of = (type: Action["type"]) => dispatched.filter((a) => a.type === type);
const first = (type: Action["type"]) => of(type)[0] as Record<string, unknown> | undefined;

beforeEach(() => {
  dispatched = [];
  requests = [];
  idCounter = 0;
  status = "connected";
  reply = async () => ({ type: "res", ok: true, payload: { runId: "run-1" } }) as GatewayFrame;

  const client = {
    get status() {
      return status;
    },
    request: (method: string, params: Record<string, unknown>) => {
      requests.push({ method, params });
      return reply();
    },
  } as unknown as GatewayClient;

  refs = {
    dispatch: { current: (action: Action) => dispatched.push(action) },
    clientRef: { current: client },
    tasks: { current: [] },
    seats: { current: [seat("seat-0", "Alice"), seat("seat-1", "Bob")] },
    activeSessionKey: { current: SESSION },
    seatIdToSessionKey: { current: new Map() },
    stoppedRunIds: { current: new Set() },
    runActors: { current: new Map() },
    nextTaskId: () => `task-${++idCounter}`,
  };

  rendered = renderHook(() => useTaskRouter(refs));
});

afterEach(() => {
  // The hook listens on a module-wide bus, so a test that left it mounted
  // would go on answering the next test's events.
  rendered?.unmount();
  rendered = null;
});

const router = () => rendered!.current;

describe("assigning a task", () => {
  it("adds it, says it in the chat, and tells the room", async () => {
    const assigned = vi.fn();
    const off = gameEvents.on("task-assigned", assigned);

    await settle(() => router().assignTask("sweep the yard", "seat-0"));

    expect(first("ADD_TASK")).toMatchObject({
      task: { taskId: "task-1", message: "sweep the yard", status: "submitted", seatId: "seat-0" },
    });
    expect(first("APPEND_CHAT")).toMatchObject({
      message: { role: "user", content: "sweep the yard" },
    });
    expect(assigned).toHaveBeenCalledWith("task-1", "sweep the yard", "seat-0", SESSION);
    off();
  });

  it("names the seat it went to", async () => {
    await settle(() => router().assignTask("a job", "seat-1"));
    expect(first("ADD_TASK")).toMatchObject({ task: { actorName: "Bob" } });
  });

  it("lists what came with it in the bubble", async () => {
    await settle(() =>
      router().assignTask("read these", undefined, [
        { id: "a", name: "notes.txt", size: 1 },
        { id: "b", name: "sheet.csv", size: 2 },
      ]),
    );

    // The bubble shows the names; the agent is handed the files themselves.
    expect(first("APPEND_CHAT")).toMatchObject({
      message: { content: "read these\n📎 notes.txt\n📎 sheet.csv" },
    });
    expect(first("ADD_TASK")).toMatchObject({ task: { attachments: [{ name: "notes.txt" }, {}] } });
  });

  it("does nothing at all while the gateway is down", async () => {
    status = "disconnected";
    await settle(() => router().assignTask("a job", "seat-0"));
    expect(dispatched).toEqual([]);
  });
});

describe("sending a ready task on to the gateway", () => {
  it("marks it submitted, sets the worker to work, and asks the gateway", async () => {
    refs.tasks.current = [task("task-1", { seatId: "seat-0" })];

    await settle(() => gameEvents.emit("task-ready", "task-1", "sweep the yard", "seat-0"));

    expect(first("UPDATE_TASK")).toMatchObject({
      taskId: "task-1",
      patch: { status: "submitted" },
    });
    expect(first("PATCH_SEAT_RUNTIME")).toMatchObject({
      seatId: "seat-0",
      patch: { status: "running", runId: "task-1", taskSnippet: "sweep the yard" },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("chat.send");
    expect(requests[0].params).toMatchObject({
      sessionKey: SESSION,
      message: "sweep the yard",
      idempotencyKey: "task-1",
      seatLabel: "Alice",
      seatRole: "Worker",
    });
  });

  it("binds the run the gateway gives back", async () => {
    refs.tasks.current = [task("task-1", { seatId: "seat-0" })];
    const bound = vi.fn();
    const off = gameEvents.on("task-bound", bound);

    await settle(() => gameEvents.emit("task-ready", "task-1", "a job", "seat-0"));

    expect(of("SET_RUN_ACTOR")[0]).toMatchObject({ runId: "run-1", actorName: "Alice" });
    expect(of("UPDATE_TASK")[1]).toMatchObject({
      patch: { status: "running", runId: "run-1", seatId: "seat-0" },
    });
    expect(of("BIND_SEAT_RUN")[0]).toMatchObject({ taskId: "task-1", runId: "run-1" });
    expect(bound).toHaveBeenCalledWith("task-1", "run-1");
    off();
  });

  it("falls back to the task's own id when the gateway names no run", async () => {
    refs.tasks.current = [task("task-1", { seatId: "seat-0" })];
    reply = async () => ({ type: "res", ok: true, payload: {} }) as GatewayFrame;

    await settle(() => gameEvents.emit("task-ready", "task-1", "a job", "seat-0"));

    expect(of("BIND_SEAT_RUN")[0]).toMatchObject({ runId: "task-1" });
  });

  it("says so in the chat when the gateway refuses it", async () => {
    refs.tasks.current = [task("task-1", { seatId: "seat-0" })];
    reply = async () => {
      throw new Error("no capacity");
    };
    const failed = vi.fn();
    const off = gameEvents.on("task-failed", failed);

    await settle(() => gameEvents.emit("task-ready", "task-1", "a job", "seat-0"));

    expect(of("UPDATE_TASK")[1]).toMatchObject({ patch: { status: "failed" } });
    expect(of("SET_SEAT_STATUS")[0]).toMatchObject({ runId: "task-1", status: "failed" });
    expect(first("APPEND_CHAT")).toMatchObject({
      message: { role: "system", content: "Assign failed: no capacity" },
    });
    expect(failed).toHaveBeenCalledWith("task-1");
    off();
  });
});

describe("one task at a time per session", () => {
  it("holds a second task back while one is running", async () => {
    refs.tasks.current = [task("task-1", { status: "running", runId: "run-1" }), task("task-2")];

    await settle(() => gameEvents.emit("task-ready", "task-2", "the next job"));

    // Nothing sent, and nothing said about it: it is simply waiting.
    expect(requests).toEqual([]);
    expect(dispatched).toEqual([]);
  });

  it("sends it once the running one is done", async () => {
    refs.tasks.current = [task("task-1", { status: "running", runId: "run-1" }), task("task-2")];
    await settle(() => gameEvents.emit("task-ready", "task-2", "the next job"));
    expect(requests).toEqual([]);

    await settle(() => gameEvents.emit("task-completed", "task-1"));

    expect(requests).toHaveLength(1);
    expect(requests[0].params).toMatchObject({ message: "the next job" });
  });

  it.each(["task-completed", "task-failed", "task-aborted"] as const)(
    "drains the queue on %s",
    async (event) => {
      refs.tasks.current = [task("task-1", { status: "running", runId: "run-1" }), task("task-2")];
      await settle(() => gameEvents.emit("task-ready", "task-2", "the next job"));

      await settle(() => gameEvents.emit(event, "task-1"));

      expect(requests).toHaveLength(1);
    },
  );

  it("lets the line through one at a time", async () => {
    refs.tasks.current = [
      task("task-1", { status: "running", runId: "run-1" }),
      task("task-2"),
      task("task-3"),
    ];
    await settle(() => gameEvents.emit("task-ready", "task-2", "second"));
    await settle(() => gameEvents.emit("task-ready", "task-3", "third"));

    await settle(() => gameEvents.emit("task-completed", "task-1"));
    expect(requests.map((r) => r.params.message)).toEqual(["second"]);

    // The next one waits for its own turn, not for the first completion.
    refs.tasks.current = [
      task("task-1", { status: "completed" }),
      task("task-2", { status: "running", runId: "run-2" }),
      task("task-3"),
    ];
    await settle(() => gameEvents.emit("task-completed", "task-2"));
    expect(requests.map((r) => r.params.message)).toEqual(["second", "third"]);
  });

  it("does not hold up a task in another session", async () => {
    refs.tasks.current = [
      task("task-1", { status: "running", runId: "run-1" }),
      task("task-2", { sessionKey: OTHER_SESSION }),
    ];

    await settle(() => gameEvents.emit("task-ready", "task-2", "elsewhere"));

    expect(requests).toHaveLength(1);
    expect(requests[0].params).toMatchObject({ sessionKey: OTHER_SESSION });
  });
});

describe("stopping a task", () => {
  it("stops one that never reached the gateway without asking it", async () => {
    refs.tasks.current = [task("task-1", { status: "queued", seatId: "seat-0" })];
    const aborted = vi.fn();
    const off = gameEvents.on("task-aborted", aborted);

    await settle(() => gameEvents.emit("stop-task", "task-1", "seat-0"));

    expect(requests).toEqual([]);
    expect(first("UPDATE_TASK")).toMatchObject({
      patch: { status: "stopped", result: "Stopped by user" },
    });
    expect(first("PATCH_SEAT_RUNTIME")).toMatchObject({
      seatId: "seat-0",
      patch: { status: "empty", runId: undefined },
    });
    expect(aborted).toHaveBeenCalledWith("task-1");
    off();
  });

  it("asks the gateway to abort one that is really running", async () => {
    refs.tasks.current = [task("task-1", { status: "running", runId: "run-1", seatId: "seat-0" })];

    await settle(() => gameEvents.emit("stop-task", "task-1", "seat-0"));

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("chat.abort");
    expect(requests[0].params).toMatchObject({ sessionKey: SESSION, runId: "run-1" });
    // Stopped here and now, rather than waiting to hear back.
    expect(first("UPDATE_TASK")).toMatchObject({ patch: { status: "stopped" } });
  });

  it("stops it locally when there is no gateway to ask", async () => {
    refs.tasks.current = [task("task-1", { status: "running", runId: "run-1", seatId: "seat-0" })];
    status = "disconnected";

    await settle(() => gameEvents.emit("stop-task", "task-1", "seat-0"));

    expect(requests).toEqual([]);
    expect(first("UPDATE_TASK")).toMatchObject({ patch: { status: "stopped" } });
  });

  it("clears whichever seat holds the run when it is stopped without one named", async () => {
    // The way the store stops a task it has no seat for: by run id alone.
    refs.tasks.current = [task("task-1", { status: "running", runId: "run-1" })];

    await settle(() => router().finalizeStoppedTask("task-1"));

    expect(first("SET_SEAT_STATUS")).toMatchObject({ runId: "task-1", status: "empty" });
    expect(of("PATCH_SEAT_RUNTIME")).toEqual([]);
  });

  it("says so in the chat when the gateway will not abort", async () => {
    refs.tasks.current = [task("task-1", { status: "running", runId: "run-1" })];
    reply = async () => {
      throw new Error("gateway said no");
    };

    await settle(() => gameEvents.emit("stop-task", "task-1", "seat-0"));

    const said = of("APPEND_CHAT").map((a) => (a as { message: { content: string } }).message);
    expect(said.map((m) => m.content)).toContain(
      "Stop task failed: gateway rejected the stop request",
    );
  });

  it("ignores a stop for a task it has never heard of", async () => {
    refs.tasks.current = [];
    await settle(() => gameEvents.emit("stop-task", "task-nope", "seat-0"));
    expect(dispatched).toEqual([]);
    expect(requests).toEqual([]);
  });

  it.each(["stopped", "completed"] as const)("will not stop a task already %s", async (state) => {
    refs.tasks.current = [task("task-1", { status: state, runId: "run-1" })];

    await settle(() => router().finalizeStoppedTask("task-1"));

    expect(dispatched).toEqual([]);
  });

  it("remembers the run it stopped, so a late reply is not mistaken for work", async () => {
    refs.tasks.current = [task("task-1", { status: "running", runId: "run-1" })];

    await settle(() => router().finalizeStoppedTask("task-1"));

    expect([...refs.stoppedRunIds.current]).toEqual(["run-1"]);
  });
});

describe("a task moving about the room", () => {
  it("puts a routed task on the seat that took it", async () => {
    refs.tasks.current = [task("task-1")];

    await settle(() => gameEvents.emit("task-routed", "task-1", "seat-1", "Bob"));

    expect(first("UPDATE_TASK")).toMatchObject({
      taskId: "task-1",
      patch: { seatId: "seat-1", actorName: "Bob" },
    });
    // So the seat's next reply is filed under the right conversation.
    expect(refs.seatIdToSessionKey.current.get("seat-1")).toBe(SESSION);
  });

  it("shows a queued task waiting at the desk", async () => {
    await settle(() => gameEvents.emit("task-staged", "task-1", "queued", "seat-0"));

    expect(first("UPDATE_TASK")).toMatchObject({ patch: { status: "queued", seatId: "seat-0" } });
    expect(first("PATCH_SEAT_RUNTIME")).toMatchObject({
      patch: { status: "running", taskSnippet: "Queued task" },
    });
  });

  it("shows a worker walking back with the answer", async () => {
    await settle(() => gameEvents.emit("task-staged", "task-1", "returning", "seat-0"));

    expect(first("UPDATE_TASK")).toMatchObject({ patch: { status: "returning" } });
    expect(first("PATCH_SEAT_RUNTIME")).toMatchObject({
      patch: { status: "returning", taskSnippet: "Returning to desk..." },
    });
  });

  it("stages a task with no seat without touching any seat", async () => {
    await settle(() => gameEvents.emit("task-staged", "task-1", "queued", undefined));

    expect(of("UPDATE_TASK")).toHaveLength(1);
    expect(of("PATCH_SEAT_RUNTIME")).toEqual([]);
  });
});

describe("after the hook goes", () => {
  it("stops answering the room", async () => {
    rendered!.unmount();
    rendered = null;
    refs.tasks.current = [task("task-1", { seatId: "seat-0" })];

    await settle(() => gameEvents.emit("task-ready", "task-1", "a job", "seat-0"));

    expect(requests).toEqual([]);
    expect(dispatched).toEqual([]);
  });
});
