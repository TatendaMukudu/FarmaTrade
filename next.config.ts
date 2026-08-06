import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
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
