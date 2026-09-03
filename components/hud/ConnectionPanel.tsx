"use client";

import { useEffect, useState } from "react";
import { useStudio } from "@/lib/store";
import { chooseProvider, fetchProviders, type ProviderState } from "@/lib/provider-client";
import type { CliProviderId } from "@/lib/cli-providers";
import { STATUS_LABELS } from "@/lib/constants";
import { parseGatewayAddress, getProviderLabel, getProviderSetupHint } from "@/lib/utils";
import HudFlyout from "./HudFlyout";

const PROVIDER_LABEL = getProviderLabel();
const SETUP_HINT = getProviderSetupHint();

export default function ConnectionPanel() {
  const { state, connect, disconnect } = useStudio();
  const isConnected = state.connection === "connected";
  const isConnecting = state.connection === "connecting";
  const isAuthFailed = state.connection === "auth_failed";
  const isUnreachable = state.connection === "unreachable";
  const isRateLimited = state.connection === "rate_limited";

  const [error, setError] = useState("");

  // Which AI the agents run on, and what else they could: the server says.
  const [providers, setProviders] = useState<ProviderState | null>(null);
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    let live = true;
    void fetchProviders().then((state) => {
      if (live) setProviders(state);
    });
    return () => {
      live = false;
    };
  }, []);
  const activeLabel =
    providers?.choices.find((c) => c.id === providers.active)?.label ?? PROVIDER_LABEL;

  /** Switch the agents to another AI, then connect to it. Only while disconnected. */
  const handleChoose = async (id: CliProviderId) => {
    if (!providers || isConnected || isConnecting) return;
    setError("");
    if (id !== providers.active) {
      setSwitching(true);
      const { state, refused } = await chooseProvider(id);
      if (state) setProviders(state);
      setSwitching(false);
      if (refused) {
        setError(refused);
        return;
      }
    }
    connect({ url: parseGatewayAddress("") ?? "", token: "" });
  };

  const handleConnect = () => {
    setError("");
    // Every provider runs through the local bridge — no gateway URL or token needed.
    connect({ url: parseGatewayAddress("") ?? "", token: "" });
  };

  return (
    <HudFlyout
      title="Connection"
      subtitle={`${STATUS_LABELS[state.connection]} (${activeLabel})`}
    >
      <div className="hud-panel__stack">
        {providers && providers.choices.length > 1 && (
          <>
            <label className="hud-panel__label">Agents run on</label>
            <div className="hud-panel__choices" role="radiogroup" aria-label="Agent provider">
              {providers.choices.map((choice) => {
                const active = choice.id === providers.active;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`pixel-button hud-choice${active ? " hud-choice--active" : ""}`}
                    onClick={() => void handleChoose(choice.id)}
                    disabled={isConnected || isConnecting || switching}
                    title={
                      choice.blocked ??
                      (choice.id === providers.default ? "The default" : choice.hint)
                    }
                  >
                    {choice.label}
                    {active ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
            {(isConnected || isConnecting) && (
              <p style={{ color: "var(--pixel-muted)", fontSize: "8px" }}>
                Disconnect to switch the agents to another AI.
              </p>
            )}
          </>
        )}
        {!isConnected && !isConnecting && (
          <p style={{ color: "var(--pixel-muted)", fontSize: "8px" }}>
            Using {activeLabel} as agent provider.{" "}
            {providers?.choices.find((c) => c.id === providers.active)?.hint ?? SETUP_HINT}
          </p>
        )}
        {isAuthFailed && !error && (
          <p style={{ color: "var(--pixel-red)", fontSize: "8px" }}>
            Authentication failed. Token may be invalid or expired — please re-enter.
          </p>
        )}
        {isUnreachable && !error && (
          <p style={{ color: "var(--pixel-red)", fontSize: "8px" }}>
            Gateway is unreachable. Please check if your gateway is running.
          </p>
        )}
        {isRateLimited && !error && (
          <p style={{ color: "var(--pixel-red)", fontSize: "8px" }}>
            Too many failed attempts. Please wait a moment before retrying.
          </p>
        )}
        {error && <p style={{ color: "var(--pixel-red)", fontSize: "8px" }}>{error}</p>}
        {!isConnected && !isConnecting ? (
          <button
            type="button"
            className="pixel-button pixel-button--primary"
            onClick={handleConnect}
          >
            Connect
          </button>
        ) : null}
        {isConnected ? (
          <button type="button" className="pixel-button" onClick={disconnect}>
            Disconnect
          </button>
        ) : null}
        {isConnecting ? (
          <button type="button" className="pixel-button" onClick={disconnect}>
            Cancel
          </button>
        ) : null}
      </div>
    </HudFlyout>
  );
}
