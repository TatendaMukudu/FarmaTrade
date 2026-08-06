// No external monitoring service is wired up yet (deferred — needs an
// account decision). Until then, this is the one thing worth having: every
// call becomes a single JSON line on stdout, which Render's log viewer
// already captures and can be searched/filtered on — so `event` and `level`
// are the fields worth keeping consistent, not a schema to grow further.
type Level = "info" | "warn" | "error";

type LogFields = Record<string, string | number | boolean | null | undefined>;

function log(level: Level, event: string, fields: LogFields = {}) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === "error") {
    console.error(line);
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
