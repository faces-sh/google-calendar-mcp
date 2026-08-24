import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OAuth2Client } from 'google-auth-library';
import { GetEventHandler } from '../../../handlers/core/GetEventHandler.js';
import { ListEventsHandler } from '../../../handlers/core/ListEventsHandler.js';
import { ListCalendarsHandler } from '../../../handlers/core/ListCalendarsHandler.js';
import { CalendarRegistry } from '../../../services/CalendarRegistry.js';
import { ToolRegistry } from '../../../tools/registry.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EnvelopeError } from '../../../utils/failure-envelope.js';

// Three representative failures, held to docs/MCP_FAILURE_ENVELOPE.md:
//   a 401 (the credential is refused),
//   a 404 on an event id that does not exist,
//   a failure that was not HTTP at all (no account connected).
//
// The point of each is the EVIDENCE. Maestro has to be able to tell an expired credential from a
// permission the account never had, and only Google's own body separates them.

vi.mock('googleapis', () => ({
  google: {
    calendar: vi.fn(() => ({}))
  },
  calendar_v3: {}
}));

/** A googleapis failure, shaped the way gaxios shapes one. */
function googleFailure(status: number, statusText: string, body: unknown) {
  const error: any = new Error(`Request failed with status code ${status}`);
  error.response = { status, statusText, data: body };
  return error;
}

describe('failure envelope, end to end through the handlers', () => {
  let mockOAuth2Client: OAuth2Client;
  let mockAccounts: Map<string, OAuth2Client>;

  beforeEach(() => {
    CalendarRegistry.resetInstance();
    mockOAuth2Client = new OAuth2Client();
    mockAccounts = new Map([['test', mockOAuth2Client]]);
  });

  it('a 401 carries the status line and Google\'s body verbatim', async () => {
    const body = {
      error: {
        code: 401,
        message: 'Request had invalid authentication credentials. Expected OAuth 2 access token.',
        status: 'UNAUTHENTICATED'
      }
    };

    const handler = new ListCalendarsHandler();
    vi.spyOn(handler as any, 'getCalendar').mockReturnValue({
      calendarList: { list: vi.fn().mockRejectedValue(googleFailure(401, 'Unauthorized', body)) }
    });

    const error = await handler.runTool({}, mockAccounts).catch(e => e);

    expect(error).toBeInstanceOf(EnvelopeError);
    expect(error.envelopeCode).toBe('http_401');
    expect(error.envelope).toBe(
      '[http_401] Could not list the calendars: the request was not authorised.\n' +
      'HTTP 401 Unauthorized\n' +
      JSON.stringify(body)
    );
    // The distinction Maestro used to guess at with a regex is right there in the body.
    expect(error.envelope).toContain('UNAUTHENTICATED');
  });

  it('a 404 on a missing event id carries the status line and Google\'s body verbatim', async () => {
    const body = { error: { code: 404, message: 'Not Found', errors: [{ domain: 'global', reason: 'notFound' }] } };

    const handler = new GetEventHandler();
    vi.spyOn(handler as any, 'getCalendar').mockReturnValue({
      events: { get: vi.fn().mockRejectedValue(googleFailure(404, 'Not Found', body)) }
    });
    vi.spyOn(handler as any, 'getClientWithAutoSelection').mockResolvedValue({
      client: mockOAuth2Client,
      accountId: 'test',
      calendarId: 'primary',
      wasAutoSelected: true
    });

    const error = await handler.runTool(
      { calendarId: 'primary', eventId: 'no-such-event' },
      mockAccounts
    ).catch(e => e);

    expect(error).toBeInstanceOf(EnvelopeError);
    expect(error.envelopeCode).toBe('http_404');
    expect(error.envelope).toBe(
      '[http_404] Could not read event "no-such-event": it was not found.\n' +
      'HTTP 404 Not Found\n' +
      JSON.stringify(body)
    );
  });

  it('a failure that was not HTTP gets a code and no status line', async () => {
    const handler = new ListCalendarsHandler();

    const error = await handler.runTool({}, new Map()).catch(e => e);

    expect(error).toBeInstanceOf(EnvelopeError);
    expect(error.envelopeCode).toBe('no_credentials');
    expect(error.envelope).toBe('[no_credentials] No Google account is connected to this server.');
    expect(error.envelope).not.toContain('HTTP');
  });

  it('a calendar that could not be read is never reported as a calendar with no events', async () => {
    // The marquee swallow this contract exists to stop: "you have nothing on Friday" and "I could
    // not read your calendar" are opposite answers.
    const body = { error: { code: 403, message: 'Insufficient Permission', status: 'PERMISSION_DENIED' } };

    const handler = new ListEventsHandler();
    vi.spyOn(handler as any, 'getCalendarTimezone').mockResolvedValue('UTC');
    vi.spyOn(handler as any, 'getCalendar').mockReturnValue({
      events: { list: vi.fn().mockRejectedValue(googleFailure(403, 'Forbidden', body)) }
    });

    const error = await handler.runTool({ calendarId: 'primary' }, mockAccounts).catch(e => e);

    expect(error).toBeInstanceOf(EnvelopeError);
    expect(error.envelopeCode).toBe('http_403');
    expect(error.envelope).toContain('HTTP 403 Forbidden');
    expect(error.envelope).toContain('PERMISSION_DENIED');
  });

  describe('at the MCP boundary', () => {
    /** Registers the tools against a fake server and hands back one tool's callback. */
    async function callbackFor(toolName: string, executeWithHandler: any) {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const callbacks = new Map<string, any>();
      server.registerTool = vi.fn((name: string, _definition: any, callback: any) => {
        callbacks.set(name, callback);
        return { name } as any;
      }) as any;

      await ToolRegistry.registerAll(server, executeWithHandler);
      return callbacks.get(toolName)!;
    }

    it('turns a thrown failure into isError: true with the envelope as its text (rule 1)', async () => {
      const body = { error: { code: 401, message: 'Invalid Credentials', status: 'UNAUTHENTICATED' } };
      const callback = await callbackFor('list-calendars', async () => {
        throw googleFailure(401, 'Unauthorized', body);
      });

      const result = await callback({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(
        '[http_401] Could not run list-calendars: the request was not authorised.\n' +
        'HTTP 401 Unauthorized\n' +
        JSON.stringify(body)
      );
    });

    it('turns a rejected argument into an envelope rather than a raw schema dump', async () => {
      const callback = await callbackFor('get-freebusy', async () => ({ content: [] }));

      // timeMin is required, so validation fails before any handler runs.
      const result = await callback({ calendars: [{ id: 'primary' }] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text.startsWith('[bad_request] Could not run get-freebusy.')).toBe(true);
    });
  });
});
