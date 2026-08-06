// Every call becomes a single JSON line on stdout, which Render's log
// viewer captures and can be searched on — so `event` and `level` are the
// fields worth keeping consistent, not a schema to grow further.
//
// error() also forwards to Sentry (captureMessage, tagged with `event` so
// it's the same name in both places) — one call site, two destinations,
// rather than every caller having to remember both. warn/info stay
// log-only: rate-limit blocks and the like are signal worth grepping for,
// not something that should page anyone.
import * as Sentry from "@sentry/nextjs";

type Level = "info" | "warn" | "error";

type LogFields = Record<string, string | number | boolean | null | undefined>;

function log(level: Level, event: string, fields: LogFields = {}) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === "error") {
    console.error(line);
    Sentry.captureMessage(event, { level: "error", extra: fields });
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (event: string, fields?: LogFields) => log("info", event, fields),
  warn: (event: string, fields?: LogFields) => log("warn", event, fields),
  error: (event: string, fields?: LogFields) => log("error", event, fields),
};
