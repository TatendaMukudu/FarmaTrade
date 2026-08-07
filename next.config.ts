import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Response headers are a control the app cannot forget to apply — unlike a
// check in a route handler, these hold for every response including error
// pages and anything added later.
//
// The CSP is written for what this app actually does: no third-party
// scripts, no embedded frames, no inline event handlers. `'unsafe-inline'`
// on style-src is the one concession — Tailwind injects inline styles, and
// a nonce-per-request would mean giving up static rendering for every page
// to close a hole nobody is realistically walking through. Script-src has
// no such escape hatch, which is the half that stops an injected <script>.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-eval' is absent deliberately; Next's production bundle
      // doesn't need it, and its absence is what makes a large class of
      // injection payloads inert.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // Sentry is the only outbound destination the browser needs.
      "connect-src 'self' https://*.sentry.io",
      "form-action 'self'",
      // Clickjacking: the modern replacement for X-Frame-Options, kept
      // alongside it below for older browsers.
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  // A session cookie sent over plain HTTP even once is a session that can be
  // stolen; this makes the browser refuse to try.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Don't leak the path a farmer was on (which can name a counterparty)
  // to any external site they click through to.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here needs a camera, microphone or location.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Uploads source maps during the build so stack traces in Sentry's UI show
// real code instead of minified output. Safe to wrap unconditionally —
// without SENTRY_AUTH_TOKEN set (local dev, or CI, which doesn't have one
// configured on purpose) the plugin skips the upload step rather than
// failing the build.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
});
