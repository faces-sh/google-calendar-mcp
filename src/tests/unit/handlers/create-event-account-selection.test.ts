import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateEventHandler } from '../../../handlers/core/CreateEventHandler.js';
import { OAuth2Client } from 'google-auth-library';
import { calendar_v3 } from 'googleapis';
import { CalendarRegistry } from '../../../services/CalendarRegistry.js';

// Mock ConflictDetectionService to avoid calling Google APIs
vi.mock('../../../services/conflict-detection/ConflictDetectionService.js', () => ({
  ConflictDetectionService: class {
    checkConflicts = vi.fn().mockResolvedValue({
      hasConflicts: false,
      conflicts: [],
      duplicates: []
    });
  }
}));

describe('CreateEventHandler - multi-account selection', () => {
  let handler: CreateEventHandler;
  let workClient: OAuth2Client;
  let personalClient: OAuth2Client;
  let accounts: Map<string, OAuth2Client>;

  beforeEach(() => {
    // Reset the singleton to get a fresh instance for each test
    CalendarRegistry.resetInstance();
    handler = new CreateEventHandler();
    // getCalendarTimezone hits the calendar API; these tests are about account selection.
    vi.spyOn(handler as any, 'getCalendarTimezone').mockResolvedValue('America/Los_Angeles');
    workClient = new OAuth2Client();
    personalClient = new OAuth2Client();
    accounts = new Map([
      ['work', workClient],
      ['personal', personalClient]
    ]);
  });

  const baseArgs = {
    calendarId: 'team@company.com',
    summary: 'Planning',
    start: '2025-01-01T10:00:00-08:00',
    end: '2025-01-01T11:00:00-08:00'
  };

  it('auto-selects account with write access when account is omitted', async () => {
    // Mock getClientWithAutoSelection to return work account
    vi.spyOn(handler as any, 'getClientWithAutoSelection').mockResolvedValue({
      client: workClient,
      accountId: 'work',
      calendarId: 'team@company.com',
      wasAutoSelected: true
    });

    // Stub createEvent to avoid API call
    vi.spyOn(handler as any, 'createEvent').mockResolvedValue({
      id: 'evt-1',
      start: { dateTime: baseArgs.start },
      end: { dateTime: baseArgs.end },
      summary: baseArgs.summary
    } as calendar_v3.Schema$Event);

    const result = await handler.runTool(baseArgs, accounts);
    const response = JSON.parse((result.content as any)[0].text);

    expect(response.event).toBeDefined();
    expect(response.event.accountId).toBe('work');
  });

  it('uses explicitly provided account even when registry would choose differently', async () => {
    // Mock getClientWithAutoSelection to return personal account when explicitly specified
    vi.spyOn(handler as any, 'getClientWithAutoSelection').mockResolvedValue({
      client: personalClient,
      accountId: 'personal',
      calendarId: 'team@company.com',
      wasAutoSelected: false
    });
    vi.spyOn(handler as any, 'createEvent').mockResolvedValue({
      id: 'evt-2',
      start: { dateTime: baseArgs.start },
      end: { dateTime: baseArgs.end },
      summary: baseArgs.summary
    } as calendar_v3.Schema$Event);

    const result = await handler.runTool({ ...baseArgs, account: 'personal' }, accounts);
    const response = JSON.parse((result.content as any)[0].text);

    expect(response.event.accountId).toBe('personal');
  });

  it('surfaces the real account failure instead of calling the calendar missing', async () => {
    // Don't mock getClientWithAutoSelection - let it fail naturally.
    // Every account's calendar list fails (there are no real credentials here). That used to be
    // swallowed into an empty calendar list, and the user was told "no account has write access
    // to that calendar" when the truth was that their accounts could not be read at all
    // (docs/MCP_FAILURE_ENVELOPE.md rule 6).
    await expect(handler.runTool(baseArgs, accounts)).rejects.toThrow(/No access, refresh token/i);
  });
});
