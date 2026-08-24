// The uniform failure envelope every Maestro MCP server returns (docs/MCP_FAILURE_ENVELOPE.md).
//
// One shape, every failure:
//
//   [<code>] <one plain sentence: what did not happen>
//   HTTP <status> <reason phrase>
//   <the provider's response body, verbatim>
//
// Line 1 is for a person and for the model. Lines 2 and 3 are the evidence, and they are never
// summarised, translated, or interpreted here: an expired credential and a permission the account
// never had are both "403" and only the body separates them. Deciding what it means is the caller's
// job.

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Rule 5: the body is capped, and a cap is announced rather than hidden. */
export const MAX_BODY_CHARS = 4000;

const TRUNCATION_MARKER = " ...[truncated]";

/** Standard reason phrases, used when the transport did not give us a literal one. */
const REASON_PHRASES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  412: "Precondition Failed",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  423: "Locked",
  428: "Precondition Required",
  429: "Too Many Requests",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout"
};

/**
 * A neutral restatement of the HTTP status for line 1. It describes the status and nothing else:
 * it never guesses a cause and never suggests a remedy (rule 7), because the body is what tells
 * the caller which of the several meanings of this status actually applies.
 */
const STATUS_CLAUSES: Record<number, string> = {
  400: "the request was rejected as invalid",
  401: "the request was not authorised",
  403: "the request was forbidden",
  404: "it was not found",
  409: "it conflicts with something that already exists",
  410: "it is gone",
  429: "the rate limit was reached"
};

/** Secret-bearing keys that must never leave this process (rule 8). */
const SECRET_KEYS = [
  "access_token",
  "refresh_token",
  "id_token",
  "client_secret",
  "client_id",
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "api_key",
  "apikey",
  "x-goog-api-key"
];

const REDACTED = "<redacted>";

// All patterns below are deliberately linear (no nested quantifiers, no backtracking traps): this
// runs over provider bodies we do not control.
const KEY_ALTERNATION = SECRET_KEYS.join("|");

/** "access_token": "ya29...."  and  'access_token': 'ya29....' */
const JSON_SECRET = new RegExp(
  `(["']?(?:${KEY_ALTERNATION})["']?\\s*[:=]\\s*)(["'])[^"']*(["'])`,
  "gi"
);

/** Authorization: Bearer ya29....   (header line, value runs to end of line) */
const HEADER_SECRET = new RegExp(`^(\\s*(?:${KEY_ALTERNATION})\\s*:\\s*)[^\\r\\n]+`, "gim");

/** access_token=ya29....  (query string or form body) */
const QUERY_SECRET = new RegExp(`((?:${KEY_ALTERNATION})=)[^&\\s"']+`, "gi");

/** A bare bearer credential anywhere in the text. */
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;

/**
 * Strips Authorization, Cookie, Set-Cookie and any access_token / refresh_token / client_secret /
 * client_id value from anything we echo. The rest of the body stays verbatim.
 */
export function redactSecrets(input: string): string {
  if (!input) return input;
  return input
    .replace(JSON_SECRET, (_m, prefix: string, openQuote: string, closeQuote: string) =>
      `${prefix}${openQuote}${REDACTED}${closeQuote}`)
    .replace(HEADER_SECRET, (_m, prefix: string) => `${prefix}${REDACTED}`)
    .replace(QUERY_SECRET, (_m, prefix: string) => `${prefix}${REDACTED}`)
    .replace(BEARER, (_m, scheme: string) => `${scheme} ${REDACTED}`);
}

/** Rule 5: verbatim, capped at MAX_BODY_CHARS, with the cap announced. */
export function capBody(body: string): string {
  if (body.length <= MAX_BODY_CHARS) return body;
  return body.slice(0, MAX_BODY_CHARS) + TRUNCATION_MARKER;
}

/**
 * Renders a provider response body as text without interpreting it. A string body is passed
 * through byte for byte; a parsed body is re-serialised as JSON, which is the closest thing to
 * verbatim available once the HTTP client has already parsed it.
 */
export function bodyToText(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

export function reasonPhrase(status: number, literal?: string): string {
  if (literal && literal.trim().length > 0) return literal.trim();
  return REASON_PHRASES[status] ?? "";
}

export function statusLineFor(status: number, literal?: string): string {
  const phrase = reasonPhrase(status, literal);
  return phrase ? `HTTP ${status} ${phrase}` : `HTTP ${status}`;
}

/**
 * Line 1 for an HTTP failure: what did not happen, in words a person reads.
 * `action` is an infinitive phrase, e.g. "list the events".
 */
export function summaryForStatus(action: string, status: number): string {
  const clause = STATUS_CLAUSES[status] ?? (status >= 500 ? "Google reported a server error" : undefined);
  return clause ? `Could not ${action}: ${clause}.` : `Could not ${action}.`;
}

export interface EnvelopeParts {
  /** `http_<status>` for an HTTP failure, lowercase snake_case otherwise. */
  code: string;
  /** One plain sentence saying what did not happen. */
  summary: string;
  /** Literal status line, e.g. "HTTP 403 Forbidden". Omitted entirely when the failure was not HTTP. */
  statusLine?: string;
  /** The provider's response body, verbatim. */
  body?: string;
}

export function formatEnvelope(parts: EnvelopeParts): string {
  const lines = [`[${parts.code}] ${parts.summary}`];
  if (parts.statusLine) lines.push(parts.statusLine);
  const body = parts.body === undefined ? undefined : capBody(redactSecrets(parts.body));
  if (body !== undefined && body.length > 0) lines.push(body);
  return lines.join("\n");
}

/**
 * A failure carrying its own envelope. `message` IS the envelope text, so the envelope survives
 * even when the error escapes to a generic handler that only knows how to print `error.message`.
 */
export class EnvelopeError extends Error {
  readonly envelopeCode: string;
  readonly summary: string;
  readonly statusLine?: string;
  readonly body?: string;
  readonly status?: number;

  constructor(parts: EnvelopeParts & { status?: number }) {
    super(formatEnvelope(parts));
    this.name = "EnvelopeError";
    this.envelopeCode = parts.code;
    this.summary = parts.summary;
    this.statusLine = parts.statusLine;
    this.body = parts.body;
    this.status = parts.status;
  }

  /** The full envelope text. */
  get envelope(): string {
    return this.message;
  }
}

/** Builds the envelope for an HTTP failure: `http_<status>`, literal status line, verbatim body. */
export function httpEnvelopeError(options: {
  action: string;
  status: number;
  statusText?: string;
  body?: unknown;
  summary?: string;
}): EnvelopeError {
  return new EnvelopeError({
    code: `http_${options.status}`,
    summary: options.summary ?? summaryForStatus(options.action, options.status),
    statusLine: statusLineFor(options.status, options.statusText),
    body: bodyToText(options.body),
    status: options.status
  });
}

/** Builds the envelope for a failure that was not HTTP: no status line is invented (rule 4). */
export function localEnvelopeError(code: string, summary: string, body?: string): EnvelopeError {
  return new EnvelopeError({ code, summary, body });
}

/** True when the value already carries an envelope. */
export function isEnvelopeError(error: unknown): error is EnvelopeError {
  return error instanceof EnvelopeError;
}

/**
 * Maps ANY failure to its envelope. This is the single place that decides what a failure looks
 * like, so a googleapis error carries `http_<status>` and Google's body wherever it is caught,
 * and a local error never gets a status line invented for it (rule 4).
 */
export function envelopeErrorFor(error: unknown, action: string): EnvelopeError {
  if (isEnvelopeError(error)) return error;

  // googleapis / gaxios failures carry the response, whatever their class.
  const response = (error as any)?.response;
  const status: unknown = response?.status ?? (typeof (error as any)?.code === "number" ? (error as any).code : undefined);
  if (typeof status === "number") {
    return httpEnvelopeError({
      action,
      status,
      statusText: response?.statusText,
      body: response?.data ?? (error instanceof Error ? error.message : undefined)
    });
  }

  // A transport failure: there is no HTTP response, so there is no status line.
  const transportCode = String((error as any)?.code ?? "").toUpperCase();
  if (transportCode) {
    const code = (transportCode === "ETIMEDOUT" || transportCode === "ECONNABORTED" || transportCode === "ERR_CANCELED")
      ? "timeout"
      : "network_error";
    return localEnvelopeError(
      code,
      `Could not ${action}: the request did not complete.`,
      error instanceof Error ? error.message : String(error)
    );
  }

  if (error instanceof Error) {
    // A ZodError (schema validation) is a bad argument as far as the caller is concerned; the
    // message carries the detail.
    const code = error.name === "ZodError" ? "bad_request" : "internal_error";
    return localEnvelopeError(code, `Could not ${action}.`, error.message);
  }

  return localEnvelopeError(
    "internal_error",
    `Could not ${action}.`,
    typeof error === "string" ? error : bodyToText(error)
  );
}

/** The envelope text for any failure. */
export function envelopeTextFor(error: unknown, action: string): string {
  return envelopeErrorFor(error, action).envelope;
}

/**
 * Rule 1: `isError: true` on the MCP result, always, and the text is the envelope so the flag has
 * a backstop when it is lost in transit.
 */
export function toEnvelopeResult(error: unknown, action: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: envelopeTextFor(error, action) }]
  };
}

/** A leading [snake_case_code], which is what Maestro recognises. */
const LEADING_CODE = /^\[[a-z][a-z0-9_]*\]\s+\S/;

/**
 * The JSON-RPC error codes the MCP SDK uses, mapped to our codes. This is not a guess about what
 * the failure MEANT: it is the classification the SDK itself already made, read back off its own
 * message rather than re-derived from the prose.
 */
const RPC_CODES: Record<string, { code: string; clause?: string }> = {
  "-32602": { code: "bad_request", clause: "the arguments were not valid" },
  "-32601": { code: "unknown_tool", clause: "there is no such tool" },
  "-32600": { code: "bad_request", clause: "the request was not valid" },
  "-32603": { code: "internal_error" },
  "-32700": { code: "bad_request", clause: "the request could not be parsed" }
};

const RPC_PREFIX = /^MCP error (-?\d+):\s*/;

/**
 * The last line of defence, applied to every tool result on its way out.
 *
 * The MCP SDK validates arguments against the registered input schema BEFORE our handler is ever
 * called, and turns a rejection into `isError: true` whose text begins "MCP error -32602: ...".
 * That is a failure with something in front of the code, which is precisely what rule 2 forbids
 * and precisely what Maestro cannot read. This re-shapes it without touching a result that is
 * already an envelope.
 */
export function ensureEnvelope(result: unknown, action: string): unknown {
  const r = result as any;
  if (!r || r.isError !== true || !Array.isArray(r.content)) return result;

  const first = r.content[0];
  if (!first || first.type !== "text" || typeof first.text !== "string") return result;

  const text: string = first.text.trim();
  if (LEADING_CODE.test(text)) return result;

  const match = RPC_PREFIX.exec(text);
  const mapped = match ? RPC_CODES[match[1]] : undefined;
  const code = mapped?.code ?? "internal_error";
  const summary = mapped?.clause
    ? `Could not ${action}: ${mapped.clause}.`
    : `Could not ${action}.`;
  // The original text becomes the evidence, verbatim: it holds the schema complaint.
  const body = match ? text.slice(match[0].length) : text;

  return { ...r, content: [{ ...first, text: formatEnvelope({ code, summary, body }) }, ...r.content.slice(1)] };
}
