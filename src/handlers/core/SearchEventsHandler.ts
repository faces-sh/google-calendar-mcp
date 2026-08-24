import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { SearchEventsInput } from "../../tools/registry.js";
import { BaseToolHandler } from "./BaseToolHandler.js";
import { calendar_v3 } from 'googleapis';
import { buildListFieldMask } from "../../utils/field-mask-builder.js";
import { createStructuredResponse } from "../../utils/response-builder.js";
import { SearchEventsResponse, StructuredEvent, convertGoogleEventToStructured, ExtendedEvent } from "../../types/structured-responses.js";
import { envelopeTextFor } from "../../utils/failure-envelope.js";

// Internal args type for searchEvents with single calendarId (after normalization)
interface SearchEventsArgs {
    calendarId: string;
    query: string;
    timeMin: string;
    timeMax: string;
    timeZone?: string;
    fields?: string[];
    privateExtendedProperty?: string[];
    sharedExtendedProperty?: string[];
}

export class SearchEventsHandler extends BaseToolHandler {
    async runTool(args: any, accounts: Map<string, OAuth2Client>): Promise<CallToolResult> {
        const validArgs = args as SearchEventsInput;

        // Normalize calendarId to always be an array for consistent processing
        const calendarNamesOrIds = Array.isArray(validArgs.calendarId)
            ? validArgs.calendarId
            : [validArgs.calendarId];

        // Get clients for specified accounts (supports single or multiple)
        const selectedAccounts = this.getClientsForAccounts(args.account, accounts);

        // For multi-account/multi-calendar queries, use CalendarRegistry routing
        let accountCalendarMap: Map<string, string[]>;
        const resolutionWarnings: string[] = [];

        if (selectedAccounts.size > 1 || calendarNamesOrIds.length > 1) {
            // Multi-account or multi-calendar: route calendars to their owning accounts
            const { resolved, warnings } = await this.calendarRegistry.resolveCalendarsToAccounts(
                calendarNamesOrIds,
                selectedAccounts
            );
            accountCalendarMap = resolved;
            resolutionWarnings.push(...warnings);

            // If no calendars could be resolved, throw error
            if (accountCalendarMap.size === 0) {
                await this.throwNoCalendarsFoundError(calendarNamesOrIds, selectedAccounts);
            }
        } else {
            // Single account + single calendar: use existing auto-selection for simplicity
            const { accountId, calendarId } = await this.getClientWithAutoSelection(
                args.account,
                calendarNamesOrIds[0],  // Use normalized single-element array
                accounts,
                'read'
            );
            accountCalendarMap = new Map([[accountId, [calendarId]]]);
        }

        // Search events from all calendars across all accounts
        const allEvents: ExtendedEvent[] = [];
        const queriedCalendarIds: string[] = [];
        const failures: unknown[] = [];

        await Promise.all(
            Array.from(accountCalendarMap.entries()).map(async ([accountId, calendarIds]) => {
                const client = selectedAccounts.get(accountId)!;
                for (const calendarId of calendarIds) {
                    try {
                        const events = await this.searchEvents(client, {
                            ...validArgs,
                            calendarId
                        });
                        // Tag events with account ID and calendar ID
                        for (const event of events) {
                            allEvents.push({
                                ...event,
                                calendarId,
                                accountId
                            });
                        }
                        queriedCalendarIds.push(calendarId);
                    } catch (error) {
                        // For multi-calendar, record the failure and continue
                        if (accountCalendarMap.size > 1 || calendarIds.length > 1) {
                            failures.push(error);
                            resolutionWarnings.push(
                                `Calendar "${calendarId}" on account "${accountId}" could not be searched: ` +
                                envelopeTextFor(error, `search calendar "${calendarId}"`)
                            );
                        } else {
                            throw error;
                        }
                    }
                }
            })
        );

        // No calendar could be searched at all: "no matches" would be a lie (rule 6).
        if (queriedCalendarIds.length === 0 && failures.length > 0) {
            throw this.toEnvelopeError(failures[0], 'search the events');
        }

        // Sort events chronologically
        this.sortEventsByStartTime(allEvents);

        // Convert to structured format
        const structuredEvents: StructuredEvent[] = allEvents.map(event =>
            convertGoogleEventToStructured(event, event.calendarId, event.accountId)
        );

        const response: SearchEventsResponse = {
            events: structuredEvents,
            totalCount: allEvents.length,
            query: validArgs.query,
            // For single calendar, include calendarId; for multiple, include calendars array
            ...(queriedCalendarIds.length === 1 && { calendarId: queriedCalendarIds[0] }),
            ...(queriedCalendarIds.length > 1 && { calendars: queriedCalendarIds }),
            ...(selectedAccounts.size > 1 && { accounts: Array.from(selectedAccounts.keys()) }),
            ...(resolutionWarnings.length > 0 && { warnings: resolutionWarnings })
        };

        if (validArgs.timeMin || validArgs.timeMax) {
            // Use first calendar's timezone as reference for response display
            const firstAccountId = accountCalendarMap.keys().next().value as string;
            const firstCalendarId = accountCalendarMap.get(firstAccountId)?.[0] || 'primary';
            const client = selectedAccounts.get(firstAccountId)!;
            const { timeMin, timeMax } = await this.normalizeTimeRange(
                client, firstCalendarId, validArgs.timeMin, validArgs.timeMax, validArgs.timeZone
            );
            response.timeRange = {
                start: timeMin || '',
                end: timeMax || ''
            };
        }

        return createStructuredResponse(response);
    }

    private async searchEvents(
        client: OAuth2Client,
        args: SearchEventsArgs
    ): Promise<calendar_v3.Schema$Event[]> {
        try {
            const calendar = this.getCalendar(client);

            // Normalize time range to RFC3339 format using calendar's timezone as fallback
            const { timeMin, timeMax } = await this.normalizeTimeRange(
                client, args.calendarId, args.timeMin, args.timeMax, args.timeZone
            );
            
            const fieldMask = buildListFieldMask(args.fields);
            
            const response = await calendar.events.list({
                calendarId: args.calendarId,
                q: args.query,
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: 'startTime',
                ...(fieldMask && { fields: fieldMask }),
                ...(args.privateExtendedProperty && { privateExtendedProperty: args.privateExtendedProperty as any }),
                ...(args.sharedExtendedProperty && { sharedExtendedProperty: args.sharedExtendedProperty as any })
            });
            return response.data.items || [];
        } catch (error) {
            throw this.handleGoogleApiError(error, `search calendar "${args.calendarId}"`);
        }
    }

}
