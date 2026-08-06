"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportClientError } from "./report-client-error";

// Catches any render error thrown below the root layout (a Server
// Component, a Server Action rethrow, a client-side bug) and shows this
// instead of Next's raw default error page. Without this file, that
// default page is what a real user hits — blank, no path back, no record
// anywhere that it happened.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error.message, error.digest).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-semibold">Something went wrong.</p>
      <p className="max-w-sm text-sm text-gray-500">
        That&apos;s on us, not you — it&apos;s been logged. Try again, or head back to your dashboard.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
