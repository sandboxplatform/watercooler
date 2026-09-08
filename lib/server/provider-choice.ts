/**
 * Which AI runs the agents: chosen from the HUD, kept across restarts.
 *
 * The server boots on AGENT_PROVIDER — the Claude CLI unless told otherwise
 * — and that stays the default. The connection panel can switch the bridge
 * to Mettara, or back, while the server runs; the choice is remembered in
 * the room database so a restart comes back on it.
 *
 * The bridge lives in the server's own module graph and the API routes in
 * Next's, so the switch is handed across on globalThis, the way the
 * residents' whereabouts are.
 */

import { getCliProvider, isCliProviderId, type CliProviderId } from "../cli-providers";

export const PROVIDER_SETTING = "agent-provider";

export interface ProviderChoice {
  id: CliProviderId;
  label: string;
  /** Why it cannot run right now, or null when it is ready. */
  blocked: string | null;
  hint: string;
}

export interface ProviderState {
  active: CliProviderId;
  default: CliProviderId;
  choices: ProviderChoice[];
}

/**
 * What the panel offers: the Claude implementation the server booted with,
 * and Mettara. Whichever is the default comes first.
 */
export function offeredProviders(defaultId: CliProviderId): CliProviderId[] {
  const claude: CliProviderId = defaultId === "mettara" ? "claude" : defaultId;
  return defaultId === "mettara" ? ["mettara", claude] : [defaultId, "mettara"];
}

/**
 * Why a provider cannot run right now: what its environment says, then what
 * the service on the other end says.
 *
 * The panel is where a person chooses a provider, so it is where the reason
 * has to be legible — and until this asked the second question, Mettara read
 * as ready whenever its two keys were set, whatever was waiting at the far
 * end. The failure then only appeared as a broken run in a worker's bubble.
 */
export async function providerBlocked(id: CliProviderId): Promise<string | null> {
  const provider = getCliProvider(id);
  const reason = provider.preflight?.() ?? null;
  if (reason) return reason;
  return (await provider.ready?.()) ?? null;
}

export async function describeProviders(
  defaultId: CliProviderId,
  activeId: CliProviderId,
): Promise<ProviderState> {
  const choices = await Promise.all(
    offeredProviders(defaultId).map(async (id) => {
      const provider = getCliProvider(id);
      return {
        id,
        label: provider.displayName,
        blocked: await providerBlocked(id),
        hint: provider.setupHint ?? "",
      };
    }),
  );
  return { active: activeId, default: defaultId, choices };
}

interface SettingStore {
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
}

/** The provider chosen from the HUD before, if it is still one we offer. */
export function rememberedProvider(
  store: SettingStore,
  defaultId: CliProviderId,
): CliProviderId | null {
  const value = store.getSetting(PROVIDER_SETTING) ?? undefined;
  if (!isCliProviderId(value)) return null;
  return offeredProviders(defaultId).includes(value) ? value : null;
}

export function rememberProvider(store: SettingStore, id: CliProviderId) {
  store.setSetting(PROVIDER_SETTING, id);
}

// ── Across the module graphs ────────────────────────────

/** What the running server lets a route do about the provider. */
export interface ProviderSwitch {
  defaultId: CliProviderId;
  active(): CliProviderId;
  /** Switch, or say why not. */
  switchTo(id: CliProviderId): Promise<string | null>;
}

const SWITCH_KEY = Symbol.for("watercooler.provider.switch");

export function registerProviderSwitch(sw: ProviderSwitch | null) {
  const g = globalThis as Record<symbol, unknown>;
  if (sw) g[SWITCH_KEY] = sw;
  else delete g[SWITCH_KEY];
}

/** The running server's switch; null when no bridge is attached. */
export function providerSwitch(): ProviderSwitch | null {
  return (
    ((globalThis as Record<symbol, unknown>)[SWITCH_KEY] as ProviderSwitch | undefined) ?? null
  );
}
