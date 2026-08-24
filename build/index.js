#!/usr/bin/env node

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/utils/failure-envelope.ts
function redactSecrets(input) {
  if (!input) return input;
  return input.replace(JSON_SECRET, (_m, prefix, openQuote, closeQuote) => `${prefix}${openQuote}${REDACTED}${closeQuote}`).replace(HEADER_SECRET, (_m, prefix) => `${prefix}${REDACTED}`).replace(QUERY_SECRET, (_m, prefix) => `${prefix}${REDACTED}`).replace(BEARER, (_m, scheme) => `${scheme} ${REDACTED}`);
}
function capBody(body) {
  if (body.length <= MAX_BODY_CHARS) return body;
  return body.slice(0, MAX_BODY_CHARS) + TRUNCATION_MARKER;
}
function bodyToText(body) {
  if (body === void 0 || body === null) return void 0;
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}
function reasonPhrase(status, literal) {
  if (literal && literal.trim().length > 0) return literal.trim();
  return REASON_PHRASES[status] ?? "";
}
function statusLineFor(status, literal) {
  const phrase = reasonPhrase(status, literal);
  return phrase ? `HTTP ${status} ${phrase}` : `HTTP ${status}`;
}
function summaryForStatus(action, status) {
  const clause = STATUS_CLAUSES[status] ?? (status >= 500 ? "Google reported a server error" : void 0);
  return clause ? `Could not ${action}: ${clause}.` : `Could not ${action}.`;
}
function formatEnvelope(parts) {
  const lines = [`[${parts.code}] ${parts.summary}`];
  if (parts.statusLine) lines.push(parts.statusLine);
  const body = parts.body === void 0 ? void 0 : capBody(redactSecrets(parts.body));
  if (body !== void 0 && body.length > 0) lines.push(body);
  return lines.join("\n");
}
function httpEnvelopeError(options) {
  return new EnvelopeError({
    code: `http_${options.status}`,
    summary: options.summary ?? summaryForStatus(options.action, options.status),
    statusLine: statusLineFor(options.status, options.statusText),
    body: bodyToText(options.body),
    status: options.status
  });
}
function localEnvelopeError(code, summary, body) {
  return new EnvelopeError({ code, summary, body });
}
function isEnvelopeError(error) {
  return error instanceof EnvelopeError;
}
function envelopeErrorFor(error, action) {
  if (isEnvelopeError(error)) return error;
  const response = error?.response;
  const status = response?.status ?? (typeof error?.code === "number" ? error.code : void 0);
  if (typeof status === "number") {
    return httpEnvelopeError({
      action,
      status,
      statusText: response?.statusText,
      body: response?.data ?? (error instanceof Error ? error.message : void 0)
    });
  }
  const transportCode = String(error?.code ?? "").toUpperCase();
  if (transportCode) {
    const code = transportCode === "ETIMEDOUT" || transportCode === "ECONNABORTED" || transportCode === "ERR_CANCELED" ? "timeout" : "network_error";
    return localEnvelopeError(
      code,
      `Could not ${action}: the request did not complete.`,
      error instanceof Error ? error.message : String(error)
    );
  }
  if (error instanceof Error) {
    const code = error.name === "ZodError" ? "bad_request" : "internal_error";
    return localEnvelopeError(code, `Could not ${action}.`, error.message);
  }
  return localEnvelopeError(
    "internal_error",
    `Could not ${action}.`,
    typeof error === "string" ? error : bodyToText(error)
  );
}
function envelopeTextFor(error, action) {
  return envelopeErrorFor(error, action).envelope;
}
function toEnvelopeResult(error, action) {
  return {
    isError: true,
    content: [{ type: "text", text: envelopeTextFor(error, action) }]
  };
}
function ensureEnvelope(result, action) {
  const r = result;
  if (!r || r.isError !== true || !Array.isArray(r.content)) return result;
  const first = r.content[0];
  if (!first || first.type !== "text" || typeof first.text !== "string") return result;
  const text = first.text.trim();
  if (LEADING_CODE.test(text)) return result;
  const match = RPC_PREFIX.exec(text);
  const mapped = match ? RPC_CODES[match[1]] : void 0;
  const code = mapped?.code ?? "internal_error";
  const summary = mapped?.clause ? `Could not ${action}: ${mapped.clause}.` : `Could not ${action}.`;
  const body = match ? text.slice(match[0].length) : text;
  return { ...r, content: [{ ...first, text: formatEnvelope({ code, summary, body }) }, ...r.content.slice(1)] };
}
var MAX_BODY_CHARS, TRUNCATION_MARKER, REASON_PHRASES, STATUS_CLAUSES, SECRET_KEYS, REDACTED, KEY_ALTERNATION, JSON_SECRET, HEADER_SECRET, QUERY_SECRET, BEARER, EnvelopeError, LEADING_CODE, RPC_CODES, RPC_PREFIX;
var init_failure_envelope = __esm({
  "src/utils/failure-envelope.ts"() {
    "use strict";
    MAX_BODY_CHARS = 4e3;
    TRUNCATION_MARKER = " ...[truncated]";
    REASON_PHRASES = {
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
    STATUS_CLAUSES = {
      400: "the request was rejected as invalid",
      401: "the request was not authorised",
      403: "the request was forbidden",
      404: "it was not found",
      409: "it conflicts with something that already exists",
      410: "it is gone",
      429: "the rate limit was reached"
    };
    SECRET_KEYS = [
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
    REDACTED = "<redacted>";
    KEY_ALTERNATION = SECRET_KEYS.join("|");
    JSON_SECRET = new RegExp(
      `(["']?(?:${KEY_ALTERNATION})["']?\\s*[:=]\\s*)(["'])[^"']*(["'])`,
      "gi"
    );
    HEADER_SECRET = new RegExp(`^(\\s*(?:${KEY_ALTERNATION})\\s*:\\s*)[^\\r\\n]+`, "gim");
    QUERY_SECRET = new RegExp(`((?:${KEY_ALTERNATION})=)[^&\\s"']+`, "gi");
    BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
    EnvelopeError = class extends Error {
      envelopeCode;
      summary;
      statusLine;
      body;
      status;
      constructor(parts) {
        super(formatEnvelope(parts));
        this.name = "EnvelopeError";
        this.envelopeCode = parts.code;
        this.summary = parts.summary;
        this.statusLine = parts.statusLine;
        this.body = parts.body;
        this.status = parts.status;
      }
      /** The full envelope text. */
      get envelope() {
        return this.message;
      }
    };
    LEADING_CODE = /^\[[a-z][a-z0-9_]*\]\s+\S/;
    RPC_CODES = {
      "-32602": { code: "bad_request", clause: "the arguments were not valid" },
      "-32601": { code: "unknown_tool", clause: "there is no such tool" },
      "-32600": { code: "bad_request", clause: "the request was not valid" },
      "-32603": { code: "internal_error" },
      "-32700": { code: "bad_request", clause: "the request could not be parsed" }
    };
    RPC_PREFIX = /^MCP error (-?\d+):\s*/;
  }
});

// src/auth/paths.js
var paths_exports = {};
__export(paths_exports, {
  getAccountMode: () => getAccountMode,
  getLegacyTokenPath: () => getLegacyTokenPath,
  getSecureTokenPath: () => getSecureTokenPath,
  validateAccountId: () => validateAccountId
});
import path from "path";
import { homedir } from "os";
function getSecureTokenPath() {
  if (process.env.GOOGLE_CALENDAR_MCP_TOKEN_PATH) {
    return path.resolve(process.env.GOOGLE_CALENDAR_MCP_TOKEN_PATH);
  }
  const configDir = process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config");
  return path.join(configDir, "google-calendar-mcp", "tokens.json");
}
function getLegacyTokenPath() {
  return path.join(process.cwd(), ".gcp-saved-tokens.json");
}
function validateAccountId(accountId2) {
  if (!accountId2 || accountId2.length === 0) {
    throw new Error("Invalid account ID. Must be 1-64 characters: lowercase letters, numbers, dashes, underscores only.");
  }
  if (RESERVED_NAMES.includes(accountId2)) {
    throw new Error(`Account ID "${accountId2}" is reserved and cannot be used.`);
  }
  if (!/^[a-z0-9_-]{1,64}$/.test(accountId2)) {
    throw new Error("Invalid account ID. Must be 1-64 characters: lowercase letters, numbers, dashes, underscores only.");
  }
  return accountId2;
}
function getAccountMode() {
  const explicitMode = process.env.GOOGLE_ACCOUNT_MODE;
  if (explicitMode !== void 0 && explicitMode !== null) {
    return validateAccountId(explicitMode);
  }
  if (process.env.NODE_ENV === "test") {
    return "test";
  }
  return "normal";
}
var RESERVED_NAMES;
var init_paths = __esm({
  "src/auth/paths.js"() {
    "use strict";
    RESERVED_NAMES = [
      ".",
      "..",
      "con",
      "prn",
      "aux",
      "nul",
      "com1",
      "com2",
      "com3",
      "com4",
      "lpt1",
      "lpt2",
      "lpt3"
    ];
  }
});

// src/auth/utils.ts
import * as path2 from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
function getProjectRoot() {
  const __dirname3 = path2.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path2.join(__dirname3, "..");
  return path2.resolve(projectRoot);
}
function getAccountMode2() {
  return getAccountMode();
}
function getSecureTokenPath2() {
  return getSecureTokenPath();
}
function getLegacyTokenPath2() {
  return getLegacyTokenPath();
}
function getKeysFilePath() {
  const envCredentialsPath = process.env.GOOGLE_OAUTH_CREDENTIALS;
  if (envCredentialsPath) {
    return path2.resolve(envCredentialsPath);
  }
  const projectRoot = getProjectRoot();
  const keysPath = path2.join(projectRoot, "gcp-oauth.keys.json");
  return keysPath;
}
function getCredentialsProjectId() {
  try {
    const credentialsPath = getKeysFilePath();
    if (!fs.existsSync(credentialsPath)) {
      return void 0;
    }
    const credentialsContent = fs.readFileSync(credentialsPath, "utf-8");
    const credentials = JSON.parse(credentialsContent);
    if (credentials.installed?.project_id) {
      return credentials.installed.project_id;
    } else if (credentials.project_id) {
      return credentials.project_id;
    }
    return void 0;
  } catch (error) {
    return void 0;
  }
}
function generateCredentialsErrorMessage() {
  return `
OAuth credentials not found. Please provide credentials using one of these methods:

1. Environment variable:
   Set GOOGLE_OAUTH_CREDENTIALS to the path of your credentials file:
   export GOOGLE_OAUTH_CREDENTIALS="/path/to/gcp-oauth.keys.json"

2. Default file path:
   Place your gcp-oauth.keys.json file in the package root directory.

Token storage:
- Tokens are saved to: ${getSecureTokenPath2()}
- To use a custom token location, set GOOGLE_CALENDAR_MCP_TOKEN_PATH environment variable

To get OAuth credentials:
1. Go to the Google Cloud Console (https://console.cloud.google.com/)
2. Create or select a project
3. Enable the Google Calendar API
4. Create OAuth 2.0 credentials
5. Download the credentials file as gcp-oauth.keys.json
`.trim();
}
var init_utils = __esm({
  "src/auth/utils.ts"() {
    "use strict";
    init_paths();
  }
});

// src/auth/client.ts
var client_exports = {};
__export(client_exports, {
  initializeOAuth2Client: () => initializeOAuth2Client,
  loadCredentials: () => loadCredentials
});
import { OAuth2Client } from "google-auth-library";
import * as fs2 from "fs/promises";
async function loadCredentialsFromFile() {
  const keysContent = await fs2.readFile(getKeysFilePath(), "utf-8");
  const keys = JSON.parse(keysContent);
  if (keys.installed) {
    const { client_id, client_secret, redirect_uris } = keys.installed;
    return { client_id, client_secret, redirect_uris };
  } else if (keys.client_id && keys.client_secret) {
    return {
      client_id: keys.client_id,
      client_secret: keys.client_secret,
      redirect_uris: keys.redirect_uris || ["http://localhost:3000/oauth2callback"]
    };
  } else {
    throw new Error('Invalid credentials file format. Expected either "installed" object or direct client_id/client_secret fields.');
  }
}
async function loadCredentialsWithFallback() {
  try {
    return await loadCredentialsFromFile();
  } catch (fileError) {
    process.stderr.write(generateCredentialsErrorMessage() + "\n\n");
    throw localEnvelopeError(
      "no_credentials",
      `No Google OAuth credentials could be read from ${getKeysFilePath()}.`,
      fileError instanceof Error ? fileError.message : String(fileError)
    );
  }
}
async function initializeOAuth2Client() {
  const credentials = await loadCredentialsWithFallback();
  return new OAuth2Client({
    clientId: credentials.client_id,
    clientSecret: credentials.client_secret,
    redirectUri: credentials.redirect_uris[0]
  });
}
async function loadCredentials() {
  try {
    const credentials = await loadCredentialsWithFallback();
    if (!credentials.client_id || !credentials.client_secret) {
      throw localEnvelopeError(
        "no_credentials",
        `The credentials file ${getKeysFilePath()} has no client_id or client_secret.`
      );
    }
    return {
      client_id: credentials.client_id,
      client_secret: credentials.client_secret
    };
  } catch (error) {
    if (isEnvelopeError(error)) {
      throw error;
    }
    throw localEnvelopeError(
      "no_credentials",
      `No Google OAuth credentials could be read from ${getKeysFilePath()}.`,
      error instanceof Error ? error.message : String(error)
    );
  }
}
var init_client = __esm({
  "src/auth/client.ts"() {
    "use strict";
    init_utils();
    init_failure_envelope();
  }
});

// src/index.ts
import { fileURLToPath as fileURLToPath4 } from "url";

// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError as McpError2, ErrorCode as ErrorCode2 } from "@modelcontextprotocol/sdk/types.js";

// src/circuitBuffer.ts
init_failure_envelope();
var THRESHOLD = 200;
function cfg() {
  const url = (process.env.MAESTRO_CIRCUIT_URL || "").trim();
  const secret = (process.env.MAESTRO_CIRCUIT_SECRET || "").trim();
  const session = (process.env.MAESTRO_SESSION_ID || "").trim();
  return url && secret && session ? { url, secret, session } : null;
}
async function post(path4, body, url, secret) {
  const r = await fetch(url.replace(/\/$/, "") + path4, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Circuit-Secret": secret },
    body: JSON.stringify(body)
  });
  return { status: r.status, json: r.status === 200 ? await r.json() : null };
}
async function fetchSlug(slug, c) {
  const { status, json } = await post("/get", { session: c.session, slug }, c.url, c.secret);
  if (status === 404) {
    throw localEnvelopeError(
      "circuit_slug_expired",
      `The handle ${slug} could not be expanded because it is no longer cached.`
    );
  }
  return json && json.payload || "";
}
async function resolveArgs(args) {
  const c = cfg();
  if (!c) return args;
  const expand = async (v) => {
    if (typeof v === "string" && /@@h\d+@@/.test(v)) {
      const tokens = new Set(v.match(/@@h\d+@@/g) || []);
      let out = v;
      for (const t of tokens) {
        const payload = await fetchSlug(t, c);
        out = out.split(t).join(payload);
      }
      return out;
    }
    if (Array.isArray(v)) return Promise.all(v.map(expand));
    if (v && typeof v === "object") {
      const o = {};
      for (const k of Object.keys(v)) o[k] = await expand(v[k]);
      return o;
    }
    return v;
  };
  return expand(args);
}
async function wrapResult(result) {
  const c = cfg();
  if (!c || !result || !Array.isArray(result.content)) return result;
  if (result.isError) return result;
  const first = result.content[0];
  if (!first || first.type !== "text" || typeof first.text !== "string" || first.text.length < THRESHOLD) {
    return result;
  }
  let slug;
  try {
    const { json } = await post("/put", { session: c.session, payload: first.text }, c.url, c.secret);
    slug = json && json.slug;
  } catch {
    return result;
  }
  if (!slug) return result;
  const tag = `[circuit ${slug} \xB7 to feed this whole result into another tool, pass ${slug} as its argument instead of retyping it; read_tool_result(${slug}) shows it in full later]`;
  return { ...result, content: [{ ...first, text: tag + "\n\n" + first.text }, ...result.content.slice(1)] };
}

// src/server.ts
init_failure_envelope();
init_client();
import { OAuth2Client as OAuth2Client4 } from "google-auth-library";
import { readFileSync as readFileSync2 } from "fs";
import { join as join2, dirname as dirname3 } from "path";
import { fileURLToPath as fileURLToPath3 } from "url";

// src/auth/server.ts
import { OAuth2Client as OAuth2Client3, CodeChallengeMethod } from "google-auth-library";

// src/auth/tokenManager.ts
init_utils();
init_paths();
import { OAuth2Client as OAuth2Client2 } from "google-auth-library";
import fs3 from "fs/promises";
import { GaxiosError } from "gaxios";
import { mkdir } from "fs/promises";
import { dirname as dirname2 } from "path";
var TokenManager = class {
  oauth2Client;
  tokenPath;
  accountMode;
  accounts = /* @__PURE__ */ new Map();
  credentials;
  writeQueue = Promise.resolve();
  constructor(oauth2Client) {
    this.oauth2Client = oauth2Client;
    this.tokenPath = getSecureTokenPath2();
    this.accountMode = getAccountMode2();
    this.credentials = {
      clientId: oauth2Client._clientId,
      clientSecret: oauth2Client._clientSecret,
      redirectUri: oauth2Client._redirectUri
    };
    this.setupTokenRefresh();
  }
  // Method to expose the token path
  getTokenPath() {
    return this.tokenPath;
  }
  // Method to get current account mode
  getAccountMode() {
    return this.accountMode;
  }
  // Method to switch account mode (supports arbitrary account IDs)
  setAccountMode(mode) {
    this.accountMode = mode;
  }
  async ensureTokenDirectoryExists() {
    try {
      await mkdir(dirname2(this.tokenPath), { recursive: true });
    } catch (error) {
      process.stderr.write(`Failed to create token directory: ${error}
`);
    }
  }
  isFileNotFoundError(error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }
  async writeTokenFile(tokens) {
    await this.ensureTokenDirectoryExists();
    await fs3.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2), { mode: 384 });
  }
  async loadMultiAccountTokens() {
    try {
      const fileContent = await fs3.readFile(this.tokenPath, "utf-8");
      const parsed = JSON.parse(fileContent);
      if (parsed.access_token || parsed.refresh_token) {
        const multiAccountTokens = {
          normal: parsed
        };
        await this.saveMultiAccountTokens(multiAccountTokens);
        return multiAccountTokens;
      }
      return parsed;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return {};
      }
      throw error;
    }
  }
  /**
   * Raw token file read without migration logic.
   * Used for atomic read-modify-write operations where we need to re-read current state.
   */
  async loadMultiAccountTokensRaw() {
    try {
      const fileContent = await fs3.readFile(this.tokenPath, "utf-8");
      return JSON.parse(fileContent);
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return {};
      }
      throw error;
    }
  }
  async saveMultiAccountTokens(multiAccountTokens) {
    return this.enqueueTokenWrite(async () => {
      await this.writeTokenFile(multiAccountTokens);
    });
  }
  enqueueTokenWrite(operation) {
    const pendingWrite = this.writeQueue.catch(() => void 0).then(operation);
    this.writeQueue = pendingWrite.catch((error) => {
      process.stderr.write(`Error writing token file: ${error instanceof Error ? error.message : error}
`);
      throw error;
    }).catch(() => void 0);
    return pendingWrite;
  }
  setupTokenRefresh() {
    this.setupTokenRefreshForAccount(this.oauth2Client, this.accountMode);
  }
  /**
   * Set up token refresh handler for a specific account
   * Uses enqueueTokenWrite to prevent race conditions when multiple accounts refresh simultaneously
   */
  setupTokenRefreshForAccount(client, accountId2) {
    client.on("tokens", async (newTokens) => {
      try {
        await this.enqueueTokenWrite(async () => {
          const multiAccountTokens = await this.loadMultiAccountTokens();
          const currentTokens = multiAccountTokens[accountId2] || {};
          const updatedTokens = {
            ...currentTokens,
            ...newTokens,
            refresh_token: newTokens.refresh_token || currentTokens.refresh_token
          };
          multiAccountTokens[accountId2] = updatedTokens;
          await this.writeTokenFile(multiAccountTokens);
        });
        if (process.env.NODE_ENV !== "test") {
          process.stderr.write(`Tokens updated and saved for ${accountId2} account
`);
        }
      } catch (error) {
        process.stderr.write("Error saving updated tokens: ");
        if (error instanceof Error) {
          process.stderr.write(error.message);
        } else if (typeof error === "string") {
          process.stderr.write(error);
        }
        process.stderr.write("\n");
      }
    });
  }
  async migrateLegacyTokens() {
    const legacyPath = getLegacyTokenPath2();
    try {
      if (!await fs3.access(legacyPath).then(() => true).catch(() => false)) {
        return false;
      }
      const legacyTokens = JSON.parse(await fs3.readFile(legacyPath, "utf-8"));
      if (!legacyTokens || typeof legacyTokens !== "object") {
        process.stderr.write("Invalid legacy token format, skipping migration\n");
        return false;
      }
      await this.writeTokenFile(legacyTokens);
      process.stderr.write(`Migrated tokens from legacy location: ${legacyPath} to: ${this.tokenPath}
`);
      try {
        await fs3.unlink(legacyPath);
        process.stderr.write("Removed legacy token file\n");
      } catch (unlinkErr) {
        process.stderr.write(`Warning: Could not remove legacy token file: ${unlinkErr}
`);
      }
      return true;
    } catch (error) {
      process.stderr.write(`Error migrating legacy tokens: ${error}
`);
      return false;
    }
  }
  async loadSavedTokens() {
    try {
      await this.ensureTokenDirectoryExists();
      const tokenExists = await fs3.access(this.tokenPath).then(() => true).catch(() => false);
      if (!tokenExists) {
        const migrated = await this.migrateLegacyTokens();
        if (!migrated) {
          process.stderr.write(`No token file found at: ${this.tokenPath}
`);
          return false;
        }
      }
      const multiAccountTokens = await this.loadMultiAccountTokens();
      const tokens = multiAccountTokens[this.accountMode];
      if (!tokens || typeof tokens !== "object") {
        process.stderr.write(`No tokens found for ${this.accountMode} account in file: ${this.tokenPath}
`);
        return false;
      }
      this.oauth2Client.setCredentials(tokens);
      process.stderr.write(`Loaded tokens for ${this.accountMode} account
`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error loading tokens for ${this.accountMode} account: ${msg}
`);
      if (error instanceof SyntaxError) {
        try {
          await fs3.unlink(this.tokenPath);
          process.stderr.write("Removed corrupted token file\n");
        } catch {
        }
      }
      return false;
    }
  }
  async refreshTokensIfNeeded() {
    const expiryDate = this.oauth2Client.credentials.expiry_date;
    const isExpired = expiryDate ? Date.now() >= expiryDate - 5 * 60 * 1e3 : !this.oauth2Client.credentials.access_token;
    if (isExpired && this.oauth2Client.credentials.refresh_token) {
      if (process.env.NODE_ENV !== "test") {
        process.stderr.write(`Auth token expired or nearing expiry for ${this.accountMode} account, refreshing...
`);
      }
      try {
        const response = await this.oauth2Client.refreshAccessToken();
        const newTokens = response.credentials;
        if (!newTokens.access_token) {
          throw new Error("Received invalid tokens during refresh");
        }
        this.oauth2Client.setCredentials(newTokens);
        if (process.env.NODE_ENV !== "test") {
          process.stderr.write(`Token refreshed successfully for ${this.accountMode} account
`);
        }
        return true;
      } catch (refreshError) {
        if (refreshError instanceof GaxiosError && refreshError.response?.data?.error === "invalid_grant") {
          process.stderr.write(`Error refreshing auth token for ${this.accountMode} account: Invalid grant. Token likely expired or revoked. Please re-authenticate.
`);
          return false;
        } else {
          process.stderr.write(`Error refreshing auth token for ${this.accountMode} account: `);
          if (refreshError instanceof Error) {
            process.stderr.write(refreshError.message);
          } else if (typeof refreshError === "string") {
            process.stderr.write(refreshError);
          }
          process.stderr.write("\n");
          return false;
        }
      }
    } else if (!this.oauth2Client.credentials.access_token && !this.oauth2Client.credentials.refresh_token) {
      process.stderr.write(`No access or refresh token available for ${this.accountMode} account. Please re-authenticate.
`);
      return false;
    } else {
      return true;
    }
  }
  async validateTokens(accountMode) {
    const modeToValidate = accountMode || this.accountMode;
    const currentMode = this.accountMode;
    try {
      if (modeToValidate !== currentMode) {
        this.accountMode = modeToValidate;
      }
      if (!this.oauth2Client.credentials || !this.oauth2Client.credentials.access_token) {
        if (!await this.loadSavedTokens()) {
          return false;
        }
        if (!this.oauth2Client.credentials || !this.oauth2Client.credentials.access_token) {
          return false;
        }
      }
      const result = await this.refreshTokensIfNeeded();
      return result;
    } finally {
      if (modeToValidate !== currentMode) {
        this.accountMode = currentMode;
      }
    }
  }
  async saveTokens(tokens, email) {
    try {
      await this.enqueueTokenWrite(async () => {
        const multiAccountTokens = await this.loadMultiAccountTokens();
        const cachedTokens = { ...tokens };
        if (email) {
          cachedTokens.cached_email = email;
        }
        multiAccountTokens[this.accountMode] = cachedTokens;
        await this.writeTokenFile(multiAccountTokens);
      });
      this.oauth2Client.setCredentials(tokens);
      process.stderr.write(`Tokens saved successfully for ${this.accountMode} account to: ${this.tokenPath}
`);
    } catch (error) {
      process.stderr.write(`Error saving tokens for ${this.accountMode} account: ${error}
`);
      throw error;
    }
  }
  async clearTokens() {
    try {
      this.oauth2Client.setCredentials({});
      await this.enqueueTokenWrite(async () => {
        const multiAccountTokens = await this.loadMultiAccountTokens();
        delete multiAccountTokens[this.accountMode];
        if (Object.keys(multiAccountTokens).length === 0) {
          await fs3.unlink(this.tokenPath);
          process.stderr.write(`All tokens cleared, file deleted
`);
        } else {
          await this.writeTokenFile(multiAccountTokens);
          process.stderr.write(`Tokens cleared for ${this.accountMode} account
`);
        }
      });
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        process.stderr.write("Token file already deleted\n");
      } else {
        process.stderr.write(`Error clearing tokens for ${this.accountMode} account: ${error}
`);
      }
    }
  }
  // Method to list available accounts
  async listAvailableAccounts() {
    try {
      const multiAccountTokens = await this.loadMultiAccountTokens();
      return Object.keys(multiAccountTokens);
    } catch (error) {
      return [];
    }
  }
  /**
   * Remove a specific account's tokens from storage.
   * @param accountId - The account ID to remove
   * @throws Error if account doesn't exist or removal fails
   */
  async removeAccount(accountId2) {
    const normalizedId = accountId2.toLowerCase();
    await this.enqueueTokenWrite(async () => {
      const multiAccountTokens = await this.loadMultiAccountTokens();
      if (!multiAccountTokens[normalizedId]) {
        throw new Error(`Account "${normalizedId}" not found`);
      }
      delete multiAccountTokens[normalizedId];
      if (Object.keys(multiAccountTokens).length === 0) {
        await fs3.unlink(this.tokenPath);
        process.stderr.write(`All tokens cleared, file deleted
`);
      } else {
        await this.writeTokenFile(multiAccountTokens);
        process.stderr.write(`Account "${normalizedId}" removed successfully
`);
      }
      this.accounts.delete(normalizedId);
    });
  }
  // Method to switch to a different account (supports arbitrary account IDs)
  async switchAccount(newMode) {
    this.accountMode = newMode;
    return this.loadSavedTokens();
  }
  /**
   * Load all authenticated accounts from token file
   * Returns a Map of account ID to OAuth2Client
   *
   * Reuses existing OAuth2Client instances to prevent memory leaks
   * Sets up token refresh handlers for new accounts
   */
  async loadAllAccounts() {
    try {
      const multiAccountTokens = await this.loadMultiAccountTokens();
      for (const accountId2 of this.accounts.keys()) {
        if (!multiAccountTokens[accountId2]) {
          const client = this.accounts.get(accountId2);
          if (client) {
            client.removeAllListeners("tokens");
          }
          this.accounts.delete(accountId2);
        }
      }
      for (const [accountId2, tokens] of Object.entries(multiAccountTokens)) {
        try {
          validateAccountId(accountId2);
          if (!tokens || typeof tokens !== "object" || !tokens.access_token) {
            continue;
          }
          let client = this.accounts.get(accountId2);
          if (!client) {
            client = new OAuth2Client2(
              this.credentials.clientId,
              this.credentials.clientSecret,
              this.credentials.redirectUri
            );
            this.setupTokenRefreshForAccount(client, accountId2);
            this.accounts.set(accountId2, client);
          }
          client.setCredentials(tokens);
        } catch (error) {
          if (process.env.NODE_ENV !== "test") {
            process.stderr.write(`Skipping invalid account "${accountId2}": ${error}
`);
          }
          continue;
        }
      }
      return this.accounts;
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return /* @__PURE__ */ new Map();
      }
      throw error;
    }
  }
  /**
   * Get OAuth2Client for a specific account
   * @param accountId The account ID to retrieve
   * @throws Error if account not found or invalid
   */
  getClient(accountId2) {
    validateAccountId(accountId2);
    const client = this.accounts.get(accountId2);
    if (!client) {
      throw new Error(`Account "${accountId2}" not found. Please authenticate this account first.`);
    }
    return client;
  }
  /**
   * List all authenticated accounts with their email addresses, status, and calendars
   * Uses cached data when available to avoid repeated API calls
   */
  async listAccounts() {
    try {
      const multiAccountTokens = await this.loadMultiAccountTokens();
      const accountList = [];
      let tokensUpdated = false;
      const CALENDAR_CACHE_TTL = 5 * 60 * 1e3;
      for (const [accountId2, tokens] of Object.entries(multiAccountTokens)) {
        if (!tokens || typeof tokens !== "object") {
          continue;
        }
        let client = null;
        if (tokens.access_token || tokens.refresh_token) {
          try {
            client = new OAuth2Client2(
              this.credentials.clientId,
              this.credentials.clientSecret,
              this.credentials.redirectUri
            );
            client.setCredentials(tokens);
            if (tokens.refresh_token && (!tokens.access_token || tokens.expiry_date && tokens.expiry_date < Date.now())) {
              try {
                const response = await client.refreshAccessToken();
                client.setCredentials(response.credentials);
                Object.assign(tokens, response.credentials);
                tokensUpdated = true;
              } catch {
              }
            }
          } catch {
            client = null;
          }
        }
        let email = tokens.cached_email || "unknown";
        if (!tokens.cached_email && client) {
          try {
            email = await this.getUserEmail(client);
            if (email !== "unknown") {
              tokens.cached_email = email;
              tokensUpdated = true;
            }
          } catch {
          }
        }
        let calendars = tokens.cached_calendars || [];
        const cacheExpired = !tokens.calendars_cached_at || Date.now() - tokens.calendars_cached_at > CALENDAR_CACHE_TTL;
        if (cacheExpired && client) {
          try {
            calendars = await this.fetchCalendarsForClient(client);
            tokens.cached_calendars = calendars;
            tokens.calendars_cached_at = Date.now();
            tokensUpdated = true;
          } catch {
          }
        }
        let status = "active";
        if (!tokens.refresh_token) {
          if (!tokens.access_token || tokens.expiry_date && tokens.expiry_date < Date.now()) {
            status = "expired";
          }
        }
        accountList.push({ id: accountId2, email, status, calendars });
      }
      if (tokensUpdated) {
        await this.enqueueTokenWrite(async () => {
          const latestTokens = await this.loadMultiAccountTokensRaw();
          for (const accountId2 of Object.keys(multiAccountTokens)) {
            const localUpdates = multiAccountTokens[accountId2];
            const latestAccount = latestTokens[accountId2];
            if (latestAccount && localUpdates) {
              if (localUpdates.cached_email) {
                latestAccount.cached_email = localUpdates.cached_email;
              }
              if (localUpdates.cached_calendars) {
                latestAccount.cached_calendars = localUpdates.cached_calendars;
                latestAccount.calendars_cached_at = localUpdates.calendars_cached_at;
              }
            }
          }
          await this.writeTokenFile(latestTokens);
        });
      }
      return accountList;
    } catch (error) {
      return [];
    }
  }
  /**
   * Fetch calendars for a specific OAuth2Client
   */
  async fetchCalendarsForClient(client) {
    const { google: google5 } = await import("googleapis");
    const calendar = google5.calendar({ version: "v3", auth: client });
    const response = await calendar.calendarList.list();
    const items = response.data.items || [];
    const calendars = items.map((cal) => ({
      id: cal.id || "",
      summary: cal.summary || "",
      summaryOverride: cal.summaryOverride || void 0,
      accessRole: cal.accessRole || "reader",
      primary: cal.primary || false,
      backgroundColor: cal.backgroundColor || void 0
    }));
    calendars.sort((a, b) => {
      if (a.primary && !b.primary) return -1;
      if (!a.primary && b.primary) return 1;
      return (a.summaryOverride || a.summary).localeCompare(b.summaryOverride || b.summary);
    });
    return calendars;
  }
  /**
   * Get user email address from OAuth2Client
   * First tries getTokenInfo, then falls back to primary calendar ID
   */
  async getUserEmail(client) {
    try {
      const tokenInfo = await client.getTokenInfo(client.credentials.access_token || "");
      if (tokenInfo.email) {
        return tokenInfo.email;
      }
    } catch {
    }
    try {
      const { google: google5 } = await import("googleapis");
      const calendar = google5.calendar({ version: "v3", auth: client });
      const response = await calendar.calendars.get({ calendarId: "primary" });
      const primaryId = response.data.id;
      if (primaryId && primaryId.includes("@")) {
        return primaryId;
      }
    } catch {
    }
    return "unknown";
  }
};

// src/auth/server.ts
init_client();
init_utils();
import crypto from "crypto";
import http from "http";
import { URL as URL2 } from "url";
import open from "open";

// src/web/templates.ts
import fs4 from "fs/promises";
import path3 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
var __filename = fileURLToPath2(import.meta.url);
var __dirname = path3.dirname(__filename);
function escapeHtml(text) {
  const htmlEscapes = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}
async function loadWebFile(fileName) {
  const locations = [
    path3.join(__dirname, fileName),
    // src/web/file.html (source)
    path3.join(__dirname, "web", fileName)
    // build/web/file.html (bundled)
  ];
  for (const filePath of locations) {
    try {
      await fs4.access(filePath);
      return fs4.readFile(filePath, "utf-8");
    } catch {
    }
  }
  throw new Error(`Web file not found: ${fileName}. Tried: ${locations.join(", ")}`);
}
async function loadTemplate(templateName) {
  return loadWebFile(templateName);
}
async function renderAuthSuccess(params) {
  const template = await loadTemplate("auth-success.html");
  const safeAccountId = escapeHtml(params.accountId);
  let accountInfoSection;
  if (params.email) {
    accountInfoSection = `
      <p class="account-email">${escapeHtml(params.email)}</p>
      <p class="account-label">Saved as <code>${safeAccountId}</code></p>`;
  } else {
    accountInfoSection = `
      <p class="account-email">Account connected</p>
      <p class="account-label">Saved as <code>${safeAccountId}</code></p>`;
  }
  const closeButtonSection = params.showCloseButton ? `<button onclick="window.close()">Close Window</button>` : "";
  const scriptSection = params.postMessageOrigin ? `<script>
        if (window.opener) {
          window.opener.postMessage({ type: 'auth-success', accountId: ${JSON.stringify(safeAccountId)} }, ${JSON.stringify(params.postMessageOrigin)});
        }
        setTimeout(() => window.close(), 3000);
      </script>` : "";
  return template.replace("{{accountInfo}}", accountInfoSection).replace("{{closeButton}}", closeButtonSection).replace("{{script}}", scriptSection);
}
async function renderAuthError(params) {
  const template = await loadTemplate("auth-error.html");
  const safeError = escapeHtml(params.errorMessage);
  const closeButtonSection = params.showCloseButton ? `<button onclick="window.close()">Close Window</button>` : "";
  return template.replace("{{errorMessage}}", safeError).replace("{{closeButton}}", closeButtonSection);
}
async function renderAuthLanding(params) {
  const template = await loadTemplate("auth-landing.html");
  const safeAccountId = escapeHtml(params.accountId);
  const safeAuthUrl = escapeHtml(params.authUrl);
  return template.replace(/\{\{accountId\}\}/g, safeAccountId).replace("{{authUrl}}", safeAuthUrl);
}

// src/auth/server.ts
var AuthServer = class {
  baseOAuth2Client;
  // Used by TokenManager for validation/refresh
  flowOAuth2Client = null;
  // Used specifically for the auth code flow
  server = null;
  tokenManager;
  portRange;
  activeConnections = /* @__PURE__ */ new Set();
  // Track active socket connections
  authCompletedSuccessfully = false;
  // Flag for standalone script
  mcpToolTimeout = null;
  // Timeout for MCP tool auth flow
  autoShutdownOnSuccess = false;
  // Whether to auto-shutdown after successful auth
  pendingAuthFlow = null;
  // PKCE + state for current OAuth flow
  constructor(oauth2Client) {
    this.baseOAuth2Client = oauth2Client;
    this.tokenManager = new TokenManager(oauth2Client);
    this.portRange = { start: 3500, end: 3505 };
  }
  /**
   * Creates the flow-specific OAuth2Client with the correct redirect URI.
   */
  async createFlowOAuth2Client(port) {
    const { client_id, client_secret } = await loadCredentials();
    return new OAuth2Client3(
      client_id,
      client_secret,
      `http://localhost:${port}/oauth2callback`
    );
  }
  /**
   * Generates an OAuth authorization URL with standard settings.
   * Includes PKCE (Proof Key for Code Exchange) and a state parameter for CSRF protection.
   * Requires that PKCE credentials and state have been pre-generated via preparePkceAndState().
   */
  generateOAuthUrl(client) {
    if (!this.pendingAuthFlow) {
      throw new Error("Auth flow not initialized. Call preparePkceAndState() before generating auth URL.");
    }
    return client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/calendar"],
      prompt: "consent",
      code_challenge_method: CodeChallengeMethod.S256,
      code_challenge: this.pendingAuthFlow.codeChallenge,
      state: this.pendingAuthFlow.state
    });
  }
  /**
   * Generates and stores PKCE verifier/challenge pair and a random state parameter.
   * Must be called once per auth flow, before generateOAuthUrl().
   * Subsequent calls to generateOAuthUrl() or landing page visits reuse these values.
   */
  async preparePkceAndState(client) {
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    if (!codeChallenge) {
      throw new Error("Failed to generate PKCE code challenge");
    }
    this.pendingAuthFlow = {
      codeVerifier,
      codeChallenge,
      state: crypto.randomBytes(32).toString("hex")
    };
  }
  async sendErrorPage(res, statusCode, errorMessage) {
    const errorHtml = await renderAuthError({ errorMessage });
    res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
    res.end(errorHtml);
  }
  createServer() {
    const server = http.createServer(async (req, res) => {
      const url = new URL2(req.url || "/", `http://${req.headers.host}`);
      if (url.pathname === "/styles.css") {
        const css = await loadWebFile("styles.css");
        res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
        res.end(css);
      } else if (url.pathname === "/") {
        try {
          const clientForUrl = this.flowOAuth2Client || this.baseOAuth2Client;
          const authUrl = this.generateOAuthUrl(clientForUrl);
          const accountMode = getAccountMode2();
          const landingHtml = await renderAuthLanding({
            accountId: accountMode,
            authUrl
          });
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(landingHtml);
        } catch (error) {
          await this.sendErrorPage(res, 500, "Authentication flow not ready. Please restart the auth process.");
        }
      } else if (url.pathname === "/oauth2callback") {
        const code = url.searchParams.get("code");
        if (!code) {
          await this.sendErrorPage(res, 400, "Authorization code missing");
          return;
        }
        const returnedState = url.searchParams.get("state");
        if (!this.pendingAuthFlow || !returnedState || returnedState !== this.pendingAuthFlow.state) {
          process.stderr.write(`\u2717 OAuth callback rejected: invalid state parameter (possible CSRF attempt)
`);
          await this.sendErrorPage(res, 403, "Invalid state parameter. This may indicate a CSRF attack or an expired authentication session. Please try authenticating again.");
          return;
        }
        if (!this.flowOAuth2Client) {
          await this.sendErrorPage(res, 500, "Authentication flow not properly initiated.");
          return;
        }
        try {
          const { tokens } = await this.flowOAuth2Client.getToken({
            code,
            codeVerifier: this.pendingAuthFlow.codeVerifier
          });
          this.pendingAuthFlow = null;
          await this.tokenManager.saveTokens(tokens);
          this.authCompletedSuccessfully = true;
          const tokenPath = this.tokenManager.getTokenPath();
          const accountMode = this.tokenManager.getAccountMode();
          if (this.autoShutdownOnSuccess) {
            if (this.mcpToolTimeout) {
              clearTimeout(this.mcpToolTimeout);
              this.mcpToolTimeout = null;
            }
            setTimeout(() => {
              this.stop().catch(() => {
              });
            }, 2e3);
          }
          const successHtml = await renderAuthSuccess({
            accountId: accountMode,
            tokenPath
          });
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(successHtml);
        } catch (error) {
          this.authCompletedSuccessfully = false;
          this.pendingAuthFlow = null;
          const message = error instanceof Error ? error.message : "Unknown error";
          process.stderr.write(`\u2717 Token save failed: ${message}
`);
          await this.sendErrorPage(res, 500, message);
        }
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    });
    server.on("connection", (socket) => {
      this.activeConnections.add(socket);
      socket.on("close", () => {
        this.activeConnections.delete(socket);
      });
    });
    return server;
  }
  async start(openBrowser = true) {
    return Promise.race([
      this.startWithTimeout(openBrowser),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Auth server start timed out after 10 seconds")), 1e4);
      })
    ]).catch(() => false);
  }
  async startWithTimeout(openBrowser = true) {
    if (await this.tokenManager.validateTokens()) {
      this.authCompletedSuccessfully = true;
      return true;
    }
    const port = await this.startServerOnAvailablePort();
    if (port === null) {
      process.stderr.write(`Could not start auth server on available port. Please check port availability (${this.portRange.start}-${this.portRange.end}) and try again.
`);
      this.authCompletedSuccessfully = false;
      return false;
    }
    try {
      this.flowOAuth2Client = await this.createFlowOAuth2Client(port);
    } catch (error) {
      process.stderr.write(`\u2717 Failed to load OAuth credentials: ${error instanceof Error ? error.message : "Unknown error"}
`);
      this.authCompletedSuccessfully = false;
      await this.stop();
      return false;
    }
    try {
      await this.preparePkceAndState(this.flowOAuth2Client);
    } catch (error) {
      process.stderr.write(`\u2717 Failed to initialize PKCE: ${error instanceof Error ? error.message : "Unknown error"}
`);
      this.authCompletedSuccessfully = false;
      await this.stop();
      return false;
    }
    const authorizeUrl = this.generateOAuthUrl(this.flowOAuth2Client);
    process.stderr.write(`
\u{1F517} Authentication URL: ${authorizeUrl}

`);
    process.stderr.write(`Or visit: http://localhost:${port}

`);
    if (openBrowser) {
      try {
        await open(authorizeUrl);
        process.stderr.write(`Browser opened automatically. If it didn't open, use the URL above.
`);
      } catch (error) {
        process.stderr.write(`Could not open browser automatically. Please use the URL above.
`);
      }
    } else {
      process.stderr.write(`Please visit the URL above to complete authentication.
`);
    }
    return true;
  }
  async startServerOnAvailablePort() {
    for (let port = this.portRange.start; port <= this.portRange.end; port++) {
      try {
        await new Promise((resolve2, reject) => {
          const testServer = this.createServer();
          testServer.listen(port, () => {
            this.server = testServer;
            resolve2();
          });
          testServer.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
              testServer.close(() => reject(err));
            } else {
              reject(err);
            }
          });
        });
        return port;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EADDRINUSE")) {
          return null;
        }
      }
    }
    return null;
  }
  getRunningPort() {
    if (this.server) {
      const address = this.server.address();
      if (typeof address === "object" && address !== null) {
        return address.port;
      }
    }
    return null;
  }
  async stop() {
    if (this.mcpToolTimeout) {
      clearTimeout(this.mcpToolTimeout);
      this.mcpToolTimeout = null;
    }
    this.autoShutdownOnSuccess = false;
    this.pendingAuthFlow = null;
    return new Promise((resolve2, reject) => {
      if (this.server) {
        for (const connection of this.activeConnections) {
          connection.destroy();
        }
        this.activeConnections.clear();
        const timeout = setTimeout(() => {
          process.stderr.write("Server close timeout, forcing exit...\n");
          this.server = null;
          resolve2();
        }, 2e3);
        this.server.close((err) => {
          clearTimeout(timeout);
          if (err) {
            reject(err);
          } else {
            this.server = null;
            resolve2();
          }
        });
      } else {
        resolve2();
      }
    });
  }
  /**
   * Start the auth server for use by an MCP tool.
   *
   * Unlike the regular start() method:
   * - Does not open the browser automatically
   * - Returns the auth URL for the MCP tool to return to the user
   * - Auto-shutdowns after successful auth or timeout (5 minutes)
   * - Does not validate existing tokens (allows adding new accounts)
   *
   * @param accountId - The account ID to authenticate
   * @returns Result with auth URL on success, or error on failure
   */
  async startForMcpTool(accountId2) {
    if (this.server) {
      await this.stop();
    }
    this.tokenManager.setAccountMode(accountId2);
    const port = await this.startServerOnAvailablePort();
    if (port === null) {
      return {
        success: false,
        error: `Could not start auth server. Ports ${this.portRange.start}-${this.portRange.end} may be in use.`
      };
    }
    try {
      this.flowOAuth2Client = await this.createFlowOAuth2Client(port);
    } catch (error) {
      await this.stop();
      return {
        success: false,
        error: `Failed to load OAuth credentials: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
    try {
      await this.preparePkceAndState(this.flowOAuth2Client);
    } catch (error) {
      await this.stop();
      return {
        success: false,
        error: `Failed to initialize PKCE: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
    const authUrl = this.generateOAuthUrl(this.flowOAuth2Client);
    this.autoShutdownOnSuccess = true;
    this.authCompletedSuccessfully = false;
    this.mcpToolTimeout = setTimeout(async () => {
      if (!this.authCompletedSuccessfully) {
        process.stderr.write(`Auth timeout for account "${accountId2}" - shutting down auth server
`);
        await this.stop();
      }
    }, 5 * 60 * 1e3);
    return {
      success: true,
      authUrl,
      callbackUrl: `http://localhost:${port}/oauth2callback`
    };
  }
};

// src/tools/registry.ts
import { z } from "zod";

// src/utils/field-mask-builder.ts
init_failure_envelope();
var ALLOWED_EVENT_FIELDS = [
  "id",
  "summary",
  "description",
  "start",
  "end",
  "location",
  "attendees",
  "colorId",
  "transparency",
  "extendedProperties",
  "reminders",
  "conferenceData",
  "attachments",
  "status",
  "htmlLink",
  "created",
  "updated",
  "creator",
  "organizer",
  "recurrence",
  "recurringEventId",
  "originalStartTime",
  "visibility",
  "iCalUID",
  "sequence",
  "hangoutLink",
  "anyoneCanAddSelf",
  "guestsCanInviteOthers",
  "guestsCanModify",
  "guestsCanSeeOtherGuests",
  "privateCopy",
  "locked",
  "source",
  "eventType"
];
var DEFAULT_EVENT_FIELDS = [
  "id",
  "summary",
  "start",
  "end",
  "status",
  "htmlLink",
  "location",
  "attendees",
  "reminders",
  "recurrence"
];
function validateFields(fields) {
  const validFields = [];
  const invalidFields = [];
  for (const field of fields) {
    if (ALLOWED_EVENT_FIELDS.includes(field)) {
      validFields.push(field);
    } else {
      invalidFields.push(field);
    }
  }
  if (invalidFields.length > 0) {
    throw localEnvelopeError(
      "bad_request",
      `Invalid fields requested: ${invalidFields.join(", ")}.`,
      `Allowed fields: ${ALLOWED_EVENT_FIELDS.join(", ")}`
    );
  }
  return validFields;
}
function prepareFields(requestedFields, includeDefaults = true) {
  if (!requestedFields || requestedFields.length === 0) {
    return void 0;
  }
  const validFields = validateFields(requestedFields);
  return includeDefaults ? [.../* @__PURE__ */ new Set([...DEFAULT_EVENT_FIELDS, ...validFields])] : validFields;
}
function buildEventFieldMask(requestedFields, includeDefaults = true) {
  const fields = prepareFields(requestedFields, includeDefaults);
  if (!fields) return void 0;
  return `items(${fields.join(",")})`;
}
function buildSingleEventFieldMask(requestedFields, includeDefaults = true) {
  const fields = prepareFields(requestedFields, includeDefaults);
  if (!fields) return void 0;
  return fields.join(",");
}
function buildListFieldMask(requestedFields, includeDefaults = true) {
  if (!requestedFields || requestedFields.length === 0) {
    return void 0;
  }
  const eventFieldMask = buildEventFieldMask(requestedFields, includeDefaults);
  if (!eventFieldMask) {
    return void 0;
  }
  return `${eventFieldMask},nextPageToken,nextSyncToken,kind,etag,summary,updated,timeZone,accessRole,defaultReminders`;
}

// src/tools/registry.ts
init_failure_envelope();

// src/handlers/core/BaseToolHandler.ts
init_utils();
import { google as google2 } from "googleapis";

// src/services/CalendarRegistry.ts
init_utils();
import { google } from "googleapis";
var PERMISSION_RANK = {
  "owner": 4,
  "writer": 3,
  "reader": 2,
  "freeBusyReader": 1
};
var CalendarRegistry = class _CalendarRegistry {
  static instance = null;
  cache = /* @__PURE__ */ new Map();
  CACHE_TTL = 5 * 60 * 1e3;
  // 5 minutes
  // Track in-flight requests to prevent duplicate API calls during concurrent access
  inFlightRequests = /* @__PURE__ */ new Map();
  // Accounts whose calendar list could not be read on the most recent fetch. A calendar missing
  // because its account is broken must never be reported as a calendar that does not exist.
  lastAccessFailures = [];
  /**
   * Get the singleton instance of CalendarRegistry
   */
  static getInstance() {
    if (!_CalendarRegistry.instance) {
      _CalendarRegistry.instance = new _CalendarRegistry();
    }
    return _CalendarRegistry.instance;
  }
  /**
   * Reset the singleton instance (useful for testing or when accounts change)
   * Clears the cache and resets the instance
   */
  static resetInstance() {
    if (_CalendarRegistry.instance) {
      _CalendarRegistry.instance.clearCache();
    }
    _CalendarRegistry.instance = null;
  }
  /**
   * Get calendar client for a specific account
   */
  getCalendar(auth) {
    const quotaProjectId = getCredentialsProjectId();
    const config = {
      version: "v3",
      auth,
      timeout: 3e3
    };
    if (quotaProjectId) {
      config.quotaProjectId = quotaProjectId;
    }
    return google.calendar(config);
  }
  /**
   * Fetch all calendars from all accounts and build unified registry.
   * Uses in-flight request tracking to prevent duplicate API calls during concurrent access.
   */
  async getUnifiedCalendars(accounts) {
    const cacheKey = Array.from(accounts.keys()).sort().join(",");
    const inFlight = this.inFlightRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    const requestPromise = this.fetchAndBuildUnifiedCalendars(accounts, cacheKey);
    this.inFlightRequests.set(cacheKey, requestPromise);
    try {
      return await requestPromise;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }
  /**
   * The accounts whose calendar list could not be read on the most recent fetch. Empty when every
   * account answered.
   */
  getAccessFailures() {
    return this.lastAccessFailures;
  }
  /** The first account failure from the most recent fetch, if there was one. */
  getLastAccessFailure() {
    return this.lastAccessFailures[0];
  }
  /**
   * Internal method to fetch calendars and build the unified registry
   */
  async fetchAndBuildUnifiedCalendars(accounts, cacheKey) {
    const failures = [];
    const calendarsByAccount = await Promise.all(
      Array.from(accounts.entries()).map(async ([accountId2, client]) => {
        try {
          const calendar = this.getCalendar(client);
          const response = await calendar.calendarList.list();
          return {
            accountId: accountId2,
            calendars: response.data.items || []
          };
        } catch (error) {
          failures.push({ accountId: accountId2, error });
          return {
            accountId: accountId2,
            calendars: []
          };
        }
      })
    );
    this.lastAccessFailures = failures;
    if (failures.length > 0 && failures.length === accounts.size) {
      throw failures[0].error;
    }
    const calendarMap = /* @__PURE__ */ new Map();
    for (const { accountId: accountId2, calendars } of calendarsByAccount) {
      for (const cal of calendars) {
        if (!cal.id) continue;
        const access = {
          accountId: accountId2,
          accessRole: cal.accessRole || "reader",
          primary: cal.primary || false,
          summary: cal.summary || cal.id,
          summaryOverride: cal.summaryOverride ?? void 0
        };
        const existing = calendarMap.get(cal.id) || [];
        existing.push(access);
        calendarMap.set(cal.id, existing);
      }
    }
    const unified = Array.from(calendarMap.entries()).map(([calendarId, accounts2]) => {
      const sortedAccounts = [...accounts2].sort((a, b) => {
        const rankA = PERMISSION_RANK[a.accessRole] || 0;
        const rankB = PERMISSION_RANK[b.accessRole] || 0;
        return rankB - rankA;
      });
      const preferredAccount = sortedAccounts[0].accountId;
      const primaryAccess = accounts2.find((a) => a.primary);
      const preferredAccess = sortedAccounts[0];
      const displayName = primaryAccess?.summaryOverride || preferredAccess.summaryOverride || preferredAccess.summary;
      return {
        calendarId,
        accounts: accounts2,
        preferredAccount,
        displayName
      };
    });
    this.cache.set(cacheKey, {
      data: unified,
      timestamp: Date.now()
    });
    return unified;
  }
  /**
   * Find which account to use for a specific calendar
   * For write operations, returns account with highest permission
   * For read operations, returns any account with access (prefers higher permission)
   */
  async getAccountForCalendar(calendarId, accounts, operationType = "read") {
    const unified = await this.getUnifiedCalendars(accounts);
    const calendar = unified.find((c) => c.calendarId === calendarId);
    if (!calendar) {
      return null;
    }
    if (operationType === "write") {
      const preferredAccess2 = calendar.accounts.find((a) => a.accountId === calendar.preferredAccount);
      if (!preferredAccess2) return null;
      if (preferredAccess2.accessRole === "owner" || preferredAccess2.accessRole === "writer") {
        return {
          accountId: preferredAccess2.accountId,
          accessRole: preferredAccess2.accessRole
        };
      }
      return null;
    }
    const preferredAccess = calendar.accounts.find((a) => a.accountId === calendar.preferredAccount);
    if (!preferredAccess) return null;
    return {
      accountId: preferredAccess.accountId,
      accessRole: preferredAccess.accessRole
    };
  }
  /**
   * Get all accounts that have access to a specific calendar
   */
  async getAccountsForCalendar(calendarId, accounts) {
    const unified = await this.getUnifiedCalendars(accounts);
    const calendar = unified.find((c) => c.calendarId === calendarId);
    return calendar?.accounts || [];
  }
  /**
   * Clear cache and in-flight requests (useful for testing or when accounts change)
   */
  clearCache() {
    this.cache.clear();
    this.inFlightRequests.clear();
  }
  /**
   * Resolve a calendar name or ID to a calendar ID and preferred account
   * Searches across all accounts for matching calendars by name
   * Returns the account with highest permissions for the matched calendar
   *
   * @param nameOrId Calendar name (summary/summaryOverride) or ID
   * @param accounts Map of available accounts
   * @param operationType 'read' or 'write' operation type
   * @returns Calendar ID and account info, or null if not found
   */
  async resolveCalendarNameToId(nameOrId, accounts, operationType = "read") {
    if (nameOrId === "primary") {
      if (accounts.size === 1) {
        const [accountId2] = accounts.keys();
        return { calendarId: "primary", accountId: accountId2, accessRole: "owner" };
      }
      const result = await this.getAccountForCalendar(nameOrId, accounts, operationType);
      if (result) {
        return { calendarId: nameOrId, ...result };
      }
      const [firstAccountId] = accounts.keys();
      return { calendarId: "primary", accountId: firstAccountId, accessRole: "owner" };
    }
    if (nameOrId.includes("@")) {
      const result = await this.getAccountForCalendar(nameOrId, accounts, operationType);
      if (result) {
        return { calendarId: nameOrId, ...result };
      }
      return null;
    }
    const unified = await this.getUnifiedCalendars(accounts);
    const lowerName = nameOrId.toLowerCase();
    let match;
    match = unified.find(
      (cal) => cal.accounts.some((a) => a.summaryOverride === nameOrId)
    );
    if (!match) {
      match = unified.find(
        (cal) => cal.accounts.some((a) => a.summaryOverride?.toLowerCase() === lowerName)
      );
    }
    if (!match) {
      match = unified.find((cal) => cal.displayName === nameOrId);
    }
    if (!match) {
      match = unified.find((cal) => cal.displayName.toLowerCase() === lowerName);
    }
    if (!match) {
      match = unified.find(
        (cal) => cal.accounts.some((a) => a.summary === nameOrId)
      );
    }
    if (!match) {
      match = unified.find(
        (cal) => cal.accounts.some((a) => a.summary.toLowerCase() === lowerName)
      );
    }
    if (!match) {
      return null;
    }
    if (operationType === "write") {
      const preferredAccess2 = match.accounts.find((a) => a.accountId === match.preferredAccount);
      if (!preferredAccess2 || preferredAccess2.accessRole !== "owner" && preferredAccess2.accessRole !== "writer") {
        return null;
      }
      return {
        calendarId: match.calendarId,
        accountId: preferredAccess2.accountId,
        accessRole: preferredAccess2.accessRole
      };
    }
    const preferredAccess = match.accounts.find((a) => a.accountId === match.preferredAccount);
    if (!preferredAccess) {
      return null;
    }
    return {
      calendarId: match.calendarId,
      accountId: preferredAccess.accountId,
      accessRole: preferredAccess.accessRole
    };
  }
  /**
   * Resolve multiple calendar names/IDs to their owning accounts.
   * For each calendar, determines which account has access (using highest permission).
   * Returns a routing map of accountId -> calendarIds for efficient multi-account queries.
   *
   * @param namesOrIds Array of calendar names or IDs to resolve
   * @param accounts Map of available accounts
   * @param options.restrictToAccounts Only resolve on these specific accounts (for strict mode)
   * @returns Routing map and warnings for calendars not found
   */
  async resolveCalendarsToAccounts(namesOrIds, accounts, options) {
    const resolved = /* @__PURE__ */ new Map();
    const warnings = [];
    const availableAccounts = options?.restrictToAccounts ? new Map(Array.from(accounts.entries()).filter(([id]) => options.restrictToAccounts.includes(id))) : accounts;
    for (const nameOrId of namesOrIds) {
      const resolution = await this.resolveCalendarNameToId(nameOrId, availableAccounts, "read");
      if (!resolution) {
        warnings.push(`Calendar "${nameOrId}" not found on any account`);
        continue;
      }
      const { calendarId, accountId: accountId2 } = resolution;
      const accountCalendars = resolved.get(accountId2) || [];
      if (!accountCalendars.includes(calendarId)) {
        accountCalendars.push(calendarId);
      }
      resolved.set(accountId2, accountCalendars);
    }
    return { resolved, warnings };
  }
};

// src/handlers/core/BaseToolHandler.ts
init_paths();

// src/utils/datetime.ts
init_failure_envelope();
function hasTimezoneInDatetime(datetime) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(datetime);
}
function convertToRFC3339(datetime, fallbackTimezone) {
  if (hasTimezoneInDatetime(datetime)) {
    return datetime;
  } else {
    try {
      const match = datetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
      if (!match) {
        throw localEnvelopeError("bad_request", "Invalid datetime format.");
      }
      const [, year, month, day, hour, minute, second] = match.map(Number);
      const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
      const targetDate = convertLocalTimeToUTC(year, month - 1, day, hour, minute, second, fallbackTimezone);
      return targetDate.toISOString().replace(/\.000Z$/, "Z");
    } catch (error) {
      return datetime + "Z";
    }
  }
}
function convertLocalTimeToUTC(year, month, day, hour, minute, second, timezone) {
  let testDate = new Date(Date.UTC(year, month, day, hour, minute, second));
  const options = {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  };
  const formatter = new Intl.DateTimeFormat("sv-SE", options);
  const formattedInTargetTZ = formatter.format(testDate);
  const [datePart, timePart] = formattedInTargetTZ.split(" ");
  const [targetYear, targetMonth, targetDay] = datePart.split("-").map(Number);
  const [targetHour, targetMinute, targetSecond] = timePart.split(":").map(Number);
  const wantedTime = new Date(year, month, day, hour, minute, second).getTime();
  const actualTime = new Date(targetYear, targetMonth - 1, targetDay, targetHour, targetMinute, targetSecond).getTime();
  const offsetMs = wantedTime - actualTime;
  return new Date(testDate.getTime() + offsetMs);
}
function createTimeObject(input, fallbackTimezone) {
  const trimmedInput = input.trim();
  if (trimmedInput.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmedInput);
      if (obj.date !== void 0 && obj.dateTime !== void 0) {
        throw localEnvelopeError("bad_request", "Cannot specify both 'date' and 'dateTime' in time input.");
      }
      if (obj.date) {
        return { date: obj.date };
      }
      if (obj.dateTime) {
        if (obj.timeZone !== void 0) {
          if (typeof obj.timeZone !== "string") {
            throw localEnvelopeError("bad_request", "timeZone must be a string (IANA timezone, e.g., 'America/Los_Angeles').");
          }
          if (obj.timeZone.trim() === "") {
            throw localEnvelopeError("bad_request", "timeZone cannot be empty: provide a valid IANA timezone (e.g., 'America/Los_Angeles') or omit the field.");
          }
        }
        if (hasTimezoneInDatetime(obj.dateTime)) {
          return { dateTime: obj.dateTime };
        } else if (obj.timeZone) {
          return { dateTime: obj.dateTime, timeZone: obj.timeZone };
        } else {
          return { dateTime: obj.dateTime, timeZone: fallbackTimezone };
        }
      }
      throw localEnvelopeError("bad_request", "Invalid time object: must have either dateTime or date.");
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw localEnvelopeError("bad_request", "Invalid JSON in time input.");
      }
      throw e;
    }
  }
  const datetime = trimmedInput;
  if (!/T/.test(datetime)) {
    return { date: datetime };
  }
  if (hasTimezoneInDatetime(datetime)) {
    return { dateTime: datetime };
  } else {
    return { dateTime: datetime, timeZone: fallbackTimezone };
  }
}

// src/handlers/core/BaseToolHandler.ts
init_failure_envelope();
var BaseToolHandler = class {
  calendarRegistry = CalendarRegistry.getInstance();
  /**
   * Normalize account ID to lowercase for case-insensitive matching
   * @param accountId Account ID to normalize
   * @returns Lowercase account ID
   */
  normalizeAccountId(accountId2) {
    return accountId2.toLowerCase();
  }
  /**
   * Get OAuth2Client for a specific account, or the first available account if none specified.
   * Use this for read-only operations where any authenticated account will work.
   * @param accountId Optional account ID. If not provided, uses first available account.
   * @param accounts Map of available accounts
   * @returns OAuth2Client for the specified or first account
   * @throws EnvelopeError if account is invalid or not found
   */
  getClientForAccountOrFirst(accountId2, accounts) {
    if (accounts.size === 0) {
      throw localEnvelopeError(
        "no_credentials",
        "No Google account is connected to this server."
      );
    }
    if (accountId2) {
      const normalizedId = this.normalizeAccountId(accountId2);
      try {
        validateAccountId(normalizedId);
      } catch (error) {
        throw localEnvelopeError(
          "bad_request",
          "The account name is not a valid account name.",
          error instanceof Error ? error.message : void 0
        );
      }
      const client2 = accounts.get(normalizedId);
      if (!client2) {
        const availableAccounts = Array.from(accounts.keys()).join(", ");
        throw localEnvelopeError(
          "account_not_found",
          `There is no connected account called "${normalizedId}".`,
          `Connected accounts: ${availableAccounts || "none"}`
        );
      }
      return client2;
    }
    const sortedAccountIds = Array.from(accounts.keys()).sort();
    const firstAccountId = sortedAccountIds[0];
    const client = accounts.get(firstAccountId);
    if (!client) {
      throw localEnvelopeError(
        "internal_error",
        "The connected account could not be loaded."
      );
    }
    return client;
  }
  /**
   * Get OAuth2Client for a specific account or determine default account
   * @param accountId Optional account ID. If not provided, uses single account if available.
   * @param accounts Map of available accounts
   * @returns OAuth2Client for the specified or default account
   * @throws EnvelopeError if account is invalid or not found
   */
  getClientForAccount(accountId2, accounts) {
    if (accounts.size === 0) {
      throw localEnvelopeError(
        "no_credentials",
        "No Google account is connected to this server."
      );
    }
    if (accountId2) {
      const normalizedId = this.normalizeAccountId(accountId2);
      try {
        validateAccountId(normalizedId);
      } catch (error) {
        throw localEnvelopeError(
          "bad_request",
          "The account name is not a valid account name.",
          error instanceof Error ? error.message : void 0
        );
      }
      const client = accounts.get(normalizedId);
      if (!client) {
        const availableAccounts2 = Array.from(accounts.keys()).join(", ");
        throw localEnvelopeError(
          "account_not_found",
          `There is no connected account called "${normalizedId}".`,
          `Connected accounts: ${availableAccounts2 || "none"}`
        );
      }
      return client;
    }
    if (accounts.size === 1) {
      const firstClient = accounts.values().next().value;
      if (!firstClient) {
        throw localEnvelopeError(
          "internal_error",
          "The connected account could not be loaded."
        );
      }
      return firstClient;
    }
    const availableAccounts = Array.from(accounts.keys()).join(", ");
    throw localEnvelopeError(
      "account_required",
      "More than one Google account is connected, so the account to use was ambiguous.",
      `Connected accounts: ${availableAccounts}`
    );
  }
  /**
   * Get multiple OAuth2Clients for multi-account operations (e.g., list-events across accounts)
   * @param accountIds Account ID(s) - string, string[], or undefined
   * @param accounts Map of available accounts
   * @returns Map of accountId to OAuth2Client for the specified accounts
   * @throws EnvelopeError if any account is invalid or not found
   */
  getClientsForAccounts(accountIds, accounts) {
    if (accounts.size === 0) {
      throw localEnvelopeError(
        "no_credentials",
        "No Google account is connected to this server."
      );
    }
    const ids = this.normalizeAccountIds(accountIds);
    if (ids.length === 0) {
      return accounts;
    }
    const result = /* @__PURE__ */ new Map();
    for (const id of ids) {
      const normalizedId = this.normalizeAccountId(id);
      try {
        validateAccountId(normalizedId);
      } catch (error) {
        throw localEnvelopeError(
          "bad_request",
          "The account name is not a valid account name.",
          error instanceof Error ? error.message : void 0
        );
      }
      const client = accounts.get(normalizedId);
      if (!client) {
        const availableAccounts = Array.from(accounts.keys()).join(", ");
        throw localEnvelopeError(
          "account_not_found",
          `There is no connected account called "${normalizedId}".`,
          `Connected accounts: ${availableAccounts || "none"}`
        );
      }
      result.set(normalizedId, client);
    }
    return result;
  }
  /**
   * Get the best account for a calendar depending on operation type
   * @param calendarId Calendar ID
   * @param accounts Available accounts
   * @param operation 'read' or 'write'
   */
  async getAccountForCalendarAccess(calendarId, accounts, operation) {
    if (accounts.size === 1) {
      const entry = accounts.entries().next().value;
      if (entry) {
        const [accountId2, client2] = entry;
        return { accountId: accountId2, client: client2 };
      }
    }
    const result = await this.calendarRegistry.getAccountForCalendar(
      calendarId,
      accounts,
      operation
    );
    if (!result) {
      return null;
    }
    const client = accounts.get(result.accountId);
    if (!client) {
      return null;
    }
    return {
      accountId: result.accountId,
      client
    };
  }
  /**
   * Convenience method to get a single OAuth2Client with automatic account selection.
   * Handles the common pattern where:
   * - If account is specified, use it
   * - If no account specified, auto-select based on calendar permissions
   *
   * This eliminates repetitive boilerplate in handler implementations.
   * Supports both calendar IDs and calendar names for resolution.
   *
   * @param accountId Optional account ID from args
   * @param calendarNameOrId Calendar name or ID to check permissions for (if auto-selecting)
   * @param accounts Map of available accounts
   * @param operation 'read' or 'write' operation type
   * @returns OAuth2Client, selected account ID, resolved calendar ID, and whether it was auto-selected
   * @throws EnvelopeError if account not found or no suitable account available
   */
  async getClientWithAutoSelection(accountId2, calendarNameOrId, accounts, operation) {
    if (accountId2) {
      const normalizedAccountId = this.normalizeAccountId(accountId2);
      const client2 = this.getClientForAccount(normalizedAccountId, accounts);
      let resolvedCalendarId = calendarNameOrId;
      if (calendarNameOrId !== "primary" && !calendarNameOrId.includes("@")) {
        resolvedCalendarId = await this.resolveCalendarId(client2, calendarNameOrId);
      }
      return { client: client2, accountId: normalizedAccountId, calendarId: resolvedCalendarId, wasAutoSelected: false };
    }
    const resolution = await this.calendarRegistry.resolveCalendarNameToId(
      calendarNameOrId,
      accounts,
      operation
    );
    if (!resolution) {
      this.throwCalendarAccessFailureIfAny(`reach calendar "${calendarNameOrId}"`);
      const availableAccounts = Array.from(accounts.keys()).join(", ");
      const accessType = operation === "write" ? "write" : "read";
      throw localEnvelopeError(
        "calendar_not_found",
        `No connected account has ${accessType} access to a calendar called "${calendarNameOrId}".`,
        `Connected accounts: ${availableAccounts}`
      );
    }
    const client = accounts.get(resolution.accountId);
    if (!client) {
      throw localEnvelopeError(
        "internal_error",
        `The connected account "${resolution.accountId}" could not be loaded.`
      );
    }
    return {
      client,
      accountId: resolution.accountId,
      calendarId: resolution.calendarId,
      wasAutoSelected: true
    };
  }
  /**
   * Normalize account parameter to array of account IDs
   * @param accountIds string, string[], or undefined
   * @returns Array of account IDs (empty array if undefined)
   */
  normalizeAccountIds(accountIds) {
    if (!accountIds) {
      return [];
    }
    return Array.isArray(accountIds) ? accountIds : [accountIds];
  }
  /**
   * Format a Google API failure as its envelope text without throwing.
   * Used when collecting failures in batch operations, where each item carries its own evidence.
   */
  formatGoogleApiError(error, action = "complete the request") {
    return envelopeTextFor(error, action);
  }
  /**
   * Turns any failure from the Google API into the uniform envelope
   * (docs/MCP_FAILURE_ENVELOPE.md): `http_<status>`, the literal status line, and Google's
   * response body verbatim. Nothing here interprets the body: an expired credential and a
   * permission the account never had are both 403, and only the body separates them.
   */
  toEnvelopeError(error, action) {
    return envelopeErrorFor(error, action);
  }
  handleGoogleApiError(error, action = "complete the request") {
    throw this.toEnvelopeError(error, action);
  }
  getCalendar(auth) {
    const quotaProjectId = getCredentialsProjectId();
    const config = {
      version: "v3",
      auth,
      timeout: 3e3
      // 3 second timeout for API calls
    };
    if (quotaProjectId) {
      config.quotaProjectId = quotaProjectId;
    }
    return google2.calendar(config);
  }
  /**
   * Combined setup for calendar operations that need both OAuth2Client and Calendar API.
   * Returns the client, calendar instance, resolved calendar ID, and account ID in one call.
   * Use this when you need immediate access to the calendar API in your handler.
   *
   * @param accountId Optional account ID from args
   * @param calendarNameOrId Calendar name or ID
   * @param accounts Map of available accounts
   * @param operation 'read' or 'write' operation type
   * @returns Object with client, calendar, accountId, and resolved calendarId
   */
  async setupOperation(accountId2, calendarNameOrId, accounts, operation) {
    const { client, accountId: selectedAccountId, calendarId: resolvedCalendarId } = await this.getClientWithAutoSelection(accountId2, calendarNameOrId, accounts, operation);
    const calendar = this.getCalendar(client);
    return {
      client,
      calendar,
      accountId: selectedAccountId,
      calendarId: resolvedCalendarId
    };
  }
  /**
   * Gets calendar details including default timezone
   * @param client OAuth2Client
   * @param calendarId Calendar ID to fetch details for
   * @returns Calendar details with timezone
   */
  async getCalendarDetails(client, calendarId) {
    try {
      const calendar = this.getCalendar(client);
      const response = await calendar.calendarList.get({ calendarId });
      if (!response.data) {
        throw localEnvelopeError(
          "unexpected_response",
          `Google returned no details for calendar "${calendarId}".`
        );
      }
      return response.data;
    } catch (error) {
      throw this.handleGoogleApiError(error, `read the settings of calendar "${calendarId}"`);
    }
  }
  /**
   * Gets the default timezone for a calendar.
   *
   * A 404 here is an expected absence, not a breakage: the calendar is simply not in this
   * account's calendar list (a public or resource calendar addressed by id, for example), and
   * UTC is the documented default. Every OTHER failure is propagated with its envelope. It used
   * to swallow all of them into 'UTC', which turned an expired credential into a silently
   * wrong time window (rule 6).
   *
   * @param client OAuth2Client
   * @param calendarId Calendar ID
   * @returns Timezone string (IANA format)
   */
  async getCalendarTimezone(client, calendarId) {
    try {
      const calendarDetails = await this.getCalendarDetails(client, calendarId);
      return calendarDetails.timeZone || "UTC";
    } catch (error) {
      if (isEnvelopeError(error) && error.status === 404) {
        return "UTC";
      }
      throw error;
    }
  }
  /**
   * Normalizes time range parameters to RFC3339 format for Google Calendar API.
   * Determines timezone with precedence: explicit timeZone > calendar's default > UTC.
   *
   * @param client OAuth2Client
   * @param calendarId Calendar ID (used to get default timezone if needed)
   * @param timeMin Optional start of time range
   * @param timeMax Optional end of time range
   * @param timeZone Optional explicit timezone override
   * @returns Normalized time range with resolved timezone
   */
  async normalizeTimeRange(client, calendarId, timeMin, timeMax, timeZone) {
    const timezone = timeZone || await this.getCalendarTimezone(client, calendarId);
    return {
      timeMin: timeMin ? convertToRFC3339(timeMin, timezone) : void 0,
      timeMax: timeMax ? convertToRFC3339(timeMax, timezone) : void 0,
      timezone
    };
  }
  /**
   * Resolves calendar name to calendar ID. If the input is already an ID, returns it unchanged.
   * Supports both exact and case-insensitive name matching.
   *
   * Per Google Calendar API documentation:
   * - Calendar IDs are typically email addresses (e.g., "user@gmail.com") or "primary" keyword
   * - Calendar names are stored in "summary" field (calendar title) and "summaryOverride" field (user's personal override)
   *
   * Matching priority (user's personal override name takes precedence):
   * 1. Exact match on summaryOverride
   * 2. Case-insensitive match on summaryOverride
   * 3. Exact match on summary
   * 4. Case-insensitive match on summary
   *
   * This ensures if a user has set a personal override, it's always checked first (both exact and fuzzy),
   * before falling back to the calendar's actual title.
   *
   * @param client OAuth2Client
   * @param nameOrId Calendar name (summary/summaryOverride) or ID
   * @returns Calendar ID
   * @throws EnvelopeError if calendar name cannot be resolved
   */
  async resolveCalendarId(client, nameOrId) {
    if (nameOrId === "primary" || nameOrId.includes("@")) {
      return nameOrId;
    }
    try {
      const calendar = this.getCalendar(client);
      const response = await calendar.calendarList.list();
      const calendars = response.data.items || [];
      const lowerName = nameOrId.toLowerCase();
      let match = calendars.find((cal) => cal.summaryOverride === nameOrId);
      if (!match) {
        match = calendars.find(
          (cal) => cal.summaryOverride?.toLowerCase() === lowerName
        );
      }
      if (!match) {
        match = calendars.find((cal) => cal.summary === nameOrId);
      }
      if (!match) {
        match = calendars.find(
          (cal) => cal.summary?.toLowerCase() === lowerName
        );
      }
      if (match && match.id) {
        return match.id;
      }
      const availableCalendars = calendars.map((cal) => {
        if (cal.summaryOverride && cal.summaryOverride !== cal.summary) {
          return `"${cal.summaryOverride}" / "${cal.summary}" (${cal.id})`;
        }
        return `"${cal.summary}" (${cal.id})`;
      }).join(", ");
      throw localEnvelopeError(
        "calendar_not_found",
        `This account has no calendar called "${nameOrId}".`,
        `Calendars on this account: ${availableCalendars || "none"}`
      );
    } catch (error) {
      if (isEnvelopeError(error)) {
        throw error;
      }
      throw this.handleGoogleApiError(error, "list the calendars on this account");
    }
  }
  /**
   * If the calendar registry could not read one of the connected accounts, that HTTP failure is
   * the true answer to "why did we not find this calendar", and it is thrown with its own
   * envelope. Silence here would report a broken account as an empty calendar list.
   */
  throwCalendarAccessFailureIfAny(action) {
    const failure = this.calendarRegistry.getLastAccessFailure();
    if (!failure) return;
    throw this.toEnvelopeError(failure.error, action);
  }
  /**
   * Sorts events by start time (chronological order).
   * Works with both regular events and extended events.
   * Mutates the array in place and returns it for chaining.
   */
  sortEventsByStartTime(events) {
    return events.sort((a, b) => {
      const aStart = a.start?.dateTime || a.start?.date || "";
      const bStart = b.start?.dateTime || b.start?.date || "";
      return aStart.localeCompare(bStart);
    });
  }
  /**
   * Throws an error when no calendars could be resolved from multi-account resolution.
   * Provides a helpful error message listing available calendars.
   */
  async throwNoCalendarsFoundError(requestedCalendars, selectedAccounts) {
    const allCalendars = await this.calendarRegistry.getUnifiedCalendars(selectedAccounts);
    this.throwCalendarAccessFailureIfAny("find the requested calendars");
    const calendarList = allCalendars.map((c) => `"${c.displayName}" (${c.calendarId})`).join(", ");
    throw localEnvelopeError(
      "calendar_not_found",
      `None of the requested calendars exist on the connected accounts: ${requestedCalendars.map((c) => `"${c}"`).join(", ")}.`,
      `Available calendars: ${calendarList || "none"}`
    );
  }
  /**
   * Resolves multiple calendar names/IDs to calendar IDs in batch.
   * Fetches calendar list once for efficiency when resolving multiple calendars.
   * Optimized to skip API call if all inputs are already IDs.
   *
   * Matching priority (user's personal override name takes precedence):
   * 1. Exact match on summaryOverride
   * 2. Case-insensitive match on summaryOverride
   * 3. Exact match on summary
   * 4. Case-insensitive match on summary
   *
   * @param client OAuth2Client
   * @param namesOrIds Array of calendar names (summary/summaryOverride) or IDs
   * @returns Array of resolved calendar IDs
   * @throws EnvelopeError if any calendar name cannot be resolved
   */
  async resolveCalendarIds(client, namesOrIds) {
    const validInputs = namesOrIds.filter((item) => item && item.trim().length > 0);
    if (validInputs.length === 0) {
      throw localEnvelopeError(
        "bad_request",
        "No calendar was named in the request."
      );
    }
    const needsResolution = validInputs.some(
      (item) => item !== "primary" && !item.includes("@")
    );
    if (!needsResolution) {
      return validInputs;
    }
    const calendar = this.getCalendar(client);
    const response = await calendar.calendarList.list();
    const calendars = response.data.items || [];
    const overrideToIdMap = /* @__PURE__ */ new Map();
    const summaryToIdMap = /* @__PURE__ */ new Map();
    const lowerOverrideToIdMap = /* @__PURE__ */ new Map();
    const lowerSummaryToIdMap = /* @__PURE__ */ new Map();
    for (const cal of calendars) {
      if (cal.id) {
        if (cal.summaryOverride) {
          overrideToIdMap.set(cal.summaryOverride, cal.id);
          lowerOverrideToIdMap.set(cal.summaryOverride.toLowerCase(), cal.id);
        }
        if (cal.summary) {
          summaryToIdMap.set(cal.summary, cal.id);
          lowerSummaryToIdMap.set(cal.summary.toLowerCase(), cal.id);
        }
      }
    }
    const resolvedIds = [];
    const errors = [];
    for (const nameOrId of validInputs) {
      if (nameOrId === "primary" || nameOrId.includes("@")) {
        resolvedIds.push(nameOrId);
        continue;
      }
      const lowerName = nameOrId.toLowerCase();
      let id = overrideToIdMap.get(nameOrId);
      if (!id) {
        id = lowerOverrideToIdMap.get(lowerName);
      }
      if (!id) {
        id = summaryToIdMap.get(nameOrId);
      }
      if (!id) {
        id = lowerSummaryToIdMap.get(lowerName);
      }
      if (id) {
        resolvedIds.push(id);
      } else {
        errors.push(nameOrId);
      }
    }
    if (errors.length > 0) {
      const availableCalendars = calendars.map((cal) => {
        if (cal.summaryOverride && cal.summaryOverride !== cal.summary) {
          return `"${cal.summaryOverride}" / "${cal.summary}" (${cal.id})`;
        }
        return `"${cal.summary}" (${cal.id})`;
      }).join(", ");
      throw localEnvelopeError(
        "calendar_not_found",
        `This account has no calendar called ${errors.map((e) => `"${e}"`).join(", ")}.`,
        `Calendars on this account: ${availableCalendars || "none"}`
      );
    }
    return resolvedIds;
  }
};

// src/utils/response-builder.ts
function createStructuredResponse(data) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(data)
    }]
  };
}
function convertConflictsToStructured(conflicts) {
  const result = {};
  if (conflicts.duplicates.length > 0) {
    result.duplicates = conflicts.duplicates.map((dup) => {
      let start = "";
      let end = "";
      if (dup.fullEvent) {
        start = dup.fullEvent.start?.dateTime || dup.fullEvent.start?.date || "";
        end = dup.fullEvent.end?.dateTime || dup.fullEvent.end?.date || "";
      }
      return {
        event: {
          id: dup.event.id || "",
          title: dup.event.title,
          start,
          end,
          url: dup.event.url,
          similarity: dup.event.similarity
        },
        calendarId: dup.calendarId || "",
        suggestion: dup.suggestion
      };
    });
  }
  if (conflicts.conflicts.length > 0) {
    result.conflicts = conflicts.conflicts.map((conflict) => {
      let start = conflict.event.start || "";
      let end = conflict.event.end || "";
      if (!start && conflict.fullEvent) {
        start = conflict.fullEvent.start?.dateTime || conflict.fullEvent.start?.date || "";
      }
      if (!end && conflict.fullEvent) {
        end = conflict.fullEvent.end?.dateTime || conflict.fullEvent.end?.date || "";
      }
      return {
        event: {
          id: conflict.event.id || "",
          title: conflict.event.title,
          start,
          end,
          url: conflict.event.url,
          similarity: conflict.similarity
        },
        calendar: conflict.calendar,
        overlap: conflict.overlap ? {
          duration: conflict.overlap.duration,
          percentage: `${conflict.overlap.percentage}%`
        } : void 0
      };
    });
  }
  return result;
}
function createWarningsArray(conflicts) {
  if (!conflicts || !conflicts.hasConflicts) {
    return void 0;
  }
  const warnings = [];
  if (conflicts.duplicates.length > 0) {
    warnings.push(`Found ${conflicts.duplicates.length} potential duplicate(s)`);
  }
  if (conflicts.conflicts.length > 0) {
    warnings.push(`Found ${conflicts.conflicts.length} scheduling conflict(s)`);
  }
  return warnings.length > 0 ? warnings : void 0;
}

// src/handlers/core/ListCalendarsHandler.ts
var ListCalendarsHandler = class extends BaseToolHandler {
  async runTool(args, accounts) {
    const selectedAccounts = this.getClientsForAccounts(args.account, accounts);
    const calendarsPerAccount = await Promise.all(
      Array.from(selectedAccounts.entries()).map(async ([accountId2, client]) => {
        const calendars = await this.listCalendars(client);
        return calendars.map((cal) => ({ ...cal, _accountId: accountId2 }));
      })
    );
    const allCalendars = calendarsPerAccount.flat();
    if (selectedAccounts.size > 1) {
      const unifiedCalendars = await this.calendarRegistry.getUnifiedCalendars(selectedAccounts);
      const response2 = {
        calendars: unifiedCalendars.map((unified) => {
          const preferredCal = allCalendars.find(
            (cal) => cal.id === unified.calendarId && cal._accountId === unified.preferredAccount
          );
          return {
            ...this.convertCalendarToStructured(preferredCal, unified.calendarId),
            accountAccess: unified.accounts.map((a) => ({
              accountId: a.accountId,
              accessRole: a.accessRole,
              primary: a.primary
            }))
          };
        }),
        totalCount: unifiedCalendars.length,
        note: `Showing deduplicated calendars across ${selectedAccounts.size} account(s). Calendars accessible from multiple accounts show all access levels in 'accountAccess' field.`
      };
      return createStructuredResponse(response2);
    }
    const response = {
      calendars: allCalendars.map((cal) => this.convertCalendarToStructured(cal)),
      totalCount: allCalendars.length
    };
    return createStructuredResponse(response);
  }
  convertCalendarToStructured(cal, idOverride) {
    return {
      id: idOverride || cal.id || "",
      summary: cal.summary ?? void 0,
      description: cal.description ?? void 0,
      location: cal.location ?? void 0,
      timeZone: cal.timeZone ?? void 0,
      summaryOverride: cal.summaryOverride ?? void 0,
      colorId: cal.colorId ?? void 0,
      backgroundColor: cal.backgroundColor ?? void 0,
      foregroundColor: cal.foregroundColor ?? void 0,
      hidden: cal.hidden ?? void 0,
      selected: cal.selected ?? void 0,
      accessRole: cal.accessRole ?? void 0,
      defaultReminders: cal.defaultReminders?.map((r) => ({
        method: r.method || "popup",
        minutes: r.minutes || 0
      })),
      notificationSettings: cal.notificationSettings ? {
        notifications: cal.notificationSettings.notifications?.map((n) => ({
          type: n.type ?? void 0,
          method: n.method ?? void 0
        }))
      } : void 0,
      primary: cal.primary ?? void 0,
      deleted: cal.deleted ?? void 0,
      conferenceProperties: cal.conferenceProperties ? {
        allowedConferenceSolutionTypes: cal.conferenceProperties.allowedConferenceSolutionTypes ?? void 0
      } : void 0
    };
  }
  async listCalendars(client) {
    try {
      const calendar = this.getCalendar(client);
      const response = await calendar.calendarList.list();
      return response.data.items || [];
    } catch (error) {
      throw this.handleGoogleApiError(error, "list the calendars");
    }
  }
};

// src/handlers/core/BatchRequestHandler.ts
init_failure_envelope();
var BatchRequestError = class extends EnvelopeError {
  constructor(summary, errors, partial = false, envelope) {
    super({
      code: envelope?.code ?? "batch_failed",
      summary,
      statusLine: envelope?.statusLine,
      body: envelope?.body,
      status: envelope?.status
    });
    this.errors = errors;
    this.partial = partial;
    this.name = "BatchRequestError";
  }
};
var BatchRequestHandler = class {
  // 1 second
  constructor(auth) {
    this.auth = auth;
    this.boundary = "batch_boundary_" + Date.now();
  }
  batchEndpoint = "https://www.googleapis.com/batch/calendar/v3";
  boundary;
  maxRetries = 3;
  baseDelay = 1e3;
  async executeBatch(requests) {
    if (requests.length === 0) {
      return [];
    }
    if (requests.length > 50) {
      throw localEnvelopeError(
        "bad_request",
        `A batch may hold at most 50 requests, and ${requests.length} were given.`
      );
    }
    return this.executeBatchWithRetry(requests, 0);
  }
  async executeBatchWithRetry(requests, attempt) {
    try {
      const batchBody = this.createBatchBody(requests);
      const token = await this.auth.getAccessToken();
      const response = await fetch(this.batchEndpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token.token}`,
          "Content-Type": `multipart/mixed; boundary=${this.boundary}`
        },
        body: batchBody
      });
      const responseText = await response.text();
      if (response.status === 429 && attempt < this.maxRetries) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter ? parseInt(retryAfter) * 1e3 : this.baseDelay * Math.pow(2, attempt);
        process.stderr.write(`Rate limited, retrying after ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})
`);
        await this.sleep(delay);
        return this.executeBatchWithRetry(requests, attempt + 1);
      }
      if (!response.ok) {
        throw new BatchRequestError(
          "Could not read the calendars: the batch request was refused.",
          [{
            statusCode: response.status,
            message: statusLineFor(response.status, response.statusText),
            details: responseText
          }],
          false,
          {
            code: `http_${response.status}`,
            statusLine: statusLineFor(response.status, response.statusText),
            body: responseText,
            status: response.status
          }
        );
      }
      return this.parseBatchResponse(responseText);
    } catch (error) {
      if (error instanceof BatchRequestError) {
        throw error;
      }
      if (attempt < this.maxRetries && this.isRetryableError(error)) {
        const delay = this.baseDelay * Math.pow(2, attempt);
        process.stderr.write(`Network error, retrying after ${delay}ms (attempt ${attempt + 1}/${this.maxRetries}): ${error instanceof Error ? error.message : "Unknown error"}
`);
        await this.sleep(delay);
        return this.executeBatchWithRetry(requests, attempt + 1);
      }
      const detail = error instanceof Error ? error.message : String(error);
      throw new BatchRequestError(
        "Could not read the calendars: the batch request did not complete.",
        [{
          statusCode: 0,
          message: detail,
          details: detail
        }],
        false,
        { code: "network_error", body: detail }
      );
    }
  }
  isRetryableError(error) {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes("network") || message.includes("timeout") || message.includes("econnreset") || message.includes("enotfound");
    }
    return false;
  }
  sleep(ms) {
    return new Promise((resolve2) => setTimeout(resolve2, ms));
  }
  createBatchBody(requests) {
    return requests.map((req, index) => {
      const parts = [
        `--${this.boundary}`,
        `Content-Type: application/http`,
        `Content-ID: <item${index + 1}>`,
        "",
        `${req.method} ${req.path} HTTP/1.1`
      ];
      if (req.headers) {
        Object.entries(req.headers).forEach(([key, value]) => {
          parts.push(`${key}: ${value}`);
        });
      }
      if (req.body) {
        parts.push("Content-Type: application/json");
        parts.push("");
        parts.push(JSON.stringify(req.body));
      }
      return parts.join("\r\n");
    }).join("\r\n\r\n") + `\r
--${this.boundary}--`;
  }
  parseBatchResponse(responseText) {
    const lines = responseText.split(/\r?\n/);
    let boundary = null;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i];
      if (line.toLowerCase().includes("content-type:") && line.includes("boundary=")) {
        const boundaryMatch = line.match(/boundary=([^\s\r\n;]+)/);
        if (boundaryMatch) {
          boundary = boundaryMatch[1];
          break;
        }
      }
    }
    if (!boundary) {
      const boundaryMatch = responseText.match(/--([a-zA-Z0-9_-]+)/);
      if (boundaryMatch) {
        boundary = boundaryMatch[1];
      }
    }
    if (!boundary) {
      throw localEnvelopeError(
        "unexpected_response",
        "Google returned a batch response that could not be read.",
        responseText
      );
    }
    const parts = responseText.split(`--${boundary}`);
    const responses = [];
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.trim() === "" || part.trim() === "--" || part.trim().startsWith("--")) continue;
      const response = this.parseResponsePart(part);
      if (response) {
        responses.push(response);
      }
    }
    return responses;
  }
  parseResponsePart(part) {
    const lines = part.split(/\r?\n/);
    let httpLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("HTTP/1.1")) {
        httpLineIndex = i;
        break;
      }
    }
    if (httpLineIndex === -1) return null;
    const httpLine = lines[httpLineIndex];
    const statusMatch = httpLine.match(/HTTP\/1\.1 (\d+)/);
    if (!statusMatch) return null;
    const statusCode = parseInt(statusMatch[1]);
    const headers = {};
    let bodyStartIndex = httpLineIndex + 1;
    for (let i = httpLineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "") {
        bodyStartIndex = i + 1;
        break;
      }
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        headers[key] = value;
      }
    }
    let body = null;
    if (bodyStartIndex < lines.length) {
      const bodyLines = [];
      for (let i = bodyStartIndex; i < lines.length; i++) {
        bodyLines.push(lines[i]);
      }
      while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === "") {
        bodyLines.pop();
      }
      if (bodyLines.length > 0) {
        const bodyText = bodyLines.join("\n");
        if (bodyText.trim()) {
          try {
            body = JSON.parse(bodyText);
          } catch {
            body = bodyText;
          }
        }
      }
    }
    return {
      statusCode,
      headers,
      body
    };
  }
};

// src/types/structured-responses.ts
function getDayOfWeek(dateTimeOrDate, timeZone) {
  if (!dateTimeOrDate) return void 0;
  try {
    if (!timeZone && /[+-]\d{2}:\d{2}$/.test(dateTimeOrDate)) {
      const dateMatch = dateTimeOrDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        const [, year, month, day] = dateMatch;
        const localDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0));
        if (!isNaN(localDate.getTime())) {
          return new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            timeZone: "UTC"
          }).format(localDate);
        }
      }
    }
    const date = new Date(dateTimeOrDate);
    if (isNaN(date.getTime())) return void 0;
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: timeZone || "UTC"
    }).format(date);
  } catch {
    return void 0;
  }
}
function convertGoogleEventToStructured(event, calendarId, accountId2) {
  return {
    id: event.id || "",
    summary: event.summary ?? void 0,
    description: event.description ?? void 0,
    location: event.location ?? void 0,
    start: {
      dateTime: event.start?.dateTime ?? void 0,
      date: event.start?.date ?? void 0,
      timeZone: event.start?.timeZone ?? void 0
    },
    end: {
      dateTime: event.end?.dateTime ?? void 0,
      date: event.end?.date ?? void 0,
      timeZone: event.end?.timeZone ?? void 0
    },
    startDayOfWeek: getDayOfWeek(
      event.start?.dateTime || event.start?.date,
      event.start?.timeZone
    ),
    endDayOfWeek: getDayOfWeek(
      event.end?.dateTime || event.end?.date,
      event.end?.timeZone
    ),
    status: event.status ?? void 0,
    htmlLink: event.htmlLink ?? void 0,
    created: event.created ?? void 0,
    updated: event.updated ?? void 0,
    colorId: event.colorId ?? void 0,
    creator: event.creator ? {
      email: event.creator.email ?? "",
      displayName: event.creator.displayName ?? void 0,
      self: event.creator.self ?? void 0
    } : void 0,
    organizer: event.organizer ? {
      email: event.organizer.email ?? "",
      displayName: event.organizer.displayName ?? void 0,
      self: event.organizer.self ?? void 0
    } : void 0,
    attendees: event.attendees?.map((a) => ({
      email: a.email || "",
      displayName: a.displayName ?? void 0,
      responseStatus: a.responseStatus,
      optional: a.optional ?? void 0,
      organizer: a.organizer ?? void 0,
      self: a.self ?? void 0,
      resource: a.resource ?? void 0,
      comment: a.comment ?? void 0,
      additionalGuests: a.additionalGuests ?? void 0
    })),
    recurrence: event.recurrence ?? void 0,
    recurringEventId: event.recurringEventId ?? void 0,
    originalStartTime: event.originalStartTime ? {
      dateTime: event.originalStartTime.dateTime ?? void 0,
      date: event.originalStartTime.date ?? void 0,
      timeZone: event.originalStartTime.timeZone ?? void 0
    } : void 0,
    transparency: event.transparency,
    visibility: event.visibility,
    iCalUID: event.iCalUID ?? void 0,
    sequence: event.sequence ?? void 0,
    reminders: event.reminders ? {
      useDefault: event.reminders.useDefault ?? void 0,
      overrides: event.reminders.overrides?.map((r) => ({
        method: r.method || "popup",
        minutes: r.minutes || 0
      }))
    } : void 0,
    source: event.source ? {
      url: event.source.url ?? void 0,
      title: event.source.title ?? void 0
    } : void 0,
    attachments: event.attachments?.map((a) => ({
      fileUrl: a.fileUrl ?? void 0,
      title: a.title ?? void 0,
      mimeType: a.mimeType ?? void 0,
      iconLink: a.iconLink ?? void 0,
      fileId: a.fileId ?? void 0
    })),
    eventType: event.eventType,
    focusTimeProperties: event.focusTimeProperties,
    outOfOfficeProperties: event.outOfOfficeProperties,
    workingLocationProperties: event.workingLocationProperties,
    conferenceData: event.conferenceData,
    extendedProperties: event.extendedProperties,
    hangoutLink: event.hangoutLink ?? void 0,
    anyoneCanAddSelf: event.anyoneCanAddSelf ?? void 0,
    guestsCanInviteOthers: event.guestsCanInviteOthers ?? void 0,
    guestsCanModify: event.guestsCanModify ?? void 0,
    guestsCanSeeOtherGuests: event.guestsCanSeeOtherGuests ?? void 0,
    privateCopy: event.privateCopy ?? void 0,
    locked: event.locked ?? void 0,
    calendarId,
    accountId: accountId2
  };
}

// src/handlers/core/ListEventsHandler.ts
init_failure_envelope();
var ListEventsHandler = class extends BaseToolHandler {
  async runTool(args, accounts) {
    const selectedAccounts = this.getClientsForAccounts(args.account, accounts);
    const partialFailures = [];
    const resolutionWarnings = [];
    const calendarNamesOrIds = Array.isArray(args.calendarId) ? args.calendarId : [args.calendarId];
    let accountCalendarMap;
    if (selectedAccounts.size > 1) {
      const { resolved, warnings: warnings2 } = await this.calendarRegistry.resolveCalendarsToAccounts(
        calendarNamesOrIds,
        selectedAccounts
      );
      accountCalendarMap = resolved;
      resolutionWarnings.push(...warnings2);
      if (accountCalendarMap.size === 0) {
        await this.throwNoCalendarsFoundError(calendarNamesOrIds, selectedAccounts);
      }
    } else {
      const [accountId2] = selectedAccounts.keys();
      accountCalendarMap = /* @__PURE__ */ new Map([[accountId2, calendarNamesOrIds]]);
    }
    const failures = [];
    let succeededCalendars = 0;
    const eventsPerAccount = await Promise.all(
      Array.from(accountCalendarMap.entries()).map(async ([accountId2, calendarsForAccount]) => {
        const client = selectedAccounts.get(accountId2);
        try {
          const calendarIds = selectedAccounts.size === 1 ? await this.resolveCalendarIds(client, calendarsForAccount) : calendarsForAccount;
          const { events, failures: calendarFailures } = await this.fetchEvents(client, calendarIds, {
            timeMin: args.timeMin,
            timeMax: args.timeMax,
            timeZone: args.timeZone,
            fields: args.fields,
            privateExtendedProperty: args.privateExtendedProperty,
            sharedExtendedProperty: args.sharedExtendedProperty
          });
          succeededCalendars += calendarIds.length - calendarFailures.length;
          for (const failure of calendarFailures) {
            failures.push(failure.error);
            partialFailures.push({
              accountId: accountId2,
              reason: `calendar "${failure.calendarId}": ${envelopeTextFor(failure.error, `list events in calendar "${failure.calendarId}"`)}`
            });
          }
          return {
            accountId: accountId2,
            calendarIds,
            events: events.map((event) => ({ ...event, accountId: accountId2 }))
          };
        } catch (error) {
          if (selectedAccounts.size === 1) {
            throw error;
          }
          failures.push(error);
          partialFailures.push({
            accountId: accountId2,
            reason: envelopeTextFor(error, `list events for account "${accountId2}"`)
          });
          return { accountId: accountId2, calendarIds: [], events: [] };
        }
      })
    );
    if (succeededCalendars === 0 && failures.length > 0) {
      throw this.toEnvelopeError(failures[0], "list the events");
    }
    const allEvents = eventsPerAccount.flatMap((result) => result.events);
    const allQueriedCalendarIds = [...new Set(eventsPerAccount.flatMap((result) => result.calendarIds))];
    this.sortEventsByStartTime(allEvents);
    const structuredEvents = allEvents.map(
      (event) => convertGoogleEventToStructured(event, event.calendarId, event.accountId)
    );
    const warnings = [...resolutionWarnings];
    if (partialFailures.length > 0) {
      for (const failure of partialFailures) {
        warnings.push(`Account "${failure.accountId}" failed: ${failure.reason}`);
      }
    }
    let note;
    if (selectedAccounts.size > 1) {
      const successfulAccounts = selectedAccounts.size - partialFailures.length;
      if (partialFailures.length > 0) {
        note = `\u26A0\uFE0F Partial results: Retrieved events from ${successfulAccounts} of ${selectedAccounts.size} account(s). ${partialFailures.length} account(s) failed - see warnings for details.`;
      } else {
        note = `Showing merged events from ${selectedAccounts.size} account(s), sorted chronologically`;
      }
    }
    const response = {
      events: structuredEvents,
      totalCount: allEvents.length,
      calendars: allQueriedCalendarIds.length > 1 ? allQueriedCalendarIds : void 0,
      ...partialFailures.length > 0 && { partialFailures },
      ...warnings.length > 0 && { warnings },
      ...selectedAccounts.size > 1 && { accounts: Array.from(selectedAccounts.keys()) },
      ...note && { note }
    };
    return createStructuredResponse(response);
  }
  async fetchEvents(client, calendarIds, options) {
    if (calendarIds.length === 1) {
      const events = await this.fetchSingleCalendarEvents(client, calendarIds[0], options);
      return { events, failures: [] };
    }
    return this.fetchMultipleCalendarEvents(client, calendarIds, options);
  }
  async fetchSingleCalendarEvents(client, calendarId, options) {
    try {
      const calendar = this.getCalendar(client);
      const { timeMin, timeMax } = await this.normalizeTimeRange(
        client,
        calendarId,
        options.timeMin,
        options.timeMax,
        options.timeZone
      );
      const fieldMask = buildListFieldMask(options.fields);
      const response = await calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        ...fieldMask && { fields: fieldMask },
        ...options.privateExtendedProperty && { privateExtendedProperty: options.privateExtendedProperty },
        ...options.sharedExtendedProperty && { sharedExtendedProperty: options.sharedExtendedProperty }
      });
      return (response.data.items || []).map((event) => ({
        ...event,
        calendarId
      }));
    } catch (error) {
      throw this.handleGoogleApiError(error, `list events in calendar "${calendarId}"`);
    }
  }
  async fetchMultipleCalendarEvents(client, calendarIds, options) {
    const batchHandler = new BatchRequestHandler(client);
    const requests = await Promise.all(calendarIds.map(async (calendarId) => ({
      method: "GET",
      path: await this.buildEventsPath(client, calendarId, options)
    })));
    const responses = await batchHandler.executeBatch(requests);
    const { events, failures } = this.processBatchResponses(responses, calendarIds);
    return { events: this.sortEventsByStartTime(events), failures };
  }
  async buildEventsPath(client, calendarId, options) {
    const { timeMin, timeMax } = await this.normalizeTimeRange(
      client,
      calendarId,
      options.timeMin,
      options.timeMax,
      options.timeZone
    );
    const fieldMask = buildListFieldMask(options.fields);
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime"
    });
    if (timeMin) params.set("timeMin", timeMin);
    if (timeMax) params.set("timeMax", timeMax);
    if (fieldMask) params.set("fields", fieldMask);
    if (options.privateExtendedProperty) {
      for (const kv of options.privateExtendedProperty) params.append("privateExtendedProperty", kv);
    }
    if (options.sharedExtendedProperty) {
      for (const kv of options.sharedExtendedProperty) params.append("sharedExtendedProperty", kv);
    }
    return `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
  }
  processBatchResponses(responses, calendarIds) {
    const events = [];
    const failures = [];
    responses.forEach((response, index) => {
      const calendarId = calendarIds[index];
      if (response.statusCode === 200 && response.body?.items) {
        const calendarEvents = response.body.items.map((event) => ({
          ...event,
          calendarId
        }));
        events.push(...calendarEvents);
      } else {
        failures.push({
          calendarId,
          error: httpEnvelopeError({
            action: `list events in calendar "${calendarId}"`,
            status: response.statusCode,
            body: response.body
          })
        });
      }
    });
    return { events, failures };
  }
};

// src/handlers/core/SearchEventsHandler.ts
init_failure_envelope();
var SearchEventsHandler = class extends BaseToolHandler {
  async runTool(args, accounts) {
    const validArgs = args;
    const calendarNamesOrIds = Array.isArray(validArgs.calendarId) ? validArgs.calendarId : [validArgs.calendarId];
    const selectedAccounts = this.getClientsForAccounts(args.account, accounts);
    let accountCalendarMap;
    const resolutionWarnings = [];
    if (selectedAccounts.size > 1 || calendarNamesOrIds.length > 1) {
      const { resolved, warnings } = await this.calendarRegistry.resolveCalendarsToAccounts(
        calendarNamesOrIds,
        selectedAccounts
      );
      accountCalendarMap = resolved;
      resolutionWarnings.push(...warnings);
      if (accountCalendarMap.size === 0) {
        await this.throwNoCalendarsFoundError(calendarNamesOrIds, selectedAccounts);
      }
    } else {
      const { accountId: accountId2, calendarId } = await this.getClientWithAutoSelection(
        args.account,
        calendarNamesOrIds[0],
        // Use normalized single-element array
        accounts,
        "read"
      );
      accountCalendarMap = /* @__PURE__ */ new Map([[accountId2, [calendarId]]]);
    }
    const allEvents = [];
    const queriedCalendarIds = [];
    const failures = [];
    await Promise.all(
      Array.from(accountCalendarMap.entries()).map(async ([accountId2, calendarIds]) => {
        const client = selectedAccounts.get(accountId2);
        for (const calendarId of calendarIds) {
          try {
            const events = await this.searchEvents(client, {
              ...validArgs,
              calendarId
            });
            for (const event of events) {
              allEvents.push({
                ...event,
                calendarId,
                accountId: accountId2
              });
            }
            queriedCalendarIds.push(calendarId);
          } catch (error) {
            if (accountCalendarMap.size > 1 || calendarIds.length > 1) {
              failures.push(error);
              resolutionWarnings.push(
                `Calendar "${calendarId}" on account "${accountId2}" could not be searched: ` + envelopeTextFor(error, `search calendar "${calendarId}"`)
              );
            } else {
              throw error;
            }
          }
        }
      })
    );
    if (queriedCalendarIds.length === 0 && failures.length > 0) {
      throw this.toEnvelopeError(failures[0], "search the events");
    }
    this.sortEventsByStartTime(allEvents);
    const structuredEvents = allEvents.map(
      (event) => convertGoogleEventToStructured(event, event.calendarId, event.accountId)
    );
    const response = {
      events: structuredEvents,
      totalCount: allEvents.length,
      query: validArgs.query,
      // For single calendar, include calendarId; for multiple, include calendars array
      ...queriedCalendarIds.length === 1 && { calendarId: queriedCalendarIds[0] },
      ...queriedCalendarIds.length > 1 && { calendars: queriedCalendarIds },
      ...selectedAccounts.size > 1 && { accounts: Array.from(selectedAccounts.keys()) },
      ...resolutionWarnings.length > 0 && { warnings: resolutionWarnings }
    };
    if (validArgs.timeMin || validArgs.timeMax) {
      const firstAccountId = accountCalendarMap.keys().next().value;
      const firstCalendarId = accountCalendarMap.get(firstAccountId)?.[0] || "primary";
      const client = selectedAccounts.get(firstAccountId);
      const { timeMin, timeMax } = await this.normalizeTimeRange(
        client,
        firstCalendarId,
        validArgs.timeMin,
        validArgs.timeMax,
        validArgs.timeZone
      );
      response.timeRange = {
        start: timeMin || "",
        end: timeMax || ""
      };
    }
    return createStructuredResponse(response);
  }
  async searchEvents(client, args) {
    try {
      const calendar = this.getCalendar(client);
      const { timeMin, timeMax } = await this.normalizeTimeRange(
        client,
        args.calendarId,
        args.timeMin,
        args.timeMax,
        args.timeZone
      );
      const fieldMask = buildListFieldMask(args.fields);
      const response = await calendar.events.list({
        calendarId: args.calendarId,
        q: args.query,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        ...fieldMask && { fields: fieldMask },
        ...args.privateExtendedProperty && { privateExtendedProperty: args.privateExtendedProperty },
        ...args.sharedExtendedProperty && { sharedExtendedProperty: args.sharedExtendedProperty }
      });
      return response.data.items || [];
    } catch (error) {
      throw this.handleGoogleApiError(error, `search calendar "${args.calendarId}"`);
    }
  }
};

// src/handlers/core/GetEventHandler.ts
init_failure_envelope();
var GetEventHandler = class extends BaseToolHandler {
  async runTool(args, accounts) {
    const validArgs = args;
    const { client: oauth2Client, accountId: selectedAccountId, calendarId: resolvedCalendarId } = await this.getClientWithAutoSelection(
      args.account,
      validArgs.calendarId,
      accounts,
      "read"
    );
    try {
      const argsWithResolvedCalendar = { ...validArgs, calendarId: resolvedCalendarId };
      const event = await this.getEvent(oauth2Client, argsWithResolvedCalendar);
      const response = {
        event: convertGoogleEventToStructured(event, resolvedCalendarId, selectedAccountId)
      };
      return createStructuredResponse(response);
    } catch (error) {
      throw this.handleGoogleApiError(error, `read event "${validArgs.eventId}"`);
    }
  }
  async getEvent(client, args) {
    const calendar = this.getCalendar(client);
    const fieldMask = buildSingleEventFieldMask(args.fields);
    const response = await calendar.events.get({
      calendarId: args.calendarId,
      eventId: args.eventId,
      ...fieldMask && { fields: fieldMask }
    });
    if (!response.data) {
      throw localEnvelopeError(
        "unexpected_response",
        `Google returned no event for id "${args.eventId}".`
      );
    }
    return response.data;
  }
};

// src/handlers/core/ListColorsHandler.ts
init_failure_envelope();
var ListColorsHandler = class extends BaseToolHandler {
  async runTool(args, accounts) {
    const oauth2Client = this.getClientForAccountOrFirst(args.account, accounts);
    const colors = await this.listColors(oauth2Client);
    const response = {
      event: {},
      calendar: {}
    };
    if (colors.event) {
      for (const [id, color] of Object.entries(colors.event)) {
        response.event[id] = {
          background: color.background || "",
          foreground: color.foreground || ""
        };
      }
    }
    if (colors.calendar) {
      for (const [id, color] of Object.entries(colors.calendar)) {
        response.calendar[id] = {
          background: color.background || "",
          foreground: color.foreground || ""
        };
      }
    }
    return createStructuredResponse(response);
  }
  async listColors(client) {
    try {
      const calendar = this.getCalendar(client);
      const response = await calendar.colors.get();
      if (!response.data) {
        throw localEnvelopeError("unexpected_response", "Google returned no colours.");
      }
      return response.data;
    } catch (error) {
      throw this.handleGoogleApiError(error, "list the calendar colours");
    }
  }
};

// src/utils/event-id-validator.ts
init_failure_envelope();
function isValidEventId(eventId) {
  if (eventId.length < 5 || eventId.length > 1024) {
    return false;
  }
  const validPattern = /^[a-v0-9]+$/;
  return validPattern.test(eventId);
}
function validateEventId(eventId) {
  if (!isValidEventId(eventId)) {
    const errors = [];
    if (eventId.length < 5) {
      errors.push("must be at least 5 characters long");
    }
    if (eventId.length > 1024) {
      errors.push("must not exceed 1024 characters");
    }
    if (!/^[a-v0-9]+$/.test(eventId)) {
      errors.push("can only contain lowercase letters a-v and digits 0-9 (base32hex encoding)");
    }
    throw localEnvelopeError(
      "bad_request",
      "The event id given is not a valid Google Calendar event id.",
      `Invalid event ID: ${errors.join(", ")}`
    );
  }
}

// src/services/conflict-detection/ConflictDetectionService.ts
import { google as google3 } from "googleapis";

// src/services/conflict-detection/EventSimilarityChecker.ts
var EventSimilarityChecker = class {
  DEFAULT_SIMILARITY_THRESHOLD = 0.7;
  /**
   * Check if two events are potentially duplicates based on similarity
   * Uses simplified rules-based approach instead of complex weighted calculations
   */
  checkSimilarity(event1, event2) {
    const event1IsAllDay = this.isAllDayEvent(event1);
    const event2IsAllDay = this.isAllDayEvent(event2);
    if (event1IsAllDay !== event2IsAllDay) {
      return 0.2;
    }
    const titleMatch = this.titlesMatch(event1.summary, event2.summary);
    const timeOverlap = this.eventsOverlap(event1, event2);
    const sameDay = this.eventsOnSameDay(event1, event2);
    if (titleMatch.exact && timeOverlap) {
      return 0.95;
    }
    if (titleMatch.similar && timeOverlap) {
      return 0.7;
    }
    if (titleMatch.exact && sameDay) {
      return 0.6;
    }
    if (titleMatch.exact && !sameDay) {
      return 0.4;
    }
    if (titleMatch.similar) {
      return 0.3;
    }
    return 0.1;
  }
  /**
   * Check if an event is an all-day event
   */
  isAllDayEvent(event) {
    return !event.start?.dateTime && !!event.start?.date;
  }
  /**
   * Check if two titles match (exact or similar)
   * Simplified string matching without Levenshtein distance
   */
  titlesMatch(title1, title2) {
    if (!title1 || !title2) {
      return { exact: false, similar: false };
    }
    const t1 = title1.toLowerCase().trim();
    const t2 = title2.toLowerCase().trim();
    if (t1 === t2) {
      return { exact: true, similar: true };
    }
    if (t1.includes(t2) || t2.includes(t1)) {
      return { exact: false, similar: true };
    }
    const words1 = t1.split(/\s+/).filter((w) => w.length > 3);
    const words2 = t2.split(/\s+/).filter((w) => w.length > 3);
    if (words1.length > 0 && words2.length > 0) {
      const commonWords = words1.filter((w) => words2.includes(w));
      const similarity = commonWords.length / Math.min(words1.length, words2.length);
      return { exact: false, similar: similarity >= 0.5 };
    }
    return { exact: false, similar: false };
  }
  /**
   * Check if two events are on the same day
   */
  eventsOnSameDay(event1, event2) {
    const time1 = this.getEventTime(event1);
    const time2 = this.getEventTime(event2);
    if (!time1 || !time2) return false;
    const date1 = new Date(time1.start);
    const date2 = new Date(time2.start);
    return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate();
  }
  /**
   * Extract event time information
   * 
   * Note: This method handles both:
   * - Events being created (may have timezone-naive datetimes with separate timeZone field)
   * - Events from Google Calendar (have timezone-aware datetimes)
   * 
   * The MCP trusts Google Calendar to return only relevant events in the queried time range.
   * Any timezone conversions are handled by the Google Calendar API, not by this service.
   */
  getEventTime(event) {
    const startTime = event.start?.dateTime || event.start?.date;
    const endTime = event.end?.dateTime || event.end?.date;
    if (!startTime || !endTime) return null;
    return {
      start: new Date(startTime),
      end: new Date(endTime)
    };
  }
  /**
   * Check if two events overlap in time
   * Consolidated overlap logic used throughout the service
   */
  eventsOverlap(event1, event2) {
    const time1 = this.getEventTime(event1);
    const time2 = this.getEventTime(event2);
    if (!time1 || !time2) return false;
    return time1.start < time2.end && time2.start < time1.end;
  }
  /**
   * Calculate overlap duration in milliseconds
   * Calculate overlap duration for conflict analysis
   */
  calculateOverlapDuration(event1, event2) {
    const time1 = this.getEventTime(event1);
    const time2 = this.getEventTime(event2);
    if (!time1 || !time2) return 0;
    const overlapStart = Math.max(time1.start.getTime(), time2.start.getTime());
    const overlapEnd = Math.min(time1.end.getTime(), time2.end.getTime());
    return Math.max(0, overlapEnd - overlapStart);
  }
  /**
   * Determine if events are likely duplicates
   */
  isDuplicate(event1, event2, threshold) {
    const similarity = this.checkSimilarity(event1, event2);
    return similarity >= (threshold || this.DEFAULT_SIMILARITY_THRESHOLD);
  }
  /**
     * Analyze overlap between two events with detailed information
  
     */
  analyzeOverlap(event1, event2) {
    const hasOverlap = this.eventsOverlap(event1, event2);
    if (!hasOverlap) {
      return { hasOverlap: false };
    }
    const time1 = this.getEventTimeRange(event1);
    const time2 = this.getEventTimeRange(event2);
    if (!time1 || !time2) {
      return { hasOverlap: false };
    }
    const overlapDuration = this.calculateOverlapDuration(event1, event2);
    const overlapStart = new Date(Math.max(time1.start.getTime(), time2.start.getTime()));
    const overlapEnd = new Date(Math.min(time1.end.getTime(), time2.end.getTime()));
    const event1Duration = time1.end.getTime() - time1.start.getTime();
    const overlapPercentage = Math.round(overlapDuration / event1Duration * 100);
    return {
      hasOverlap: true,
      duration: this.formatDuration(overlapDuration),
      percentage: overlapPercentage,
      startTime: overlapStart.toISOString(),
      endTime: overlapEnd.toISOString()
    };
  }
  /**
     * Get event time range with isAllDay flag
  
     */
  getEventTimeRange(event) {
    const startTime = event.start?.dateTime || event.start?.date;
    const endTime = event.end?.dateTime || event.end?.date;
    if (!startTime || !endTime) return null;
    const start = new Date(startTime);
    const end = new Date(endTime);
    const isAllDay = !event.start?.dateTime && !!event.start?.date;
    return { start, end, isAllDay };
  }
  /**
     * Format duration in human-readable format
  
     */
  formatDuration(milliseconds) {
    const minutes = Math.floor(milliseconds / (1e3 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) {
      const remainingHours = hours % 24;
      return remainingHours > 0 ? `${days} day${days > 1 ? "s" : ""} ${remainingHours} hour${remainingHours > 1 ? "s" : ""}` : `${days} day${days > 1 ? "s" : ""}`;
    }
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours} hour${hours > 1 ? "s" : ""} ${remainingMinutes} minute${remainingMinutes > 1 ? "s" : ""}` : `${hours} hour${hours > 1 ? "s" : ""}`;
    }
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  }
  /**
     * Check if an event conflicts with a busy time slot
  
     */
  checkBusyConflict(event, busySlot) {
    const start = busySlot.start ?? void 0;
    const end = busySlot.end ?? void 0;
    if (!start || !end) return false;
    const busyEvent = {
      start: { dateTime: start },
      end: { dateTime: end }
    };
    return this.eventsOverlap(event, busyEvent);
  }
  /**
     * Filter events that overlap with a given target event
  
     */
  findOverlappingEvents(events, targetEvent) {
    return events.filter((event) => {
      if (event.id === targetEvent.id) return false;
      if (event.status === "cancelled") return false;
      return this.eventsOverlap(targetEvent, event);
    });
  }
};

// src/services/conflict-detection/config.ts
var CONFLICT_DETECTION_CONFIG = {
  /**
   * Thresholds for duplicate event detection
   */
  DUPLICATE_THRESHOLDS: {
    /**
     * Events with similarity >= this value are flagged as potential duplicates
     * and shown as warnings during creation
     */
    WARNING: 0.7,
    /**
     * Events with similarity >= this value are considered exact duplicates
     * and block creation unless explicitly overridden with allowDuplicates flag
     */
    BLOCKING: 0.95
  },
  /**
   * Default similarity threshold for duplicate detection
   * Used when duplicateSimilarityThreshold is not specified in the request
   */
  DEFAULT_DUPLICATE_THRESHOLD: 0.7
};

// src/utils/event-url.ts
function generateEventUrl(calendarId, eventId) {
  const encodedCalendarId = encodeURIComponent(calendarId);
  const encodedEventId = encodeURIComponent(eventId);
  return `https://calendar.google.com/calendar/event?eid=${encodedEventId}&cid=${encodedCalendarId}`;
}
function getEventUrl(event, calendarId) {
  if (event.htmlLink) {
    return event.htmlLink;
  } else if (calendarId && event.id) {
    return generateEventUrl(calendarId, event.id);
  }
  return null;
}

// src/services/conflict-detection/ConflictDetectionService.ts
var ConflictDetectionService = class {
  similarityChecker;
  constructor() {
    this.similarityChecker = new EventSimilarityChecker();
  }
  /**
   * Check for conflicts and duplicates when creating or updating an event
   */
  async checkConflicts(oauth2Client, event, calendarId, options = {}) {
    const {
      checkDuplicates = true,
      checkConflicts = true,
      calendarsToCheck = [calendarId],
      duplicateSimilarityThreshold = CONFLICT_DETECTION_CONFIG.DEFAULT_DUPLICATE_THRESHOLD,
      includeDeclinedEvents = false
    } = options;
    const result = {
      hasConflicts: false,
      conflicts: [],
      duplicates: []
    };
    if (!event.start || !event.end) {
      return result;
    }
    const normalizedEvent = this.normalizeEventForComparison(event);
    let timeMin = normalizedEvent.start?.dateTime || normalizedEvent.start?.date;
    let timeMax = normalizedEvent.end?.dateTime || normalizedEvent.end?.date;
    if (!timeMin || !timeMax) {
      return result;
    }
    const timezone = normalizedEvent.start?.timeZone || normalizedEvent.end?.timeZone;
    const needsConversion = timezone && timeMin && !timeMin.includes("Z") && !timeMin.includes("+") && !timeMin.substring(10).includes("-");
    if (needsConversion) {
      timeMin = convertToRFC3339(timeMin, timezone);
      timeMax = convertToRFC3339(timeMax, timezone);
    }
    for (const checkCalendarId of calendarsToCheck) {
      try {
        const events = await this.getEventsInTimeRange(
          oauth2Client,
          checkCalendarId,
          timeMin,
          timeMax,
          timezone || void 0
        );
        if (checkDuplicates) {
          const duplicates = this.findDuplicates(
            normalizedEvent,
            events,
            checkCalendarId,
            duplicateSimilarityThreshold
          );
          result.duplicates.push(...duplicates);
        }
        if (checkConflicts) {
          const conflicts = this.findConflicts(
            normalizedEvent,
            events,
            checkCalendarId,
            includeDeclinedEvents
          );
          result.conflicts.push(...conflicts);
        }
      } catch (error) {
      }
    }
    result.hasConflicts = result.conflicts.length > 0 || result.duplicates.length > 0;
    return result;
  }
  /**
   * Ensure the event used for comparison has timezone-aware datetimes so overlap/duplicate checks
   * don't depend on the local machine timezone.
   */
  normalizeEventForComparison(event) {
    const clone = JSON.parse(JSON.stringify(event));
    const timezone = clone.start?.timeZone || clone.end?.timeZone;
    if (clone.start?.dateTime && timezone && !hasTimezoneInDatetime(clone.start.dateTime)) {
      clone.start.dateTime = convertToRFC3339(clone.start.dateTime, timezone);
    }
    if (clone.end?.dateTime && timezone && !hasTimezoneInDatetime(clone.end.dateTime)) {
      clone.end.dateTime = convertToRFC3339(clone.end.dateTime, timezone);
    }
    return clone;
  }
  /**
   * Get events in a specific time range from a calendar
   */
  async getEventsInTimeRange(oauth2Client, calendarId, timeMin, timeMax, timeZone) {
    const calendar = google3.calendar({ version: "v3", auth: oauth2Client });
    const listParams = {
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250
    };
    if (timeZone) {
      listParams.timeZone = timeZone;
    }
    const response = await calendar.events.list(listParams);
    const events = response?.data?.items || [];
    return events;
  }
  /**
   * Find duplicate events based on similarity
   */
  findDuplicates(newEvent, existingEvents, calendarId, threshold) {
    const duplicates = [];
    for (const existingEvent of existingEvents) {
      if (existingEvent.id === newEvent.id) continue;
      if (existingEvent.status === "cancelled") continue;
      const similarity = this.similarityChecker.checkSimilarity(newEvent, existingEvent);
      if (similarity >= threshold) {
        duplicates.push({
          event: {
            id: existingEvent.id,
            title: existingEvent.summary || "Untitled Event",
            url: getEventUrl(existingEvent, calendarId) || void 0,
            similarity: Math.round(similarity * 100) / 100
          },
          fullEvent: existingEvent,
          calendarId,
          suggestion: similarity >= CONFLICT_DETECTION_CONFIG.DUPLICATE_THRESHOLDS.BLOCKING ? "This appears to be a duplicate. Consider updating the existing event instead." : "This event is very similar to an existing one. Is this intentional?"
        });
      }
    }
    return duplicates;
  }
  /**
   * Find conflicting events based on time overlap
   * Note: _includeDeclinedEvents is reserved for future declined event detection
   */
  findConflicts(newEvent, existingEvents, calendarId, _includeDeclinedEvents) {
    const conflicts = [];
    const overlappingEvents = this.similarityChecker.findOverlappingEvents(existingEvents, newEvent);
    for (const conflictingEvent of overlappingEvents) {
      const overlap = this.similarityChecker.analyzeOverlap(newEvent, conflictingEvent);
      if (overlap.hasOverlap) {
        conflicts.push({
          type: "overlap",
          calendar: calendarId,
          event: {
            id: conflictingEvent.id,
            title: conflictingEvent.summary || "Untitled Event",
            url: getEventUrl(conflictingEvent, calendarId) || void 0,
            start: conflictingEvent.start?.dateTime || conflictingEvent.start?.date || void 0,
            end: conflictingEvent.end?.dateTime || conflictingEvent.end?.date || void 0
          },
          fullEvent: conflictingEvent,
          overlap: {
            duration: overlap.duration,
            percentage: overlap.percentage,
            startTime: overlap.startTime,
            endTime: overlap.endTime
          }
        });
      }
    }
    return conflicts;
  }
};

// src/handlers/core/CreateEventHandler.ts
init_failure_envelope();
var CreateEventHandler = class extends BaseToolHandler {
  conflictDetectionService;
  constructor() {
    super();
    this.conflictDetectionService = new ConflictDetectionService();
  }
  async runTool(args, accounts) {
    const validArgs = args;
    const { client: oauth2Client, accountId: selectedAccountId, calendarId: resolvedCalendarId } = await this.getClientWithAutoSelection(
      args.account,
      validArgs.calendarId,
      accounts,
      "write"
    );
    if (validArgs.eventType === "outOfOffice" || validArgs.eventType === "workingLocation") {
      if (resolvedCalendarId !== "primary" && !resolvedCalendarId.includes("@")) {
        const eventTypeName = validArgs.eventType === "outOfOffice" ? "Out of Office" : "Working Location";
        throw localEnvelopeError(
          "bad_request",
          `${eventTypeName} events can only be created on the primary calendar, and "${resolvedCalendarId}" is not it.`
        );
      }
    }
    const timezone = args.timeZone || await this.getCalendarTimezone(oauth2Client, resolvedCalendarId);
    const eventToCheck = {
      summary: args.summary,
      description: args.description,
      start: createTimeObject(args.start, timezone),
      end: createTimeObject(args.end, timezone),
      attendees: args.attendees,
      location: args.location
    };
    const conflicts = await this.conflictDetectionService.checkConflicts(
      oauth2Client,
      eventToCheck,
      resolvedCalendarId,
      {
        checkDuplicates: true,
        checkConflicts: true,
        calendarsToCheck: validArgs.calendarsToCheck || [resolvedCalendarId],
        duplicateSimilarityThreshold: validArgs.duplicateSimilarityThreshold || CONFLICT_DETECTION_CONFIG.DEFAULT_DUPLICATE_THRESHOLD
      }
    );
    const exactDuplicate = conflicts.duplicates.find(
      (dup) => dup.event.similarity >= CONFLICT_DETECTION_CONFIG.DUPLICATE_THRESHOLDS.BLOCKING
    );
    if (exactDuplicate && validArgs.allowDuplicates !== true) {
      throw localEnvelopeError(
        "duplicate_event",
        `The event was not created because "${exactDuplicate.event.title}" already exists and is ${Math.round(exactDuplicate.event.similarity * 100)}% similar.`,
        `Set allowDuplicates to true to create it anyway.`
      );
    }
    const argsWithResolvedCalendar = { ...validArgs, calendarId: resolvedCalendarId };
    const event = await this.createEvent(oauth2Client, argsWithResolvedCalendar);
    const structuredConflicts = convertConflictsToStructured(conflicts);
    const response = {
      event: convertGoogleEventToStructured(event, resolvedCalendarId, selectedAccountId),
      conflicts: structuredConflicts.conflicts,
      duplicates: structuredConflicts.duplicates,
      warnings: createWarningsArray(conflicts)
    };
    return createStructuredResponse(response);
  }
  async createEvent(client, args) {
    try {
      const calendar = this.getCalendar(client);
      if (args.eventId) {
        validateEventId(args.eventId);
      }
      const timezone = args.timeZone || await this.getCalendarTimezone(client, args.calendarId);
      const { transparency, visibility } = this.getEventTypeDefaults(args);
      const summary = args.eventType === "workingLocation" && !args.summary ? this.generateWorkingLocationSummary(args) : args.summary;
      const requestBody = {
        summary,
        description: args.description,
        start: createTimeObject(args.start, timezone),
        end: createTimeObject(args.end, timezone),
        attendees: args.attendees,
        location: args.location,
        colorId: args.colorId,
        reminders: args.reminders,
        recurrence: args.recurrence,
        transparency,
        visibility,
        guestsCanInviteOthers: args.guestsCanInviteOthers,
        guestsCanModify: args.guestsCanModify,
        guestsCanSeeOtherGuests: args.guestsCanSeeOtherGuests,
        anyoneCanAddSelf: args.anyoneCanAddSelf,
        conferenceData: args.conferenceData,
        extendedProperties: args.extendedProperties,
        attachments: args.attachments,
        source: args.source,
        eventType: args.eventType,
        ...args.eventId && { id: args.eventId },
        // Include custom ID if provided
        ...args.focusTimeProperties && { focusTimeProperties: args.focusTimeProperties },
        ...args.eventType === "outOfOffice" && { outOfOfficeProperties: this.buildOutOfOfficeProperties(args) },
        ...args.eventType === "workingLocation" && { workingLocationProperties: this.buildWorkingLocationProperties(args) }
      };
      const conferenceDataVersion = args.conferenceData ? 1 : void 0;
      const supportsAttachments = args.attachments ? true : void 0;
      const response = await calendar.events.insert({
        calendarId: args.calendarId,
        requestBody,
        sendUpdates: args.sendUpdates,
        ...conferenceDataVersion && { conferenceDataVersion },
        ...supportsAttachments && { supportsAttachments }
      });
      if (!response.data) {
        throw localEnvelopeError("unexpected_response", "Google accepted the event but returned nothing.");
      }
      return response.data;
    } catch (error) {
      throw this.handleGoogleApiError(error, "create the event");
    }
  }
  /**
   * Get default transparency and visibility based on event type
   */
  getEventTypeDefaults(args) {
    let transparency = args.transparency;
    let visibility = args.visibility;
    switch (args.eventType) {
      case "focusTime":
      case "outOfOffice":
        if (!transparency) transparency = "opaque";
        break;
      case "workingLocation":
        if (!transparency) transparency = "transparent";
        if (!visibility) visibility = "public";
        break;
    }
    return { transparency, visibility };
  }
  /**
   * Build outOfOfficeProperties from args
   */
  buildOutOfOfficeProperties(args) {
    const props = args.outOfOfficeProperties;
    return {
      autoDeclineMode: props?.autoDeclineMode || "declineAllConflictingInvitations",
      ...props?.declineMessage && { declineMessage: props.declineMessage }
    };
  }
  /**
   * Build workingLocationProperties from args
   */
  buildWorkingLocationProperties(args) {
    const props = args.workingLocationProperties;
    if (!props) {
      throw localEnvelopeError(
        "bad_request",
        "A workingLocation event was requested without workingLocationProperties."
      );
    }
    const properties = {
      type: props.type
    };
    switch (props.type) {
      case "homeOffice":
        properties.homeOffice = {};
        break;
      case "officeLocation":
        properties.officeLocation = props.officeLocation || {};
        break;
      case "customLocation":
        properties.customLocation = props.customLocation || {};
        break;
    }
    return properties;
  }
  /**
   * Generate summary for working location events if not provided
   */
  generateWorkingLocationSummary(args) {
    const props = args.workingLocationProperties;
    if (!props) return "Working location";
    switch (props.type) {
      case "homeOffice":
        return "Working from home";
      case "officeLocation":
        return props.officeLocation?.label ? `Working from ${props.officeLocation.label}` : "Working from office";
      case "customLocation":
        return props.customLocation?.label ? `Working from ${props.customLocation.label}` : "Working from custom location";
      default:
        return "Working location";
    }
  }
};

// src/handlers/core/CreateEventsHandler.ts
init_failure_envelope();
var CreateEventsHandler = class extends BaseToolHandler {
  async runTool(args, accounts) {
    const validArgs = args;
    const sharedDefaults = {
      account: validArgs.account,
      calendarId: validArgs.calendarId,
      timeZone: validArgs.timeZone,
      sendUpdates: validArgs.sendUpdates
    };
    const defaultAccount = sharedDefaults.account;
    const defaultCalendarId = sharedDefaults.calendarId ?? "primary";
    const hasPerEventAccountOverrides = validArgs.events.some((e) => e.account);
    if (!hasPerEventAccountOverrides) {
      await this.getClientWithAutoSelection(defaultAccount, defaultCalendarId, accounts, "write");
    }
    const clientCache = /* @__PURE__ */ new Map();
    const calendarCache = /* @__PURE__ */ new Map();
    const timezoneCache = /* @__PURE__ */ new Map();
    const created = [];
    const failed = [];
    let firstError;
    let consecutiveFailures = 0;
    let lastErrorMessage = "";
    const MAX_CONSECUTIVE_FAILURES = 3;
    for (let i = 0; i < validArgs.events.length; i++) {
      const eventInput = validArgs.events[i];
      const account = eventInput.account ?? sharedDefaults.account;
      const calendarId = eventInput.calendarId ?? sharedDefaults.calendarId ?? "primary";
      const timeZone = eventInput.timeZone ?? sharedDefaults.timeZone;
      const sendUpdates = eventInput.sendUpdates ?? sharedDefaults.sendUpdates;
      try {
        const cacheKey = `${account ?? ""}:${calendarId}`;
        let clientResult = clientCache.get(cacheKey);
        if (!clientResult) {
          const result = await this.getClientWithAutoSelection(account, calendarId, accounts, "write");
          clientResult = { client: result.client, accountId: result.accountId, calendarId: result.calendarId };
          clientCache.set(cacheKey, clientResult);
        }
        const { client: oauth2Client, accountId: selectedAccountId, calendarId: resolvedCalendarId } = clientResult;
        let calendar = calendarCache.get(cacheKey);
        if (!calendar) {
          calendar = this.getCalendar(oauth2Client);
          calendarCache.set(cacheKey, calendar);
        }
        let tz = timeZone;
        if (!tz) {
          const tzCacheKey = `${selectedAccountId}:${resolvedCalendarId}`;
          let cachedTz = timezoneCache.get(tzCacheKey);
          if (!cachedTz) {
            cachedTz = await this.getCalendarTimezone(oauth2Client, resolvedCalendarId);
            timezoneCache.set(tzCacheKey, cachedTz);
          }
          tz = cachedTz;
        }
        const requestBody = {
          summary: eventInput.summary,
          description: eventInput.description,
          start: createTimeObject(eventInput.start, tz),
          end: createTimeObject(eventInput.end, tz),
          attendees: eventInput.attendees,
          location: eventInput.location,
          colorId: eventInput.colorId,
          reminders: eventInput.reminders,
          recurrence: eventInput.recurrence,
          transparency: eventInput.transparency,
          visibility: eventInput.visibility,
          guestsCanInviteOthers: eventInput.guestsCanInviteOthers,
          guestsCanModify: eventInput.guestsCanModify,
          guestsCanSeeOtherGuests: eventInput.guestsCanSeeOtherGuests,
          anyoneCanAddSelf: eventInput.anyoneCanAddSelf,
          conferenceData: eventInput.conferenceData
        };
        const conferenceDataVersion = eventInput.conferenceData ? 1 : void 0;
        const response2 = await calendar.events.insert({
          calendarId: resolvedCalendarId,
          requestBody,
          sendUpdates,
          ...conferenceDataVersion && { conferenceDataVersion }
        });
        if (!response2.data) {
          throw localEnvelopeError("unexpected_response", "Google accepted the event but returned nothing.");
        }
        created.push(
          convertGoogleEventToStructured(response2.data, resolvedCalendarId, selectedAccountId)
        );
        consecutiveFailures = 0;
        lastErrorMessage = "";
      } catch (error) {
        if (firstError === void 0) {
          firstError = error;
        }
        const errorMessage = this.formatGoogleApiError(error, "create the event");
        failed.push({
          index: i,
          summary: eventInput.summary,
          error: errorMessage
        });
        if (errorMessage === lastErrorMessage) {
          consecutiveFailures++;
        } else {
          consecutiveFailures = 1;
          lastErrorMessage = errorMessage;
        }
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && i < validArgs.events.length - 1) {
          for (let j = i + 1; j < validArgs.events.length; j++) {
            failed.push({
              index: j,
              summary: validArgs.events[j].summary,
              error: `Skipped: ${lastErrorMessage}`
            });
          }
          break;
        }
      }
    }
    const response = {
      totalRequested: validArgs.events.length,
      totalCreated: created.length,
      totalFailed: failed.length,
      created,
      ...failed.length > 0 && { failed }
    };
    if (created.length === 0 && firstError !== void 0) {
      const action = validArgs.events.length === 1 ? "create the requested event" : `create any of the ${validArgs.events.length} requested events`;
      throw this.toEnvelopeError(firstError, action);
    }
    return createStructuredResponse(response);
  }
};

// src/handlers/core/RecurringEventHelpers.ts
init_failure_envelope();
var RecurringEventHelpers = class {
  calendar;
  constructor(calendar) {
    this.calendar = calendar;
  }
  /**
   * Get the calendar instance
   */
  getCalendar() {
    return this.calendar;
  }
  /**
   * Detects if an event is recurring or single
   */
  async detectEventType(eventId, calendarId) {
    const response = await this.calendar.events.get({
      calendarId,
      eventId
    });
    const event = response.data;
    if (event.recurrence && event.recurrence.length > 0) return "recurring";
    if (event.recurringEventId) return "recurring";
    return "single";
  }
  /**
   * Formats an instance ID for single instance updates
   */
  formatInstanceId(eventId, originalStartTime) {
    const utcDate = new Date(originalStartTime);
    const basicTimeFormat = utcDate.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    return `${eventId}_${basicTimeFormat}`;
  }
  /**
   * Calculates the UNTIL date for future instance updates
   */
  calculateUntilDate(futureStartDate) {
    const futureDate = new Date(futureStartDate);
    const untilDate = new Date(futureDate.getTime() - 864e5);
    return untilDate.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  }
  /**
   * Calculates end time based on original duration
   */
  calculateEndTime(newStartTime, originalEvent) {
    const newStart = new Date(newStartTime);
    const originalStart = new Date(originalEvent.start.dateTime);
    const originalEnd = new Date(originalEvent.end.dateTime);
    const duration = originalEnd.getTime() - originalStart.getTime();
    return new Date(newStart.getTime() + duration).toISOString();
  }
  /**
   * Updates recurrence rule with UNTIL clause
   */
  updateRecurrenceWithUntil(recurrence, untilDate) {
    if (!recurrence || recurrence.length === 0) {
      throw localEnvelopeError("not_recurring", "The event has no recurrence rule to change.");
    }
    const updatedRecurrence = [];
    let foundRRule = false;
    for (const rule of recurrence) {
      if (rule.startsWith("RRULE:")) {
        foundRRule = true;
        const updatedRule = rule.replace(/;UNTIL=\d{8}T\d{6}Z/g, "").replace(/;COUNT=\d+/g, "") + `;UNTIL=${untilDate}`;
        updatedRecurrence.push(updatedRule);
      } else {
        updatedRecurrence.push(rule);
      }
    }
    if (!foundRRule) {
      throw localEnvelopeError("not_recurring", "The event has no RRULE in its recurrence rules.");
    }
    return updatedRecurrence;
  }
  /**
   * Cleans event fields for new event creation
   */
  cleanEventForDuplication(event) {
    const cleanedEvent = { ...event };
    delete cleanedEvent.id;
    delete cleanedEvent.etag;
    delete cleanedEvent.iCalUID;
    delete cleanedEvent.created;
    delete cleanedEvent.updated;
    delete cleanedEvent.htmlLink;
    delete cleanedEvent.hangoutLink;
    return cleanedEvent;
  }
  /**
   * Builds request body for event updates
   */
  buildUpdateRequestBody(args, defaultTimeZone) {
    const requestBody = {};
    if (args.summary !== void 0 && args.summary !== null) requestBody.summary = args.summary;
    if (args.description !== void 0 && args.description !== null) requestBody.description = args.description;
    if (args.location !== void 0 && args.location !== null) requestBody.location = args.location;
    if (args.colorId !== void 0 && args.colorId !== null) requestBody.colorId = args.colorId;
    if (args.attendees !== void 0 && args.attendees !== null) requestBody.attendees = args.attendees;
    if (args.reminders !== void 0 && args.reminders !== null) requestBody.reminders = args.reminders;
    if (args.recurrence !== void 0 && args.recurrence !== null) requestBody.recurrence = args.recurrence;
    if (args.conferenceData !== void 0 && args.conferenceData !== null) requestBody.conferenceData = args.conferenceData;
    if (args.transparency !== void 0 && args.transparency !== null) requestBody.transparency = args.transparency;
    if (args.visibility !== void 0 && args.visibility !== null) requestBody.visibility = args.visibility;
    if (args.guestsCanInviteOthers !== void 0 && args.guestsCanInviteOthers !== null) requestBody.guestsCanInviteOthers = args.guestsCanInviteOthers;
    if (args.guestsCanModify !== void 0 && args.guestsCanModify !== null) requestBody.guestsCanModify = args.guestsCanModify;
    if (args.guestsCanSeeOtherGuests !== void 0 && args.guestsCanSeeOtherGuests !== null) requestBody.guestsCanSeeOtherGuests = args.guestsCanSeeOtherGuests;
    if (args.anyoneCanAddSelf !== void 0 && args.anyoneCanAddSelf !== null) requestBody.anyoneCanAddSelf = args.anyoneCanAddSelf;
    if (args.extendedProperties !== void 0 && args.extendedProperties !== null) requestBody.extendedProperties = args.extendedProperties;
    if (args.attachments !== void 0 && args.attachments !== null) requestBody.attachments = args.attachments;
    if (args.eventType !== void 0 && args.eventType !== null) requestBody.eventType = args.eventType;
    const effectiveTimeZone = args.timeZone || defaultTimeZone;
    if (args.start !== void 0 && args.start !== null) {
      const timeObj = createTimeObject(args.start, effectiveTimeZone);
      if (timeObj.date !== void 0) {
        requestBody.start = { date: timeObj.date, dateTime: null };
      } else {
        requestBody.start = { dateTime: timeObj.dateTime, timeZone: timeObj.timeZone, date: null };
      }
    }
    if (args.end !== void 0 && args.end !== null) {
      const timeObj = createTimeObject(args.end, effectiveTimeZone);
      if (timeObj.date !== void 0) {
        requestBody.end = { date: timeObj.date, dateTime: null };
      } else {
        requestBody.end = { dateTime: timeObj.dateTime, timeZone: timeObj.timeZone, date: null };
      }
    }
    return requestBody;
  }
};
var RecurringEventError = class extends EnvelopeError {
  code;
  constructor(message, code) {
    super({ code: code.toLowerCase(), summary: message });
    this.name = "RecurringEventError";
    this.code = code;
  }
};
var RECURRING_EVENT_ERRORS = {
  INVALID_SCOPE: "INVALID_MODIFICATION_SCOPE",
  MISSING_ORIGINAL_TIME: "MISSING_ORIGINAL_START_TIME",
  MISSING_FUTURE_DATE: "MISSING_FUTURE_START_DATE",
  PAST_FUTURE_DATE: "FUTURE_DATE_IN_PAST",
  NON_RECURRING_SCOPE: "SCOPE_NOT_APPLICABLE_TO_SINGLE_EVENT"
};

// src/handlers/core/UpdateEventHandler.ts
init_failure_envelope();
var UpdateEventHandler = class extends BaseToolHandler {
  conflictDetectionService;
  constructor() {
    super();
    this.conflictDetectionService = new ConflictDetectionService();
  }
  async runTool(args, accounts) {
    const validArgs = args;
    const { client: oauth2Client, calendar, accountId: selectedAccountId, calendarId: resolvedCalendarId } = await this.setupOperation(args.account, validArgs.calendarId, accounts, "write");
    const needsExistingEvent = validArgs.checkConflicts !== false && (validArgs.start || validArgs.end) || validArgs.attendees !== void 0 && validArgs.attendees !== null;
    let existingEvent = null;
    if (needsExistingEvent) {
      const existingEventResponse = await calendar.events.get({
        calendarId: resolvedCalendarId,
        eventId: validArgs.eventId
      });
      existingEvent = existingEventResponse.data;
      if (!existingEvent) {
        throw localEnvelopeError(
          "unexpected_response",
          `Google returned no event for id "${validArgs.eventId}".`
        );
      }
    }
    let conflicts = null;
    if (validArgs.checkConflicts !== false && (validArgs.start || validArgs.end) && existingEvent) {
      const timezone = validArgs.timeZone || await this.getCalendarTimezone(oauth2Client, resolvedCalendarId);
      const eventToCheck = {
        ...existingEvent,
        id: validArgs.eventId,
        summary: validArgs.summary || existingEvent.summary,
        description: validArgs.description || existingEvent.description,
        start: validArgs.start ? createTimeObject(validArgs.start, timezone) : existingEvent.start,
        end: validArgs.end ? createTimeObject(validArgs.end, timezone) : existingEvent.end,
        location: validArgs.location || existingEvent.location
      };
      conflicts = await this.conflictDetectionService.checkConflicts(
        oauth2Client,
        eventToCheck,
        resolvedCalendarId,
        {
          checkDuplicates: false,
          // Don't check duplicates for updates
          checkConflicts: true,
          calendarsToCheck: validArgs.calendarsToCheck || [resolvedCalendarId]
        }
      );
    }
    let argsWithMergedAttendees = { ...validArgs, calendarId: resolvedCalendarId };
    if (validArgs.attendees !== void 0 && validArgs.attendees !== null && existingEvent) {
      const mergedAttendees = this.mergeAttendees(existingEvent.attendees || [], validArgs.attendees);
      argsWithMergedAttendees = {
        ...argsWithMergedAttendees,
        attendees: mergedAttendees
      };
    }
    const event = await this.updateEventWithScope(oauth2Client, argsWithMergedAttendees);
    const response = {
      event: convertGoogleEventToStructured(event, resolvedCalendarId, selectedAccountId)
    };
    if (conflicts && conflicts.hasConflicts) {
      const structuredConflicts = convertConflictsToStructured(conflicts);
      if (structuredConflicts.conflicts) {
        response.conflicts = structuredConflicts.conflicts;
      }
      response.warnings = createWarningsArray(conflicts);
    }
    return createStructuredResponse(response);
  }
  async updateEventWithScope(client, args) {
    try {
      const calendar = this.getCalendar(client);
      const helpers = new RecurringEventHelpers(calendar);
      const defaultTimeZone = await this.getCalendarTimezone(client, args.calendarId);
      const eventType = await helpers.detectEventType(args.eventId, args.calendarId);
      if (args.modificationScope && args.modificationScope !== "all" && eventType !== "recurring") {
        throw new RecurringEventError(
          'Scope other than "all" only applies to recurring events',
          RECURRING_EVENT_ERRORS.NON_RECURRING_SCOPE
        );
      }
      switch (args.modificationScope) {
        case "thisEventOnly":
          return this.updateSingleInstance(helpers, args, defaultTimeZone);
        case "all":
        case void 0:
          return this.updateAllInstances(helpers, args, defaultTimeZone);
        case "thisAndFollowing":
          return this.updateFutureInstances(helpers, args, defaultTimeZone);
        default:
          throw new RecurringEventError(
            `Invalid modification scope: ${args.modificationScope}`,
            RECURRING_EVENT_ERRORS.INVALID_SCOPE
          );
      }
    } catch (error) {
      if (isEnvelopeError(error)) {
        throw error;
      }
      throw this.handleGoogleApiError(error, `update event "${args.eventId}"`);
    }
  }
  async updateSingleInstance(helpers, args, defaultTimeZone) {
    if (!args.originalStartTime) {
      throw new RecurringEventError(
        "originalStartTime is required for single instance updates",
        RECURRING_EVENT_ERRORS.MISSING_ORIGINAL_TIME
      );
    }
    const calendar = helpers.getCalendar();
    const instanceId = helpers.formatInstanceId(args.eventId, args.originalStartTime);
    const requestBody = helpers.buildUpdateRequestBody(args, defaultTimeZone);
    const conferenceDataVersion = requestBody.conferenceData !== void 0 ? 1 : void 0;
    const supportsAttachments = requestBody.attachments !== void 0 ? true : void 0;
    const response = await calendar.events.patch({
      calendarId: args.calendarId,
      eventId: instanceId,
      requestBody,
      ...conferenceDataVersion && { conferenceDataVersion },
      ...supportsAttachments && { supportsAttachments }
    });
    if (!response.data) {
      throw localEnvelopeError("unexpected_response", "Google accepted the change but returned nothing.");
    }
    return response.data;
  }
  async updateAllInstances(helpers, args, defaultTimeZone) {
    const calendar = helpers.getCalendar();
    const requestBody = helpers.buildUpdateRequestBody(args, defaultTimeZone);
    const conferenceDataVersion = requestBody.conferenceData !== void 0 ? 1 : void 0;
    const supportsAttachments = requestBody.attachments !== void 0 ? true : void 0;
    const response = await calendar.events.patch({
      calendarId: args.calendarId,
      eventId: args.eventId,
      requestBody,
      ...conferenceDataVersion && { conferenceDataVersion },
      ...supportsAttachments && { supportsAttachments }
    });
    if (!response.data) {
      throw localEnvelopeError("unexpected_response", "Google accepted the change but returned nothing.");
    }
    return response.data;
  }
  async updateFutureInstances(helpers, args, defaultTimeZone) {
    if (!args.futureStartDate) {
      throw new RecurringEventError(
        "futureStartDate is required for future instance updates",
        RECURRING_EVENT_ERRORS.MISSING_FUTURE_DATE
      );
    }
    const calendar = helpers.getCalendar();
    const effectiveTimeZone = args.timeZone || defaultTimeZone;
    const originalResponse = await calendar.events.get({
      calendarId: args.calendarId,
      eventId: args.eventId
    });
    const originalEvent = originalResponse.data;
    if (!originalEvent.recurrence) {
      throw localEnvelopeError(
        "not_recurring",
        `Event "${args.eventId}" is not a recurring event, so following instances cannot be changed.`
      );
    }
    const untilDate = helpers.calculateUntilDate(args.futureStartDate);
    const updatedRecurrence = helpers.updateRecurrenceWithUntil(originalEvent.recurrence, untilDate);
    await calendar.events.patch({
      calendarId: args.calendarId,
      eventId: args.eventId,
      requestBody: { recurrence: updatedRecurrence }
    });
    const requestBody = helpers.buildUpdateRequestBody(args, defaultTimeZone);
    let endTime = args.end;
    if (args.start || args.futureStartDate) {
      const newStartTime = args.start || args.futureStartDate;
      endTime = endTime || helpers.calculateEndTime(newStartTime, originalEvent);
    }
    const newEvent = {
      ...helpers.cleanEventForDuplication(originalEvent),
      ...requestBody,
      start: {
        dateTime: args.start || args.futureStartDate,
        timeZone: effectiveTimeZone
      },
      end: {
        dateTime: endTime,
        timeZone: effectiveTimeZone
      }
    };
    const conferenceDataVersion = newEvent.conferenceData !== void 0 ? 1 : void 0;
    const supportsAttachments = newEvent.attachments !== void 0 ? true : void 0;
    const response = await calendar.events.insert({
      calendarId: args.calendarId,
      requestBody: newEvent,
      ...conferenceDataVersion && { conferenceDataVersion },
      ...supportsAttachments && { supportsAttachments }
    });
    if (!response.data) {
      throw localEnvelopeError("unexpected_response", "Google accepted the new recurring event but returned nothing.");
    }
    return response.data;
  }
  /**
   * Merge new attendees with existing attendees, preserving properties like responseStatus.
   * - Existing attendees: keep all their properties (responseStatus, displayName, etc.)
   * - New attendees (not in existing list): add with only the provided email
   */
  mergeAttendees(existingAttendees, newAttendees) {
    const existingByEmail = /* @__PURE__ */ new Map();
    for (const attendee of existingAttendees) {
      if (attendee.email) {
        existingByEmail.set(attendee.email.toLowerCase(), attendee);
      }
    }
    const mergedAttendees = [];
    for (const newAttendee of newAttendees) {
      const existing = existingByEmail.get(newAttendee.email.toLowerCase());
      if (existing) {
        mergedAttendees.push(existing);
      } else {
        mergedAttendees.push({ email: newAttendee.email });
      }
    }
    return mergedAttendees;
  }
};

// src/handlers/core/DeleteEventHandler.ts
var DeleteEventHandler = class extends BaseToolHandler {
  async runTool(args, accounts) {
    const validArgs = args;
    const { client: oauth2Client, calendarId: resolvedCalendarId } = await this.getClientWithAutoSelection(
      args.account,
      validArgs.calendarId,
      accounts,
      "write"
    );
    const argsWithResolvedCalendar = { ...validArgs, calendarId: resolvedCalendarId };
    await this.deleteEvent(oauth2Client, argsWithResolvedCalendar);
    const response = {
      success: true,
      eventId: validArgs.eventId,
      calendarId: resolvedCalendarId,
      message: "Event deleted successfully"
    };
    return createStructuredResponse(response);
  }
  async deleteEvent(client, args) {
    try {
      const calendar = this.getCalendar(client);
      await calendar.events.delete({
        calendarId: args.calendarId,
        eventId: args.eventId,
        sendUpdates: args.sendUpdates
      });
    } catch (error) {
      throw this.handleGoogleApiError(error, `delete event "${args.eventId}"`);
    }
  }
};

// src/handlers/core/FreeBusyEventHandler.ts
init_failure_envelope();
var FreeBusyEventHandler = class extends BaseToolHandler {
  async runTool(args, accounts) {
    const validArgs = args;
    if (!this.isLessThanThreeMonths(validArgs.timeMin, validArgs.timeMax)) {
      throw localEnvelopeError(
        "bad_request",
        "The requested time range is longer than the three months Google allows for a free/busy query.",
        `timeMin: ${validArgs.timeMin}, timeMax: ${validArgs.timeMax}`
      );
    }
    const selectedAccounts = this.getClientsForAccounts(args.account, accounts);
    const { calendars: mergedCalendars, warnings } = await this.queryFreeBusyMultiAccount(selectedAccounts, validArgs);
    const response = {
      timeMin: validArgs.timeMin,
      timeMax: validArgs.timeMax,
      calendars: mergedCalendars,
      ...warnings.length > 0 && { warnings }
    };
    return createStructuredResponse(response);
  }
  async queryFreeBusyMultiAccount(accounts, args) {
    const mergedCalendars = {};
    const calendarIds = args.calendars.map((c) => c.id);
    const failureWarnings = [];
    let accountCalendarMap;
    const resolutionWarnings = [];
    if (accounts.size > 1) {
      const { resolved, warnings } = await this.calendarRegistry.resolveCalendarsToAccounts(
        calendarIds,
        accounts
      );
      accountCalendarMap = resolved;
      resolutionWarnings.push(...warnings);
      if (accountCalendarMap.size === 0) {
        this.throwCalendarAccessFailureIfAny("read the free/busy information");
        for (const calId of calendarIds) {
          mergedCalendars[calId] = {
            busy: [],
            errors: [{ reason: "notFound" }]
          };
        }
        return { calendars: mergedCalendars, warnings: [...resolutionWarnings] };
      }
    } else {
      const [accountId2] = accounts.keys();
      accountCalendarMap = /* @__PURE__ */ new Map([[accountId2, calendarIds]]);
    }
    const results = await Promise.all(
      Array.from(accountCalendarMap.entries()).map(async ([accountId2, calendarsForAccount]) => {
        const client = accounts.get(accountId2);
        try {
          const filteredArgs = {
            ...args,
            calendars: args.calendars.filter((c) => calendarsForAccount.includes(c.id))
          };
          const result = await this.queryFreeBusy(client, filteredArgs);
          return { accountId: accountId2, result, error: null, calendarsQueried: calendarsForAccount };
        } catch (error) {
          return { accountId: accountId2, result: null, error, calendarsQueried: calendarsForAccount };
        }
      })
    );
    const failed = results.filter((r) => r.error !== null);
    if (failed.length > 0 && failed.length === results.length) {
      throw this.toEnvelopeError(failed[0].error, "read the free/busy information");
    }
    for (const failure of failed) {
      failureWarnings.push(
        `Account "${failure.accountId}" could not be queried, so its calendars (${failure.calendarsQueried.join(", ")}) are missing from this answer: ` + envelopeTextFor(failure.error, `read free/busy for account "${failure.accountId}"`)
      );
    }
    const unqueriedCalendars = /* @__PURE__ */ new Set();
    for (const failure of failed) {
      for (const calId of failure.calendarsQueried) {
        unqueriedCalendars.add(calId);
      }
    }
    for (const success of results.filter((r) => r.error === null)) {
      for (const calId of success.calendarsQueried) {
        unqueriedCalendars.delete(calId);
      }
    }
    for (const calId of calendarIds) {
      let bestResult = null;
      for (const { result } of results) {
        if (!result?.calendars) continue;
        const calData = result.calendars[calId];
        if (!calData) continue;
        if (!bestResult) {
          bestResult = {
            busy: calData.busy?.map((slot) => ({ start: slot.start, end: slot.end })) || [],
            errors: calData.errors?.map((err) => ({ domain: err.domain, reason: err.reason }))
          };
        } else if (bestResult.errors && !calData.errors) {
          bestResult = {
            busy: calData.busy?.map((slot) => ({ start: slot.start, end: slot.end })) || []
          };
        }
      }
      if (!bestResult) {
        mergedCalendars[calId] = {
          busy: [],
          errors: [{ reason: unqueriedCalendars.has(calId) ? "queryFailed" : "notFound" }]
        };
      } else {
        mergedCalendars[calId] = bestResult;
      }
    }
    return { calendars: mergedCalendars, warnings: [...resolutionWarnings, ...failureWarnings] };
  }
  async queryFreeBusy(client, args) {
    try {
      const calendar = this.getCalendar(client);
      const timezone = args.timeZone || await this.getCalendarTimezone(client, "primary");
      const timeMin = convertToRFC3339(args.timeMin, timezone);
      const timeMax = convertToRFC3339(args.timeMax, timezone);
      const requestBody = {
        timeMin,
        timeMax,
        items: args.calendars,
        timeZone: timezone
        // Always include to ensure response consistency
      };
      if (args.groupExpansionMax !== void 0) {
        requestBody.groupExpansionMax = args.groupExpansionMax;
      }
      if (args.calendarExpansionMax !== void 0) {
        requestBody.calendarExpansionMax = args.calendarExpansionMax;
      }
      const response = await calendar.freebusy.query({
        requestBody
      });
      return response.data;
    } catch (error) {
      throw this.handleGoogleApiError(error, "read the free/busy information");
    }
  }
  isLessThanThreeMonths(timeMin, timeMax) {
    const minDate = new Date(timeMin);
    const maxDate = new Date(timeMax);
    const diffInMilliseconds = maxDate.getTime() - minDate.getTime();
    const threeMonthsInMilliseconds = 3 * 30 * 24 * 60 * 60 * 1e3;
    return diffInMilliseconds <= threeMonthsInMilliseconds;
  }
};

// src/handlers/core/GetCurrentTimeHandler.ts
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
var GetCurrentTimeHandler = class extends BaseToolHandler {
  async runTool(args, accounts) {
    const validArgs = args;
    const oauth2Client = this.getClientForAccountOrFirst(args.account, accounts);
    const now = /* @__PURE__ */ new Date();
    const requestedTimeZone = validArgs.timeZone;
    let timezone;
    if (validArgs.timeZone) {
      if (!this.isValidTimeZone(validArgs.timeZone)) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Invalid timezone: ${validArgs.timeZone}. Use IANA format (e.g. 'America/Los_Angeles').`
        );
      }
      timezone = validArgs.timeZone;
    } else {
      try {
        timezone = await this.getCalendarTimezone(oauth2Client, "primary");
        if (timezone === "UTC") {
          const sys = this.getSystemTimeZone();
          if (sys !== "UTC") timezone = sys;
        }
      } catch {
        timezone = this.getSystemTimeZone();
      }
    }
    const response = {
      currentTime: this.formatISOInZone(now, timezone),
      timezone,
      offset: this.getTimezoneOffset(now, timezone),
      isDST: this.isDaylightSavingTime(now, timezone),
      dayOfWeek: new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        timeZone: timezone
      }).format(now)
    };
    return createStructuredResponse(response);
  }
  /**
   * Formats a Date object as an ISO 8601 string in a specific timezone with offset.
   *
   * This method uses Intl.DateTimeFormat to extract date/time components in the target
   * timezone and constructs an ISO string with the timezone offset appended.
   *
   * @param date - The Date object to format
   * @param timeZone - IANA timezone identifier (e.g., 'America/Los_Angeles', 'UTC')
   * @returns ISO 8601 string with timezone offset (e.g., '2025-11-04T14:30:00.123-08:00' or '2025-11-04T14:30:00.123Z')
   *
   * @example
   * formatISOInZone(new Date('2025-11-04T22:30:00.000Z'), 'America/Los_Angeles')
   * // Returns: '2025-11-04T14:30:00.000-08:00'
   *
   * @example
   * formatISOInZone(new Date('2025-11-04T14:30:00.000Z'), 'UTC')
   * // Returns: '2025-11-04T14:30:00.000Z'
   */
  formatISOInZone(date, timeZone) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      fractionalSecondDigits: 3
      // keep milliseconds
    }).formatToParts(date);
    const map = parts.reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
    const iso = `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}.${map.fractionalSecond || "000"}`;
    const offset = this.getTimezoneOffset(date, timeZone);
    return offset === "Z" ? `${iso}Z` : `${iso}${offset}`;
  }
  getSystemTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  }
  isValidTimeZone(timeZone) {
    try {
      Intl.DateTimeFormat(void 0, { timeZone });
      return true;
    } catch {
      return false;
    }
  }
  getTimezoneOffset(_date, timeZone) {
    try {
      const offsetMinutes = this.getTimezoneOffsetMinutes(timeZone);
      if (offsetMinutes === 0) {
        return "Z";
      }
      const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
      const offsetMins = Math.abs(offsetMinutes) % 60;
      const sign = offsetMinutes >= 0 ? "+" : "-";
      return `${sign}${offsetHours.toString().padStart(2, "0")}:${offsetMins.toString().padStart(2, "0")}`;
    } catch {
      return "Z";
    }
  }
  getTimezoneOffsetMinutes(timeZone) {
    return this.getTimezoneOffsetForDate(/* @__PURE__ */ new Date(), timeZone);
  }
  isDaylightSavingTime(date, timeZone) {
    try {
      const currentOffset = this.getTimezoneOffsetForDate(date, timeZone);
      const january = new Date(date.getFullYear(), 0, 1);
      const januaryOffset = this.getTimezoneOffsetForDate(january, timeZone);
      const july = new Date(date.getFullYear(), 6, 1);
      const julyOffset = this.getTimezoneOffsetForDate(july, timeZone);
      if (januaryOffset !== julyOffset) {
        const dstOffset = Math.min(januaryOffset, julyOffset);
        return currentOffset === dstOffset;
      }
      return false;
    } catch {
      return false;
    }
  }
  getTimezoneOffsetForDate(date, timeZone) {
    const targetTimeString = new Intl.DateTimeFormat("sv-SE", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(date);
    const utcTimeString = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(date);
    const targetTime = (/* @__PURE__ */ new Date(targetTimeString.replace(" ", "T") + "Z")).getTime();
    const utcTimeParsed = (/* @__PURE__ */ new Date(utcTimeString.replace(" ", "T") + "Z")).getTime();
    return (targetTime - utcTimeParsed) / (1e3 * 60);
  }
};

// src/handlers/core/RespondToEventHandler.ts
init_failure_envelope();
var RespondToEventHandler = class extends BaseToolHandler {
  async runTool(args, accounts) {
    const validArgs = args;
    const { calendar, accountId: selectedAccountId, calendarId: resolvedCalendarId } = await this.setupOperation(args.account, validArgs.calendarId, accounts, "write");
    try {
      const helpers = new RecurringEventHelpers(calendar);
      let targetEventId = validArgs.eventId;
      if (validArgs.modificationScope === "thisEventOnly") {
        if (!validArgs.originalStartTime) {
          throw new RecurringEventError(
            'originalStartTime is required when modificationScope is "thisEventOnly"',
            RECURRING_EVENT_ERRORS.MISSING_ORIGINAL_TIME
          );
        }
        const eventType = await helpers.detectEventType(validArgs.eventId, resolvedCalendarId);
        if (eventType !== "recurring") {
          throw new RecurringEventError(
            'modificationScope "thisEventOnly" can only be used with recurring events',
            RECURRING_EVENT_ERRORS.NON_RECURRING_SCOPE
          );
        }
        targetEventId = helpers.formatInstanceId(validArgs.eventId, validArgs.originalStartTime);
      } else if (validArgs.modificationScope === "all") {
        targetEventId = validArgs.eventId.split("_")[0];
      }
      const eventResponse = await calendar.events.get({
        calendarId: resolvedCalendarId,
        eventId: targetEventId
      });
      const event = eventResponse.data;
      if (!event) {
        throw localEnvelopeError(
          "unexpected_response",
          `Google returned no event for id "${targetEventId}".`
        );
      }
      const attendees = event.attendees || [];
      const selfAttendeeIndex = attendees.findIndex((a) => a.self === true);
      if (selfAttendeeIndex === -1) {
        throw localEnvelopeError(
          "not_an_attendee",
          "The response was not recorded because this account is not an attendee of the event."
        );
      }
      const selfAttendee = attendees[selfAttendeeIndex];
      if (selfAttendee.organizer === true) {
        throw localEnvelopeError(
          "is_organizer",
          "The response was not recorded because this account is the organizer of the event."
        );
      }
      const updatedAttendees = [...attendees];
      updatedAttendees[selfAttendeeIndex] = {
        ...selfAttendee,
        responseStatus: validArgs.response,
        ...validArgs.comment !== void 0 && { comment: validArgs.comment }
      };
      const actualSendUpdates = validArgs.sendUpdates || "none";
      const updateResponse = await calendar.events.patch({
        calendarId: resolvedCalendarId,
        eventId: targetEventId,
        requestBody: {
          attendees: updatedAttendees
        },
        sendUpdates: actualSendUpdates
      });
      if (!updateResponse.data) {
        throw localEnvelopeError("unexpected_response", "Google accepted the response but returned nothing.");
      }
      let message = `Your response has been set to "${validArgs.response}"`;
      if (validArgs.modificationScope === "thisEventOnly") {
        message += " for this instance only";
      } else if (validArgs.modificationScope === "all") {
        message += " for all instances";
      }
      if (validArgs.comment) {
        message += ` with note: "${validArgs.comment}"`;
      }
      const response = {
        event: convertGoogleEventToStructured(updateResponse.data, resolvedCalendarId, selectedAccountId),
        responseStatus: validArgs.response,
        sendUpdates: actualSendUpdates,
        message
      };
      return createStructuredResponse(response);
    } catch (error) {
      if (isEnvelopeError(error)) {
        throw error;
      }
      throw this.handleGoogleApiError(error, `respond to event "${validArgs.eventId}"`);
    }
  }
};

// src/tools/registry.ts
var ISO_DATETIME_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;
var ISO_DATETIME_WITHOUT_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
var ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
var isValidIsoDateTime = (val) => ISO_DATETIME_WITH_TZ.test(val) || ISO_DATETIME_WITHOUT_TZ.test(val);
var isValidIsoDateOrDateTime = (val) => ISO_DATE_ONLY.test(val) || isValidIsoDateTime(val);
var validateTimeInput = (val) => {
  const trimmed = val.trim();
  if (trimmed.startsWith("{")) {
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return "Invalid JSON format in time input";
    }
    if (obj.date !== void 0 && obj.dateTime !== void 0) {
      return "Cannot specify both 'date' and 'dateTime' in time input";
    }
    if (obj.date !== void 0) {
      return ISO_DATE_ONLY.test(obj.date) ? true : "Invalid date format: must be YYYY-MM-DD (e.g., '2025-01-01')";
    }
    if (obj.dateTime !== void 0) {
      if (obj.timeZone !== void 0) {
        if (typeof obj.timeZone !== "string") {
          return "timeZone must be a string (IANA timezone, e.g., 'America/Los_Angeles')";
        }
        if (obj.timeZone.trim() === "") {
          return "timeZone cannot be empty - provide a valid IANA timezone (e.g., 'America/Los_Angeles') or omit the field";
        }
      }
      return isValidIsoDateTime(obj.dateTime) ? true : "Invalid dateTime format: must be ISO 8601 (e.g., '2025-01-01T10:00:00')";
    }
    return "JSON time object must have either 'dateTime' or 'date' field";
  }
  return isValidIsoDateOrDateTime(trimmed) ? true : "Must be ISO 8601 format: '2025-01-01T10:00:00' for timed events or '2025-01-01' for all-day events";
};
var superRefineTimeInput = (val, ctx) => {
  const result = validateTimeInput(val);
  if (typeof result === "string") {
    ctx.addIssue({ code: "custom", message: result });
  }
};
var SEND_UPDATES_VALUES = ["all", "externalOnly", "none"];
var VISIBILITY_VALUES = ["default", "public", "private", "confidential"];
var TRANSPARENCY_VALUES = ["opaque", "transparent"];
var AUTO_DECLINE_MODE_VALUES = [
  "declineNone",
  "declineAllConflictingInvitations",
  "declineOnlyNewConflictingInvitations"
];
var RESPONSE_STATUS_VALUES = ["needsAction", "declined", "tentative", "accepted"];
var CONFERENCE_TYPE_VALUES = ["hangoutsMeet", "eventHangout", "eventNamedHangout", "addOn"];
var remindersSchema = z.object({
  useDefault: z.boolean().describe("Whether to use the default reminders"),
  overrides: z.array(z.object({
    method: z.enum(["email", "popup"]).default("popup").describe("Reminder method"),
    minutes: z.number().describe("Minutes before the event to trigger the reminder")
  }).partial({ method: true })).optional().describe("Custom reminders")
}).describe("Reminder settings for the event").optional();
var conferenceDataSchema = z.object({
  createRequest: z.object({
    requestId: z.string().describe("Client-generated unique ID for this request to ensure idempotency"),
    conferenceSolutionKey: z.object({
      type: z.enum(CONFERENCE_TYPE_VALUES).describe("Conference solution type")
    }).describe("Conference solution to create")
  }).describe("Request to generate a new conference")
}).optional();
var extendedPropertiesSchema = z.object({
  private: z.record(z.string(), z.string()).optional().describe(
    "Properties private to the application. Keys can have max 44 chars, values max 1024 chars."
  ),
  shared: z.record(z.string(), z.string()).optional().describe(
    "Properties visible to all attendees. Keys can have max 44 chars, values max 1024 chars."
  )
}).optional().describe(
  "Extended properties for storing application-specific data. Max 300 properties totaling 32KB."
);
var timeMinSchema = z.string().refine(isValidIsoDateTime, "Must be ISO 8601 format: '2026-01-01T00:00:00'").describe("Start of time range (ISO 8601, e.g., '2024-01-01T00:00:00').").optional();
var timeMaxSchema = z.string().refine(isValidIsoDateTime, "Must be ISO 8601 format: '2026-01-01T00:00:00'").describe("End of time range (ISO 8601, e.g., '2024-01-31T23:59:59').").optional();
var timeZoneSchema = z.string().optional().describe(
  "IANA timezone (e.g., 'America/Los_Angeles'). Defaults to calendar's timezone."
);
var parseJsonStringArray = (val) => {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return val;
  try {
    let jsonString = trimmed;
    if (jsonString.includes("'")) {
      jsonString = jsonString.replace(/\[\s*'/g, '["').replace(/'\s*,\s*'/g, '", "').replace(/'\s*\]/g, '"]');
    }
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
  }
  return val;
};
var fieldsSchema = z.preprocess(
  parseJsonStringArray,
  z.array(z.enum(ALLOWED_EVENT_FIELDS))
).optional().describe(
  "Additional fields to include beyond defaults (id, summary, start, end, status, htmlLink, location, attendees)."
);
var calendarsToCheckSchema = z.preprocess(
  parseJsonStringArray,
  z.array(z.string())
).optional().describe(
  "List of calendar IDs to check for conflicts (defaults to just the target calendar)"
);
var recurrenceSchema = z.preprocess(
  parseJsonStringArray,
  z.array(z.string())
).optional().describe(
  'Recurrence rules in RFC5545 format (e.g., ["RRULE:FREQ=WEEKLY;COUNT=5"])'
);
var privateExtendedPropertySchema = z.array(z.string().regex(/^[^=]+=[^=]+$/, "Must be in key=value format")).optional().describe(
  "Filter by private extended properties (key=value). Matches events that have all specified properties."
);
var sharedExtendedPropertySchema = z.array(z.string().regex(/^[^=]+=[^=]+$/, "Must be in key=value format")).optional().describe(
  "Filter by shared extended properties (key=value). Matches events that have all specified properties."
);
var singleAccountSchema = z.string().regex(/^[a-z0-9_-]{1,64}$/, "Account nickname must be 1-64 characters: lowercase letters, numbers, dashes, underscores only").optional().describe(
  "Account nickname (e.g., 'work'). Optional if only one account connected."
);
var accountIdRegex = /^[a-z0-9_-]{1,64}$/;
var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var multiAccountSchema = z.preprocess(
  parseJsonStringArray,
  z.union([
    z.string().regex(accountIdRegex, "Account nickname must be 1-64 characters: lowercase letters, numbers, dashes, underscores only"),
    z.array(z.string().regex(accountIdRegex, "Account nickname must be 1-64 characters: lowercase letters, numbers, dashes, underscores only")).min(1, "At least one account nickname is required").max(10, "Maximum 10 accounts allowed per request")
  ])
).optional().describe(
  "Account nickname(s) to query (e.g., 'work' or ['work', 'personal']). Omit to query all accounts."
);
var ToolSchemas = {
  "list-calendars": z.object({
    account: multiAccountSchema
  }),
  "list-events": z.object({
    account: multiAccountSchema,
    calendarId: z.union([
      z.string().describe(
        `Calendar identifier(s) to query. Accepts calendar IDs (e.g., 'primary', 'user@gmail.com') OR calendar names (e.g., 'Work', 'Personal'). Single calendar: 'primary'. Multiple calendars: array ['Work', 'Personal'] or JSON string '["Work", "Personal"]'`
      ),
      z.array(z.string().min(1)).min(1, "At least one calendar ID is required").max(50, "Maximum 50 calendars allowed per request").refine(
        (arr) => new Set(arr).size === arr.length,
        "Duplicate calendar IDs are not allowed"
      ).describe("Array of calendar IDs to query events from (max 50, no duplicates)")
    ]),
    timeMin: timeMinSchema,
    timeMax: timeMaxSchema,
    timeZone: timeZoneSchema,
    fields: fieldsSchema,
    privateExtendedProperty: privateExtendedPropertySchema,
    sharedExtendedProperty: sharedExtendedPropertySchema
  }),
  "search-events": z.object({
    account: multiAccountSchema,
    calendarId: z.union([
      z.string().describe(
        `Calendar identifier(s) to search. Accepts calendar IDs (e.g., 'primary', 'user@gmail.com') OR calendar names (e.g., 'Work', 'Personal'). Single calendar: 'primary'. Multiple calendars: array ['Work', 'Personal'] or JSON string '["Work", "Personal"]'`
      ),
      z.array(z.string())
    ]).transform((val) => {
      if (typeof val === "string") {
        if (val.startsWith("[")) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return parsed;
          } catch {
          }
        }
        return val;
      }
      return val;
    }).describe("Calendar identifier(s) to search. Accepts calendar IDs or names. Single or multiple calendars supported."),
    query: z.string().describe(
      "Free text search query (searches summary, description, location, attendees, etc.)"
    ),
    timeMin: z.string().refine(isValidIsoDateTime, "Must be ISO 8601 format: '2026-01-01T00:00:00'").describe("Start of time range (ISO 8601, e.g., '2024-01-01T00:00:00')."),
    timeMax: z.string().refine(isValidIsoDateTime, "Must be ISO 8601 format: '2026-01-01T00:00:00'").describe("End of time range (ISO 8601, e.g., '2024-01-31T23:59:59')."),
    timeZone: timeZoneSchema,
    fields: z.array(z.enum(ALLOWED_EVENT_FIELDS)).optional().describe(
      "Additional fields to include beyond defaults (id, summary, start, end, status, htmlLink, location, attendees)."
    ),
    privateExtendedProperty: z.array(z.string().regex(/^[^=]+=[^=]+$/, "Must be in key=value format")).optional().describe(
      "Filter by private extended properties (key=value). Matches events that have all specified properties."
    ),
    sharedExtendedProperty: z.array(z.string().regex(/^[^=]+=[^=]+$/, "Must be in key=value format")).optional().describe(
      "Filter by shared extended properties (key=value). Matches events that have all specified properties."
    )
  }),
  "get-event": z.object({
    account: singleAccountSchema,
    calendarId: z.string().describe("ID of the calendar (use 'primary' for the main calendar)"),
    eventId: z.string().describe("ID of the event to retrieve"),
    fields: z.array(z.enum(ALLOWED_EVENT_FIELDS)).optional().describe(
      "Optional array of additional event fields to retrieve. Available fields are strictly validated. Default fields (id, summary, start, end, status, htmlLink, location, attendees) are always included."
    )
  }),
  "list-colors": z.object({
    account: singleAccountSchema
  }),
  "create-event": z.object({
    account: singleAccountSchema,
    calendarId: z.string().describe("ID of the calendar (use 'primary' for the main calendar)"),
    eventId: z.string().optional().describe("Optional custom event ID (5-1024 characters, base32hex encoding: lowercase letters a-v and digits 0-9 only). If not provided, Google Calendar will generate one."),
    summary: z.string().describe("Title of the event"),
    description: z.string().optional().describe("Description/notes for the event"),
    start: z.string().superRefine(superRefineTimeInput).describe(
      `Event start time. String format: '2025-01-01T10:00:00' (timed) or '2025-01-01' (all-day). For per-field timezone, use JSON: '{"dateTime": "2025-01-01T10:00:00", "timeZone": "America/Los_Angeles"}'. Per-field timezone is useful for events spanning multiple timezones (e.g., flights). Note: If the dateTime already includes a timezone offset (e.g., 'Z' or '+05:00'), the embedded timezone takes precedence over the timeZone field.`
    ),
    end: z.string().superRefine(superRefineTimeInput).describe(
      `Event end time. String format: '2025-01-01T11:00:00' (timed) or '2025-01-02' (all-day, exclusive). For per-field timezone, use JSON: '{"dateTime": "2025-01-01T11:00:00", "timeZone": "America/New_York"}'. Per-field timezone is useful for events spanning multiple timezones (e.g., flights). Note: If the dateTime already includes a timezone offset (e.g., 'Z' or '+05:00'), the embedded timezone takes precedence over the timeZone field.`
    ),
    timeZone: z.string().optional().describe(
      "Timezone as IANA Time Zone Database name (e.g., America/Los_Angeles). Takes priority over calendar's default timezone. Only used for timezone-naive datetime strings."
    ),
    location: z.string().optional().describe("Location of the event"),
    attendees: z.array(z.object({
      email: z.string().regex(emailRegex, "Invalid email address").describe("Email address of the attendee"),
      displayName: z.string().optional().describe("Display name of the attendee"),
      optional: z.boolean().optional().describe("Whether this is an optional attendee"),
      responseStatus: z.enum(RESPONSE_STATUS_VALUES).optional().describe("Attendee's response status"),
      comment: z.string().optional().describe("Attendee's response comment"),
      additionalGuests: z.number().int().min(0).optional().describe("Number of additional guests the attendee is bringing")
    })).optional().describe("List of event attendees with their details"),
    colorId: z.string().optional().describe(
      "Color ID for the event (use list-colors to see available IDs)"
    ),
    reminders: remindersSchema,
    recurrence: recurrenceSchema,
    transparency: z.enum(TRANSPARENCY_VALUES).optional().describe(
      "Whether the event blocks time on the calendar. 'opaque' means busy, 'transparent' means free."
    ),
    visibility: z.enum(VISIBILITY_VALUES).optional().describe(
      "Visibility of the event. Use 'public' for public events, 'private' for private events visible to attendees."
    ),
    guestsCanInviteOthers: z.boolean().optional().describe(
      "Whether attendees can invite others to the event. Default is true."
    ),
    guestsCanModify: z.boolean().optional().describe(
      "Whether attendees can modify the event. Default is false."
    ),
    guestsCanSeeOtherGuests: z.boolean().optional().describe(
      "Whether attendees can see the list of other attendees. Default is true."
    ),
    anyoneCanAddSelf: z.boolean().optional().describe(
      "Whether anyone can add themselves to the event. Default is false."
    ),
    sendUpdates: z.enum(SEND_UPDATES_VALUES).optional().describe(
      "Whether to send notifications about the event creation. 'all' sends to all guests, 'externalOnly' to non-Google Calendar users only, 'none' sends no notifications."
    ),
    conferenceData: conferenceDataSchema.describe(
      "Conference properties for the event. Use createRequest to add a new conference."
    ),
    extendedProperties: extendedPropertiesSchema,
    attachments: z.array(z.object({
      fileUrl: z.string().describe("URL of the attached file"),
      title: z.string().optional().describe("Title of the attachment"),
      mimeType: z.string().optional().describe("MIME type of the attachment"),
      iconLink: z.string().optional().describe("URL of the icon for the attachment"),
      fileId: z.string().optional().describe("ID of the attached file in Google Drive")
    })).optional().describe(
      "File attachments for the event. Requires calendar to support attachments."
    ),
    source: z.object({
      url: z.string().describe("URL of the source"),
      title: z.string().describe("Title of the source")
    }).optional().describe(
      "Source of the event, such as a web page or email message."
    ),
    calendarsToCheck: calendarsToCheckSchema,
    duplicateSimilarityThreshold: z.number().min(0).max(1).optional().describe(
      "Threshold for duplicate detection (0-1, default: 0.7). Events with similarity above this are flagged as potential duplicates"
    ),
    allowDuplicates: z.boolean().optional().describe(
      "If true, allows creation even when exact duplicates are detected (similarity >= 0.95). Default is false which blocks duplicate creation"
    ),
    eventType: z.enum(["default", "focusTime", "outOfOffice", "workingLocation"]).optional().describe(
      "Type of the event. 'default' for regular events, 'focusTime' for Focus Time blocks, 'outOfOffice' for Out of Office events, 'workingLocation' for Working Location events. Note: outOfOffice and workingLocation require Google Workspace and only work on primary calendar."
    ),
    focusTimeProperties: z.object({
      autoDeclineMode: z.enum(AUTO_DECLINE_MODE_VALUES).optional().describe("Whether to auto-decline conflicting meetings"),
      chatStatus: z.enum(["available", "doNotDisturb"]).optional().describe("Chat status during focus time"),
      declineMessage: z.string().optional().describe("Message sent when declining invitations")
    }).optional().describe(
      "Focus Time properties. Only used when eventType is 'focusTime'. Requires Google Workspace."
    ),
    outOfOfficeProperties: z.object({
      autoDeclineMode: z.enum(AUTO_DECLINE_MODE_VALUES).optional().default("declineAllConflictingInvitations").describe("How to handle conflicting meetings. Default is to decline all conflicts."),
      declineMessage: z.string().optional().describe("Message sent when declining invitations (e.g., 'I'm out of office, will respond when I return')")
    }).optional().describe(
      "Out of Office properties. Only used when eventType is 'outOfOffice'. Requires Google Workspace."
    ),
    workingLocationProperties: z.object({
      type: z.enum(["homeOffice", "officeLocation", "customLocation"]).describe("Type of working location"),
      homeOffice: z.object({}).optional().describe("Empty object for home office type"),
      officeLocation: z.object({
        label: z.string().optional().describe("Office name shown in Calendar (e.g., 'HQ Building', 'NYC Office')"),
        buildingId: z.string().optional().describe("Building identifier from organization's Resources"),
        floorId: z.string().optional().describe("Floor identifier"),
        floorSectionId: z.string().optional().describe("Floor section identifier"),
        deskId: z.string().optional().describe("Desk identifier")
      }).optional().describe("Office location details"),
      customLocation: z.object({
        label: z.string().optional().describe("Label for custom location (e.g., 'Coffee Shop', 'Client Site')")
      }).optional().describe("Custom location details")
    }).optional().describe(
      "Working Location properties. Only used when eventType is 'workingLocation'. Requires Google Workspace."
    )
  }).refine(
    (data) => {
      if (data.eventType === "focusTime" || data.eventType === "outOfOffice") {
        const isAllDay = (val) => {
          const trimmed = val.trim();
          if (trimmed.startsWith("{")) {
            try {
              const obj = JSON.parse(trimmed);
              return obj.date !== void 0;
            } catch {
              return false;
            }
          }
          return ISO_DATE_ONLY.test(trimmed);
        };
        if (isAllDay(data.start) || isAllDay(data.end)) {
          return false;
        }
      }
      return true;
    },
    {
      message: "Focus Time and Out of Office events cannot be all-day events. Use dateTime format (e.g., '2025-01-01T10:00:00') instead of date format.",
      path: ["eventType"]
    }
  ),
  // Note: All schemas within create-events are inlined (not reusing shared schema objects)
  // to prevent $ref generation in JSON schema output, which causes issues with some MCP clients.
  "create-events": z.object({
    account: z.string().regex(/^[a-z0-9_-]{1,64}$/, "Account nickname must be 1-64 characters: lowercase letters, numbers, dashes, underscores only").optional().describe("Default account for all events. Individual events can override this."),
    calendarId: z.string().optional().describe(
      "Default calendar ID for all events (use 'primary' for the main calendar). Individual events can override this. Defaults to 'primary' if not specified."
    ),
    timeZone: z.string().optional().describe(
      "Default IANA timezone for all events (e.g., 'America/Los_Angeles'). Individual events can override this."
    ),
    sendUpdates: z.enum(["all", "externalOnly", "none"]).optional().describe(
      "Default notification setting for all events. Individual events can override this."
    ),
    events: z.array(z.object({
      summary: z.string().describe("Title of the event"),
      start: z.string().refine(isValidIsoDateOrDateTime, "Must be ISO 8601 format: '2025-01-01T10:00:00' for timed events or '2025-01-01' for all-day events").describe("Event start time: '2025-01-01T10:00:00' for timed events or '2025-01-01' for all-day events"),
      end: z.string().refine(isValidIsoDateOrDateTime, "Must be ISO 8601 format: '2025-01-01T11:00:00' for timed events or '2025-01-02' for all-day events").describe("Event end time: '2025-01-01T11:00:00' for timed events or '2025-01-02' for all-day events (exclusive)"),
      calendarId: z.string().optional().describe("Override calendar ID for this event"),
      account: z.string().regex(/^[a-z0-9_-]{1,64}$/, "Account nickname must be 1-64 characters: lowercase letters, numbers, dashes, underscores only").optional().describe("Override account for this event"),
      timeZone: z.string().optional().describe("Override timezone for this event"),
      description: z.string().optional().describe("Description/notes for the event"),
      location: z.string().optional().describe("Location of the event"),
      attendees: z.array(z.object({
        email: z.string().regex(emailRegex, "Invalid email address").describe("Email address of the attendee"),
        displayName: z.string().optional().describe("Display name of the attendee"),
        optional: z.boolean().optional().describe("Whether this is an optional attendee"),
        responseStatus: z.enum(["needsAction", "declined", "tentative", "accepted"]).optional().describe("Attendee's response status")
      })).optional().describe("List of event attendees"),
      colorId: z.string().optional().describe("Color ID for the event (use list-colors to see available IDs)"),
      reminders: z.object({
        useDefault: z.boolean().describe("Whether to use the default reminders"),
        overrides: z.array(z.object({
          method: z.enum(["email", "popup"]).default("popup").describe("Reminder method"),
          minutes: z.number().describe("Minutes before the event to trigger the reminder")
        }).partial({ method: true })).optional().describe("Custom reminders")
      }).describe("Reminder settings for the event").optional(),
      recurrence: z.preprocess(
        parseJsonStringArray,
        z.array(z.string())
      ).optional().describe(
        'Recurrence rules in RFC5545 format (e.g., ["RRULE:FREQ=WEEKLY;COUNT=5"])'
      ),
      transparency: z.enum(["opaque", "transparent"]).optional().describe(
        "Whether the event blocks time. 'opaque' = busy, 'transparent' = free."
      ),
      visibility: z.enum(["default", "public", "private", "confidential"]).optional().describe("Visibility of the event"),
      guestsCanInviteOthers: z.boolean().optional().describe("Whether attendees can invite others"),
      guestsCanModify: z.boolean().optional().describe("Whether attendees can modify the event"),
      guestsCanSeeOtherGuests: z.boolean().optional().describe("Whether attendees can see other attendees"),
      anyoneCanAddSelf: z.boolean().optional().describe("Whether anyone can add themselves"),
      sendUpdates: z.enum(["all", "externalOnly", "none"]).optional().describe("Override notification setting for this event"),
      conferenceData: z.object({
        createRequest: z.object({
          requestId: z.string().describe("Client-generated unique ID for this request to ensure idempotency"),
          conferenceSolutionKey: z.object({
            type: z.enum(["hangoutsMeet", "eventHangout", "eventNamedHangout", "addOn"]).describe("Conference solution type")
          }).describe("Conference solution to create")
        }).describe("Request to generate a new conference")
      }).optional().describe("Conference properties for the event")
    })).min(1).max(50).describe("Array of events to create (1-50 events)")
  }),
  "update-event": z.object({
    account: singleAccountSchema,
    calendarId: z.string().describe("ID of the calendar (use 'primary' for the main calendar)"),
    eventId: z.string().describe("ID of the event to update"),
    summary: z.string().optional().describe("Updated title of the event"),
    description: z.string().optional().describe("Updated description/notes"),
    start: z.string().superRefine(superRefineTimeInput).describe(
      `Updated start time. String format: '2025-01-01T10:00:00' (timed) or '2025-01-01' (all-day). For per-field timezone, use JSON: '{"dateTime": "2025-01-01T10:00:00", "timeZone": "America/Los_Angeles"}'. Note: If the dateTime already includes a timezone offset, the embedded timezone takes precedence over the timeZone field.`
    ).optional(),
    end: z.string().superRefine(superRefineTimeInput).describe(
      `Updated end time. String format: '2025-01-01T11:00:00' (timed) or '2025-01-02' (all-day, exclusive). For per-field timezone, use JSON: '{"dateTime": "2025-01-01T11:00:00", "timeZone": "America/New_York"}'. Note: If the dateTime already includes a timezone offset, the embedded timezone takes precedence over the timeZone field.`
    ).optional(),
    timeZone: z.string().optional().describe("Updated timezone as IANA Time Zone Database name. If not provided, uses the calendar's default timezone."),
    location: z.string().optional().describe("Updated location"),
    attendees: z.array(z.object({
      email: z.string().regex(emailRegex, "Invalid email address").describe("Email address of the attendee")
    })).optional().describe("Updated attendee list"),
    colorId: z.string().optional().describe("Updated color ID"),
    reminders: remindersSchema,
    recurrence: recurrenceSchema,
    sendUpdates: z.enum(SEND_UPDATES_VALUES).default("all").describe(
      "Whether to send update notifications"
    ),
    modificationScope: z.enum(["thisAndFollowing", "all", "thisEventOnly"]).optional().describe(
      "Scope for recurring event modifications"
    ),
    originalStartTime: z.string().refine(isValidIsoDateTime, "Must be ISO 8601 format: '2026-01-01T00:00:00'").describe("Original start time in the ISO 8601 format '2024-01-01T10:00:00'").optional(),
    futureStartDate: z.string().refine(isValidIsoDateTime, "Must be ISO 8601 format: '2026-01-01T00:00:00'").describe("Start date for future instances in the ISO 8601 format '2024-01-01T10:00:00'").optional(),
    checkConflicts: z.boolean().optional().describe(
      "Whether to check for conflicts when updating (default: true when changing time)"
    ),
    calendarsToCheck: calendarsToCheckSchema,
    conferenceData: conferenceDataSchema.describe("Conference properties for the event. Used to add or update Google Meet links."),
    transparency: z.enum(TRANSPARENCY_VALUES).optional().describe(
      "Whether the event blocks time on the calendar. 'opaque' means busy, 'transparent' means available"
    ),
    visibility: z.enum(VISIBILITY_VALUES).optional().describe(
      "Visibility of the event"
    ),
    guestsCanInviteOthers: z.boolean().optional().describe(
      "Whether attendees other than the organizer can invite others"
    ),
    guestsCanModify: z.boolean().optional().describe(
      "Whether attendees other than the organizer can modify the event"
    ),
    guestsCanSeeOtherGuests: z.boolean().optional().describe(
      "Whether attendees other than the organizer can see who the event's attendees are"
    ),
    anyoneCanAddSelf: z.boolean().optional().describe(
      "Whether anyone can add themselves to the event"
    ),
    extendedProperties: extendedPropertiesSchema,
    attachments: z.array(z.object({
      fileUrl: z.string().url().describe("URL link to the attachment"),
      title: z.string().describe("Title of the attachment"),
      mimeType: z.string().optional().describe("MIME type of the attachment"),
      iconLink: z.string().optional().describe("URL link to the attachment's icon"),
      fileId: z.string().optional().describe("ID of the attached Google Drive file")
    })).optional().describe("File attachments for the event")
    // Note: eventType is intentionally not included - Google Calendar API does not allow changing event type after creation
  }).refine(
    (data) => {
      if (data.modificationScope === "thisEventOnly" && !data.originalStartTime) {
        return false;
      }
      return true;
    },
    {
      message: "originalStartTime is required when modificationScope is 'thisEventOnly'",
      path: ["originalStartTime"]
    }
  ).refine(
    (data) => {
      if (data.modificationScope === "thisAndFollowing" && !data.futureStartDate) {
        return false;
      }
      return true;
    },
    {
      message: "futureStartDate is required when modificationScope is 'thisAndFollowing'",
      path: ["futureStartDate"]
    }
  ).refine(
    (data) => {
      if (data.futureStartDate) {
        const futureDate = new Date(data.futureStartDate);
        const now = /* @__PURE__ */ new Date();
        return futureDate > now;
      }
      return true;
    },
    {
      message: "futureStartDate must be in the future",
      path: ["futureStartDate"]
    }
  ),
  "delete-event": z.object({
    account: singleAccountSchema,
    calendarId: z.string().describe("ID of the calendar (use 'primary' for the main calendar)"),
    eventId: z.string().describe("ID of the event to delete"),
    sendUpdates: z.enum(SEND_UPDATES_VALUES).default("all").describe(
      "Whether to send cancellation notifications"
    )
  }),
  "get-freebusy": z.object({
    account: multiAccountSchema.describe(
      "Account nickname(s) to query (e.g., 'work' or ['work', 'personal']). Omit to query all accounts."
    ),
    calendars: z.array(z.object({
      id: z.string().describe("ID of the calendar (use 'primary' for the main calendar)")
    })).describe(
      "List of calendars and/or groups to query for free/busy information"
    ),
    timeMin: z.string().refine(isValidIsoDateTime, "Must be ISO 8601 format: '2026-01-01T00:00:00'").describe("Start of time range (ISO 8601, e.g., '2024-01-01T00:00:00')."),
    timeMax: z.string().refine(isValidIsoDateTime, "Must be ISO 8601 format: '2026-01-01T00:00:00'").describe("End of time range (ISO 8601, e.g., '2024-01-31T23:59:59')."),
    timeZone: z.string().optional().describe("IANA timezone for the query."),
    groupExpansionMax: z.number().int().max(100).optional().describe(
      "Maximum number of calendars to expand per group (max 100)"
    ),
    calendarExpansionMax: z.number().int().max(50).optional().describe(
      "Maximum number of calendars to expand (max 50)"
    )
  }),
  "get-current-time": z.object({
    account: singleAccountSchema,
    timeZone: z.string().optional().describe(
      "IANA timezone (e.g., 'America/Los_Angeles'). Defaults to calendar's timezone."
    )
  }),
  "respond-to-event": z.object({
    calendarId: z.string().describe("ID of the calendar (use 'primary' for the main calendar)"),
    eventId: z.string().describe("ID of the event to respond to"),
    account: z.string().optional().describe(
      "Account nickname to use for this operation (e.g., 'work', 'personal'). Optional when only one account is connected - will auto-select the account with appropriate permissions. Use 'list-calendars' to see available accounts."
    ),
    response: z.enum(RESPONSE_STATUS_VALUES).describe(
      "Your response to the event invitation: 'accepted' (accept), 'declined' (decline), 'tentative' (maybe), 'needsAction' (no response)"
    ),
    comment: z.string().optional().describe(
      "Optional message/note to include with your response (e.g., 'I have a conflict' when declining)"
    ),
    modificationScope: z.enum(["thisEventOnly", "all"]).optional().describe(
      "For recurring events: 'thisEventOnly' responds to just this instance, 'all' responds to all instances. Default is 'all'."
    ),
    originalStartTime: z.string().refine(isValidIsoDateTime, "Must be ISO 8601 format: '2025-01-01T10:00:00'").describe("Original start time of the specific instance (required when modificationScope is 'thisEventOnly')").optional(),
    sendUpdates: z.enum(SEND_UPDATES_VALUES).optional().describe(
      "Whether to send response notifications. 'all' sends to all guests, 'externalOnly' to non-Google Calendar users only, 'none' sends no notifications. Default is 'none'."
    )
  }).refine(
    (data) => {
      if (data.modificationScope === "thisEventOnly" && !data.originalStartTime) {
        return false;
      }
      return true;
    },
    {
      message: "originalStartTime is required when modificationScope is 'thisEventOnly'",
      path: ["originalStartTime"]
    }
  )
};
var READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: false
};
var WRITE_NON_DESTRUCTIVE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
};
var WRITE_DESTRUCTIVE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
};
var WRITE_DESTRUCTIVE_IDEMPOTENT_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false
};
var WRITE_NON_DESTRUCTIVE_IDEMPOTENT_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};
var ToolRegistry = class {
  static extractSchemaShape(schema) {
    const schemaAny = schema;
    if ("shape" in schemaAny) {
      return schemaAny.shape;
    }
    return schemaAny.shape;
  }
  static tools = [
    {
      name: "list-calendars",
      title: "List Calendars",
      description: "List all available calendars",
      annotations: READ_ONLY_ANNOTATIONS,
      schema: ToolSchemas["list-calendars"],
      handler: ListCalendarsHandler
    },
    {
      name: "list-events",
      title: "List Calendar Events",
      description: "List events from one or more calendars. Supports both calendar IDs and calendar names.",
      annotations: READ_ONLY_ANNOTATIONS,
      schema: ToolSchemas["list-events"],
      handler: ListEventsHandler,
      handlerFunction: async (args) => {
        let processedCalendarId = args.calendarId;
        if (Array.isArray(args.calendarId)) {
          processedCalendarId = args.calendarId;
        } else if (typeof args.calendarId === "string" && args.calendarId.trim().startsWith("[") && args.calendarId.trim().endsWith("]")) {
          try {
            let jsonString = args.calendarId.trim();
            if (jsonString.includes("'")) {
              jsonString = jsonString.replace(/\[\s*'/g, '["').replace(/'\s*,\s*'/g, '", "').replace(/'\s*\]/g, '"]');
            }
            const parsed = JSON.parse(jsonString);
            if (!Array.isArray(parsed)) {
              throw new Error("JSON string must contain an array");
            }
            if (!parsed.every((id) => typeof id === "string" && id.length > 0)) {
              throw new Error("Array must contain only non-empty strings");
            }
            if (parsed.length === 0) {
              throw new Error("At least one calendar ID is required");
            }
            if (parsed.length > 50) {
              throw new Error("Maximum 50 calendars allowed");
            }
            if (new Set(parsed).size !== parsed.length) {
              throw new Error("Duplicate calendar IDs are not allowed");
            }
            processedCalendarId = parsed;
          } catch (error) {
            throw localEnvelopeError(
              "bad_request",
              "The calendarId argument was not a calendar id or a list of calendar ids.",
              error instanceof Error ? error.message : void 0
            );
          }
        }
        return {
          account: args.account,
          calendarId: processedCalendarId,
          timeMin: args.timeMin,
          timeMax: args.timeMax,
          timeZone: args.timeZone,
          fields: args.fields,
          privateExtendedProperty: args.privateExtendedProperty,
          sharedExtendedProperty: args.sharedExtendedProperty
        };
      }
    },
    {
      name: "search-events",
      title: "Search Calendar Events",
      description: "Search for events in a calendar by text query.",
      annotations: READ_ONLY_ANNOTATIONS,
      schema: ToolSchemas["search-events"],
      handler: SearchEventsHandler
    },
    {
      name: "get-event",
      title: "Get Event Details",
      description: "Get details of a specific event by ID.",
      annotations: READ_ONLY_ANNOTATIONS,
      schema: ToolSchemas["get-event"],
      handler: GetEventHandler
    },
    {
      name: "list-colors",
      title: "List Calendar Colors",
      description: "List available color IDs and their meanings for calendar events",
      annotations: READ_ONLY_ANNOTATIONS,
      schema: ToolSchemas["list-colors"],
      handler: ListColorsHandler
    },
    {
      name: "create-event",
      title: "Create Calendar Event",
      description: "Create a new calendar event.",
      annotations: WRITE_NON_DESTRUCTIVE_ANNOTATIONS,
      schema: ToolSchemas["create-event"],
      handler: CreateEventHandler
    },
    {
      name: "create-events",
      title: "Create Calendar Events (Bulk)",
      description: "Create multiple calendar events in bulk. Accepts shared defaults (account, calendarId, timeZone) that apply to all events, with per-event overrides. Skips conflict and duplicate detection for speed.",
      annotations: WRITE_NON_DESTRUCTIVE_ANNOTATIONS,
      schema: ToolSchemas["create-events"],
      handler: CreateEventsHandler
    },
    {
      name: "update-event",
      title: "Update Calendar Event",
      description: "Update an existing calendar event with recurring event modification scope support.",
      annotations: WRITE_DESTRUCTIVE_IDEMPOTENT_ANNOTATIONS,
      schema: ToolSchemas["update-event"],
      handler: UpdateEventHandler
    },
    {
      name: "delete-event",
      title: "Delete Calendar Event",
      description: "Delete a calendar event.",
      annotations: WRITE_DESTRUCTIVE_ANNOTATIONS,
      schema: ToolSchemas["delete-event"],
      handler: DeleteEventHandler
    },
    {
      name: "get-freebusy",
      title: "Get Free/Busy",
      description: "Query free/busy information for calendars. Note: Time range is limited to a maximum of 3 months between timeMin and timeMax.",
      annotations: READ_ONLY_ANNOTATIONS,
      schema: ToolSchemas["get-freebusy"],
      handler: FreeBusyEventHandler
    },
    {
      name: "get-current-time",
      title: "Get Current Time",
      description: "Get the current date and time. Call this FIRST before creating, updating, or searching for events to ensure you have accurate date context for scheduling.",
      annotations: READ_ONLY_ANNOTATIONS,
      schema: ToolSchemas["get-current-time"],
      handler: GetCurrentTimeHandler
    },
    {
      name: "respond-to-event",
      title: "Respond to Event Invitation",
      description: "Respond to a calendar event invitation with Accept, Decline, Maybe (Tentative), or No Response.",
      annotations: WRITE_NON_DESTRUCTIVE_IDEMPOTENT_ANNOTATIONS,
      schema: ToolSchemas["respond-to-event"],
      handler: RespondToEventHandler
    }
  ];
  static getToolsWithSchemas() {
    return this.tools.map((tool) => {
      const jsonSchema = z.toJSONSchema(tool.schema, { io: "input" });
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: jsonSchema
      };
    });
  }
  /**
   * Normalizes datetime fields from object format to string format
   * Converts { date: "2025-01-01" } or { dateTime: "...", timeZone: "..." } to simple strings
   * This allows accepting both Google Calendar API format and our simplified format
   */
  static normalizeDateTimeFields(toolName, args) {
    const toolsWithDateTime = ["create-event", "update-event", "create-events"];
    if (!toolsWithDateTime.includes(toolName)) {
      return args;
    }
    const normalized = { ...args };
    const dateTimeFields = ["start", "end", "originalStartTime", "futureStartDate"];
    if (toolName === "create-events" && Array.isArray(normalized.events)) {
      normalized.events = normalized.events.map((event) => {
        const normalizedEvent = { ...event };
        for (const field of dateTimeFields) {
          if (normalizedEvent[field] && typeof normalizedEvent[field] === "object") {
            const obj = normalizedEvent[field];
            if (obj.date) {
              normalizedEvent[field] = obj.date;
            } else if (obj.dateTime) {
              normalizedEvent[field] = obj.dateTime;
            }
          }
        }
        return normalizedEvent;
      });
      return normalized;
    }
    for (const field of dateTimeFields) {
      if (normalized[field] && typeof normalized[field] === "object") {
        const obj = normalized[field];
        if (obj.date) {
          normalized[field] = obj.date;
        } else if (obj.dateTime) {
          normalized[field] = obj.dateTime;
        }
      }
    }
    return normalized;
  }
  /**
   * Get all available tool names for validation
   */
  static getAvailableToolNames() {
    return this.tools.map((t) => t.name);
  }
  /**
   * Validate that all tool names in a list exist
   * @throws Error if any tool name is invalid
   */
  static validateToolNames(toolNames) {
    const availableTools = /* @__PURE__ */ new Set([...this.getAvailableToolNames(), "manage-accounts"]);
    const invalidTools = toolNames.filter((name) => !availableTools.has(name));
    if (invalidTools.length > 0) {
      const available = [...this.getAvailableToolNames(), "manage-accounts"].join(", ");
      throw new Error(
        `Invalid tool name(s): ${invalidTools.join(", ")}. Available tools: ${available}`
      );
    }
  }
  static async registerAll(server, executeWithHandler, config) {
    if (config?.enabledTools) {
      if (config.enabledTools.length === 0) {
        throw new Error("Enabled tools list is empty. Provide at least one tool name.");
      }
      this.validateToolNames(config.enabledTools);
      const enabledSet = new Set(config.enabledTools);
      process.stderr.write(`Tool filtering enabled: ${config.enabledTools.join(", ")}
`);
      for (const tool of this.tools) {
        if (!enabledSet.has(tool.name)) {
          continue;
        }
        this.registerSingleTool(server, tool, executeWithHandler);
      }
      return;
    }
    for (const tool of this.tools) {
      this.registerSingleTool(server, tool, executeWithHandler);
    }
  }
  static registerSingleTool(server, tool, executeWithHandler) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: this.extractSchemaShape(tool.schema),
        annotations: tool.annotations
      },
      async (args) => {
        try {
          const normalizedArgs = this.normalizeDateTimeFields(tool.name, args);
          const validatedArgs = tool.schema.parse(normalizedArgs);
          const processedArgs = tool.handlerFunction ? await tool.handlerFunction(validatedArgs) : validatedArgs;
          const handler = new tool.handler();
          return await executeWithHandler(handler, processedArgs);
        } catch (error) {
          return toEnvelopeResult(error, `run ${tool.name}`);
        }
      }
    );
  }
};

// src/handlers/core/ManageAccountsHandler.ts
init_paths();
init_failure_envelope();
import { google as google4 } from "googleapis";
var ManageAccountsHandler = class {
  async runTool(args, context) {
    switch (args.action) {
      case "list":
        return this.listAccounts(args.account_id, context);
      case "add":
        return this.addAccount(args.account_id, context);
      case "remove":
        return this.removeAccount(args.account_id, context);
      default:
        throw localEnvelopeError(
          "bad_request",
          `Invalid action: ${args.action}. Must be 'list', 'add', or 'remove'.`
        );
    }
  }
  // ============ LIST ACTION ============
  async listAccounts(accountId2, context) {
    const accounts = await context.reloadAccounts();
    if (accountId2) {
      const normalizedId = accountId2.toLowerCase();
      const client = accounts.get(normalizedId);
      if (!client) {
        const availableAccounts = Array.from(accounts.keys()).join(", ") || "none";
        throw localEnvelopeError(
          "account_not_found",
          `There is no connected account called "${normalizedId}".`,
          `Connected accounts: ${availableAccounts}`
        );
      }
      const accountInfo = await this.getAccountInfo(normalizedId, client);
      const response2 = {
        accounts: [accountInfo],
        total_accounts: 1,
        message: `Found account "${normalizedId}"`
      };
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response2, null, 2)
        }]
      };
    }
    if (accounts.size === 0) {
      const response2 = {
        accounts: [],
        total_accounts: 0,
        message: "No authenticated accounts found. Use manage-accounts with action 'add' and provide a nickname to connect a Google account."
      };
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response2, null, 2)
        }]
      };
    }
    const accountInfos = [];
    const errors = [];
    for (const [accId, client] of accounts) {
      try {
        const info = await this.getAccountInfo(accId, client);
        accountInfos.push(info);
      } catch (error) {
        const envelope = envelopeTextFor(error, `read account "${accId}"`);
        errors.push(`${accId}: ${envelope}`);
        accountInfos.push({
          account_id: accId,
          status: "error",
          error: envelope
        });
      }
    }
    const response = {
      accounts: accountInfos,
      total_accounts: accountInfos.length,
      message: errors.length > 0 ? `Found ${accountInfos.length} account(s) with ${errors.length} error(s)` : `Found ${accountInfos.length} authenticated account(s)`
    };
    return {
      content: [{
        type: "text",
        text: JSON.stringify(response, null, 2)
      }]
    };
  }
  async getAccountInfo(accountId2, client) {
    try {
      const calendar = google4.calendar({ version: "v3", auth: client });
      const calendarList = await calendar.calendarList.list();
      const calendars = calendarList.data.items || [];
      const primaryCalendar = calendars.find((c) => c.primary);
      const credentials = client.credentials;
      const expiryDate = credentials.expiry_date;
      const isExpired = expiryDate ? Date.now() > expiryDate : false;
      const email = primaryCalendar?.id || "unknown";
      return {
        account_id: accountId2,
        status: isExpired ? "expired" : "active",
        email,
        calendar_count: calendars.length,
        primary_calendar: primaryCalendar ? {
          id: primaryCalendar.id || "primary",
          name: primaryCalendar.summary || "Primary Calendar",
          timezone: primaryCalendar.timeZone || "UTC"
        } : void 0,
        token_expiry: expiryDate ? new Date(expiryDate).toISOString() : void 0
      };
    } catch (error) {
      const response = error?.response;
      if (typeof response?.status === "number") {
        throw httpEnvelopeError({
          action: `read account "${accountId2}"`,
          status: response.status,
          statusText: response.statusText,
          body: response.data
        });
      }
      if (isEnvelopeError(error)) throw error;
      throw localEnvelopeError(
        "internal_error",
        `Account "${accountId2}" could not be read.`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  // ============ ADD ACTION ============
  async addAccount(accountId2, context) {
    if (!accountId2) {
      throw localEnvelopeError(
        "bad_request",
        "account_id is required for the 'add' action."
      );
    }
    const normalizedId = accountId2.toLowerCase();
    try {
      validateAccountId(normalizedId);
    } catch (error) {
      throw localEnvelopeError(
        "bad_request",
        "The account nickname is not a valid account nickname.",
        error instanceof Error ? error.message : void 0
      );
    }
    if (context.accounts.has(normalizedId)) {
      const response = {
        status: "already_authenticated",
        account_id: normalizedId,
        message: `An account with nickname "${normalizedId}" is already connected. Use action 'list' to view account details.`
      };
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
    process.env.GOOGLE_ACCOUNT_MODE = normalizedId;
    context.tokenManager.setAccountMode(normalizedId);
    try {
      const started = await context.authServer.startForMcpTool(normalizedId);
      if (!started.success) {
        throw localEnvelopeError(
          "auth_server_failed",
          "The authentication server could not be started.",
          started.error
        );
      }
      const response = {
        status: "awaiting_authentication",
        account_id: normalizedId,
        auth_url: started.authUrl,
        callback_url: started.callbackUrl,
        instructions: `Visit the auth_url in your browser to connect your Google account. This will be saved with the nickname '${normalizedId}'.`,
        expires_in_minutes: 5,
        next_step: "After authenticating in your browser, use manage-accounts with action 'list' to verify the account was connected successfully."
      };
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response, null, 2)
        }]
      };
    } catch (error) {
      if (isEnvelopeError(error)) {
        throw error;
      }
      throw localEnvelopeError(
        "auth_server_failed",
        "Authentication could not be started.",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  // ============ REMOVE ACTION ============
  async removeAccount(accountId2, context) {
    if (!accountId2) {
      throw localEnvelopeError(
        "bad_request",
        "account_id is required for the 'remove' action."
      );
    }
    const normalizedId = accountId2.toLowerCase();
    try {
      validateAccountId(normalizedId);
    } catch (error) {
      throw localEnvelopeError(
        "bad_request",
        "The account nickname is not a valid account nickname.",
        error instanceof Error ? error.message : void 0
      );
    }
    const accounts = await context.reloadAccounts();
    if (!accounts.has(normalizedId)) {
      const availableAccounts = Array.from(accounts.keys()).join(", ") || "none";
      throw localEnvelopeError(
        "account_not_found",
        `There is no connected account called "${normalizedId}".`,
        `Connected accounts: ${availableAccounts}`
      );
    }
    if (accounts.size === 1) {
      throw localEnvelopeError(
        "last_account",
        `Account "${normalizedId}" was not removed because it is the only connected account.`
      );
    }
    try {
      await context.tokenManager.removeAccount(normalizedId);
      const updatedAccounts = await context.reloadAccounts();
      const remainingAccounts = Array.from(updatedAccounts.keys());
      const response = {
        success: true,
        account_id: normalizedId,
        message: `Account "${normalizedId}" has been removed successfully.`,
        remaining_accounts: remainingAccounts
      };
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response, null, 2)
        }]
      };
    } catch (error) {
      if (isEnvelopeError(error)) {
        throw error;
      }
      throw localEnvelopeError(
        "internal_error",
        `Account "${normalizedId}" could not be removed.`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
};

// src/server.ts
import { z as z2 } from "zod";

// src/transports/stdio.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
var StdioTransportHandler = class {
  server;
  constructor(server) {
    this.server = server;
  }
  async connect() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
};

// src/transports/http.ts
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http2 from "http";
var SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "1; mode=block"
};
function isLocalhostOrigin(origin) {
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
var HttpTransportHandler = class {
  server;
  config;
  tokenManager;
  constructor(server, config = {}, tokenManager) {
    this.server = server;
    this.config = config;
    this.tokenManager = tokenManager;
  }
  /**
   * Creates an OAuth2Client configured for the given account.
   * Consolidates credential loading and redirect URI construction.
   */
  async createOAuth2Client(accountId2, host, port) {
    const { OAuth2Client: OAuth2Client5 } = await import("google-auth-library");
    const { loadCredentials: loadCredentials2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    const { client_id, client_secret } = await loadCredentials2();
    return new OAuth2Client5(
      client_id,
      client_secret,
      `http://${host}:${port}/oauth2callback?account=${accountId2}`
    );
  }
  /**
   * Generates an OAuth authorization URL with standard settings.
   */
  generateOAuthUrl(client) {
    return client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/calendar"],
      prompt: "consent"
    });
  }
  /**
   * Validates an account ID format.
   * Throws an error if the format is invalid.
   */
  async validateAccountId(accountId2) {
    const { validateAccountId: validateAccountId2 } = await Promise.resolve().then(() => (init_paths(), paths_exports));
    validateAccountId2(accountId2);
  }
  parseRequestBody(req) {
    return new Promise((resolve2, reject) => {
      let body = "";
      req.on("data", (chunk) => body += chunk.toString());
      req.on("end", () => {
        try {
          resolve2(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(new Error("Invalid JSON in request body"));
        }
      });
      req.on("error", reject);
    });
  }
  async connect() {
    const port = this.config.port || 3e3;
    const host = this.config.host || "127.0.0.1";
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: void 0
      // Stateless mode - allows multiple initializations
    });
    await this.server.connect(transport);
    const httpServer = http2.createServer(async (req, res) => {
      const origin = req.headers.origin;
      if (origin && !isLocalhostOrigin(origin)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: "Forbidden: Invalid origin",
          message: "Origin header validation failed"
        }));
        return;
      }
      const contentLength = parseInt(req.headers["content-length"] || "0", 10);
      const maxRequestSize = 10 * 1024 * 1024;
      if (contentLength > maxRequestSize) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: "Payload Too Large",
          message: "Request size exceeds maximum allowed size"
        }));
        return;
      }
      const allowedCorsOrigin = origin && isLocalhostOrigin(origin) ? origin : `http://${host}:${port}`;
      res.setHeader("Access-Control-Allow-Origin", allowedCorsOrigin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }
      if (req.method === "POST" || req.method === "GET") {
        const acceptHeader = req.headers.accept;
        if (acceptHeader && !acceptHeader.includes("application/json") && !acceptHeader.includes("text/event-stream") && !acceptHeader.includes("*/*")) {
          res.writeHead(406, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "Not Acceptable",
            message: "Accept header must include application/json or text/event-stream"
          }));
          return;
        }
      }
      if (req.method === "GET" && (req.url === "/" || req.url === "/accounts")) {
        try {
          const html = await loadWebFile("accounts.html");
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            ...SECURITY_HEADERS
          });
          res.end(html);
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "Failed to load UI",
            message: error instanceof Error ? error.message : String(error)
          }));
        }
        return;
      }
      if (req.method === "GET" && req.url === "/styles.css") {
        try {
          const css = await loadWebFile("styles.css");
          res.writeHead(200, {
            "Content-Type": "text/css; charset=utf-8",
            ...SECURITY_HEADERS
          });
          res.end(css);
        } catch (error) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("CSS file not found");
        }
        return;
      }
      if (req.method === "GET" && req.url === "/api/accounts") {
        try {
          const accounts = await this.tokenManager.listAccounts();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ accounts }));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "Failed to list accounts",
            message: error instanceof Error ? error.message : String(error)
          }));
        }
        return;
      }
      if (req.method === "POST" && req.url === "/api/accounts") {
        try {
          const body = await this.parseRequestBody(req);
          const accountId2 = body.accountId;
          if (!accountId2 || typeof accountId2 !== "string") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              error: "Invalid request",
              message: "accountId is required and must be a string"
            }));
            return;
          }
          try {
            await this.validateAccountId(accountId2);
          } catch (error) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              error: "Invalid account ID",
              message: error instanceof Error ? error.message : String(error)
            }));
            return;
          }
          const oauth2Client = await this.createOAuth2Client(accountId2, host, port);
          const authUrl = this.generateOAuthUrl(oauth2Client);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            authUrl,
            accountId: accountId2
          }));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "Failed to initiate OAuth flow",
            message: error instanceof Error ? error.message : String(error)
          }));
        }
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/oauth2callback")) {
        try {
          const url = new URL(req.url, `http://${host}:${port}`);
          const code = url.searchParams.get("code");
          const accountId2 = url.searchParams.get("account");
          if (!code) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end("<h1>Error</h1><p>Authorization code missing</p>");
            return;
          }
          if (!accountId2) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end("<h1>Error</h1><p>Account ID missing</p>");
            return;
          }
          const oauth2Client = await this.createOAuth2Client(accountId2, host, port);
          const { tokens } = await oauth2Client.getToken(code);
          oauth2Client.setCredentials(tokens);
          let email = "unknown";
          try {
            const tokenInfo = await oauth2Client.getTokenInfo(tokens.access_token || "");
            email = tokenInfo.email || "unknown";
          } catch {
          }
          const originalMode = this.tokenManager.getAccountMode();
          try {
            this.tokenManager.setAccountMode(accountId2);
            await this.tokenManager.saveTokens(tokens, email !== "unknown" ? email : void 0);
          } finally {
            this.tokenManager.setAccountMode(originalMode);
          }
          CalendarRegistry.getInstance().clearCache();
          const postMessageOrigin = `http://${host}:${port}`;
          const successHtml = await renderAuthSuccess({
            accountId: accountId2,
            email: email !== "unknown" ? email : void 0,
            showCloseButton: true,
            postMessageOrigin
          });
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            ...SECURITY_HEADERS
          });
          res.end(successHtml);
        } catch (error) {
          const errorHtml = await renderAuthError({
            errorMessage: error instanceof Error ? error.message : String(error),
            showCloseButton: true
          });
          res.writeHead(500, {
            "Content-Type": "text/html; charset=utf-8",
            ...SECURITY_HEADERS
          });
          res.end(errorHtml);
        }
        return;
      }
      if (req.method === "DELETE" && req.url?.startsWith("/api/accounts/")) {
        const accountId2 = req.url.substring("/api/accounts/".length);
        try {
          await this.validateAccountId(accountId2);
          const originalMode = this.tokenManager.getAccountMode();
          try {
            this.tokenManager.setAccountMode(accountId2);
            await this.tokenManager.clearTokens();
          } finally {
            this.tokenManager.setAccountMode(originalMode);
          }
          CalendarRegistry.getInstance().clearCache();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            accountId: accountId2,
            message: "Account removed successfully"
          }));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "Failed to remove account",
            message: error instanceof Error ? error.message : String(error)
          }));
        }
        return;
      }
      if (req.method === "POST" && req.url?.match(/^\/api\/accounts\/[^/]+\/reauth$/)) {
        const accountId2 = req.url.split("/")[3];
        try {
          await this.validateAccountId(accountId2);
          const oauth2Client = await this.createOAuth2Client(accountId2, host, port);
          const authUrl = this.generateOAuthUrl(oauth2Client);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            authUrl,
            accountId: accountId2
          }));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "Failed to initiate re-authentication",
            message: error instanceof Error ? error.message : String(error)
          }));
        }
        return;
      }
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "healthy",
          server: "google-calendar-mcp",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }));
        return;
      }
      try {
        await transport.handleRequest(req, res);
      } catch (error) {
        process.stderr.write(`Error handling request: ${error instanceof Error ? error.message : error}
`);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error"
            },
            id: null
          }));
        }
      }
    });
    httpServer.listen(port, host, () => {
      process.stderr.write(`Google Calendar MCP Server listening on http://${host}:${port}
`);
    });
  }
};

// src/server.ts
var __server_dirname = dirname3(fileURLToPath3(import.meta.url));
var SERVER_VERSION = JSON.parse(readFileSync2(join2(__server_dirname, "..", "package.json"), "utf-8")).version;
var GoogleCalendarMcpServer = class {
  server;
  oauth2Client;
  tokenManager;
  authServer;
  config;
  accounts;
  // Set when the credentials file could not be read. The server still starts and still advertises
  // every tool; each call answers with this envelope instead. A server that refuses to start is a
  // DEAD extension: it resolves to nothing, the turn opens with an empty toolbox, and the step
  // fails silently. A server that starts and says [no_credentials] can be acted on.
  credentialsFailure;
  constructor(config) {
    this.config = config;
    this.server = new McpServer({
      name: "google-calendar",
      version: SERVER_VERSION
    });
  }
  async initialize() {
    try {
      this.oauth2Client = await initializeOAuth2Client();
      this.tokenManager = new TokenManager(this.oauth2Client);
      this.authServer = new AuthServer(this.oauth2Client);
      this.accounts = await this.tokenManager.loadAllAccounts();
      await this.handleStartupAuthentication();
    } catch (error) {
      this.credentialsFailure = envelopeErrorFor(error, "read the Google credentials");
      process.stderr.write(`${this.credentialsFailure.envelope}
`);
      process.stderr.write("The server is starting anyway; every tool will report this failure until it is resolved.\n");
      this.oauth2Client = new OAuth2Client4();
      this.tokenManager = new TokenManager(this.oauth2Client);
      this.authServer = new AuthServer(this.oauth2Client);
      this.accounts = /* @__PURE__ */ new Map();
    }
    this.registerTools();
    this.registerPrompts();
    this.registerResources();
    this.guardToolResults();
    this.setupGracefulShutdown();
  }
  async handleStartupAuthentication() {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    this.accounts = await this.tokenManager.loadAllAccounts();
    if (this.accounts.size > 0) {
      const accountList = Array.from(this.accounts.keys()).join(", ");
      process.stderr.write(`Valid tokens found for account(s): ${accountList}
`);
      return;
    }
    const accountMode = this.tokenManager.getAccountMode();
    if (this.config.transport.type === "stdio") {
      const hasValidTokens = await this.tokenManager.validateTokens(accountMode);
      if (!hasValidTokens) {
        process.stderr.write(`\u26A0\uFE0F  No authenticated accounts found.
`);
        process.stderr.write(`Use the 'manage-accounts' tool with action 'add' to authenticate a Google account, or run:
`);
        process.stderr.write(`  npx @cocal/google-calendar-mcp auth

`);
      } else {
        process.stderr.write(`Valid ${accountMode} user tokens found.
`);
        this.accounts = await this.tokenManager.loadAllAccounts();
      }
    } else {
      const hasValidTokens = await this.tokenManager.validateTokens(accountMode);
      if (!hasValidTokens) {
        process.stderr.write(`\u26A0\uFE0F  No valid ${accountMode} user authentication tokens found.
`);
        process.stderr.write('Visit the server URL in your browser to authenticate, or run "npm run auth" separately.\n');
      } else {
        process.stderr.write(`Valid ${accountMode} user tokens found.
`);
        this.accounts = await this.tokenManager.loadAllAccounts();
      }
    }
  }
  registerTools() {
    ToolRegistry.registerAll(this.server, this.executeWithHandler.bind(this), this.config);
    this.registerAccountManagementTools();
  }
  /**
   * Register the manage-accounts tool that needs access to server internals.
   * This tool is special because it:
   * - Doesn't require existing authentication (for 'add' action)
   * - Needs access to authServer, tokenManager, etc.
   */
  registerAccountManagementTools() {
    const self = this;
    const serverContext = {
      oauth2Client: this.oauth2Client,
      tokenManager: this.tokenManager,
      authServer: this.authServer,
      get accounts() {
        return self.accounts;
      },
      reloadAccounts: async () => {
        this.accounts = await this.tokenManager.loadAllAccounts();
        return this.accounts;
      }
    };
    const manageAccountsHandler = new ManageAccountsHandler();
    this.server.registerTool(
      "manage-accounts",
      {
        title: "Manage Google Accounts",
        description: "Manage Google account authentication. Actions: 'list' (show accounts), 'add' (authenticate new account), 'remove' (remove account).",
        inputSchema: {
          action: z2.enum(["list", "add", "remove"]).describe("Action to perform: 'list' shows all accounts, 'add' authenticates a new account, 'remove' removes an account"),
          account_id: z2.string().regex(/^[a-z0-9_-]{1,64}$/, "Account nickname must be 1-64 characters: lowercase letters, numbers, dashes, underscores only").optional().describe("Account nickname (e.g., 'work', 'personal') - a friendly name to identify this Google account. Required for 'add' and 'remove'. Optional for 'list' (shows all if omitted)")
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false
        }
      },
      async (args) => {
        try {
          if (this.credentialsFailure) {
            throw this.credentialsFailure;
          }
          return await manageAccountsHandler.runTool(args, serverContext);
        } catch (error) {
          return toEnvelopeResult(error, "manage the connected accounts");
        }
      }
    );
  }
  /**
   * Wraps the SDK's tools/call handler so that EVERY failing tool result leaves as the envelope.
   *
   * The funnel in ToolRegistry catches everything our own code can throw, but the SDK validates
   * arguments against the registered input schema before that funnel is reached, and reports a
   * rejection as `isError: true` with the text "MCP error -32602: ...". Rule 2 says nothing comes
   * before the code, so that result is re-shaped here, at the outermost point a result exists.
   */
  guardToolResults() {
    const handlers = this.server.server?._requestHandlers;
    const inner = handlers?.get("tools/call");
    if (!handlers || !inner) {
      process.stderr.write("WARNING: could not wrap the tools/call handler; argument-validation failures will not carry the failure envelope.\n");
      return;
    }
    handlers.set("tools/call", async (request, extra) => {
      const result = await inner(request, extra);
      return ensureEnvelope(result, `run ${request?.params?.name ?? "the tool"}`);
    });
  }
  registerPrompts() {
    this.server.registerPrompt(
      "daily-agenda-brief",
      {
        title: "Daily Agenda Brief",
        description: "Generate a concise daily agenda brief with priorities, risks, and focus blocks.",
        argsSchema: {
          date: z2.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today's date in the selected timezone."),
          account: z2.union([z2.string(), z2.array(z2.string())]).optional().describe("Account nickname or list of account nicknames to include."),
          timeZone: z2.string().optional().describe("IANA timezone (for example: America/Los_Angeles).")
        }
      },
      async ({ date, account, timeZone }) => {
        const accountHint = Array.isArray(account) ? account.join(", ") : account;
        const dateHint = date ?? "today";
        const timeZoneHint = timeZone ?? "calendar default timezone";
        const toolArgs = {
          calendarId: "primary"
        };
        if (account) {
          toolArgs.account = account;
        }
        if (timeZone) {
          toolArgs.timeZone = timeZone;
        }
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Create my daily agenda brief for ${dateHint} in ${timeZoneHint}. Account scope: ${accountHint ?? "all connected accounts"}.

Use these tools in order:
1) get-current-time to ground date/time context.
2) list-events with args ${JSON.stringify(toolArgs)} and a time window for the requested day.
3) get-freebusy if you need to confirm open focus blocks.

Return sections:
- Priorities (top 3)
- Meeting Risks (overlaps, back-to-back runs, insufficient prep gaps)
- Suggested Focus Blocks (specific time ranges)
- Prep Checklist (owner + due-before-event)

Keep it concise, actionable, and timezone-explicit.`
              }
            }
          ]
        };
      }
    );
    this.server.registerPrompt(
      "find-and-book-meeting",
      {
        title: "Find and Book Meeting",
        description: "Find candidate meeting times and create an event only after explicit confirmation.",
        argsSchema: {
          title: z2.string().describe("Meeting title."),
          attendeeEmails: z2.array(z2.string()).optional().describe("List of attendee emails."),
          durationMinutes: z2.number().int().min(15).max(240).describe("Meeting duration in minutes."),
          windowStart: z2.string().describe("Window start in ISO 8601 format."),
          windowEnd: z2.string().describe("Window end in ISO 8601 format."),
          account: z2.union([z2.string(), z2.array(z2.string())]).optional().describe("Account nickname or list of account nicknames to include."),
          targetCalendarId: z2.string().optional().describe("Calendar ID to book on. Defaults to 'primary'."),
          timeZone: z2.string().optional().describe("IANA timezone used for candidate slots and final booking.")
        }
      },
      async ({ title, attendeeEmails, durationMinutes, windowStart, windowEnd, account, targetCalendarId, timeZone }) => {
        const freebusyArgs = {
          timeMin: windowStart,
          timeMax: windowEnd,
          calendars: [{ id: targetCalendarId ?? "primary" }]
        };
        if (account) {
          freebusyArgs.account = account;
        }
        if (timeZone) {
          freebusyArgs.timeZone = timeZone;
        }
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Find and book a meeting.

Constraints:
- Title: ${title}
- Duration: ${durationMinutes} minutes
- Window: ${windowStart} to ${windowEnd}
- Account scope: ${Array.isArray(account) ? account.join(", ") : account ?? "all connected accounts"}
- Target calendar: ${targetCalendarId ?? "primary"}
- Timezone: ${timeZone ?? "calendar default timezone"}
- Attendees: ${attendeeEmails && attendeeEmails.length > 0 ? attendeeEmails.join(", ") : "none specified"}

Workflow:
1) Call get-current-time first.
2) Call get-freebusy with args ${JSON.stringify(freebusyArgs)}.
3) Propose exactly 3 ranked candidate slots with tradeoffs.
4) Ask for explicit confirmation of one slot.
5) Only after confirmation, call create-event with selected slot and provided attendees.

Do not create an event before confirmation.`
              }
            }
          ]
        };
      }
    );
  }
  registerResources() {
    this.server.registerResource(
      "calendar-accounts",
      "calendar://accounts",
      {
        title: "Connected Accounts and Calendars",
        description: "Lists authenticated account nicknames and a deduplicated summary of accessible calendars.",
        mimeType: "application/json"
      },
      async () => {
        try {
          await this.ensureAuthenticated();
          const accountIds = Array.from(this.accounts.keys()).sort();
          const registry = CalendarRegistry.getInstance();
          const unifiedCalendars = await registry.getUnifiedCalendars(this.accounts);
          const payload = {
            generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            accountCount: accountIds.length,
            accountIds,
            calendarCount: unifiedCalendars.length,
            calendars: unifiedCalendars.map((calendar) => ({
              calendarId: calendar.calendarId,
              displayName: calendar.displayName,
              preferredAccount: calendar.preferredAccount,
              access: calendar.accounts.map((accountAccess) => ({
                accountId: accountAccess.accountId,
                accessRole: accountAccess.accessRole,
                primary: accountAccess.primary
              }))
            })),
            notes: [
              "Calendars are deduplicated across accounts by calendar ID.",
              "preferredAccount is the account with the highest permissions for that calendar."
            ]
          };
          return {
            contents: [
              {
                uri: "calendar://accounts",
                mimeType: "application/json",
                text: JSON.stringify(payload, null, 2)
              }
            ]
          };
        } catch (error) {
          throw new McpError2(
            ErrorCode2.InternalError,
            envelopeTextFor(error, "load the connected accounts")
          );
        }
      }
    );
  }
  async ensureAuthenticated() {
    if (this.credentialsFailure) {
      throw this.credentialsFailure;
    }
    const availableAccounts = await this.tokenManager.loadAllAccounts();
    if (availableAccounts.size > 0) {
      this.accounts = availableAccounts;
      return;
    }
    if (await this.tokenManager.validateTokens()) {
      const refreshedAccounts = await this.tokenManager.loadAllAccounts();
      if (refreshedAccounts.size > 0) {
        this.accounts = refreshedAccounts;
        return;
      }
    }
    if (this.config.transport.type === "stdio") {
      throw localEnvelopeError(
        "no_credentials",
        "The stored Google credentials are no longer valid."
      );
    }
    try {
      const authSuccess = await this.authServer.start(false);
      if (!authSuccess) {
        throw localEnvelopeError(
          "no_credentials",
          "No Google account is connected and the authentication server could not be started."
        );
      }
    } catch (error) {
      if (isEnvelopeError(error)) {
        throw error;
      }
      throw localEnvelopeError(
        "no_credentials",
        "No Google account is connected and authentication could not be started.",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  async executeWithHandler(handler, args) {
    await this.ensureAuthenticated();
    const result = await handler.runTool(await resolveArgs(args), this.accounts);
    return await wrapResult(result);
  }
  async start() {
    switch (this.config.transport.type) {
      case "stdio":
        const stdioHandler = new StdioTransportHandler(this.server);
        await stdioHandler.connect();
        break;
      case "http":
        const httpConfig = {
          port: this.config.transport.port,
          host: this.config.transport.host
        };
        const httpHandler = new HttpTransportHandler(
          this.server,
          httpConfig,
          this.tokenManager
        );
        await httpHandler.connect();
        break;
      default:
        throw new Error(`Unsupported transport type: ${this.config.transport.type}`);
    }
  }
  setupGracefulShutdown() {
    const cleanup = async () => {
      try {
        if (this.authServer) {
          await this.authServer.stop();
        }
        this.server.close();
        process.exit(0);
      } catch (error) {
        process.stderr.write(`Error during cleanup: ${error instanceof Error ? error.message : error}
`);
        process.exit(1);
      }
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }
  // Expose server for testing
  getServer() {
    return this.server;
  }
};

// src/config/TransportConfig.ts
function parseEnabledTools(value, source) {
  if (value === void 0) {
    return void 0;
  }
  const parsed = value.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  if (parsed.length === 0) {
    process.stderr.write(`Error: ${source} requires at least one tool name
`);
    process.exit(1);
  }
  return parsed;
}
function parseArgs(args) {
  const config = {
    transport: {
      type: process.env.TRANSPORT || "stdio",
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3,
      host: process.env.HOST || "127.0.0.1"
    },
    debug: process.env.DEBUG === "true" || false,
    enabledTools: parseEnabledTools(process.env.ENABLED_TOOLS, "ENABLED_TOOLS")
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--transport":
        const transport = args[++i];
        if (transport === "stdio" || transport === "http") {
          config.transport.type = transport;
        }
        break;
      case "--port":
        config.transport.port = parseInt(args[++i], 10);
        break;
      case "--host":
        config.transport.host = args[++i];
        break;
      case "--debug":
        config.debug = true;
        break;
      case "--enable-tools":
        const enabledTools = args[++i];
        if (!enabledTools) {
          process.stderr.write("Error: --enable-tools requires a comma-separated list of tool names\n");
          process.exit(1);
        }
        config.enabledTools = parseEnabledTools(enabledTools, "--enable-tools");
        break;
      case "--help":
        process.stderr.write(`
Google Calendar MCP Server

Usage: node build/index.js [options]

Options:
  --transport <type>        Transport type: stdio (default) | http
  --port <number>          Port for HTTP transport (default: 3000)
  --host <string>          Host for HTTP transport (default: 127.0.0.1)
  --debug                  Enable debug logging
  --enable-tools <list>    Comma-separated list of tools to enable (whitelist)
  --help                   Show this help message

Environment Variables:
  TRANSPORT               Transport type: stdio | http
  PORT                   Port for HTTP transport
  HOST                   Host for HTTP transport
  DEBUG                  Enable debug logging (true/false)
  ENABLED_TOOLS          Comma-separated list of tools to enable

Examples:
  node build/index.js                              # stdio (local use)
  node build/index.js --transport http --port 3000 # HTTP server
  node build/index.js --enable-tools list-events,create-event,get-current-time
  PORT=3000 TRANSPORT=http node build/index.js     # Using env vars
        `);
        process.exit(0);
    }
  }
  return config;
}

// src/index.ts
init_client();
import { readFileSync as readFileSync3 } from "fs";
import { join as join3, dirname as dirname4 } from "path";
var __filename2 = fileURLToPath4(import.meta.url);
var __dirname2 = dirname4(__filename2);
var packageJsonPath = join3(__dirname2, "..", "package.json");
var packageJson = JSON.parse(readFileSync3(packageJsonPath, "utf-8"));
var VERSION = packageJson.version;
async function main() {
  try {
    const config = parseArgs(process.argv.slice(2));
    const server = new GoogleCalendarMcpServer(config);
    await server.initialize();
    await server.start();
  } catch (error) {
    process.stderr.write(`Failed to start server: ${error instanceof Error ? error.message : error}
`);
    process.exit(1);
  }
}
async function runAuthServer(accountId2) {
  if (accountId2) {
    if (!/^[a-z0-9_-]{1,64}$/.test(accountId2)) {
      process.stderr.write("Invalid account ID. Must be 1-64 characters: lowercase letters, numbers, dashes, underscores only.\n");
      process.exit(1);
    }
    process.env.GOOGLE_ACCOUNT_MODE = accountId2;
    process.stderr.write(`Authenticating account: ${accountId2}
`);
  }
  try {
    const oauth2Client = await initializeOAuth2Client();
    const authServerInstance = new AuthServer(oauth2Client);
    const success = await authServerInstance.start(true);
    if (!success && !authServerInstance.authCompletedSuccessfully) {
      process.stderr.write(
        "Authentication failed. Could not start server or validate existing tokens. Check port availability (3500-3505) and try again.\n"
      );
      process.exit(1);
    } else if (authServerInstance.authCompletedSuccessfully) {
      process.stderr.write("Authentication successful.\n");
      process.exit(0);
    }
    process.stderr.write(
      "Authentication server started. Please complete the authentication in your browser...\n"
    );
    const intervalId = setInterval(async () => {
      if (authServerInstance.authCompletedSuccessfully) {
        clearInterval(intervalId);
        await authServerInstance.stop();
        process.stderr.write("Authentication completed successfully!\n");
        process.exit(0);
      }
    }, 1e3);
  } catch (error) {
    process.stderr.write(`Authentication failed: ${error}
`);
    process.exit(1);
  }
}
function showHelp() {
  process.stdout.write(`
Google Calendar MCP Server v${VERSION}

Usage:
  npx @cocal/google-calendar-mcp [command] [options]

Commands:
  auth [account-id]  Run the authentication flow
                     Optional account-id for multi-account support (e.g., work, personal)
  start              Start the MCP server (default)
  version            Show version information
  help               Show this help message

Options:
  --enable-tools <list>   Comma-separated list of tools to enable (whitelist)

Examples:
  npx @cocal/google-calendar-mcp auth              # Authenticate default account
  npx @cocal/google-calendar-mcp auth work         # Authenticate "work" account
  npx @cocal/google-calendar-mcp start
  npx @cocal/google-calendar-mcp start --enable-tools list-events,create-event,get-current-time
  npx @cocal/google-calendar-mcp

Environment Variables:
  GOOGLE_OAUTH_CREDENTIALS    Path to OAuth credentials file
  GOOGLE_ACCOUNT_MODE         Account ID to use (alternative to auth argument)
  ENABLED_TOOLS               Comma-separated list of tools to enable
`);
}
function showVersion() {
  process.stdout.write(`Google Calendar MCP Server v${VERSION}
`);
}
function parseCliArgs() {
  const args = process.argv.slice(2);
  let command2;
  let accountId2;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--version" || arg === "-v" || arg === "--help" || arg === "-h") {
      command2 = arg;
      continue;
    }
    if (arg === "--transport" || arg === "--port" || arg === "--host" || arg === "--enable-tools") {
      i++;
      continue;
    }
    if (arg === "--debug") {
      continue;
    }
    if (!command2 && !arg.startsWith("--")) {
      command2 = arg;
      continue;
    }
    if (command2 === "auth" && !accountId2 && !arg.startsWith("--")) {
      accountId2 = arg;
      continue;
    }
  }
  return { command: command2, accountId: accountId2 };
}
var { command, accountId } = parseCliArgs();
switch (command) {
  case "auth":
    runAuthServer(accountId).catch((error) => {
      process.stderr.write(`Authentication failed: ${error}
`);
      process.exit(1);
    });
    break;
  case "start":
  case void 0:
    main().catch((error) => {
      process.stderr.write(`Failed to start server: ${error}
`);
      process.exit(1);
    });
    break;
  case "version":
  case "--version":
  case "-v":
    showVersion();
    break;
  case "help":
  case "--help":
  case "-h":
    showHelp();
    break;
  default:
    process.stderr.write(`Unknown command: ${command}
`);
    showHelp();
    process.exit(1);
}
export {
  main,
  runAuthServer
};
//# sourceMappingURL=index.js.map
