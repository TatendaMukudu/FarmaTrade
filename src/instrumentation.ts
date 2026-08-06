import * as Sentry from "@sentry/nextjs";

// Next's own hook for initializing anything before a runtime starts
// handling requests — this is where the Node vs Edge Sentry configs
// actually get loaded, since Next won't load either of them on its own.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Sentry's hook into Next's own server-side error reporting — catches
// errors during rendering/data-fetching that never reach error.tsx
// (a Server Component throwing during a request Next handles itself),
// which is exactly the class of error the structured logger alone
// wouldn't otherwise get flagged anywhere but stdout.
export const onRequestError = Sentry.captureRequestError;
