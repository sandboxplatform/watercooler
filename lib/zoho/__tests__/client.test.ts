import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchDepartments, forgetZohoToken, type ZohoConfig } from "../client";

const CONFIG: ZohoConfig = {
  clientId: "id",
  clientSecret: "secret",
  refreshToken: "refresh",
  orgId: "1",
  region: "com",
  departmentId: null,
  timeZone: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  forgetZohoToken();
});

describe("the access token", () => {
  /**
   * The wall's three sweeps start together, and each used to trade the
   * refresh token for a token of its own — three refreshes for one read,
   * against the endpoint Zoho limits hardest.
   */
  it("is refreshed once for everybody who finds it stale at the same moment", async () => {
    const refreshes: string[] = [];
    const signals: (AbortSignal | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        signals.push(init?.signal ?? undefined);
        if (String(input).includes("/oauth/v2/token")) {
          refreshes.push(String(input));
          return Response.json({ access_token: "token", expires_in: 3600 });
        }
        return Response.json({ data: [{ id: "7", name: "Support" }] });
      }),
    );

    const answers = await Promise.all([1, 2, 3].map(() => fetchDepartments(CONFIG)));

    expect(refreshes).toHaveLength(1);
    expect(answers.every((a) => a[0]?.name === "Support")).toBe(true);
    // Every request out gives up on its own rather than waiting for ever.
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });
});
