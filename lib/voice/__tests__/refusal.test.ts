/**
 * Telling a refused microphone's causes apart.
 *
 * The one that matters is the phone: pressing the pill there went red with
 * no prompt at all, and the only sentence on offer was addressed to somebody
 * who had been asked and said no. Nobody had been asked.
 */

import { describe, expect, it } from "vitest";
import { UNASKED_MS, refusalReason, unsupportedReason } from "../refusal";

const denied = { name: "NotAllowedError", message: "Permission denied" };
const quick = UNASKED_MS / 10;
const slow = UNASKED_MS * 5;

describe("a browser with no microphone to offer", () => {
  it("is fine when it has the API", () => {
    expect(unsupportedReason({ secure: true, hasApi: true })).toBeNull();
  });

  it("says it is the http address, not the browser, when the page is not secure", () => {
    expect(unsupportedReason({ secure: false, hasApi: false })).toMatch(/https/);
  });

  it("blames the browser only when the page is secure", () => {
    expect(unsupportedReason({ secure: true, hasApi: false })).toMatch(/browser cannot/);
  });
});

describe("a refusal", () => {
  it("that came back before anybody could have answered, with the site blocked", () => {
    const reason = refusalReason(denied, { permission: "denied", elapsedMs: quick });
    expect(reason).toMatch(/blocked for this site/);
    expect(reason).toMatch(/allow Microphone/);
  });

  it("that came back unasked with nothing blocked points at another app's web view", () => {
    const reason = refusalReason(denied, { permission: "prompt", elapsedMs: quick });
    expect(reason).toMatch(/without asking/);
    expect(reason).toMatch(/inside another app/);
  });

  it("that the browser cannot explain is still read as unasked when it was quick", () => {
    expect(refusalReason(denied, { permission: null, elapsedMs: quick })).toMatch(/without asking/);
  });

  it("from the device rather than the site says where the device keeps it", () => {
    const reason = refusalReason(
      { name: "NotAllowedError", message: "Permission denied by system" },
      { permission: "granted", elapsedMs: quick },
    );
    expect(reason).toMatch(/device/);
    expect(reason).toMatch(/Settings → Apps → Chrome/);
  });

  it("from a person who was asked is told how to change their mind", () => {
    expect(refusalReason(denied, { permission: "denied", elapsedMs: slow })).toMatch(
      /refused.*icon beside the address/,
    );
    expect(refusalReason(denied, { permission: "prompt", elapsedMs: slow })).toMatch(/asked again/);
  });

  it("of a device somebody else is holding says so", () => {
    for (const name of ["NotReadableError", "TrackStartError", "AbortError"]) {
      expect(refusalReason({ name }, { permission: "granted", elapsedMs: quick })).toMatch(
        /another app/,
      );
    }
  });

  it("with no microphone at all", () => {
    expect(refusalReason({ name: "NotFoundError" }, { permission: null, elapsedMs: 0 })).toMatch(
      /No microphone/,
    );
  });

  it("of any other kind keeps the browser's own words", () => {
    expect(
      refusalReason(
        { name: "WeirdError", message: "the flux is out" },
        { permission: null, elapsedMs: 0 },
      ),
    ).toMatch(/the flux is out/);
  });
});
