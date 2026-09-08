import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SDK_MISSING_MESSAGE,
  loadSdk,
  mettaraServiceReady,
  resetIdentityCache,
  resetSdkCache,
  resetServiceReady,
  runMettaraTurn,
  setSdkLoader,
  type Sdk,
} from "../client";

const ENV = { ...process.env };

function configure() {
  process.env.METTARA_API_SECRET = "secret";
  process.env.METTARA_PLATFORM_ID = "platform";
  process.env.METTARA_EMAIL_DOMAIN = "sandbox.co";
}

/**
 * Stands in for the tarball SDK, which is distributed privately and is not
 * installed in CI. It records what the client actually sends to Mettara.
 */
function fakeSdk() {
  const sent: Array<{ conversationId: string; content: string }> = [];
  const created: string[] = [];
  const tokensFor: string[] = [];
  const emails: string[] = [];

  const sdk = {
    EmbedClient: class {
      constructor(
        public secret: string,
        public baseUrl: string,
        public platformId: string,
      ) {}
      async getToken(
        userId: string,
        _group: string,
        _groupName: string,
        _name: string,
        email: string,
      ) {
        tokensFor.push(userId);
        emails.push(email);
        return { userId, groupId: "g1" };
      }
    },
    MettaraClient: class {
      constructor(
        public apiKey: string,
        public baseUrl?: string,
      ) {}
      async createConversation(_group: string, _user: string, ai: string) {
        created.push(ai);
        return { id: `conv-${created.length}` };
      }
      async *streamMessage(conversationId: string, _g: string, _u: string, content: string) {
        sent.push({ conversationId, content });
        // Mettara narrates itself before it answers; only the content frames
        // are the reply.
        yield { type: "activity", content: "Analyzing" };
        yield { type: "activity", content: "is thinking..." };
        yield { type: "content", content: `reply to ${content.length} chars` };
      }
    },
  } as unknown as Sdk;

  setSdkLoader(async () => sdk);
  return { sent, created, tokensFor, emails };
}

beforeEach(() => {
  resetSdkCache();
  resetIdentityCache();
});

afterEach(() => {
  setSdkLoader();
  resetIdentityCache();
  process.env = { ...ENV };
});

describe("where the SDK is pointed", () => {
  it("adds the gateway's prefixes to the plain host", async () => {
    const { apiBase, embedBase } = await import("../client");
    expect(apiBase({ baseUrl: "https://api.mettara.ai" })).toBe("https://api.mettara.ai/api");
    expect(embedBase({ baseUrl: "https://api.mettara.ai/" })).toBe("https://api.mettara.ai/api/v1");
  });
});

describe("mettara client", () => {
  it("loads the vendored SDK, with both clients", async () => {
    const sdk = await loadSdk();
    expect(typeof sdk?.EmbedClient).toBe("function");
    expect(typeof sdk?.MettaraClient).toBe("function");
  });

  it("explains how to install the SDK instead of failing opaquely", async () => {
    configure();
    setSdkLoader(async () => null);
    await expect(
      runMettaraTurn({ sessionKey: "s", message: "hi", personality: "You are Sam." }),
    ).rejects.toThrow(/vendor\/mettara-lib/);
  });

  it("refuses to run when the server has no credentials", async () => {
    delete process.env.METTARA_API_SECRET;
    delete process.env.METTARA_PLATFORM_ID;
    await expect(
      runMettaraTurn({ sessionKey: "s", message: "hi", personality: "You are Sam." }),
    ).rejects.toThrow(/not configured/);
  });

  it("opens a conversation on the first turn and carries the briefing with it", async () => {
    configure();
    const { sent, created } = fakeSdk();

    const reply = await runMettaraTurn({
      seatLabel: "Sam",
      sessionKey: "seat:1",
      message: "Chase the invoice",
      personality: "You are Sam, an accountant.",
      aiName: "analyst",
    });

    expect(created).toEqual(["analyst"]);
    expect(reply.conversationId).toBe("conv-1");
    // Mettara has no system-prompt field, so the briefing rides in front of
    // the first message rather than being silently dropped.
    expect(sent[0].content).toBe("You are Sam, an accountant.\n\nChase the invoice");
    expect(sent[0].conversationId).toBe("conv-1");
  });

  it("resumes an existing conversation without repeating the briefing", async () => {
    configure();
    const { sent, created } = fakeSdk();

    const reply = await runMettaraTurn({
      seatLabel: "Sam",
      sessionKey: "seat:1",
      message: "Any update?",
      personality: "You are Sam, an accountant.",
      conversationId: "conv-existing",
    });

    expect(created).toEqual([]);
    expect(reply.conversationId).toBe("conv-existing");
    expect(sent[0].content).toBe("Any update?");
  });

  it("provisions each seat once and keeps them apart", async () => {
    configure();
    const { tokensFor } = fakeSdk();

    await runMettaraTurn({ seatLabel: "Sam", sessionKey: "a", message: "x", personality: "p" });
    await runMettaraTurn({ seatLabel: "Sam", sessionKey: "a", message: "y", personality: "p" });
    await runMettaraTurn({ seatLabel: "Ada", sessionKey: "b", message: "z", personality: "p" });

    expect(tokensFor).toEqual(["sam", "ada"]);
  });

  it("does not cache a failed provisioning", async () => {
    configure();
    let attempts = 0;
    const sdk = {
      EmbedClient: class {
        async getToken(userId: string) {
          attempts += 1;
          if (attempts === 1) throw new Error("network down");
          return { userId, groupId: "g1" };
        }
      },
      MettaraClient: class {
        async createConversation() {
          return { id: "conv-1" };
        }
        async *streamMessage() {
          yield { type: "content", content: "ok" };
        }
      },
    } as unknown as Sdk;
    setSdkLoader(async () => sdk);

    const turn = { seatLabel: "Sam", sessionKey: "a", message: "x", personality: "p" };
    await expect(runMettaraTurn(turn)).rejects.toThrow("network down");
    // A blip must not lock the seat out for the life of the process.
    await expect(runMettaraTurn(turn)).resolves.toMatchObject({ conversationId: "conv-1" });
    expect(attempts).toBe(2);
  });

  /**
   * The address a seat is provisioned on comes from the operator's domain.
   * It was `@watercooler.local`, which Mettara refuses outright — no seat
   * could be provisioned, and so no turn could be taken, on any deployment.
   */
  it("provisions the seat on the configured domain", async () => {
    configure();
    process.env.METTARA_EMAIL_DOMAIN = "sandbox.co";
    const { emails } = fakeSdk();
    await runMettaraTurn({
      seatLabel: "Sam Rivera",
      sessionKey: "a",
      message: "x",
      personality: "p",
    });
    expect(emails).toEqual(["sam-rivera@sandbox.co"]);
  });

  it("falls back to the default AI when the HUD picks no model", async () => {
    configure();
    const { created } = fakeSdk();
    await runMettaraTurn({ seatLabel: "Sam", sessionKey: "a", message: "x", personality: "p" });
    expect(created).toEqual(["assistant"]);
  });
});

/**
 * Whether the far end can take a turn at all. The keys being set says nothing
 * about it: the group they point at has to have an assistant in it, and until
 * this was asked a room with an empty group read as ready and every run died
 * in `createConversation`.
 */
describe("whether the service can take a turn", () => {
  /** Answers the AI list endpoint, and records what was asked for. */
  function answerAis(body: unknown, init: { ok?: boolean; status?: number } = {}) {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string, options?: { headers?: Record<string, string> }) => {
      asked.push(url);
      return {
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: async () => body,
        headers: options?.headers,
      } as unknown as Response;
    });
    return asked;
  }

  beforeEach(() => {
    resetServiceReady();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is silent about missing keys — the environment preflight owns that sentence", async () => {
    const asked = answerAis({ data: [] });
    expect(await mettaraServiceReady()).toBeNull();
    expect(asked).toEqual([]);
  });

  it("wants the SDK before it asks the service anything", async () => {
    configure();
    setSdkLoader(async () => null);
    const asked = answerAis({ data: [] });
    expect(await mettaraServiceReady()).toBe(SDK_MISSING_MESSAGE);
    expect(asked).toEqual([]);
  });

  it("refuses a group with no AI in it, naming the group", async () => {
    configure();
    process.env.METTARA_GROUP_ID = "g-1";
    fakeSdk();
    answerAis({ object: "list", data: [] });
    const reason = await mettaraServiceReady();
    expect(reason).toMatch(/g-1/);
    expect(reason).toMatch(/no AI in it/);
    expect(reason).toMatch(/METTARA_AI_NAME/);
  });

  it("names what the group does have when the chosen AI is not among them", async () => {
    configure();
    process.env.METTARA_AI_NAME = "concierge";
    fakeSdk();
    answerAis({ data: [{ technical_name: "helper" }, { technical_name: "analyst" }] });
    const reason = await mettaraServiceReady();
    expect(reason).toMatch(/"concierge"/);
    expect(reason).toMatch(/helper, analyst/);
  });

  it("is ready when the group has the AI, and asks the group's own endpoint", async () => {
    configure();
    process.env.METTARA_GROUP_ID = "g-1";
    fakeSdk();
    const asked = answerAis({ data: [{ technical_name: "assistant" }] });
    expect(await mettaraServiceReady()).toBeNull();
    expect(asked).toEqual(["https://api.mettara.ai/api/v1/ais?group_id=g-1"]);
  });

  /**
   * The gateway answers `{object:"list",data:[…]}`; the SDK's own `listAis`
   * reads `ais`. Either shape has to count, or the check reports an empty
   * group for a group that is fine.
   */
  it("reads either shape of list", async () => {
    configure();
    fakeSdk();
    answerAis({ ais: [{ technical_name: "assistant" }] });
    expect(await mettaraServiceReady()).toBeNull();
  });

  it("does not refuse a run when it could not ask", async () => {
    configure();
    fakeSdk();
    // Mettara being unreachable says nothing about which AIs the group has,
    // and the run is about to reach for the same host: let it fail with the
    // real error rather than with a guess.
    answerAis({}, { ok: false, status: 503 });
    expect(await mettaraServiceReady()).toBeNull();
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    resetServiceReady();
    expect(await mettaraServiceReady()).toBeNull();
  });

  it("asks once when the answer is yes, and every time it is no", async () => {
    configure();
    fakeSdk();
    const ready = answerAis({ data: [{ technical_name: "assistant" }] });
    expect(await mettaraServiceReady()).toBeNull();
    expect(await mettaraServiceReady()).toBeNull();
    expect(ready).toHaveLength(1);

    // An empty group is fixed on Mettara's side while this server runs, so a
    // refusal that cached itself would need a restart to stop being true.
    resetServiceReady();
    const empty = answerAis({ data: [] });
    expect(await mettaraServiceReady()).not.toBeNull();
    expect(await mettaraServiceReady()).not.toBeNull();
    expect(empty).toHaveLength(2);
  });
});

/**
 * What a worker actually says.
 *
 * The plain `sendMessage` call cannot be used for this: Mettara runs every
 * frame together into one `content` — the status text included — and repeats
 * the answer at the end, so asking it for "PONG" comes back as
 * "Analyzingis thinking...PONGPONG". Streamed, the frames are typed.
 */
describe("the reply a worker speaks", () => {
  it("keeps the answer and drops the assistant narrating itself", async () => {
    configure();
    const sdk = {
      EmbedClient: class {
        async getToken(userId: string) {
          return { userId, groupId: "g1" };
        }
      },
      MettaraClient: class {
        async createConversation() {
          return { id: "conv-1" };
        }
        async *streamMessage() {
          yield { type: "activity", content: "Analyzing" };
          yield { type: "activity", content: "is thinking..." };
          yield { type: "reasoning", content: "the user wants a greeting" };
          yield { type: "content", content: "Hello" };
          yield { type: "content", content: ", I'm Yoshi." };
        }
      },
    } as unknown as Sdk;
    setSdkLoader(async () => sdk);

    const reply = await runMettaraTurn({
      seatLabel: "Yoshi",
      sessionKey: "a",
      message: "hello",
      personality: "p",
    });

    expect(reply.text).toBe("Hello, I'm Yoshi.");
  });

  it("is empty rather than wrong when the answer was all narration", async () => {
    configure();
    const sdk = {
      EmbedClient: class {
        async getToken(userId: string) {
          return { userId, groupId: "g1" };
        }
      },
      MettaraClient: class {
        async createConversation() {
          return { id: "conv-1" };
        }
        async *streamMessage() {
          yield { type: "activity", content: "Analyzing" };
        }
      },
    } as unknown as Sdk;
    setSdkLoader(async () => sdk);

    const reply = await runMettaraTurn({
      seatLabel: "Yoshi",
      sessionKey: "a",
      message: "hello",
      personality: "p",
    });

    expect(reply.text).toBe("");
  });
});
