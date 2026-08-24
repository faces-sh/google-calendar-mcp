import { BaseToolHandler } from './BaseToolHandler.js';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { GetFreeBusyInput } from "../../tools/registry.js";
import { FreeBusyResponse as GoogleFreeBusyResponse } from '../../schemas/types.js';
import { FreeBusyResponse, BusySlot } from '../../types/structured-responses.js';
import { createStructuredResponse } from '../../utils/response-builder.js';
import { convertToRFC3339 } from '../../utils/datetime.js';
import { envelopeTextFor, localEnvelopeError } from '../../utils/failure-envelope.js';

interface FreeBusyCalendarResult {
  busy: BusySlot[];
  errors?: Array<{ domain?: string; reason?: string }>;
}

export class FreeBusyEventHandler extends BaseToolHandler {
  async runTool(args: any, accounts: Map<string, OAuth2Client>): Promise<CallToolResult> {
    const validArgs = args as GetFreeBusyInput;

    if (!this.isLessThanThreeMonths(validArgs.timeMin, validArgs.timeMax)) {
      throw localEnvelopeError(
        'bad_request',
        'The requested time range is longer than the three months Google allows for a free/busy query.',
        `timeMin: ${validArgs.timeMin}, timeMax: ${validArgs.timeMax}`
      );
    }

    // Get clients for specified accounts (or all if not specified)
    const selectedAccounts = this.getClientsForAccounts(args.account, accounts);

    // Query freebusy from all selected accounts and merge results
    const { calendars: mergedCalendars, warnings } = await this.queryFreeBusyMultiAccount(selectedAccounts, validArgs);

    const response: FreeBusyResponse = {
      timeMin: validArgs.timeMin,
      timeMax: validArgs.timeMax,
      calendars: mergedCalendars,
      ...(warnings.length > 0 && { warnings })
    };

    return createStructuredResponse(response);
  }

  private async queryFreeBusyMultiAccount(
    accounts: Map<string, OAuth2Client>,
    args: GetFreeBusyInput
  ): Promise<{ calendars: Record<string, FreeBusyCalendarResult>; warnings: string[] }> {
    const mergedCalendars: Record<string, FreeBusyCalendarResult> = {};
    const calendarIds = args.calendars.map(c => c.id);
    // Named apart from the registry's resolution warnings, which are destructured below.
    const failureWarnings: string[] = [];

    // For multi-account queries, pre-resolve which calendars exist on which accounts
    // This prevents the "cartesian product" problem where we try to query all calendars
    // from all accounts, causing failures when a calendar doesn't exist on an account
    let accountCalendarMap: Map<string, string[]>;
    const resolutionWarnings: string[] = [];

    if (accounts.size > 1) {
      const { resolved, warnings } = await this.calendarRegistry.resolveCalendarsToAccounts(
        calendarIds,
        accounts
      );
      accountCalendarMap = resolved;
      resolutionWarnings.push(...warnings);

      // If no calendars could be resolved, mark all as not found. An account we could not read
      // at all is a failure, not an absence, so that is raised instead.
      if (accountCalendarMap.size === 0) {
        this.throwCalendarAccessFailureIfAny('read the free/busy information');
        for (const calId of calendarIds) {
          mergedCalendars[calId] = {
            busy: [],
            errors: [{ reason: 'notFound' }]
          };
        }
        return { calendars: mergedCalendars, warnings: [...resolutionWarnings] };
      }
    } else {
      // Single account: send all calendars to that account
      const [accountId] = accounts.keys();
      accountCalendarMap = new Map([[accountId, calendarIds]]);
    }

    // Query from each account with only the calendars that exist on that account
    const results = await Promise.all(
      Array.from(accountCalendarMap.entries()).map(async ([accountId, calendarsForAccount]) => {
        const client = accounts.get(accountId)!;
        try {
          // Filter args.calendars to only include those routed to this account
          const filteredArgs: GetFreeBusyInput = {
            ...args,
            calendars: args.calendars.filter(c => calendarsForAccount.includes(c.id))
          };
          const result = await this.queryFreeBusy(client, filteredArgs);
          return { accountId, result, error: null, calendarsQueried: calendarsForAccount };
        } catch (error) {
          // Do not fail the whole query: other accounts might succeed. But the failure is
          // REPORTED, never written to stderr and forgotten. An empty busy list that means "the
          // query failed" and one that means "nothing is scheduled" are opposite answers.
          return { accountId, result: null, error, calendarsQueried: calendarsForAccount };
        }
      })
    );

    const failed = results.filter(r => r.error !== null);

    // Every account failed: there is nothing to report but the failure.
    if (failed.length > 0 && failed.length === results.length) {
      throw this.toEnvelopeError(failed[0].error, 'read the free/busy information');
    }

    for (const failure of failed) {
      failureWarnings.push(
        `Account "${failure.accountId}" could not be queried, so its calendars ` +
        `(${failure.calendarsQueried.join(', ')}) are missing from this answer: ` +
        envelopeTextFor(failure.error, `read free/busy for account "${failure.accountId}"`)
      );
    }

    // Calendars that were only routed to an account that failed: their result is unknown, and
    // "unknown" must not be rendered as "notFound" or as an empty busy list.
    const unqueriedCalendars = new Set<string>();
    for (const failure of failed) {
      for (const calId of failure.calendarsQueried) {
        unqueriedCalendars.add(calId);
      }
    }
    for (const success of results.filter(r => r.error === null)) {
      for (const calId of success.calendarsQueried) {
        unqueriedCalendars.delete(calId);
      }
    }

    // Merge results from all accounts
    // For each calendar, prefer results without errors
    for (const calId of calendarIds) {
      let bestResult: FreeBusyCalendarResult | null = null;

      for (const { result } of results) {
        if (!result?.calendars) continue;

        const calData = result.calendars[calId];
        if (!calData) continue;

        // If we don't have a result yet, or this one has no errors but previous did, use this one
        if (!bestResult) {
          bestResult = {
            busy: calData.busy?.map((slot: any) => ({ start: slot.start, end: slot.end })) || [],
            errors: calData.errors?.map((err: any) => ({ domain: err.domain, reason: err.reason }))
          };
        } else if (bestResult.errors && !calData.errors) {
          // Current best has errors but this one doesn't - prefer this one
          bestResult = {
            busy: calData.busy?.map((slot: any) => ({ start: slot.start, end: slot.end })) || []
          };
        }
      }

      // If no account returned data for this calendar, say why: a calendar whose only account
      // failed was never queried, and calling that 'notFound' invents an answer.
      if (!bestResult) {
        mergedCalendars[calId] = {
          busy: [],
          errors: [{ reason: unqueriedCalendars.has(calId) ? 'queryFailed' : 'notFound' }]
        };
      } else {
        mergedCalendars[calId] = bestResult;
      }
    }

    // resolutionWarnings used to be collected here and then dropped on the floor.
    return { calendars: mergedCalendars, warnings: [...resolutionWarnings, ...failureWarnings] };
  }

  private async queryFreeBusy(
    client: OAuth2Client,
    args: GetFreeBusyInput
  ): Promise<GoogleFreeBusyResponse> {
    try {
      const calendar = this.getCalendar(client);

      // Determine timezone with correct precedence:
      // 1. Explicit timeZone parameter (highest priority)
      // 2. Primary calendar's default timezone
      // 3. UTC when the calendar has no timezone set or is not in this account's list
      const timezone = args.timeZone || await this.getCalendarTimezone(client, 'primary');

      // Convert time boundaries to RFC3339 format for Google Calendar API
      // This handles both timezone-aware and timezone-naive datetime strings
      const timeMin = convertToRFC3339(args.timeMin, timezone);
      const timeMax = convertToRFC3339(args.timeMax, timezone);

      // Build request body
      // Note: The timeZone parameter affects the response format, not request interpretation
      // Since timeMin/timeMax are in RFC3339 (with timezone), they're unambiguous
      // But we include timeZone so busy periods in the response use consistent timezone
      const requestBody: any = {
        timeMin,
        timeMax,
        items: args.calendars,
        timeZone: timezone, // Always include to ensure response consistency
      };

      // Only add optional expansion fields if provided
      if (args.groupExpansionMax !== undefined) {
        requestBody.groupExpansionMax = args.groupExpansionMax;
      }
      if (args.calendarExpansionMax !== undefined) {
        requestBody.calendarExpansionMax = args.calendarExpansionMax;
      }

      const response = await calendar.freebusy.query({
        requestBody,
      });
      return response.data as GoogleFreeBusyResponse;
    } catch (error) {
      throw this.handleGoogleApiError(error, 'read the free/busy information');
    }
  }

  private isLessThanThreeMonths(timeMin: string, timeMax: string): boolean {
    const minDate = new Date(timeMin);
    const maxDate = new Date(timeMax);

    const diffInMilliseconds = maxDate.getTime() - minDate.getTime();
    const threeMonthsInMilliseconds = 3 * 30 * 24 * 60 * 60 * 1000;

    return diffInMilliseconds <= threeMonthsInMilliseconds;
  }
}
