import "server-only";

/**
 * Project-wide log redaction for API key secrets.
 *
 * Patches `console.log`, `console.info`, `console.warn`, `console.error`,
 * and `console.debug` so any string containing an `lsk_<live|test>_*` token
 * has the secret half masked before the line is written. The prefix is
 * preserved (it's the operator's identifier for "which key is this?") and
 * the 32-char secret becomes `***`.
 *
 * Why project-wide instead of opt-in:
 *   A single forgotten `console.log(req.headers)` is enough to leak a key
 *   into Vercel's log retention, and from there into any third-party log
 *   shipper. Making redaction the default — applied even to error stack
 *   traces and unrelated debug lines — closes that whole class of leak
 *   regardless of which file the offending log lives in.
 *
 * Called exactly once from `instrumentation.ts` at cold start. Idempotent:
 * calling twice is a no-op because the second call sees the patched
 * function already in place and bails.
 */

const SECRET_RE = /lsk_(live|test)_([0-9A-HJKMNP-TV-Z]{8})_[0-9A-HJKMNP-TV-Z]{32}/g;
const REDACTED_TAG = "__leadstack_redacted_console__";

function redactString(input: unknown): unknown {
  if (typeof input !== "string") return input;
  if (!input.includes("lsk_")) return input;
  return input.replace(SECRET_RE, (_match, mode, prefix) => {
    return `lsk_${mode}_${prefix}_***`;
  });
}

function redactArg(arg: unknown): unknown {
  if (typeof arg === "string") return redactString(arg);
  // Errors keep stack/message — redact those too.
  if (arg instanceof Error) {
    const cloned = new Error(redactString(arg.message) as string);
    cloned.name = arg.name;
    if (arg.stack) cloned.stack = redactString(arg.stack) as string;
    return cloned;
  }
  // Plain objects: shallow-walk top-level string values. Deep walking
  // serialized payloads (req/res bodies) would be expensive on every log
  // call; in practice keys leak via direct string concat or header dumps
  // which are caught by the top-level walk.
  if (arg && typeof arg === "object") {
    let touched = false;
    if (Array.isArray(arg)) {
      const out: unknown[] = [];
      for (const v of arg) {
        const redacted = typeof v === "string" ? redactString(v) : v;
        if (redacted !== v) touched = true;
        out.push(redacted);
      }
      return touched ? out : arg;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(arg as Record<string, unknown>)) {
      const redacted = typeof v === "string" ? redactString(v) : v;
      if (redacted !== v) touched = true;
      out[k] = redacted;
    }
    return touched ? out : arg;
  }
  return arg;
}

type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug";
const METHODS: ConsoleMethod[] = ["log", "info", "warn", "error", "debug"];

export function installLogRedaction(): void {
  const c = console as unknown as Record<string, unknown> & {
    [REDACTED_TAG]?: boolean;
  };
  if (c[REDACTED_TAG]) return;
  c[REDACTED_TAG] = true;

  for (const m of METHODS) {
    // Reuse `c` (already cast through `unknown`) so we don't need a second
    // `as Record<string, unknown>` cast — tsc rejects casting `Console`
    // directly to a Record without going through unknown first.
    const original = c[m] as (...a: unknown[]) => void;
    if (typeof original !== "function") continue;
    c[m] = (...args: unknown[]) => {
      original(...args.map(redactArg));
    };
  }
}
