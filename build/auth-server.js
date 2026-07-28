// src/auth/client.ts
import { OAuth2Client } from "google-auth-library";
import * as fs from "fs/promises";

// src/auth/utils.ts
import * as path2 from "path";
import { fileURLToPath } from "url";

// src/auth/paths.js
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
var RESERVED_NAMES = [
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
function validateAccountId(accountId) {
  if (!accountId || accountId.length === 0) {
    throw new Error("Invalid account ID. Must be 1-64 characters: lowercase letters, numbers, dashes, underscores only.");
  }
  if (RESERVED_NAMES.includes(accountId)) {
    throw new Error(`Account ID "${accountId}" is reserved and cannot be used.`);
  }
  if (!/^[a-z0-9_-]{1,64}$/.test(accountId)) {
    throw new Error("Invalid account ID. Must be 1-64 characters: lowercase letters, numbers, dashes, underscores only.");
  }
  return accountId;
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

// src/auth/utils.ts
function getProjectRoot() {
  const __dirname2 = path2.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path2.join(__dirname2, "..");
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

// src/auth/client.ts
async function loadCredentialsFromFile() {
  const keysContent = await fs.readFile(getKeysFilePath(), "utf-8");
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
    const errorMessage = generateCredentialsErrorMessage();
    throw new Error(`${errorMessage}

Original error: ${fileError instanceof Error ? fileError.message : fileError}`);
  }
}
async function initializeOAuth2Client() {
  try {
    const credentials = await loadCredentialsWithFallback();
    return new OAuth2Client({
      clientId: credentials.client_id,
      clientSecret: credentials.client_secret,
      redirectUri: credentials.redirect_uris[0]
    });
  } catch (error) {
    throw new Error(`Error loading OAuth keys: ${error instanceof Error ? error.message : error}`);
  }
}
async function loadCredentials() {
  try {
    const credentials = await loadCredentialsWithFallback();
    if (!credentials.client_id || !credentials.client_secret) {
      throw new Error("Client ID or Client Secret missing in credentials.");
    }
    return {
      client_id: credentials.client_id,
      client_secret: credentials.client_secret
    };
  } catch (error) {
    throw new Error(`Error loading credentials: ${error instanceof Error ? error.message : error}`);
  }
}

// src/auth/server.ts
import { OAuth2Client as OAuth2Client3, CodeChallengeMethod } from "google-auth-library";

// src/auth/tokenManager.ts
import { OAuth2Client as OAuth2Client2 } from "google-auth-library";
import fs2 from "fs/promises";
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
    await fs2.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2), { mode: 384 });
  }
  async loadMultiAccountTokens() {
    try {
      const fileContent = await fs2.readFile(this.tokenPath, "utf-8");
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
      const fileContent = await fs2.readFile(this.tokenPath, "utf-8");
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
  setupTokenRefreshForAccount(client, accountId) {
    client.on("tokens", async (newTokens) => {
      try {
        await this.enqueueTokenWrite(async () => {
          const multiAccountTokens = await this.loadMultiAccountTokens();
          const currentTokens = multiAccountTokens[accountId] || {};
          const updatedTokens = {
            ...currentTokens,
            ...newTokens,
            refresh_token: newTokens.refresh_token || currentTokens.refresh_token
          };
          multiAccountTokens[accountId] = updatedTokens;
          await this.writeTokenFile(multiAccountTokens);
        });
        if (process.env.NODE_ENV !== "test") {
          process.stderr.write(`Tokens updated and saved for ${accountId} account
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
      if (!await fs2.access(legacyPath).then(() => true).catch(() => false)) {
        return false;
      }
      const legacyTokens = JSON.parse(await fs2.readFile(legacyPath, "utf-8"));
      if (!legacyTokens || typeof legacyTokens !== "object") {
        process.stderr.write("Invalid legacy token format, skipping migration\n");
        return false;
      }
      await this.writeTokenFile(legacyTokens);
      process.stderr.write(`Migrated tokens from legacy location: ${legacyPath} to: ${this.tokenPath}
`);
      try {
        await fs2.unlink(legacyPath);
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
      const tokenExists = await fs2.access(this.tokenPath).then(() => true).catch(() => false);
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
          await fs2.unlink(this.tokenPath);
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
          await fs2.unlink(this.tokenPath);
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
  async removeAccount(accountId) {
    const normalizedId = accountId.toLowerCase();
    await this.enqueueTokenWrite(async () => {
      const multiAccountTokens = await this.loadMultiAccountTokens();
      if (!multiAccountTokens[normalizedId]) {
        throw new Error(`Account "${normalizedId}" not found`);
      }
      delete multiAccountTokens[normalizedId];
      if (Object.keys(multiAccountTokens).length === 0) {
        await fs2.unlink(this.tokenPath);
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
      for (const accountId of this.accounts.keys()) {
        if (!multiAccountTokens[accountId]) {
          const client = this.accounts.get(accountId);
          if (client) {
            client.removeAllListeners("tokens");
          }
          this.accounts.delete(accountId);
        }
      }
      for (const [accountId, tokens] of Object.entries(multiAccountTokens)) {
        try {
          validateAccountId(accountId);
          if (!tokens || typeof tokens !== "object" || !tokens.access_token) {
            continue;
          }
          let client = this.accounts.get(accountId);
          if (!client) {
            client = new OAuth2Client2(
              this.credentials.clientId,
              this.credentials.clientSecret,
              this.credentials.redirectUri
            );
            this.setupTokenRefreshForAccount(client, accountId);
            this.accounts.set(accountId, client);
          }
          client.setCredentials(tokens);
        } catch (error) {
          if (process.env.NODE_ENV !== "test") {
            process.stderr.write(`Skipping invalid account "${accountId}": ${error}
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
  getClient(accountId) {
    validateAccountId(accountId);
    const client = this.accounts.get(accountId);
    if (!client) {
      throw new Error(`Account "${accountId}" not found. Please authenticate this account first.`);
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
      for (const [accountId, tokens] of Object.entries(multiAccountTokens)) {
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
        accountList.push({ id: accountId, email, status, calendars });
      }
      if (tokensUpdated) {
        await this.enqueueTokenWrite(async () => {
          const latestTokens = await this.loadMultiAccountTokensRaw();
          for (const accountId of Object.keys(multiAccountTokens)) {
            const localUpdates = multiAccountTokens[accountId];
            const latestAccount = latestTokens[accountId];
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
    const { google } = await import("googleapis");
    const calendar = google.calendar({ version: "v3", auth: client });
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
      const { google } = await import("googleapis");
      const calendar = google.calendar({ version: "v3", auth: client });
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
import crypto from "crypto";
import http from "http";
import { URL } from "url";
import open from "open";

// src/web/templates.ts
import fs3 from "fs/promises";
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
      await fs3.access(filePath);
      return fs3.readFile(filePath, "utf-8");
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
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
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
  async startForMcpTool(accountId) {
    if (this.server) {
      await this.stop();
    }
    this.tokenManager.setAccountMode(accountId);
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
        process.stderr.write(`Auth timeout for account "${accountId}" - shutting down auth server
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

// src/auth-server.ts
var args = process.argv.slice(2);
if (args.length > 0) {
  process.env.GOOGLE_ACCOUNT_MODE = args[0];
}
async function runAuthServer() {
  let authServer = null;
  try {
    const oauth2Client = await initializeOAuth2Client();
    authServer = new AuthServer(oauth2Client);
    const success = await authServer.start(true);
    if (!success && !authServer.authCompletedSuccessfully) {
      process.stderr.write("Authentication failed. Could not start server or validate existing tokens.\n");
      process.exit(1);
    } else if (authServer.authCompletedSuccessfully) {
      process.stderr.write("Authentication successful.\n");
      process.exit(0);
    }
    process.stderr.write("Authentication server started. Please complete the authentication in your browser...\n");
    process.stderr.write(`Waiting for OAuth callback on port ${authServer.getRunningPort()}...
`);
    let lastDebugLog = 0;
    const pollInterval = setInterval(async () => {
      try {
        if (authServer?.authCompletedSuccessfully) {
          process.stderr.write("Authentication completed successfully detected. Stopping server...\n");
          clearInterval(pollInterval);
          await authServer.stop();
          process.stderr.write("Authentication successful. Server stopped.\n");
          process.exit(0);
        } else {
          const now = Date.now();
          if (now - lastDebugLog > 1e4) {
            process.stderr.write("Still waiting for authentication to complete...\n");
            lastDebugLog = now;
          }
        }
      } catch (error) {
        process.stderr.write(`Error in polling interval: ${error instanceof Error ? error.message : "Unknown error"}
`);
        clearInterval(pollInterval);
        if (authServer) await authServer.stop();
        process.exit(1);
      }
    }, 5e3);
    process.on("SIGINT", async () => {
      clearInterval(pollInterval);
      if (authServer) {
        await authServer.stop();
      }
      process.exit(0);
    });
  } catch (error) {
    process.stderr.write(`Authentication error: ${error instanceof Error ? error.message : "Unknown error"}
`);
    if (authServer) await authServer.stop();
    process.exit(1);
  }
}
if (import.meta.url.endsWith("auth-server.js")) {
  runAuthServer().catch((error) => {
    process.stderr.write(`Unhandled error: ${error instanceof Error ? error.message : "Unknown error"}
`);
    process.exit(1);
  });
}
//# sourceMappingURL=auth-server.js.map
