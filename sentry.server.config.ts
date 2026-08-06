// Loaded from instrumentation.ts's register() for the Node.js runtime
// (Server Components, Server Actions, route handlers). No SENTRY_AUTH_TOKEN
// is configured yet, so this is runtime error capture only — readable
// (un-minified) stack traces in Sentry's UI need a follow-up pass wiring
// withSentryConfig's source-map upload once that token exists.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
