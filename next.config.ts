import type { NextConfig } from "next";

const extraConnectSrc = process.env.CSP_CONNECT_SRC ?? "";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      [
        "connect-src 'self'",
        "ws://localhost:* ws://127.0.0.1:* wss://localhost:* wss://127.0.0.1:*",
        extraConnectSrc,
      ]
        .filter(Boolean)
        .join(" "),
      "media-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

/**
 * How long the browser may keep the world's assets.
 *
 * Everything in `public/` is served with `max-age=0` by default, which
 * means a browser revalidates every one of them on every page load — and a
 * room change *is* a page load. Around thirty conditional requests each
 * time is invisible on localhost and adds up over the internet, and the
 * music is three and a half megabytes that were being fetched again.
 *
 * Three tiers. The risk of caching is stale art on screen, and what
 * separates the tiers is whether a URL can go stale at all: a request
 * carrying `?v=` names its own contents (see lib/assets), so holding it for
 * ever is not a risk but the correct answer.
 */
const cacheHeaders = [
  {
    /**
     * A year, and immutable: the music never changes in place. There are
     * four tracks in `public/audio/` and the code names the one it wants,
     * so changing the music means pointing at a different file rather than
     * replacing bytes at the same path. It is also the only asset here
     * large enough for the difference to be felt.
     */
    source: "/audio/:path*",
    headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
  },
  {
    /**
     * A year for art asked for by content: `?v=` is a hash of the bytes
     * (lib/assets), so the URL changes whenever the file does and a cache
     * hit can only ever be a hit on the right file. Nothing to revalidate,
     * ever, and no way to be shown yesterday's sprite.
     *
     * The `has` is what makes this safe. Headers match on path alone, so
     * without it a request for the bare path — anything that slipped past
     * `asset()` — would be pinned for a year too, turning a missed call
     * site from an hour of staleness into a year of it.
     *
     * It pairs with the `missing` on the tier below. Next applies *every*
     * matching rule and lets the last one win, so a versioned request
     * matched both and came back with the hour. The two have to exclude
     * each other, not merely be ordered.
     */
    source: "/:dir(characters|maps|tilesets|sprites|ui)/:path*",
    has: [{ type: "query" as const, key: "v" }],
    headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
  },
  {
    /**
     * An hour for the same art asked for without a version — a hard-coded
     * URL somewhere, or a file opened directly. Long enough that it costs
     * nothing, short enough that a rewritten sheet turns up on its own.
     * `pnpm build:map` and `build-character.ts` both rewrite files in
     * place, which is why this tier cannot be generous.
     */
    source: "/:dir(characters|maps|tilesets|sprites|ui)/:path*",
    missing: [{ type: "query" as const, key: "v" }],
    headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    // Keep this default in sync with AGENT_PROVIDER in server.ts
    NEXT_PUBLIC_AGENT_PROVIDER: process.env.AGENT_PROVIDER ?? "claude",
  },
  async headers() {
    // The security headers go on everything; the cache rules are narrower
    // and come after, so the more specific source wins for those paths.
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      ...cacheHeaders,
    ];
  },
};

export default nextConfig;
