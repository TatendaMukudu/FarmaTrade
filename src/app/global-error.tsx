"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { reportClientError } from "./report-client-error";

// error.tsx only catches errors below the root layout — if RootLayout
// itself throws (a bad font load, a broken provider, ...) this is the only
// thing that can still render, which is why it owns its own <html>/<body>
// and avoids importing anything from the app that could itself be what
// broke. Deliberately minimal, inline-styled: this is the last line of
// defense, not a place to depend on the design system it might be why
// nothing else rendered.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    reportClientError(error.message, error.digest).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "1.125rem", fontWeight: 600 }}>Something went wrong.</p>
          <p style={{ maxWidth: "24rem", fontSize: "0.875rem", color: "#6b7280" }}>
            That&apos;s on us, not you — it&apos;s been logged.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              borderRadius: "0.5rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              backgroundColor: "#111827",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
