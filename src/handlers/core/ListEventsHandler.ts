import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { BaseToolHandler } from "./BaseToolHandler.js";
import { calendar_v3 } from 'googleapis';
import { BatchRequestHandler } from "./BatchRequestHandler.js";
import { buildListFieldMask } from "../../utils/field-mask-builder.js";
import { createStructuredResponse } from "../../utils/response-builder.js";
import { ListEventsResponse, StructuredEvent, convertGoogleEventToStructured, ExtendedEvent } from "../../types/structured-responses.js";
import { envelopeTextFor, httpEnvelopeError } from "../../utils/failure-envelope.js";

interface CalendarFailure {
  calendarId: string;
  error: unknown;
}

interface CalendarFetchResult {
  events: ExtendedEvent[];
  failures: CalendarFailure[];
}

interface ListEventsArgs {
  calendarId: string | string[];
  timeMin?: string;
  timeMax?: string;
  timeZone?: string;
  fields?: string[];
  privateExtendedProperty?: string[];
  sharedExtendedProperty?: string[];
  account?: string | string[];
}

export class ListEventsHandler extends BaseToolHandler {
    async runTool(args: ListEventsArgs, accounts: Map<string, OAuth2Client>): Promise<CallToolResult> {
        // Get clients for specified accounts (supports single or multiple)
        const selectedAccounts = this.getClientsForAccounts(args.account, accounts);
        const partialFailures: Array<{ accountId: string; reason: string }> = [];
        const resolutionWarnings: string[] = [];

        // Normalize calendarId to always be an array for consistent processing
        const calendarNamesOrIds = Array.isArray(args.calendarId)
            ? args.calendarId
            : [args.calendarId];

        // For multi-account queries, pre-resolve calendars to their owning accounts
        // This prevents "calendar not found" errors when a calendar only exists on some accounts
        let accountCalendarMap: Map<string, string[]>;

        if (selectedAccounts.size > 1) {
            // Multi-account: route calendars to their owning accounts using CalendarRegistry
            const { resolved, warnings } = await this.calendarRegistry.resolveCalendarsToAccounts(
                calendarNamesOrIds,
                selectedAccounts
            );
            accountCalendarMap = resolved;
            resolutionWarnings.push(...warnings);

            // If no calendars could be resolved on any account, throw error
            if (accountCalendarMap.size === 0) {
                await this.throwNoCalendarsFoundError(calendarNamesOrIds, selectedAccounts);
            }
        } else {
            // Single account: use existing per-account resolution (strict mode)
            // All calendars go to the single account - will error if not found
            const [accountId] = selectedAccounts.keys();
            accountCalendarMap = new Map([[accountId, calendarNamesOrIds]]);
        }

        // Fetch events from accounts that have matching calendars
        const failures: unknown[] = [];
        let succeededCalendars = 0;
        const eventsPerAccount = await Promise.all(
            Array.from(accountCalendarMap.entries()).map(async ([accountId, calendarsForAccount]) => {
                const client = selectedAccounts.get(accountId)!;
                try {
                    // For single-account, resolve names to IDs (strict mode)
                    // For multi-account, calendars are already resolved IDs
                    const calendarIds = selectedAccounts.size === 1
                        ? await this.resolveCalendarIds(client, calendarsForAccount)
                        : calendarsForAccount;

                    const { events, failures: calendarFailures } = await this.fetchEvents(client, calendarIds, {
                        timeMin: args.timeMin,
                        timeMax: args.timeMax,
                        timeZone: args.timeZone,
                        fields: args.fields,
                        privateExtendedProperty: args.privateExtendedProperty,
                        sharedExtendedProperty: args.sharedExtendedProperty
                    });

                    // A calendar that failed inside a batch used to be written to stderr and
                    // dropped, so a 403 on every calendar came back as "no events" (rule 6).
                    succeededCalendars += calendarIds.length - calendarFailures.length;
                    for (const failure of calendarFailures) {
                        failures.push(failure.error);
                        partialFailures.push({
                            accountId,
                            reason: `calendar "${failure.calendarId}": ${envelopeTextFor(failure.error, `list events in calendar "${failure.calendarId}"`)}`
                        });
                    }

                    // Tag events with account ID and return metadata
                    return {
                        accountId,
                        calendarIds,
                        events: events.map(event => ({ ...event, accountId }))
                    };
                } catch (error) {
                    // For single account, propagate error
                    if (selectedAccounts.size === 1) {
                        throw error;
                    }
                    failures.push(error);
                    partialFailures.push({
                        accountId,
                        reason: envelopeTextFor(error, `list events for account "${accountId}"`)
                    });
                    // For multi-account, continue with other accounts
                    return { accountId, calendarIds: [], events: [] };
                }
            })
        );

        // Nothing at all could be read: that is a failure, not an empty calendar. "You have
        // nothing on Friday" and "I could not read your calendar" are opposite answers.
        if (succeededCalendars === 0 && failures.length > 0) {
            throw this.toEnvelopeError(failures[0], 'list the events');
        }

        // Flatten and merge all events and calendar IDs
        const allEvents = eventsPerAccount.flatMap(result => result.events);
        const allQueriedCalendarIds = [...new Set(eventsPerAccount.flatMap(result => result.calendarIds))];

        // Sort events chronologically
        this.sortEventsByStartTime(allEvents);

        // Convert extended events to structured format
        const structuredEvents: StructuredEvent[] = allEvents.map(event =>
            convertGoogleEventToStructured(event, event.calendarId, event.accountId)
        );
        const warnings: string[] = [...resolutionWarnings];

        // Build detailed warnings for partial failures
        if (partialFailures.length > 0) {
            for (const failure of partialFailures) {
                warnings.push(`Account "${failure.accountId}" failed: ${failure.reason}`);
            }
        }

        // Build note based on results
        let note: string | undefined;
        if (selectedAccounts.size > 1) {
            const successfulAccounts = selectedAccounts.size - partialFailures.length;
            if (partialFailures.length > 0) {
                note = `⚠️ Partial results: Retrieved events from ${successfulAccounts} of ${selectedAccounts.size} account(s). ${partialFailures.length} account(s) failed - see warnings for details.`;
            } else {
                note = `Showing merged events from ${selectedAccounts.size} account(s), sorted chronologically`;
            }
        }

        const response: ListEventsResponse = {
            events: structuredEvents,
            totalCount: allEvents.length,
            calendars: allQueriedCalendarIds.length > 1 ? allQueriedCalendarIds : undefined,
            ...(partialFailures.length > 0 && { partialFailures }),
            ...(warnings.length > 0 && { warnings }),
            ...(selectedAccounts.size > 1 && { accounts: Array.from(selectedAccounts.keys()) }),
            ...(note && { note })
        };

        return createStructuredResponse(response);
    }

    private async fetchEvents(
        client: OAuth2Client,
        calendarIds: string[],
        options: { timeMin?: string; timeMax?: string; timeZone?: string; fields?: string[]; privateExtendedProperty?: string[]; sharedExtendedProperty?: string[] }
    ): Promise<CalendarFetchResult> {
        if (calendarIds.length === 1) {
            const events = await this.fetchSingleCalendarEvents(client, calendarIds[0], options);
            return { events, failures: [] };
        }

        return this.fetchMultipleCalendarEvents(client, calendarIds, options);
    }

    private async fetchSingleCalendarEvents(
        client: OAuth2Client,
        calendarId: string,
        options: { timeMin?: string; timeMax?: string; timeZone?: string; fields?: string[]; privateExtendedProperty?: string[]; sharedExtendedProperty?: string[] }
    ): Promise<ExtendedEvent[]> {
        try {
            const calendar = this.getCalendar(client);

            // Normalize time range to RFC3339 format using calendar's timezone as fallback
            const { timeMin, timeMax } = await this.normalizeTimeRange(
                client, calendarId, options.timeMin, options.timeMax, options.timeZone
            );
            
            const fieldMask = buildListFieldMask(options.fields);
            
            const response = await calendar.events.list({
                calendarId,
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: 'startTime',
                ...(fieldMask && { fields: fieldMask }),
                ...(options.privateExtendedProperty && { privateExtendedProperty: options.privateExtendedProperty as any }),
                ...(options.sharedExtendedProperty && { sharedExtendedProperty: options.sharedExtendedProperty as any })
            });
            
            // Add calendarId to events for consistent interface
            return (response.data.items || []).map(event => ({
                ...event,
                calendarId
            }));
        } catch (error) {
            throw this.handleGoogleApiError(error, `list events in calendar "${calendarId}"`);
        }
    }

    private async fetchMultipleCalendarEvents(
        client: OAuth2Client,
        calendarIds: string[],
        options: { timeMin?: string; timeMax?: string; timeZone?: string; fields?: string[]; privateExtendedProperty?: string[]; sharedExtendedProperty?: string[] }
    ): Promise<CalendarFetchResult> {
        const batchHandler = new BatchRequestHandler(client);

        const requests = await Promise.all(calendarIds.map(async (calendarId) => ({
            method: "GET" as const,
            path: await this.buildEventsPath(client, calendarId, options)
        })));

        const responses = await batchHandler.executeBatch(requests);

        const { events, failures } = this.processBatchResponses(responses, calendarIds);

        return { events: this.sortEventsByStartTime(events), failures };
    }

    private async buildEventsPath(client: OAuth2Client, calendarId: string, options: { timeMin?: string; timeMax?: string; timeZone?: string; fields?: string[]; privateExtendedProperty?: string[]; sharedExtendedProperty?: string[] }): Promise<string> {
        // Normalize time range to RFC3339 format using calendar's timezone as fallback
        const { timeMin, timeMax } = await this.normalizeTimeRange(
            client, calendarId, options.timeMin, options.timeMax, options.timeZone
        );

        const fieldMask = buildListFieldMask(options.fields);
        
        const params = new URLSearchParams({
            singleEvents: "true",
            orderBy: "startTime",
        });
        if (timeMin) params.set('timeMin', timeMin);
        if (timeMax) params.set('timeMax', timeMax);
        if (fieldMask) params.set('fields', fieldMask);
        if (options.privateExtendedProperty) {
            for (const kv of options.privateExtendedProperty) params.append('privateExtendedProperty', kv);
        }
        if (options.sharedExtendedProperty) {
            for (const kv of options.sharedExtendedProperty) params.append('sharedExtendedProperty', kv);
        }
        
        return `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
    }

    private processBatchResponses(
        responses: any[],
        calendarIds: string[]
    ): CalendarFetchResult {
        const events: ExtendedEvent[] = [];
        const failures: CalendarFailure[] = [];

        responses.forEach((response, index) => {
            const calendarId = calendarIds[index];

            if (response.statusCode === 200 && response.body?.items) {
                const calendarEvents: ExtendedEvent[] = response.body.items.map((event: any) => ({
                    ...event,
                    calendarId
                }));
                events.push(...calendarEvents);
            } else {
                // Keep Google's own body for this sub-request, verbatim, so the caller can tell an
                // expired credential from a permission the account never had.
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
}
