// Loaded from instrumentation.ts's register() for the Edge runtime —
// proxy.ts (the auth-redirect middleware) runs here, outside the Node.js
// process the server config covers.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
