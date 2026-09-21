import { afterEach, describe, expect, it } from "vitest";

import { METTARA_ORIGIN } from "../../mettara";
import { docConversationFor } from "../mettara";
import type { AccessIdentity } from "../../identity";

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

const original = process.env.METTARA_DOC_CONVO;

afterEach(() => {
  if (original === undefined) delete process.env.METTARA_DOC_CONVO;
  else process.env.METTARA_DOC_CONVO = original;
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

  it("points at Mettara, which is the origin the CSP names", () => {
    // `next.config.ts` puts this same constant in `frame-src`. A URL built
    // off any other origin is a frame the browser drops without a word.
    expect(docConversationFor("coop")!.startsWith(`${METTARA_ORIGIN}/`)).toBe(true);
  });

  it("takes the conversation from the environment when one is set", () => {
    process.env.METTARA_DOC_CONVO = "0000aaaa-1111-2222-3333-444455556666";
    expect(docConversationFor("coop")).toBe(
      `${METTARA_ORIGIN}/convo/0000aaaa-1111-2222-3333-444455556666`,
    );
  });

  it("reads a blank override as no override, not as a conversation with no id", () => {
    const written = docConversationFor("coop");
    process.env.METTARA_DOC_CONVO = "   ";
    expect(docConversationFor("coop")).toBe(written);
  });

  it("does not hand the environment a way past the gate", () => {
    // The override is the conversation, never who may open it.
    process.env.METTARA_DOC_CONVO = "0000aaaa-1111-2222-3333-444455556666";
    expect(docConversationFor("visitor")).toBeNull();
  });
});
