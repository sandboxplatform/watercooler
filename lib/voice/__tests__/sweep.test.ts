/**
 * The retry's decisions, without a connection in sight.
 *
 * `handshake.test.ts` drives the whole voice chat against a stub
 * `RTCPeerConnection` and watches the messages go out; this asks the policy
 * underneath it the same questions directly, including the ones that take a
 * minute of fake time to reach from the outside.
 */

import { describe, expect, it } from "vitest";
import type { OnlinePerson } from "../../presence-types";
import {
  GONE_GRACE_MS,
  NEGOTIATE_GRACE_MS,
  backoff,
  mendable,
  settled,
  sweepPlan,
  type Greeting,
  type PeerFacts,
  type SweepMemory,
} from "../sweep";

const NOW = 1_000_000;

function peer(facts: Partial<PeerFacts> = {}): PeerFacts {
  return {
    state: "connected",
    changedAt: NOW,
    everConnected: true,
    restartedAt: 0,
    canRestart: true,
    silent: false,
    ...facts,
  };
}

function person(id: string, mic = true): OnlinePerson {
  return { id, name: id, spriteKey: "player", room: "local", mic } as OnlinePerson;
}

function memory(
  greeted: Record<string, Greeting> = {},
  missing: Record<string, number> = {},
): SweepMemory {
  // "me" sorts below "zz" and above "aa", so which of the two a test uses
  // decides which side of `offers` this browser is on.
  return {
    me: "me",
    greeted: new Map(Object.entries(greeted)),
    missing: new Map(Object.entries(missing)),
  };
}

const peers = (entries: Record<string, PeerFacts>) => new Map(Object.entries(entries));

describe("somebody gone from the server's list", () => {
  it("is held on to through a blink", () => {
    const plan = sweepPlan(peers({ zz: peer() }), [], NOW, memory());
    expect(plan.forget).toEqual([]);
    expect(plan.missing.get("zz")).toBe(NOW);
  });

  it("is let go once the grace has run out", () => {
    const plan = sweepPlan(peers({ zz: peer() }), [], NOW + GONE_GRACE_MS, memory({}, { zz: NOW }));
    expect(plan.forget).toEqual(["zz"]);
    expect(plan.missing.has("zz")).toBe(false);
  });

  it("is missing no longer the moment they are back", () => {
    const plan = sweepPlan(peers({ zz: peer() }), [person("zz")], NOW, memory({}, { zz: NOW - 5 }));
    expect(plan.missing.has("zz")).toBe(false);
    expect(plan.forget).toEqual([]);
  });

  it("counts somebody greeted but never connected to", () => {
    const plan = sweepPlan(
      peers({}),
      [],
      NOW + GONE_GRACE_MS,
      memory({ zz: { at: NOW, tries: 1 } }, { zz: NOW }),
    );
    expect(plan.forget).toEqual(["zz"]);
  });

  it("does not ask the memory it was given to change", () => {
    const given = memory({}, {});
    sweepPlan(peers({ zz: peer() }), [], NOW, given);
    expect(given.missing.size).toBe(0);
  });
});

describe("saying hello again", () => {
  it("leaves a working connection alone", () => {
    const plan = sweepPlan(peers({ zz: peer() }), [person("zz")], NOW, memory());
    expect(plan.greet).toEqual([]);
    expect(plan.mend).toEqual([]);
  });

  it("greets somebody on mic with no connection at all", () => {
    const plan = sweepPlan(peers({}), [person("zz")], NOW, memory());
    expect(plan.greet).toEqual([{ id: "zz", tries: 1 }]);
  });

  it("leaves alone somebody whose microphone is off, and does not call them unreachable", () => {
    const plan = sweepPlan(peers({}), [person("zz", false)], NOW, memory());
    expect(plan.greet).toEqual([]);
    expect(plan.quiet).toEqual(["zz"]);
  });

  it("waits out the backoff since the last hello", () => {
    const greeted = { zz: { at: NOW - backoff(2) + 1, tries: 2 } };
    expect(sweepPlan(peers({}), [person("zz")], NOW, memory(greeted)).greet).toEqual([]);
    const later = sweepPlan(peers({}), [person("zz")], NOW + 1, memory(greeted));
    expect(later.greet).toEqual([{ id: "zz", tries: 3 }]);
  });

  it("gives a handshake in progress its grace, and no longer", () => {
    const making = peer({ state: "connecting", everConnected: false, changedAt: NOW });
    expect(sweepPlan(peers({ zz: making }), [person("zz")], NOW + 1, memory()).greet).toEqual([]);
    const stuck = sweepPlan(
      peers({ zz: making }),
      [person("zz")],
      NOW + NEGOTIATE_GRACE_MS,
      memory(),
    );
    expect(stuck.greet).toEqual([{ id: "zz", tries: 1 }]);
  });
});

describe("mending before rebuilding", () => {
  const failed = peer({ state: "failed" });

  it("asks a connection that worked for a new route, on the offering side", () => {
    const plan = sweepPlan(peers({ zz: failed }), [person("zz")], NOW, memory());
    expect(plan.mend).toEqual([{ id: "zz", tries: 1 }]);
    expect(plan.greet).toEqual([]);
  });

  it("leaves the mend to the other side when this one does not offer", () => {
    const plan = sweepPlan(peers({ aa: failed }), [person("aa")], NOW, memory());
    expect(plan.mend).toEqual([]);
    expect(plan.greet).toEqual([{ id: "aa", tries: 1 }]);
  });

  it("rebuilds a connection that never came up", () => {
    const plan = sweepPlan(
      peers({ zz: peer({ state: "failed", everConnected: false }) }),
      [person("zz")],
      NOW,
      memory(),
    );
    expect(plan.greet).toEqual([{ id: "zz", tries: 1 }]);
  });

  it("mends once, then rebuilds", () => {
    const plan = sweepPlan(
      peers({ zz: peer({ state: "failed", restartedAt: NOW - 1 }) }),
      [person("zz")],
      NOW,
      memory(),
    );
    expect(plan.mend).toEqual([]);
    expect(plan.greet).toEqual([{ id: "zz", tries: 1 }]);
  });

  it("rebuilds where the browser cannot restart ICE", () => {
    expect(mendable(peer({ canRestart: false }))).toBe(false);
  });
});

describe("a voice nobody can hear", () => {
  it("is asked to play again", () => {
    const plan = sweepPlan(peers({ zz: peer({ silent: true }) }), [person("zz")], NOW, memory());
    expect(plan.replay).toEqual(["zz"]);
  });

  it("is not, once they are being forgotten", () => {
    const plan = sweepPlan(
      peers({ zz: peer({ silent: true }) }),
      [],
      NOW + GONE_GRACE_MS,
      memory({}, { zz: NOW }),
    );
    expect(plan.replay).toEqual([]);
  });
});

describe("the pieces", () => {
  it("backs off from five seconds to a minute and stays there", () => {
    expect(backoff(0)).toBe(5_000);
    expect(backoff(1)).toBe(10_000);
    expect(backoff(4)).toBe(60_000);
    expect(backoff(40)).toBe(60_000);
  });

  it("counts disconnected as still connecting, for a while", () => {
    const blip = peer({ state: "disconnected", changedAt: NOW });
    expect(settled(blip, NOW + NEGOTIATE_GRACE_MS - 1)).toBe(true);
    expect(settled(blip, NOW + NEGOTIATE_GRACE_MS)).toBe(false);
    expect(settled(undefined, NOW)).toBe(false);
  });
});
