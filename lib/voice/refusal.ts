/**
 * Why the microphone could not be had, in words somebody can act on.
 *
 * Every refusal used to come out as one of three sentences, and the one
 * nearly everybody got — "Microphone access was refused. Allow it in the
 * browser and try again." — was addressed to a person who had just been
 * asked and said no. On a phone that is usually not what happened. A
 * browser that has the site blocked, or has been dismissed often enough
 * to stop asking, or is not a browser at all but another app's web view,
 * refuses in the same breath as the request with no prompt anywhere, and
 * the person pressing the pill watches it go red and has no idea why.
 *
 * So the answer is taken apart by what actually tells the cases apart:
 *
 * | Evidence                        | Means                                           |
 * | ------------------------------- | ----------------------------------------------- |
 * | `isSecureContext` false         | Plain http: no microphone API is offered at all |
 * | "by system" in the message      | The device has it off for the browser, not us   |
 * | Refused faster than a person    | Nothing was asked. Blocked, or not a browser    |
 * | The permission reads `denied`   | This site is set to Block — and where to change |
 *
 * Pure, so the rules are held by a test rather than by a phone.
 */

/**
 * Quicker than anybody answers a permission prompt.
 *
 * A prompt has to be drawn, read and tapped, which is most of a second at
 * the least; a refusal with no prompt behind it comes back in a few
 * milliseconds. Set well clear of both, so a slow phone refusing without
 * asking is not mistaken for a person refusing — the cost of erring that
 * way is only the vaguer of the two sentences.
 */
export const UNASKED_MS = 400;

/** Why this browser cannot do voice chat at all, or null when it can. */
export function unsupportedReason({
  secure,
  hasApi,
}: {
  /** `window.isSecureContext`. */
  secure: boolean;
  /** `RTCPeerConnection` and `navigator.mediaDevices.getUserMedia` both exist. */
  hasApi: boolean;
}): string | null {
  if (hasApi) return null;
  // Browsers take `navigator.mediaDevices` away outright on plain http, so
  // this is the answer whatever the browser is — and it is the case a phone
  // pointed at a dev server by its LAN address lands in.
  if (!secure) {
    return "Voice chat needs a secure (https://) address. This page was opened over plain http, where browsers switch the microphone off altogether.";
  }
  return "This browser cannot do voice chat.";
}

/** What `getUserMedia` threw, reduced to the two fields that are asked. */
export interface MicError {
  name?: string;
  message?: string;
}

/*
 * Short, because on a phone these are read in a box beside the E button.
 * "The icon beside the address" is Chrome's tune icon and Safari's aA, and
 * both open the site's permissions from there.
 */

const BLOCKED =
  "The microphone is blocked for this site. Tap the icon beside the address, allow Microphone, and press the mic again.";

const UNASKED =
  "The browser refused the microphone without asking. Allow Microphone from the icon beside the address — or, if this page is open inside another app, open it in Chrome.";

const DEVICE =
  "This device has the microphone off for the browser. On Android: Settings → Apps → Chrome → Permissions → Microphone.";

/**
 * The sentence for a failed `getUserMedia`.
 *
 * `permission` is what `navigator.permissions` says afterwards, null where
 * it cannot say — Firefox has no "microphone" to query, and a web view may
 * not answer at all. `elapsedMs` is from the request to the refusal.
 */
export function refusalReason(
  err: MicError,
  { permission, elapsedMs }: { permission: PermissionState | null; elapsedMs: number },
): string {
  const name = err.name ?? "";
  const message = err.message ?? "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    // Chrome's wording when the site is allowed and the OS is not.
    if (/system/i.test(message)) return DEVICE;
    if (elapsedMs < UNASKED_MS) return permission === "denied" ? BLOCKED : UNASKED;
    // Asked, and answered no. The way back is the same setting.
    return permission === "denied"
      ? "Microphone access was refused. To allow it, tap the icon beside the address and allow Microphone."
      : "Microphone access was refused. Press the mic to be asked again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found.";
  }
  // Permission given, device not: something else has it.
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return "The microphone would not start — another app or a call may be using it.";
  }
  if (name === "SecurityError") {
    return "This page is not allowed to use a microphone.";
  }
  return `The microphone could not be opened: ${message || name || "no reason given"}`;
}
