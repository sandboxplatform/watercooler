import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { embedIdOf, METTARA_ORIGIN } from "../../mettara";
import { docConversationFor, docTokenFor, signMettara } from "../mettara";
import type { AccessIdentity } from "../../identity";

// The logger binds `console.warn` when it is made, so a spy on `console`
// would arrive too late to see anything.
const warned = vi.hoisted(() => vi.fn());
vi.mock("../../logger", () => ({
  createLogger: () => ({ debug() {}, info() {}, warn: warned, error() {} }),
}));

const EVERYBODY: readonly AccessIdentity[] = [
  "visitor",
  "coop",
  "rob",
  "hunter",
  "nathan",
  "sara",
  "andrew",
  "campbell",
  "nick",
];

/** Who is in the group chat. The rest of the cast is held to being out of it. */
const ON_IT: readonly AccessIdentity[] = ["coop", "rob", "andrew"];

const SECRET = "platform-secret";

const CHAT = `${METTARA_ORIGIN}/embed/convo/0000aaaa-1111-2222-3333-444455556666`;

beforeEach(() => {
  vi.stubEnv("METTARA_WORKSPACE_ID", "platform-uuid");
  vi.stubEnv("METTARA_API_SECRET", SECRET);
  vi.stubEnv("METTARA_DOC_CHAT_URL", CHAT);
  vi.stubEnv("METTARA_DOC_EMBED_ID", "test-doc");
  // An address for everybody, so it is the list that keeps the rest out
  // rather than a missing variable.
  for (const identity of EVERYBODY) {
    vi.stubEnv(`METTARA_EMAIL_${identity.toUpperCase()}`, `${identity}@example.com`);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the conversation Doc is hooked up to", () => {
  it("is open to the three on it, and to nobody else", () => {
    // Everybody else walks up to a resident who says his line. Not a
    // fallback to somebody else's conversation and not an empty window —
    // the scene asks this before it will show a prompt at all, so a null
    // here is the whole of why there is nothing over his head.
    for (const identity of EVERYBODY) {
      const url = docConversationFor(identity);
      if (ON_IT.includes(identity)) expect(url, identity).toBeTruthy();
      else expect(url, identity).toBeNull();
    }
  });

  it("is one conversation between them, not one each", () => {
    // A group chat is a place several people are in. Handing them a
    // conversation apiece would look identical from any one screen and be
    // three rooms nobody else is in.
    const urls = new Set(ON_IT.map((identity) => docConversationFor(identity)));
    expect(urls.size).toBe(1);
  });

  it("opens in Mettara's embed, on the origin the CSP names", () => {
    // `next.config.ts` puts this same constant in `frame-src`. A URL built
    // off any other origin is a frame the browser drops without a word, and
    // the conversation's own page would sign in by a cookie a frame is not
    // given.
    expect(docConversationFor("coop")!.startsWith(`${METTARA_ORIGIN}/embed/convo/`)).toBe(true);
  });

  it("is the conversation the environment names, carrying the embed id it names", () => {
    // The panel reads the id back off this URL, so the frame and the panel
    // answering it are told the same one by construction.
    const url = docConversationFor("coop")!;
    expect(url).toBe(`${CHAT}?eid=test-doc`);
    expect(embedIdOf(url)).toBe("test-doc");
  });

  it("stamps its own embed id over one already in the URL, and drops a fragment", () => {
    // The fragment is where the panel puts the token.
    vi.stubEnv("METTARA_DOC_CHAT_URL", `${CHAT}?eid=stale#somewhere`);
    expect(docConversationFor("coop")).toBe(`${CHAT}?eid=test-doc`);
  });

  it("is nobody's until both the conversation and the embed id are named", () => {
    // Nothing is written in to fall back on; blank is unset.
    for (const unset of ["METTARA_DOC_CHAT_URL", "METTARA_DOC_EMBED_ID"]) {
      vi.stubEnv(unset, "   ");
      for (const identity of ON_IT) expect(docConversationFor(identity), unset).toBeNull();
      vi.stubEnv("METTARA_DOC_CHAT_URL", CHAT);
      vi.stubEnv("METTARA_DOC_EMBED_ID", "test-doc");
    }
  });

  it("will not frame anything the CSP does not name, or a page that signs in by cookie", () => {
    // A host off `METTARA_ORIGIN` is a blank frame; the conversation's own
    // page is a sign-in page in a window. Neither gets a prompt over Doc,
    // and each says why in the log, since from the world they look alike.
    const wrong = [
      "https://elsewhere.example/embed/convo/0000aaaa",
      "http://app.mettara.ai/embed/convo/0000aaaa",
      `${METTARA_ORIGIN}/convo/0000aaaa`,
      "0000aaaa-1111-2222-3333-444455556666",
    ];
    warned.mockClear();
    for (const chat of wrong) {
      vi.stubEnv("METTARA_DOC_CHAT_URL", chat);
      expect(docConversationFor("coop"), chat).toBeNull();
    }
    expect(warned).toHaveBeenCalledTimes(wrong.length);
  });

  it("does not hand the environment a way past the gate", () => {
    // The environment names the conversation, never who may open it.
    expect(docConversationFor("visitor")).toBeNull();
  });

  it("is nobody's until the platform's credentials are set", () => {
    // A prompt over Doc that opened onto a refusal would be worse than none.
    vi.stubEnv("METTARA_API_SECRET", "");
    for (const identity of ON_IT) expect(docConversationFor(identity), identity).toBeNull();
  });

  it("is not somebody's whose address Mettara would not know them by", () => {
    vi.stubEnv("METTARA_EMAIL_ROB", "");
    expect(docConversationFor("rob")).toBeNull();
    expect(docConversationFor("coop")).toBeTruthy();
  });
});

describe("a token request's signature", () => {
  it("is the one Mettara's documentation works through", () => {
    // Their worked example, character for character: sorted keys, RFC 3986
    // values, `&` between, HMAC-SHA256 in hex.
    const params = {
      platform_id: "your-platform-uuid",
      source_user_id: "user_123",
      source_group_id: "org_456",
      source_group_name: "Acme Co",
      name: "Jane Smith",
      email: "jane@acme.com",
      t: "2024-01-15T12:00:00.000Z",
    };
    const canonical =
      "email=jane%40acme.com&name=Jane%20Smith&platform_id=your-platform-uuid" +
      "&source_group_id=org_456&source_group_name=Acme%20Co&source_user_id=user_123" +
      "&t=2024-01-15T12%3A00%3A00.000Z";
    expect(signMettara(params, SECRET)).toBe(
      createHmac("sha256", SECRET).update(canonical).digest("hex"),
    );
  });

  it("encodes the five characters encodeURIComponent leaves alone", () => {
    // RFC 3986 reserves `!'()*` and `encodeURIComponent` does not escape
    // them, so a name with an apostrophe would sign as a string Mettara
    // never builds.
    const canonical = "name=O%27Brien%20%28Ops%29%21%2A";
    expect(signMettara({ name: "O'Brien (Ops)!*" }, SECRET)).toBe(
      createHmac("sha256", SECRET).update(canonical).digest("hex"),
    );
  });
});

describe("a token for Doc's frame", () => {
  /** What was sent to Mettara, and where. */
  let sent: { url: string; body: Record<string, string> }[];

  function mettaraAnswers(response: () => Response) {
    sent = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        sent.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return response();
      }),
    );
  }

  it("is asked of Mettara with a signed request, and only the token comes back", async () => {
    mettaraAnswers(() =>
      Response.json({ status: "success", result: { access_token: "jwt", expires_at: 1 } }),
    );
    expect(await docTokenFor("coop")).toBe("jwt");

    expect(sent).toHaveLength(1);
    const [{ url, body }] = sent;
    expect(url).toBe("https://api.mettara.ai/api/v1/embed/token");
    expect(body).toMatchObject({
      platform_id: "platform-uuid",
      source_user_id: "coop@example.com",
      name: "Coop",
      email: "coop@example.com",
    });
    // The signature covers every field but itself and the namespace, which
    // says which system the ids are recorded under; the secret is in none
    // of it.
    const { sig, namespace, ...signed } = body;
    expect(namespace).toBe("watercooler");
    expect(Object.keys(signed).sort()).toEqual([
      "email",
      "name",
      "platform_id",
      "source_group_id",
      "source_group_name",
      "source_user_id",
      "t",
    ]);
    expect(sig).toBe(signMettara(signed, SECRET));
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it("is one team for the three of them, so they land in the same group chat", async () => {
    mettaraAnswers(() => Response.json({ result: { access_token: "jwt" } }));
    for (const identity of ON_IT) await docTokenFor(identity);
    expect(new Set(sent.map(({ body }) => body.source_group_id)).size).toBe(1);
    expect(new Set(sent.map(({ body }) => body.source_group_name)).size).toBe(1);
  });

  it("is never asked for on behalf of somebody Doc is not hooked up for", async () => {
    mettaraAnswers(() => Response.json({ result: { access_token: "jwt" } }));
    expect(await docTokenFor("visitor")).toBeNull();
    expect(await docTokenFor("hunter")).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("is not asked for while there is no conversation for the frame to open", async () => {
    mettaraAnswers(() => Response.json({ result: { access_token: "jwt" } }));
    vi.stubEnv("METTARA_DOC_CHAT_URL", "");
    expect(await docTokenFor("coop")).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("fails loudly when Mettara refuses, rather than handing the frame nothing", async () => {
    mettaraAnswers(() => new Response("Invalid request", { status: 400 }));
    await expect(docTokenFor("coop")).rejects.toThrow(/400/);
  });

  it("fails when Mettara answers without one", async () => {
    mettaraAnswers(() => Response.json({ status: "success", result: {} }));
    await expect(docTokenFor("coop")).rejects.toThrow(/without a token/);
  });
});
