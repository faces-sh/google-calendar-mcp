import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs/promises';
import { getKeysFilePath, generateCredentialsErrorMessage, OAuthCredentials } from './utils.js';
import { isEnvelopeError, localEnvelopeError } from '../utils/failure-envelope.js';

async function loadCredentialsFromFile(): Promise<OAuthCredentials> {
  const keysContent = await fs.readFile(getKeysFilePath(), "utf-8");
  const keys = JSON.parse(keysContent);

  if (keys.installed) {
    // Standard OAuth credentials file format
    const { client_id, client_secret, redirect_uris } = keys.installed;
    return { client_id, client_secret, redirect_uris };
  } else if (keys.client_id && keys.client_secret) {
    // Direct format
    return {
      client_id: keys.client_id,
      client_secret: keys.client_secret,
      redirect_uris: keys.redirect_uris || ['http://localhost:3000/oauth2callback']
    };
  } else {
    throw new Error('Invalid credentials file format. Expected either "installed" object or direct client_id/client_secret fields.');
  }
}

async function loadCredentialsWithFallback(): Promise<OAuthCredentials> {
  // Load credentials from file (CLI param, env var, or default path)
  try {
    return await loadCredentialsFromFile();
  } catch (fileError) {
    // The setup walkthrough is for a person reading the log. It stays on stderr and out of the
    // thrown failure, because a tool result may not invent a remedy (docs/MCP_FAILURE_ENVELOPE.md
    // rule 7) and because it buries the one fact that matters: which file was looked for.
    process.stderr.write(generateCredentialsErrorMessage() + '\n\n');
    throw localEnvelopeError(
      'no_credentials',
      `No Google OAuth credentials could be read from ${getKeysFilePath()}.`,
      fileError instanceof Error ? fileError.message : String(fileError)
    );
  }
}

export async function initializeOAuth2Client(): Promise<OAuth2Client> {
  // Always use real OAuth credentials - no mocking.
  // Unit tests should mock at the handler level, integration tests need real credentials.
  const credentials = await loadCredentialsWithFallback();

  // Use the first redirect URI as the default for the base client
  return new OAuth2Client({
    clientId: credentials.client_id,
    clientSecret: credentials.client_secret,
    redirectUri: credentials.redirect_uris[0],
  });
}

export async function loadCredentials(): Promise<{ client_id: string; client_secret: string }> {
  try {
    const credentials = await loadCredentialsWithFallback();

    if (!credentials.client_id || !credentials.client_secret) {
      throw localEnvelopeError(
        'no_credentials',
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
      'no_credentials',
      `No Google OAuth credentials could be read from ${getKeysFilePath()}.`,
      error instanceof Error ? error.message : String(error)
    );
  }
}
