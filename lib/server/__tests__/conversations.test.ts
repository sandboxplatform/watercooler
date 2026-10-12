import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { METTARA_ORIGIN } from "../../mettara";
import { WORLD_ROOM_SLUG } from "../../rooms";
import { fixture } from "../../fixtures";
import { residentPresenceId, type TalkMessage } from "../../presence-types";
import type { AccessIdentity } from "../access";
import { SocketState } from "../socket/state";
import type { MessageContext } from "../socket/feature";
import { REACH_SLACK, conversationsFeature } from "../socket/features/conversations";

/**
 * Who is holding Doc still.
 *
 * The browser says whose conversation it has open and nothing else; the
 * feature decides whether that counts, and the simulation asks it every
 * tick. These drive the feature directly, with a room's state built by
 * hand — what it answers is the whole of what the simulation sees.
 */

const SUPPORT = "sandbox-erp-floor-3";
const MAP = WORLD_ROOM_SLUG;
const DOC = residentPresenceId("doc");
/** Where Doc is standing in every test, in the room's pixels. */
const POST = { x: 400, y: 300 };
const REACH = fixture("doc-chat").radius * REACH_SLACK;

beforeEach(() => {
  // The real gate, hooked up for Coop alone: `docConversationFor` reads
  // these when it is asked, so this is the answer the prompt is built on.
  vi.stubEnv("METTARA_WORKSPACE_ID", "platform-uuid");
  vi.stubEnv("METTARA_API_SECRET", "platform-secret");
  vi.stubEnv(
    "METTARA_DOC_CHAT_URL",
    `${METTARA_ORIGIN}/embed/convo/0000aaaa-1111-2222-3333-444455556666`,
  );
  vi.stubEnv("METTARA_DOC_EMBED_ID", "test-doc");
  vi.stubEnv("METTARA_EMAIL_COOP", "coop@example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function world() {
  const state = new SocketState();
  const feature = conversationsFeature({ state });
  state.roomFor(SUPPORT).hub.join(DOC, {
    name: "Doc",
    spriteKey: "character_doc",
    ...POST,
    facing: "down",
    resident: true,
  });

  /** Somebody standing in a room, at so far to Doc's right. */
  const standIn = (id: string, slug: string, offset: number) => {
    state.roomFor(slug).hub.join(id, {
      name: id,
      spriteKey: "character_coop",
      x: POST.x + offset,
      y: POST.y,
      facing: "left",
    });
    state.roomOf.set(id, slug);
  };

  const talk = (id: string, identity: AccessIdentity, to: unknown) => {
    const message = { type: "talk", to } as TalkMessage;
    feature.onMessage!.talk!(message, { id, identity } as MessageContext);
  };

  const heard = (slug = SUPPORT) => feature.listener("doc", slug, POST);

  return { state, feature, standIn, talk, heard };
}

describe("holding Doc still", () => {
  it("holds him for somebody beside him with his conversation open, and says where they are", () => {
    const { standIn, talk, heard } = world();
    standIn("c1", SUPPORT, 50);
    expect(heard()).toBeNull();
    talk("c1", "coop", "doc");
    expect(heard()).toEqual({ x: POST.x + 50, y: POST.y });
  });

  it("lets him go when the window shuts, or the connection does", () => {
    const { feature, standIn, talk, heard } = world();
    standIn("c1", SUPPORT, 50);
    talk("c1", "coop", "doc");
    talk("c1", "coop", null);
    expect(heard()).toBeNull();

    talk("c1", "coop", "doc");
    feature.onDrop!("c1", SUPPORT);
    expect(heard()).toBeNull();
  });

  /**
   * The prompt only appears for somebody he is hooked up for, so anybody
   * else sending this has typed it out — and could otherwise stop him in
   * his tracks for as long as their socket stayed open.
   */
  it("is not held by somebody he is not hooked up for", () => {
    const { standIn, talk, heard } = world();
    standIn("v1", SUPPORT, 50);
    talk("v1", "visitor", "doc");
    expect(heard()).toBeNull();
  });

  /** `?doc=1` opens the window from anywhere; that is not talking to him. */
  it("is not held from across the room, or from another room", () => {
    const { standIn, talk, heard } = world();
    standIn("far", SUPPORT, REACH + 1);
    talk("far", "coop", "doc");
    expect(heard()).toBeNull();

    const other = world();
    other.standIn("c1", MAP, 10);
    other.talk("c1", "coop", "doc");
    expect(other.heard()).toBeNull();
  });

  /**
   * The prompt is measured to where he is drawn, which trails where he is,
   * so the room has the two of them further apart than the browser did.
   */
  it("is held from a little past the prompt's own reach", () => {
    const { standIn, talk, heard } = world();
    standIn("c1", SUPPORT, fixture("doc-chat").radius + 20);
    talk("c1", "coop", "doc");
    expect(heard()).not.toBeNull();
  });

  it("ignores a hold on anybody who has no conversation, whatever they are called", () => {
    const { standIn, talk, heard, feature } = world();
    standIn("c1", SUPPORT, 50);
    for (const to of ["michael", "constructor", "__proto__", 7, {}]) {
      expect(() => talk("c1", "coop", to)).not.toThrow();
    }
    expect(heard()).toBeNull();
    expect(feature.listener("michael", SUPPORT, POST)).toBeNull();
  });

  it("is not held by somebody out of sight in the lift", () => {
    const { state, standIn, talk, heard } = world();
    standIn("c1", SUPPORT, 50);
    talk("c1", "coop", "doc");
    state.roomFor(SUPPORT).hub.setHidden("c1", true);
    expect(heard()).toBeNull();
  });
});
