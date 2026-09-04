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
 * Two tiers, because the trade differs sharply. The risk of caching is
 * stale art on screen: none of these paths carries a content hash, so a
 * regenerated sheet keeps its URL and a browser holding the old one shows
 * the old one.
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
     * An hour for the art. Long enough that walking from room to room
     * costs nothing — which is the case this exists for — and short enough
     * that a rebuilt character or a regenerated map turns up on its own
     * rather than needing a hard reload. `pnpm build:map` and
     * `build-character.ts` both rewrite files in place, so this is the one
     * that has to stay modest.
     */
    source: "/:dir(characters|maps|tilesets|sprites|ui)/:path*",
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
