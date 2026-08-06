// Auto-loaded by Next before hydration — no wiring needed elsewhere. The
// DSN has to be NEXT_PUBLIC_-prefixed here specifically because this file
// ships in the browser bundle; a Sentry DSN is designed to be public (it
// can only submit events, not read account data), so that's expected, not
// a leak.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  tracesSampleRate: 0.1,
});
