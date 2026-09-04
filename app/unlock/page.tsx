"use client";

/**
 * The door. Takes the shared code and, if it is right, the server hands back
 * a cookie and lets the browser through to wherever it was headed.
 *
 * The code is posted in a body, never put in the URL: a query string would be
 * kept by browser history, proxies and the server's own access log.
 */

import { useState } from "react";

/**
 * Where to go once the code is accepted — somewhere inside this app, always.
 *
 * A bare `startsWith("/")` is not enough: `//evil.com` passes it and every
 * browser reads that as protocol-relative, so it leaves the site. Since
 * /unlock is the one page reachable without the code, an open redirect here
 * would be a ready-made phishing link — it looks like this app right up to
 * the moment it hands the visitor somewhere else.
 */
function safeNext(next: string | null): string {
  if (!next || next[0] !== "/") return "/";
  if (next[1] === "/" || next[1] === "\\") return "/";
  return next;
}

export default function UnlockPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (res.ok) {
        window.location.replace(safeNext(new URLSearchParams(window.location.search).get("next")));
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "That code was not accepted.");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--pixel-bg)",
      }}
    >
      <form
        onSubmit={submit}
        className="pixel-panel"
        style={{ width: "min(420px, 100%)", padding: 24, display: "grid", gap: 14 }}
      >
        <div>
          <h1 style={{ fontSize: 16, margin: 0, color: "var(--pixel-accent)" }}>WATERCOOLER</h1>
          <p style={{ fontSize: 9, marginTop: 8, color: "var(--pixel-muted)", lineHeight: 1.6 }}>
            This world is private. Enter the access code you were given.
          </p>
        </div>

        <div>
          <label className="pixel-label" htmlFor="code" style={{ fontSize: 9 }}>
            Access code
          </label>
          <input
            id="code"
            className="pixel-input"
            type="password"
            value={code}
            autoComplete="off"
            autoFocus
            spellCheck={false}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            onChange={(event) => {
              setCode(event.target.value);
              setError("");
            }}
            style={{ width: "100%", marginTop: 6 }}
          />
        </div>

        {error && (
          <p role="alert" style={{ fontSize: 9, color: "var(--pixel-red)", margin: 0 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className="pixel-button pixel-button--primary"
          disabled={busy || !code.trim()}
        >
          {busy ? "Checking..." : "Walk In"}
        </button>
      </form>
    </main>
  );
}
