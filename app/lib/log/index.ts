// Minimal structured logger: one JSON line per event, so Vercel's log
// drains (and grep) can parse them. `error` additionally forwards the error
// to the env-gated Sentry wrapper — a no-op when SENTRY_DSN is unset.

import { captureError } from "./sentry";

type Fields = Record<string, unknown>;

export type Logger = {
  info: (message: string, fields?: Fields) => void;
  warn: (message: string, fields?: Fields) => void;
  error: (message: string, err?: unknown, fields?: Fields) => void;
};

function serializeError(err: unknown): Fields {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return { message: String(err) };
}

function emit(level: "info" | "warn" | "error", scope: string, message: string, fields?: Fields) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, scope, message, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(scope: string): Logger {
  return {
    info: (message, fields) => emit("info", scope, message, fields),
    warn: (message, fields) => emit("warn", scope, message, fields),
    error: (message, err, fields) => {
      emit("error", scope, message, {
        ...fields,
        ...(err !== undefined ? { error: serializeError(err) } : {}),
      });
      if (err !== undefined) captureError(err, { scope, message, ...fields });
    },
  };
}
