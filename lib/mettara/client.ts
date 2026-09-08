/**
 * Mettara Connect client.
 *
 * Wraps the `mettara-lib` SDK in the two calls the bridge actually needs:
 * provision a seat's identity, and take one conversational turn. The SDK is
 * loaded lazily by a computed specifier so the rest of the app builds and runs
 * with the package absent — Mettara is optional, and only rooms configured for
 * it ever reach this module.
 *
 * The SDK ships as a tarball rather than from the public npm registry
 * (vendored under vendor/mettara-lib), so "not installed" is a
 * routine state that has to produce a readable sentence, not a stack trace.
 *
 * Docs: https://connect-a12e4c.gitlab.io/libraries/nodejs/
 */

import { readFile } from "node:fs/promises";
import { createLogger } from "../logger";
import { readMettaraConfig, seatEmail, sourceUserId, type MettaraConfig } from "./config";

const log = createLogger("Mettara");

/** npm package name of the SDK, as published in the tarball's manifest. */
export const SDK_PACKAGE = "mettara-lib";

export const SDK_MISSING_MESSAGE =
  "The Mettara SDK is not installed. Put mettara-lib.cjs in vendor/mettara-lib, " +
  "run pnpm install, then restart the server.";

/**
 * The slice of the SDK we depend on. Kept structural rather than imported so a
 * missing package is a runtime condition, not a compile error.
 */
interface EmbedToken {
  userId: string;
  groupId: string;
}

interface Conversation {
  id: string;
}

/**
 * One frame of a streamed reply. `content` is the answer; `activity` and
 * `reasoning` are the assistant thinking out loud, and belong nowhere near a
 * worker's speech bubble.
 */
interface Delta {
  content: string;
  type: "content" | "activity" | "reasoning";
}

export interface Sdk {
  EmbedClient: new (
    apiSecret: string,
    baseUrl: string,
    platformId: string,
  ) => {
    getToken(
      sourceUserId: string,
      sourceGroupId: string,
      sourceGroupName: string,
      name: string,
      email: string,
    ): Promise<EmbedToken>;
  };
  /** Takes the same raw platform API key as EmbedClient, then the base URL. */
  MettaraClient: new (
    apiKey: string,
    baseUrl?: string,
  ) => {
    createConversation(
      groupId: string,
      userId: string,
      aiTechnicalName: string,
      name?: string,
    ): Promise<Conversation>;
    /**
     * The turn is taken streamed rather than in one call, because the
     * non-streaming reply is not usable: its `content` is every frame the
     * assistant emitted run together — the status text included — with the
     * answer itself repeated at the end. Asking Mettara for "PONG" comes back
     * as `"Analyzingis thinking...PONGPONG"`. Streamed, the frames arrive
     * typed, and only the `content` ones are the answer.
     */
    streamMessage(
      conversationId: string,
      groupId: string,
      userId: string,
      content: string,
      fileIds?: string[],
    ): AsyncIterable<Delta>;
    uploadFile(groupId: string, file: Uint8Array, filename: string): Promise<{ id: string }>;
    listAis?(groupId: string): Promise<Array<{ technical_name?: string; display_name?: string }>>;
  };
}

let sdkPromise: Promise<Sdk | null> | null = null;

async function importSdk(): Promise<Sdk | null> {
  try {
    // A computed specifier: TypeScript must not try to resolve a package that
    // is legitimately absent, and Next must not try to bundle it.
    const specifier = SDK_PACKAGE;
    const mod: Record<string, unknown> = await import(/* webpackIgnore: true */ specifier);
    const sdk = ((mod as { default?: unknown }).default ?? mod) as Sdk;
    if (!sdk?.EmbedClient || !sdk?.MettaraClient) {
      log.error(`${SDK_PACKAGE} loaded but does not export EmbedClient/MettaraClient`);
      return null;
    }
    // A turn is taken streamed, so an SDK without it is one this cannot use.
    // Named here rather than guessed at later: the plain call's reply would
    // reach a worker's bubble with the status text still in it.
    if (typeof sdk.MettaraClient.prototype?.streamMessage !== "function") {
      log.error(`${SDK_PACKAGE} is too old: MettaraClient has no streamMessage`);
      return null;
    }
    return sdk;
  } catch (err) {
    log.warn(`${SDK_PACKAGE} unavailable: ${(err as Error)?.message ?? err}`);
    return null;
  }
}

/**
 * How the SDK is obtained. Swappable so tests can exercise a real turn
 * without the tarball, which is distributed privately and is not on npm.
 */
let sdkLoader: () => Promise<Sdk | null> = importSdk;

/** Loads the SDK once. Resolves to null when the package is not installed. */
export function loadSdk(): Promise<Sdk | null> {
  if (!sdkPromise) sdkPromise = sdkLoader();
  return sdkPromise;
}

/** Test seam: supply a stand-in SDK, or pass nothing to restore the real one. */
export function setSdkLoader(loader?: () => Promise<Sdk | null>) {
  sdkLoader = loader ?? importSdk;
  sdkPromise = null;
}

/** Test seam: forget the cached SDK so a later load re-resolves. */
export function resetSdkCache() {
  sdkPromise = null;
}

export interface MettaraTurn {
  /** Seat name, used as the Mettara display name and identity key. */
  seatLabel?: string;
  /** Bridge session key — one per seat conversation. */
  sessionKey: string;
  /** The task or chat message from the room. */
  message: string;
  /** Rendered seat personality and company briefing. */
  personality: string;
  /** Existing Mettara conversation id, when this seat has spoken before. */
  conversationId?: string;
  /** AI technical name chosen in the HUD, if any. */
  aiName?: string;
  /** Files that came with the task, to upload and hand over with the message. */
  attachments?: { name: string; path: string }[];
}

export interface MettaraReply {
  text: string;
  /** Conversation id to resume on this seat's next turn. */
  conversationId: string;
}

/**
 * Where the gateway mounts what the SDK asks for. The SDK builds
 * `/v1/conversations…` and `/embed/token`; Mettara's API gateway serves them
 * at `/api/v1/conversations…` and `/api/v1/embed/token` (see its
 * /openapi.json). METTARA_BASE_URL stays the plain host; the prefixes are
 * added here, one per client.
 */
export function apiBase(config: Pick<MettaraConfig, "baseUrl">): string {
  return `${config.baseUrl.replace(/\/$/, "")}/api`;
}

export function embedBase(config: Pick<MettaraConfig, "baseUrl">): string {
  return `${apiBase(config)}/v1`;
}

/**
 * Identity is per seat, so each worker holds its own thread of conversation on
 * Mettara's side. Tokens are cheap but not free; cache them for the life of
 * the process.
 */
const tokenCache = new Map<string, Promise<EmbedToken>>();

export function resetIdentityCache() {
  tokenCache.clear();
}

function identityFor(
  sdk: Sdk,
  config: MettaraConfig,
  userId: string,
  displayName: string,
): Promise<EmbedToken> {
  const cached = tokenCache.get(userId);
  if (cached) return cached;
  const embed = new sdk.EmbedClient(config.apiSecret, embedBase(config), config.platformId);
  const pending = embed
    .getToken(
      userId,
      config.groupId,
      config.groupName,
      displayName,
      seatEmail(userId, config.emailDomain),
    )
    .catch((err: unknown) => {
      // A failed provisioning must not poison the cache — the next turn should
      // be free to try again once the secret or the network is fixed.
      tokenCache.delete(userId);
      throw err;
    });
  tokenCache.set(userId, pending);
  return pending;
}

// ── Whether the service can take a turn ────────────────

/**
 * The AIs the group has, by technical name, or null when Mettara could not
 * be asked at all.
 *
 * Read with a plain request rather than through `sdk.listAis`, which pulls
 * `ais` out of a response the gateway sends as `{"object":"list","data":[…]}`
 * — so it hands back `undefined`, and an undefined list cannot be told apart
 * from an empty group, which is the one distinction this check exists to
 * make. Both shapes are accepted here in case the SDK's is the older one.
 */
async function fetchGroupAis(config: MettaraConfig): Promise<string[] | null> {
  const url = `${apiBase(config)}/v1/ais?group_id=${encodeURIComponent(config.groupId)}`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.apiSecret}` },
    });
    if (!response.ok) {
      log.warn(`could not list the group's AIs: HTTP ${response.status}`);
      return null;
    }
    const body = (await response.json()) as {
      data?: Array<{ technical_name?: string }>;
      ais?: Array<{ technical_name?: string }>;
    };
    const list = body.data ?? body.ais;
    if (!Array.isArray(list)) {
      log.warn("could not list the group's AIs: unexpected response shape");
      return null;
    }
    return list.map((ai) => ai.technical_name ?? "").filter((name) => name.length > 0);
  } catch (err) {
    log.warn(`could not list the group's AIs: ${(err as Error)?.message ?? err}`);
    return null;
  }
}

/**
 * Only the "yes" is remembered. A group that has the AI will go on having
 * it, so the question is asked once per process; every other answer is
 * re-asked, because the fix for it — provisioning an assistant on Mettara's
 * side — happens while this server is running and should not need a restart
 * to be noticed.
 */
let serviceReady = false;

/** Test seam: forget that the service was found ready. */
export function resetServiceReady() {
  serviceReady = false;
}

/**
 * Why Mettara cannot take a turn right now, or null when it can.
 *
 * `mettaraPreflight` answers from the environment and cannot await; this is
 * the half of the question that needs the network — the SDK on this side,
 * and an assistant to talk to on the other. Without one, every run dies in
 * `createConversation` with nothing readable to show a person.
 *
 * An unanswerable check is **not** a refusal. Mettara being unreachable says
 * nothing about which AIs the group has, and the run is about to reach for
 * the same host anyway: better it fails with the real error than be turned
 * away by a check that could not see. Only a definite answer blocks.
 */
export async function mettaraServiceReady(): Promise<string | null> {
  if (serviceReady) return null;

  const config = readMettaraConfig();
  // Missing keys are `mettaraPreflight`'s sentence to say, not this one's.
  if (!config) return null;
  if (!(await loadSdk())) return SDK_MISSING_MESSAGE;

  const names = await fetchGroupAis(config);
  if (!names) return null;
  if (!names.length) {
    return (
      `Mettara group ${config.groupId} has no AI in it, so there is nothing for a ` +
      "worker to talk to. Provision an assistant on Mettara, then set METTARA_AI_NAME " +
      "to its technical name."
    );
  }
  if (!names.includes(config.defaultAiName)) {
    return (
      `Mettara group ${config.groupId} has no AI called "${config.defaultAiName}". ` +
      `Set METTARA_AI_NAME to one it does have: ${names.join(", ")}.`
    );
  }

  serviceReady = true;
  return null;
}

/**
 * Runs one turn against Mettara.
 *
 * The first turn for a seat creates a conversation and prepends the seat's
 * personality, mirroring how the Claude CLI takes a system prompt on the run
 * that starts a session and resumes silently thereafter.
 */
export async function runMettaraTurn(turn: MettaraTurn): Promise<MettaraReply> {
  const config = readMettaraConfig();
  if (!config) throw new Error("Mettara is not configured on this server.");

  const sdk = await loadSdk();
  if (!sdk) throw new Error(SDK_MISSING_MESSAGE);

  const userId = sourceUserId(turn.seatLabel, turn.sessionKey);
  const displayName = turn.seatLabel ?? "WaterCooler agent";
  const token = await identityFor(sdk, config, userId, displayName);

  const client = new sdk.MettaraClient(config.apiSecret, apiBase(config));

  let conversationId = turn.conversationId;
  let opening = turn.message;
  if (!conversationId) {
    const created = await client.createConversation(
      token.groupId,
      token.userId,
      turn.aiName ?? config.defaultAiName,
      displayName,
    );
    conversationId = created.id;
    // Mettara has no separate system-prompt field, so the briefing rides in
    // front of the first message of the conversation.
    opening = `${turn.personality}\n\n${turn.message}`;
    log.info(`Opened Mettara conversation ${conversationId} for ${displayName}`);
  }

  // Files ride with the message, uploaded to the group first.
  const fileIds: string[] = [];
  for (const file of turn.attachments ?? []) {
    const bytes = new Uint8Array(await readFile(file.path));
    const uploaded = await client.uploadFile(token.groupId, bytes, file.name);
    fileIds.push(uploaded.id);
  }

  // Only the `content` frames. The others are the assistant narrating itself
  // — "Analyzing", "is thinking..." — and a worker's bubble is not the place
  // for them; see `streamMessage` above for why the plain call is no use.
  let text = "";
  for await (const delta of client.streamMessage(
    conversationId,
    token.groupId,
    token.userId,
    opening,
    fileIds.length ? fileIds : undefined,
  )) {
    if (delta.type === "content") text += delta.content;
  }
  return { text: text.trim(), conversationId };
}
