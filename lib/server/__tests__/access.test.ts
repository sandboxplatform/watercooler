import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  accessCookieHeader,
  clearFailures,
  codeMatches,
  gateEnabled,
  isOpenPath,
  mintToken,
  rateLimited,
  recordFailure,
  verifyToken,
} from "../access";

const CODE = "11111111-2222-3333-4444-555555555555";
const original = process.env.ACCESS_CODE;

beforeEach(() => {
  process.env.ACCESS_CODE = CODE;
});

afterEach(() => {
  if (original === undefined) delete process.env.ACCESS_CODE;
  else process.env.ACCESS_CODE = original;
});

describe("whether there is a door at all", () => {
  it("is open house when no code is configured", () => {
    delete process.env.ACCESS_CODE;
    expect(gateEnabled()).toBe(false);
  });

  it("treats a code of blank space as no code, rather than a code nobody can type", () => {
    process.env.ACCESS_CODE = "   ";
    expect(gateEnabled()).toBe(false);
  });

  it("is shut once a code is set", () => {
    expect(gateEnabled()).toBe(true);
  });
});

describe("the code itself", () => {
  it("accepts the code", () => {
    expect(codeMatches(CODE)).toBe(true);
  });

  it("refuses a wrong code, an empty one, and a prefix of the real one", () => {
    expect(codeMatches("nope")).toBe(false);
    expect(codeMatches("")).toBe(false);
    expect(codeMatches(CODE.slice(0, -1))).toBe(false);
  });

  it("refuses everything when there is no code to compare against", () => {
    delete process.env.ACCESS_CODE;
    expect(codeMatches("anything")).toBe(false);
    expect(codeMatches("")).toBe(false);
  });
});

describe("the cookie handed out at the door", () => {
  it("verifies the token it just minted", () => {
    expect(verifyToken(mintToken()!)).toBe(true);
  });

  it("mints nothing when there is no code to key it with", () => {
    delete process.env.ACCESS_CODE;
    expect(mintToken()).toBeNull();
  });

  it("refuses a tampered signature", () => {
    const token = mintToken()!;
    expect(verifyToken(token.slice(0, -3) + "aaa")).toBe(false);
  });

  it("refuses a token whose expiry has been pushed out by hand", () => {
    const token = mintToken()!;
    const signature = token.slice(token.indexOf(".") + 1);
    expect(verifyToken(`${Date.now() + 999_999_999}.${signature}`)).toBe(false);
  });

  it("refuses one that has expired", () => {
    expect(verifyToken(`${Date.now() - 1000}.whatever`)).toBe(false);
  });

  it("refuses nonsense and nothing at all", () => {
    expect(verifyToken("garbage")).toBe(false);
    expect(verifyToken("")).toBe(false);
    expect(verifyToken(undefined)).toBe(false);
  });

  /** The whole revocation story: change the code, everyone is back at the door. */
  it("stops honouring cookies minted under the previous code", () => {
    const token = mintToken()!;
    process.env.ACCESS_CODE = "99999999-8888-7777-6666-555555555555";
    expect(verifyToken(token)).toBe(false);
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
