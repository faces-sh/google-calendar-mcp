import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { mkdtempSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * Drives the BUILT server over stdio as a real MCP client would, with no credentials file.
 *
 * This is the one failure a vitest mock cannot see, because it happens above the layer the unit
 * tests exercise: the process used to DIE during startup when the credentials file was missing,
 * before `initialize` ever completed. Maestro's extension then resolved to nothing, the turn opened
 * with an empty toolbox, and the step failed silently, which is the exact failure class the
 * envelope contract exists to remove. A server that cannot work must still start and say why.
 */

const SERVER = resolve(__dirname, '../../../build/index.js');
const MISSING_CREDENTIALS = join(mkdtempSync(join(tmpdir(), 'gcal-nocreds-')), 'does-not-exist.json');

/** A minimal JSON-RPC client. No SDK on purpose: the point is to see the bytes on the wire. */
class StdioClient {
  private proc!: ChildProcessWithoutNullStreams;
  private nextId = 0;
  private stdout = '';
  stderr = '';

  start(): void {
    this.proc = spawn(process.execPath, [SERVER], {
      env: { ...process.env, GOOGLE_OAUTH_CREDENTIALS: MISSING_CREDENTIALS, NODE_ENV: 'production' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.proc.stdout.on('data', (d) => { this.stdout += d.toString(); });
    this.proc.stderr.on('data', (d) => { this.stderr += d.toString(); });
  }

  stop(): void {
    this.proc?.kill();
  }

  notify(method: string, params: unknown): void {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async rpc(method: string, params: unknown, timeoutMs = 20000): Promise<any> {
    const id = ++this.nextId;
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const lines = this.stdout.split('\n');
      this.stdout = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;
        let msg: any;
        try { msg = JSON.parse(trimmed); } catch { continue; }
        if (msg.id === id) return msg;
      }
      if (this.proc.exitCode !== null) {
        throw new Error(`server exited with ${this.proc.exitCode}; stderr: ${this.stderr.slice(-400)}`);
      }
      await new Promise(r => setTimeout(r, 25));
    }
    throw new Error(`${method} timed out; stderr: ${this.stderr.slice(-400)}`);
  }
}

const LEADING_CODE = /^\[[a-z][a-z0-9_]*\]\s+\S/;

describe('the built server with no credentials file', () => {
  const client = new StdioClient();
  let toolNames: string[] = [];

  beforeAll(async () => {
    expect(existsSync(SERVER), `${SERVER} is missing: run npm run build first`).toBe(true);
    client.start();
  }, 30000);

  afterAll(() => client.stop());

  it('completes initialize instead of dying', async () => {
    const reply = await client.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'no-credentials-test', version: '1' }
    });

    expect(reply.error).toBeUndefined();
    expect(reply.result.serverInfo.name).toBe('google-calendar');
    client.notify('notifications/initialized', {});
  }, 30000);

  it('still advertises its tools', async () => {
    const reply = await client.rpc('tools/list', {});

    const tools = reply.result?.tools ?? [];
    expect(tools.length).toBeGreaterThan(0);
    toolNames = tools.map((t: any) => t.name);
    expect(toolNames).toContain('list-events');
    expect(toolNames).toContain('manage-accounts');
  }, 30000);

  it('answers every tool with an envelope, and [no_credentials] names the file it looked for', async () => {
    // Enough arguments to get past schema validation, so the call reaches the credential check.
    const args: Record<string, unknown> = {
      'list-events': { calendarId: 'primary' },
      'search-events': { calendarId: 'primary', query: 'x', timeMin: '2025-01-01T00:00:00Z', timeMax: '2025-01-02T00:00:00Z' },
      'get-event': { calendarId: 'primary', eventId: 'abcde' },
      'create-event': { calendarId: 'primary', summary: 'x', start: '2025-01-01T10:00:00', end: '2025-01-01T11:00:00' },
      'create-events': { events: [{ summary: 'x', start: '2025-01-01T10:00:00', end: '2025-01-01T11:00:00' }] },
      'update-event': { calendarId: 'primary', eventId: 'abcde', summary: 'y' },
      'delete-event': { calendarId: 'primary', eventId: 'abcde' },
      'get-freebusy': { calendars: [{ id: 'primary' }], timeMin: '2025-01-01T00:00:00Z', timeMax: '2025-01-02T00:00:00Z' },
      'respond-to-event': { calendarId: 'primary', eventId: 'abcde', response: 'accepted' },
      'manage-accounts': { action: 'list' }
    };

    // Guard the loop: without this, a failed tools/list leaves toolNames empty and this test
    // passes by iterating nothing, which is a false all-clear on the exact thing it protects.
    expect(toolNames.length).toBeGreaterThan(0);

    for (const name of toolNames) {
      const reply = await client.rpc('tools/call', { name, arguments: args[name] ?? {} });

      expect(reply.error, `${name} returned a JSON-RPC error, not a tool result`).toBeUndefined();
      expect(reply.result.isError, `${name} did not set isError`).toBe(true);

      const text: string = (reply.result.content ?? [])
        .filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim();

      expect(text, `${name}: ${text.slice(0, 80)}`).toMatch(LEADING_CODE);
      expect(text.startsWith('[no_credentials]'), `${name} said: ${text.slice(0, 80)}`).toBe(true);
      // Rule 3: it names the file it looked for, so this is actionable rather than a shrug.
      expect(text).toContain(MISSING_CREDENTIALS);
    }
  }, 60000);

  it('rejects bad arguments with an envelope, not with the SDK\'s raw "MCP error" text', async () => {
    // The SDK validates against the registered input schema before our own funnel is reached.
    const reply = await client.rpc('tools/call', { name: 'get-freebusy', arguments: {} });

    const text: string = reply.result.content[0].text.trim();
    expect(reply.result.isError).toBe(true);
    expect(text).toMatch(LEADING_CODE);
    expect(text.startsWith('[bad_request]')).toBe(true);
    expect(text).toContain('calendars');
  }, 30000);

  it('keeps the setup walkthrough in the log, where it cannot kill the process', () => {
    expect(client.stderr).toContain('OAuth credentials not found');
    expect(client.stderr).toContain('console.cloud.google.com');
    expect(client.stderr).toContain('[no_credentials]');
  });
});
