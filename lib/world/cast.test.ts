import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CAST, CAST_PEOPLE, CAST_RESIDENTS, castMember, RESIDENT_COUNT } from "./cast";
import { RESIDENTS } from "./residents";
import { ORGANISATIONS } from "./tenants";
import { WORKER_SPRITES } from "../characters/sprites";
import { personaFor } from "../server/access";
import type { AccessIdentity } from "../identity";

/**
 * The cast is a fourth place to edit when somebody joins the world, after
 * the three in CLAUDE.md, and this is what makes that survivable.
 *
 * Every assertion here is one way the list can go quietly wrong: a persona
 * with no entry, an entry naming a sprite that does not exist, a resident
 * whose organisation the roster disagrees about, a concept sheet that is
 * not on disk. Each of those draws a blank card or a broken image in the
 * People panel and in the profile window, and none of them is an error at
 * build time.
 */

/** Every identity that can hold a code — the union, minus the shared one. */
const PERSONAS: AccessIdentity[] = [
  "coop",
  "rob",
  "hunter",
  "nathan",
  "sara",
  "andrew",
  "campbell",
  "nick",
];

describe("the cast", () => {
  it("has an entry for every persona, agreeing about who they are", () => {
    for (const identity of PERSONAS) {
      const persona = personaFor(identity)!;
      const member = castMember(identity);
      expect(member, `no cast entry for ${identity}`).toBeTruthy();
      expect(member!.kind).toBe("person");
      expect(member!.name).toBe(persona.name);
      expect(member!.org).toBe(persona.home ?? null);
      expect(member!.spriteKey).toBe(persona.characterKey);
    }
  });

  it("lists every persona and nobody else as a person", () => {
    expect(CAST_PEOPLE.map((m) => m.id).sort()).toEqual([...PERSONAS].sort());
  });

  it("has an entry for every resident, agreeing about who they are", () => {
    for (const resident of RESIDENTS) {
      const member = castMember(resident.id);
      expect(member, `no cast entry for ${resident.id}`).toBeTruthy();
      expect(member!.kind).toBe("resident");
      expect(member!.name).toBe(resident.name);
      expect(member!.org).toBe(resident.org);
      expect(member!.spriteKey).toBe(resident.spriteKey);
    }
    expect(CAST_RESIDENTS.map((m) => m.id).sort()).toEqual(RESIDENTS.map((r) => r.id).sort());
    expect(RESIDENT_COUNT).toBe(RESIDENTS.length);
  });

  it("gives everybody one id, which is what a badge hangs on", () => {
    const ids = CAST.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("dresses everybody in a sheet the world actually has", () => {
    const keys = new Set(WORKER_SPRITES.map((sprite) => sprite.key));
    for (const member of CAST) {
      expect(keys.has(member.spriteKey), `${member.id} wears "${member.spriteKey}"`).toBe(true);
    }
  });

  it("names an organisation that exists, or none at all", () => {
    const slugs = new Set(ORGANISATIONS.map((org) => org.slug));
    for (const member of CAST) {
      if (member.org === null) continue;
      expect(slugs.has(member.org), `${member.id} works for "${member.org}"`).toBe(true);
    }
  });

  it("names a concept sheet that is on disk, at the path the browser asks for", () => {
    for (const member of CAST) {
      if (!member.art) continue;
      expect(member.art.startsWith("/characters/examples/")).toBe(true);
      const file = join(process.cwd(), "public", member.art.replace(/^\//, ""));
      expect(existsSync(file), `${member.id}: ${member.art} is not there`).toBe(true);
    }
  });

  it("gives everybody a role and something to read", () => {
    for (const member of CAST) {
      expect(member.role.length).toBeGreaterThan(0);
      // Long enough to be a backstory rather than a label, which is the
      // difference between a profile and a list row with a bigger picture.
      expect(member.backstory.length, `${member.id} has no story`).toBeGreaterThan(80);
    }
  });
});
