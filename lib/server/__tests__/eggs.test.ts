import { describe, expect, it } from "vitest";
import { EGG_SPOILS_MS, NEST_LIMIT, Nest } from "../eggs";
import { EGG_KINDS, EGG_REACH_PX, eggSpot } from "../../world/eggs";

/** Where somebody standing at `at` would leave one. */
const spot = (x: number, y: number) => eggSpot({ x, y });

describe("laying one", () => {
  it("puts it on the ground where it was laid, and names a kind", () => {
    const nest = new Nest();
    const egg = nest.lay(spot(400, 300), 0, 0);
    expect(egg.x).toBe(400);
    expect(egg.y).toBe(spot(400, 300).y);
    expect(EGG_KINDS.some((kind) => kind.id === egg.tier)).toBe(true);
    expect(nest.lying).toHaveLength(1);
  });

  it("takes the kind from the roll it is given and nothing else", () => {
    const nest = new Nest();
    expect(nest.lay(spot(0, 0), 0, 0).tier).toBe(EGG_KINDS[0].id);
    expect(nest.lay(spot(0, 0), 0.999999, 0).tier).toBe(EGG_KINDS[EGG_KINDS.length - 1].id);
  });

  it("gives every one an id of its own", () => {
    const nest = new Nest();
    const ids = new Set([0, 1, 2, 3].map((i) => nest.lay(spot(i * 10, 0), 0, 0).id));
    expect(ids.size).toBe(4);
  });

  /**
   * A busy afternoon must not carpet the park, and the ceiling has to drop
   * the *oldest*: the egg people have already walked past twice is the one
   * least likely to be collected, and refusing to lay a new one instead
   * would switch the whole thing off for as long as the field stayed full.
   */
  it("keeps to its ceiling, dropping the one that has lain longest", () => {
    const nest = new Nest();
    const first = nest.lay(spot(100, 100), 0, 0);
    for (let i = 0; i < NEST_LIMIT; i++) nest.lay(spot(200 + i * 10, 100), 0, i + 1);
    expect(nest.count).toBe(NEST_LIMIT);
    expect(nest.lying.some((egg) => egg.id === first.id)).toBe(false);
  });
});

describe("picking one up", () => {
  it("is refused from across the park, and allowed from over it", () => {
    const nest = new Nest();
    nest.lay(spot(400, 300), 0, 0);
    expect(nest.take({ x: 900, y: 300 })).toBeNull();
    expect(nest.count).toBe(1);
    expect(nest.take({ x: 400, y: 300 })?.tier).toBeDefined();
    expect(nest.count).toBe(0);
  });

  it("answers nothing for a press in an empty field", () => {
    expect(new Nest().take({ x: 0, y: 0 })).toBeNull();
  });

  /** One press, one egg: the other stays for whoever comes next. */
  it("takes the nearest of two and leaves the other", () => {
    const nest = new Nest();
    const near = nest.lay(spot(400, 300), 0, 0);
    const far = nest.lay(spot(400 + EGG_REACH_PX - 4, 300), 0, 0);
    expect(nest.take({ x: 400, y: 300 })?.id).toBe(near.id);
    expect(nest.lying.map((egg) => egg.id)).toEqual([far.id]);
  });

  it("cannot be taken twice", () => {
    const nest = new Nest();
    nest.lay(spot(400, 300), 0, 0);
    expect(nest.take({ x: 400, y: 300 })).not.toBeNull();
    expect(nest.take({ x: 400, y: 300 })).toBeNull();
  });
});

describe("the ones nobody came for", () => {
  it("leaves them alone until their time is up, then forgets them", () => {
    const nest = new Nest();
    nest.lay(spot(400, 300), 0, 0);
    expect(nest.spoil(EGG_SPOILS_MS - 1)).toBe(false);
    expect(nest.count).toBe(1);
    expect(nest.spoil(EGG_SPOILS_MS)).toBe(true);
    expect(nest.count).toBe(0);
  });

  /**
   * Asked on every tick of the room, so the ordinary answer has to cost
   * nothing — which it does by reading the oldest and stopping. The field
   * is kept in the order it was laid, and that is what makes it true.
   */
  it("forgets only the ones past their time, oldest first", () => {
    const nest = new Nest();
    const old = nest.lay(spot(100, 100), 0, 0);
    const fresh = nest.lay(spot(200, 100), 0, EGG_SPOILS_MS / 2);
    expect(nest.spoil(EGG_SPOILS_MS + 1)).toBe(true);
    expect(nest.lying.map((egg) => egg.id)).toEqual([fresh.id]);
    expect(nest.lying.some((egg) => egg.id === old.id)).toBe(false);
  });

  it("says nothing happened when the field is empty", () => {
    expect(new Nest().spoil(Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});
