import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  accessCookieHeader,
  clearFailures,
  codeFromUrl,
  codeMatches,
  gateEnabled,
  identityForCode,
  identityOf,
  isOpenPath,
  misconfiguredCodes,
  mintToken,
  personaFor,
  rateLimited,
  recordFailure,
  urlWithoutCode,
  verifyToken,
} from "../access";

const CODE = "11111111-2222-3333-4444-555555555555";
const COOP_CODE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ROB_CODE = "99999999-8888-7777-6666-555555555555";

const VARS = ["ACCESS_CODE", "ACCESS_CODE_COOP", "ACCESS_CODE_ROB"] as const;
const original = Object.fromEntries(VARS.map((v) => [v, process.env[v]]));

beforeEach(() => {
  process.env.ACCESS_CODE = CODE;
  process.env.ACCESS_CODE_COOP = COOP_CODE;
  process.env.ACCESS_CODE_ROB = ROB_CODE;
});

afterEach(() => {
  for (const v of VARS) {
    if (original[v] === undefined) delete process.env[v];
    else process.env[v] = original[v];
  }
});

describe("whether there is a door at all", () => {
  it("is open house when no code of any kind is configured", () => {
    for (const v of VARS) delete process.env[v];
    expect(gateEnabled()).toBe(false);
  });

  it("treats a code of blank space as no code, rather than a code nobody can type", () => {
    for (const v of VARS) delete process.env[v];
    process.env.ACCESS_CODE = "   ";
    expect(gateEnabled()).toBe(false);
  });

  it("is shut once a code is set", () => {
    expect(gateEnabled()).toBe(true);
  });

  /** Locked to everyone but its owner is still locked, and must not boot open. */
  it("stays shut when only a personal code is set", () => {
    delete process.env.ACCESS_CODE;
    expect(gateEnabled()).toBe(true);
  });
});

describe("whose code it is", () => {
  it("knows the shared code from each personal one", () => {
    expect(identityForCode(CODE)).toBe("visitor");
    expect(identityForCode(COOP_CODE)).toBe("coop");
    expect(identityForCode(ROB_CODE)).toBe("rob");
  });

  it("refuses a wrong code, an empty one, and a prefix of a real one", () => {
    expect(identityForCode("nope")).toBeNull();
    expect(identityForCode("")).toBeNull();
    expect(identityForCode(CODE.slice(0, -1))).toBeNull();
    expect(codeMatches("nope")).toBe(false);
    expect(codeMatches(COOP_CODE)).toBe(true);
  });

  it("refuses a personal code that has been withdrawn", () => {
    delete process.env.ACCESS_CODE_ROB;
    expect(identityForCode(ROB_CODE)).toBeNull();
    expect(identityForCode(COOP_CODE)).toBe("coop");
  });

  it("refuses everything when there is no code to compare against", () => {
    for (const v of VARS) delete process.env[v];
    expect(identityForCode("anything")).toBeNull();
    expect(identityForCode("")).toBeNull();
  });

  /** Sharing a code between two people is a mistake worth shouting about. */
  it("reports a personal code that is also the shared one", () => {
    process.env.ACCESS_CODE_COOP = CODE;
    expect(misconfiguredCodes()).toContain("ACCESS_CODE_COOP is the same as ACCESS_CODE");
  });

  it("reports two people given the same code", () => {
    process.env.ACCESS_CODE_ROB = COOP_CODE;
    expect(misconfiguredCodes()).toContain("ACCESS_CODE_COOP is the same as ACCESS_CODE_ROB");
  });

  it("is quiet when every code is its own", () => {
    expect(misconfiguredCodes()).toEqual([]);
  });
});

describe("the cookie handed out at the door", () => {
  it("verifies the token it just minted, and says who it belongs to", () => {
    expect(verifyToken(mintToken("visitor")!)).toBe("visitor");
    expect(verifyToken(mintToken("coop")!)).toBe("coop");
    expect(verifyToken(mintToken("rob")!)).toBe("rob");
  });

  it("mints nothing when there is no code to key it with", () => {
    delete process.env.ACCESS_CODE;
    expect(mintToken("visitor")).toBeNull();
  });

  it("refuses a tampered signature", () => {
    const token = mintToken("visitor")!;
    expect(verifyToken(token.slice(0, -3) + "aaa")).toBeNull();
  });

  /** The point of signing the identity: a visitor must not become Coop. */
  it("refuses a cookie whose identity has been edited", () => {
    const token = mintToken("visitor")!;
    const [expiry, , signature] = token.split(".");
    expect(verifyToken(`${expiry}.coop.${signature}`)).toBeNull();
    expect(verifyToken(`${expiry}.rob.${signature}`)).toBeNull();
  });

  it("refuses a token whose expiry has been pushed out by hand", () => {
    const token = mintToken("visitor")!;
    const signature = token.split(".")[2];
    expect(verifyToken(`${Date.now() + 999_999_999}.visitor.${signature}`)).toBeNull();
  });

  it("refuses one that has expired", () => {
    expect(verifyToken(`${Date.now() - 1000}.visitor.whatever`)).toBeNull();
  });

  it("refuses nonsense, an unknown identity, and nothing at all", () => {
    expect(verifyToken("garbage")).toBeNull();
    expect(verifyToken("")).toBeNull();
    expect(verifyToken(undefined)).toBeNull();
    expect(verifyToken(`${Date.now() + 60_000}.nobody.sig`)).toBeNull();
  });

  /** The whole revocation story: change the code, those cookies are done. */
  it("stops honouring cookies minted under the previous code", () => {
    const token = mintToken("visitor")!;
    process.env.ACCESS_CODE = "00000000-1111-2222-3333-444444444444";
    expect(verifyToken(token)).toBeNull();
  });

  /** Rotating one person's code must not turn everyone else out. */
  it("rotates one identity's cookies without touching another's", () => {
    const coop = mintToken("coop")!;
    const visitor = mintToken("visitor")!;
    process.env.ACCESS_CODE_COOP = "00000000-1111-2222-3333-444444444444";
    expect(verifyToken(coop)).toBeNull();
    expect(verifyToken(visitor)).toBe("visitor");
  });
});

describe("what a cookie entitles someone to", () => {
  it("reads the identity out of a Cookie header", () => {
    const token = mintToken("coop")!;
    expect(identityOf(`other=1; wc_access=${token}; more=2`)).toBe("coop");
  });

  it("treats a missing, junk or absent cookie as a visitor", () => {
    expect(identityOf(undefined)).toBe("visitor");
    expect(identityOf("wc_access=garbage")).toBe("visitor");
    expect(identityOf("something=else")).toBe("visitor");
  });

  it("gives Coop and Rob their name, their look and Sandbox ERP", () => {
    for (const identity of ["coop", "rob"] as const) {
      const persona = personaFor(identity)!;
      expect(persona.name).toBe(identity === "coop" ? "Coop" : "Rob");
      expect(persona.home).toBe("sandbox-erp");
      expect(persona.characterKey).toBe(`character_${identity}`);
    }
  });

  it("gives a visitor no persona, so they choose for themselves and work nowhere", () => {
    expect(personaFor("visitor")).toBeNull();
  });
});

describe("the Set-Cookie header", () => {
  it("keeps the cookie away from scripts and off cross-site posts", () => {
    const header = accessCookieHeader("token", false);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
  });

  it("marks it Secure in production, where plain HTTP would leak it", () => {
    expect(accessCookieHeader("token", true)).toContain("Secure");
    expect(accessCookieHeader("token", false)).not.toContain("Secure");
  });
});

describe("which paths answer before anyone has a cookie", () => {
  it("opens the door itself, the health probe and the build's assets", () => {
    expect(isOpenPath("/unlock")).toBe(true);
    expect(isOpenPath("/api/unlock")).toBe(true);
    expect(isOpenPath("/api/health")).toBe(true);
    expect(isOpenPath("/_next/static/chunk.js")).toBe(true);
    expect(isOpenPath("/api/auth/callback/google")).toBe(true);
  });

  it("gates the world, the rooms and both sockets", () => {
    expect(isOpenPath("/")).toBe(false);
    expect(isOpenPath("/world")).toBe(false);
    expect(isOpenPath("/r/somewhere")).toBe(false);
    expect(isOpenPath("/api/room/state")).toBe(false);
    expect(isOpenPath("/api/gateway")).toBe(false);
    expect(isOpenPath("/api/room/socket")).toBe(false);
  });

  /** A prefix match here would have opened far more than the door. */
  it("does not let a lookalike path in on the strength of a prefix", () => {
    expect(isOpenPath("/unlockfoo")).toBe(false);
    expect(isOpenPath("/api/healthz")).toBe(false);
    expect(isOpenPath("/api/unlock-me")).toBe(false);
  });
});

describe("the code arriving in a link", () => {
  it("is found wherever it sits in the query", () => {
    expect(codeFromUrl(`/?code=${CODE}`)).toBe(CODE);
    expect(codeFromUrl(`/world?room=x&code=${CODE}`)).toBe(CODE);
    expect(codeFromUrl(`/r/somewhere?code=${CODE}&other=1`)).toBe(CODE);
  });

  it("is absent when no link carries one", () => {
    expect(codeFromUrl("/")).toBeNull();
    expect(codeFromUrl("/world?room=x")).toBeNull();
  });

  /** An empty code is still an attempt, and must not be mistaken for absence. */
  it("tells an empty code apart from none at all", () => {
    expect(codeFromUrl("/?code=")).toBe("");
    expect(codeMatches("")).toBe(false);
  });

  it("strips the code and keeps everything else about the target", () => {
    expect(urlWithoutCode(`/?code=${CODE}`)).toBe("/");
    expect(urlWithoutCode(`/world?code=${CODE}`)).toBe("/world");
    expect(urlWithoutCode(`/world?room=x&code=${CODE}`)).toBe("/world?room=x");
    expect(urlWithoutCode(`/r/a/floor/2?code=${CODE}&zoom=3`)).toBe("/r/a/floor/2?zoom=3");
  });

  it("leaves a target that never had one alone", () => {
    expect(urlWithoutCode("/world?room=x")).toBe("/world?room=x");
    expect(urlWithoutCode("/")).toBe("/");
  });

  /** Only the path and query are ever used, so a smuggled host goes nowhere. */
  it("never returns somewhere off this site", () => {
    expect(urlWithoutCode("http://evil.example/world?code=x")).toBe("/world");
    expect(urlWithoutCode("//evil.example/world")).toBe("/world");
    expect(urlWithoutCode("")).toBe("/");
  });
});

describe("guessing the code", () => {
  const ip = "203.0.113.9";

  beforeEach(() => clearFailures(ip));

  it("lets a few typos through without complaint", () => {
    for (let i = 0; i < 9; i += 1) recordFailure(ip);
    expect(rateLimited(ip)).toBe(false);
  });

  it("stops answering after ten wrong guesses", () => {
    for (let i = 0; i < 10; i += 1) recordFailure(ip);
    expect(rateLimited(ip)).toBe(true);
  });

  it("counts each address separately, so one guesser cannot lock out the office", () => {
    for (let i = 0; i < 10; i += 1) recordFailure(ip);
    expect(rateLimited("198.51.100.4")).toBe(false);
  });

  it("forgets the failures once someone gets in", () => {
    for (let i = 0; i < 10; i += 1) recordFailure(ip);
    clearFailures(ip);
    expect(rateLimited(ip)).toBe(false);
  });
});
