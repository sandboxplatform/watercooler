import { describe, it, expect, beforeEach, vi } from "vitest";
import { BADGES, BADGE_GROUPS, badgeFor, badgeHolder, isGuestHolder } from "../../badges";
import { ORGANISATIONS, TENANTS } from "../../world/tenants";
import { RESIDENT_COUNT, CAST_RESIDENTS } from "../../world/cast";
import { EGG_KINDS } from "../../world/eggs";
import { floorRoomSlug, campusRoomSlug } from "../../rooms";
import { RoomStore } from "../room-store";

let store: RoomStore;

vi.mock("../room-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../room-store")>();
  return { ...actual, getRoomStore: () => store };
});

const rules = await import("../badge-rules");

const coop = { person: "coop", name: "Coop" };
const guest = { person: "guest:ann", name: "Ann" };

/** Every code granted by one call, for the assertions below. */
const codes = (earned: { code: string }[]) => earned.map((b) => b.code);

/** A plain basket: neither off the board nor from the far end. */
const LAY_UP = { banked: false, far: false };

beforeEach(() => {
  store = new RoomStore(":memory:");
});

describe("who a badge belongs to", () => {
  it("files a personal code under the person, so it follows them to any browser", () => {
    expect(badgeHolder("coop", "Coop")).toBe("coop");
    expect(badgeHolder("coop", "Somebody Else")).toBe("coop");
  });

  it("has nothing but a name to file a visitor under, and says so", () => {
    expect(badgeHolder("visitor", "Ann")).toBe("guest:ann");
    expect(badgeHolder("visitor", " ANN ")).toBe("guest:ann");
    expect(isGuestHolder(badgeHolder("visitor", "Ann"))).toBe(true);
    expect(isGuestHolder(badgeHolder("coop", "Coop"))).toBe(false);
  });

  it("gives a nameless visitor a shelf rather than an empty key", () => {
    expect(badgeHolder("visitor", "   ")).toBe("guest:guest");
  });
});

describe("turning up", () => {
  it("gives Walked In once, however many doors you go through", () => {
    expect(codes(rules.onArrival(coop, "sandbox-erp", noon()))).toContain("walked-in");
    expect(codes(rules.onArrival(coop, "castle-atlantic", noon()))).not.toContain("walked-in");
  });

  it("keeps two people's shelves apart", () => {
    rules.onArrival(coop, "sandbox-erp", noon());
    expect(codes(rules.onArrival(guest, "sandbox-erp", noon()))).toContain("walked-in");
  });

  it("gives Night Shift in the small hours and not at noon", () => {
    expect(codes(rules.onArrival(coop, "sandbox-erp", at(2)))).toContain("night-shift");
    expect(codes(rules.onArrival(guest, "sandbox-erp", at(13)))).not.toContain("night-shift");
  });

  it("reads a floor as a lift ride, and the third one as Operations", () => {
    const first = codes(rules.onArrival(coop, floorRoomSlug("mettara", 1), noon()));
    expect(first).toContain("going-up");
    expect(first).not.toContain("third-floor");
    expect(codes(rules.onArrival(coop, floorRoomSlug("sandbox-erp", 3), noon()))).toContain(
      "third-floor",
    );
  });

  it("gives Sea Legs for the island and for nowhere else", () => {
    expect(codes(rules.onArrival(coop, campusRoomSlug("homestar"), noon()))).not.toContain(
      "sea-legs",
    );
    expect(codes(rules.onArrival(coop, campusRoomSlug("apeiron-media"), noon()))).toContain(
      "sea-legs",
    );
  });
});

describe("the badges built on a set of places", () => {
  it("gives the Grand Tour on the last organisation and not before", () => {
    const slugs = ORGANISATIONS.map((org) => TENANTS.find((t) => t.org === org.slug)!.slug);
    const earned = slugs.flatMap((slug) => codes(rules.onArrival(coop, slug, noon())));
    expect(earned.filter((code) => code === "grand-tour")).toHaveLength(1);

    // And the one before last did not, which is the half that would pass by
    // accident if the count were wrong in the generous direction.
    const partway = slugs.slice(0, -1).flatMap((s) => codes(rules.onArrival(guest, s, noon())));
    expect(partway).not.toContain("grand-tour");
  });

  it("counts a visit twice as one place", () => {
    const one = TENANTS.find((t) => t.org === "chester")!.slug;
    for (let i = 0; i < 20; i += 1) rules.onArrival(coop, one, noon());
    expect(store.countMarks("coop", "org:")).toBe(1);
  });

  it("wants a store, a warehouse and a garage for Back of House", () => {
    const of = (kind: string) => TENANTS.find((t) => t.kind === kind)!.slug;
    expect(codes(rules.onArrival(coop, of("store"), noon()))).not.toContain("back-of-house");
    expect(codes(rules.onArrival(coop, of("warehouse"), noon()))).not.toContain("back-of-house");
    expect(codes(rules.onArrival(coop, of("garage"), noon()))).toContain("back-of-house");
  });
});

describe("playing", () => {
  it("gives Insert Coin on a score, and Top of the Board only at the top", () => {
    expect(codes(rules.onScore(coop, "pinball", true))).toEqual(
      expect.arrayContaining(["insert-coin", "top-of-the-board"]),
    );
    expect(codes(rules.onScore(guest, "pinball", false))).toEqual(["insert-coin"]);
  });

  it("gives Swish for a basket, once, however many go in", () => {
    expect(rules.onBasket(coop, LAY_UP).map((b) => b.code)).toEqual(["swish"]);
    expect(rules.onBasket(coop, LAY_UP)).toEqual([]);
  });

  it("gives Off the Board and Full Court only for the shot that was taken", () => {
    expect(codes(rules.onBasket(coop, { banked: true, far: false }))).toEqual(
      expect.arrayContaining(["swish", "off-the-board"]),
    );
    expect(codes(rules.onBasket(coop, { banked: true, far: false }))).toEqual([]);
    expect(codes(rules.onBasket(guest, { banked: false, far: true }))).toEqual(
      expect.arrayContaining(["swish", "full-court"]),
    );
    // A lay-up afterwards is still just a lay-up: neither is a tally, and
    // neither is handed over by having sunk a basket of another kind.
    expect(codes(rules.onBasket(guest, LAY_UP))).toEqual([]);
  });

  it("gives Played the Lot for every machine that is actually in a lobby", () => {
    const machines = rules.SCORED_MACHINES;
    expect(machines.length).toBeGreaterThan(1);
    const earned = machines.flatMap((machine) => codes(rules.onScore(coop, machine, false)));
    expect(earned.filter((code) => code === "played-the-lot")).toHaveLength(1);
  });

  it("does not count a machine standing in no building", () => {
    // Three of the five arcade games are declared by no tenant, so a badge
    // counting the catalogue would be one nobody could ever finish.
    const declared = new Set<string>(TENANTS.flatMap((t) => (t.game ? [t.game as string] : [])));
    for (const machine of rules.SCORED_MACHINES) expect(declared.has(machine)).toBe(true);
  });
});

describe("the locals", () => {
  it("gives Cluck for Michael and Ticket Raised for Doc, once each", () => {
    expect(codes(rules.onMingle(coop, "michael"))).toContain("cluck");
    expect(codes(rules.onMingle(coop, "michael"))).toEqual([]);
    expect(codes(rules.onMingle(coop, "doc"))).toContain("ticket-raised");
  });

  it("gives Ran Him Down for a catch, which standing beside him is not", () => {
    // Cluck is walking up to him; this is keeping up once he is running.
    expect(codes(rules.onMingle(coop, "michael"))).toContain("cluck");
    expect(codes(rules.onCaught(coop))).toEqual(["ran-him-down"]);
    expect(codes(rules.onCaught(coop))).toEqual([]);
  });

  it("gives Knows Everybody on the last resident", () => {
    const ids = CAST_RESIDENTS.map((r) => r.id);
    expect(ids).toHaveLength(RESIDENT_COUNT);
    const earned = ids.flatMap((id) => codes(rules.onMingle(coop, id)));
    expect(earned.filter((code) => code === "knows-everybody")).toHaveLength(1);
  });
});

describe("getting about, out of doors", () => {
  it("gives one badge for the wood and another for the wilderness", () => {
    expect(codes(rules.onOutdoors(coop, "wood"))).toEqual(["into-the-woods"]);
    expect(codes(rules.onOutdoors(coop, "wood"))).toEqual([]);
    expect(codes(rules.onOutdoors(coop, "wilderness"))).toEqual(["out-in-the-wild"]);
  });

  it("gives Right of Way once, however many cars go through", () => {
    expect(codes(rules.onRunThrough(coop))).toEqual(["right-of-way"]);
    expect(codes(rules.onRunThrough(coop))).toEqual([]);
  });
});

describe("together", () => {
  it("gives Round Table only once four people are in Global Chat", () => {
    const three = [coop, guest, { person: "rob", name: "Rob" }];
    expect(codes(rules.onMicOn(coop, three))).toEqual(["on-mic"]);
    const four = [...three, { person: "sara", name: "Sara" }];
    const earned = codes(rules.onMicOn({ person: "sara", name: "Sara" }, four));
    expect(earned.filter((code) => code === "round-table")).toHaveLength(4);
  });

  it("gives the host Called to Order and everyone else at the table a seat", () => {
    const earned = rules.onMeetingCalled(coop, [guest]);
    expect(earned.find((b) => b.person === "coop")?.code).toBe("called-to-order");
    expect(earned.find((b) => b.person === "guest:ann")?.code).toBe("took-a-seat");
  });

  it("shares Full House with everybody standing in the room", () => {
    const earned = rules.onRoomFull([coop, guest]);
    expect(earned.map((b) => b.person).sort()).toEqual(["coop", "guest:ann"]);
  });
});

describe("the eggs", () => {
  it("gives Finders Keepers on the first egg and not the second", () => {
    expect(codes(rules.onEggFound(coop, "plain"))).toContain("finders-keepers");
    expect(codes(rules.onEggFound(coop, "plain"))).not.toContain("finders-keepers");
  });

  it("gives Over the Rainbow for the rainbow one only", () => {
    expect(codes(rules.onEggFound(coop, "gilded"))).not.toContain("over-the-rainbow");
    expect(codes(rules.onEggFound(coop, "rainbow"))).toContain("over-the-rainbow");
  });

  /**
   * A set rather than a count, with the target read off the ladder — so a
   * seventh kind moves it, the way a new organisation moves the Grand Tour.
   */
  it("gives the Whole Clutch on the last kind and not before", () => {
    const earned = EGG_KINDS.flatMap((kind) => codes(rules.onEggFound(coop, kind.id)));
    expect(earned.filter((code) => code === "whole-clutch")).toHaveLength(1);

    // And nine of one kind is not a clutch, which is the half that would
    // pass by accident if it counted eggs rather than kinds.
    const same = Array.from({ length: 9 }).flatMap(() => codes(rules.onEggFound(guest, "plain")));
    expect(same).not.toContain("whole-clutch");
  });

  it("credits the fright to whoever caused it, once", () => {
    expect(codes(rules.onEggLaid(coop))).toContain("ruffled-feathers");
    expect(codes(rules.onEggLaid(coop))).not.toContain("ruffled-feathers");
  });
});

describe("the catalogue", () => {
  it("rewards no badge for sheer volume", () => {
    // Every entry keys on a moment, or on a set of distinct moments — a map
    // of the world rather than a grind through it.
    const volumeWords = /\b(100|50|ten|hundred|many|most|volume|times)\b/i;
    const offenders = BADGES.filter((b) => volumeWords.test(b.description));
    expect(offenders.map((b) => b.code)).toEqual([]);
  });

  it("has unique codes, resolves them, and puts each in a real group", () => {
    const groups = new Set(BADGE_GROUPS.map((g) => g.id));
    const codes = BADGES.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const badge of BADGES) {
      expect(badgeFor(badge.code)?.code).toBe(badge.code);
      expect(groups.has(badge.group)).toBe(true);
    }
  });

  it("tells somebody who has not got it where to go", () => {
    // The card shows `hint` and nothing else does, so a missing one is a
    // badge whose card is the row again — which is the thing the card was
    // added instead of. A sentence, and not the description said twice.
    for (const badge of BADGES) {
      expect(badge.hint.trim().length).toBeGreaterThan(20);
      expect(badge.hint.trim()).toMatch(/\.$/);
      expect(badge.hint.toLowerCase()).not.toBe(badge.description.toLowerCase());
    }
  });

  it("lists no group with nothing in it", () => {
    for (const group of BADGE_GROUPS) {
      expect(BADGES.some((b) => b.group === group.id)).toBe(true);
    }
  });

  /**
   * The rule the old catalogue broke twice: a badge nobody can earn reads in
   * the list as something still to find, and there is nothing to find. This
   * drives every rule there is and insists the catalogue is used up.
   */
  it("offers no badge nothing can grant", () => {
    const granted = new Set<string>();
    const take = (earned: { code: string }[]) => earned.forEach((b) => granted.add(b.code));

    const someone = { person: "sweep", name: "Sweep" };
    take(rules.onArrival(someone, "sandbox-erp", at(2)));
    for (const org of ORGANISATIONS) {
      take(rules.onArrival(someone, TENANTS.find((t) => t.org === org.slug)!.slug, at(2)));
    }
    for (const kind of ["store", "warehouse", "garage"]) {
      take(rules.onArrival(someone, TENANTS.find((t) => t.kind === kind)!.slug, at(2)));
    }
    take(rules.onArrival(someone, floorRoomSlug("sandbox-erp", 3), at(2)));
    take(rules.onArrival(someone, campusRoomSlug("apeiron-media"), at(2)));
    take(rules.onAlone(someone));
    take(rules.onRoomFull([someone]));
    take(rules.onMicOn(someone, [someone, someone, someone, someone]));
    take(rules.onMeetingCalled(someone, []));
    take(rules.onMeetingJoined(someone));
    take(rules.onWhiteboard(someone));
    take(rules.onPingPong([someone]));
    take(rules.onBasket(someone, { banked: true, far: true }));
    take(rules.onCaught(someone));
    take(rules.onOutdoors(someone, "wood"));
    take(rules.onOutdoors(someone, "wilderness"));
    take(rules.onRunThrough(someone));
    take(rules.onEggLaid(someone));
    for (const kind of EGG_KINDS) take(rules.onEggFound(someone, kind.id));
    for (const machine of rules.SCORED_MACHINES) take(rules.onScore(someone, machine, true));
    for (const resident of CAST_RESIDENTS) take(rules.onMingle(someone, resident.id));

    expect(BADGES.map((b) => b.code).filter((code) => !granted.has(code))).toEqual([]);
  });
});

function at(hour: number): Date {
  const date = new Date();
  date.setHours(hour, 30, 0, 0);
  return date;
}

function noon(): Date {
  return at(12);
}
