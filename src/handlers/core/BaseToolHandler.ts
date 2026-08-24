import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { calendar_v3, google } from "googleapis";
import { getCredentialsProjectId } from "../../auth/utils.js";
import { CalendarRegistry } from "../../services/CalendarRegistry.js";
import { validateAccountId } from "../../auth/paths.js";
import { convertToRFC3339 } from "../../utils/datetime.js";
import {
    EnvelopeError,
    envelopeErrorFor,
    envelopeTextFor,
    isEnvelopeError,
    localEnvelopeError
} from "../../utils/failure-envelope.js";


export abstract class BaseToolHandler<TArgs = any> {
    protected calendarRegistry: CalendarRegistry = CalendarRegistry.getInstance();

    abstract runTool(args: TArgs, accounts: Map<string, OAuth2Client>): Promise<CallToolResult>;

    /**
     * Normalize account ID to lowercase for case-insensitive matching
     * @param accountId Account ID to normalize
     * @returns Lowercase account ID
     */
    private normalizeAccountId(accountId: string): string {
        return accountId.toLowerCase();
    }

    /**
     * Get OAuth2Client for a specific account, or the first available account if none specified.
     * Use this for read-only operations where any authenticated account will work.
     * @param accountId Optional account ID. If not provided, uses first available account.
     * @param accounts Map of available accounts
     * @returns OAuth2Client for the specified or first account
     * @throws EnvelopeError if account is invalid or not found
     */
    protected getClientForAccountOrFirst(accountId: string | undefined, accounts: Map<string, OAuth2Client>): OAuth2Client {
        // No accounts available
        if (accounts.size === 0) {
            throw localEnvelopeError(
                'no_credentials',
                'No Google account is connected to this server.'
            );
        }

        // Account ID specified - validate and retrieve
        if (accountId) {
            const normalizedId = this.normalizeAccountId(accountId);
            try {
                validateAccountId(normalizedId);
            } catch (error) {
                throw localEnvelopeError(
                    'bad_request',
                    'The account name is not a valid account name.',
                    error instanceof Error ? error.message : undefined
                );
            }

            const client = accounts.get(normalizedId);
            if (!client) {
                const availableAccounts = Array.from(accounts.keys()).join(', ');
                throw localEnvelopeError(
                    'account_not_found',
                    `There is no connected account called "${normalizedId}".`,
                    `Connected accounts: ${availableAccounts || 'none'}`
                );
            }
            return client;
        }

        // No account specified - use first available (sorted for consistency)
        const sortedAccountIds = Array.from(accounts.keys()).sort();
        const firstAccountId = sortedAccountIds[0];
        const client = accounts.get(firstAccountId);
        if (!client) {
            throw localEnvelopeError(
                'internal_error',
                'The connected account could not be loaded.'
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
    protected getClientForAccount(accountId: string | undefined, accounts: Map<string, OAuth2Client>): OAuth2Client {
        // No accounts available
        if (accounts.size === 0) {
            throw localEnvelopeError(
                'no_credentials',
                'No Google account is connected to this server.'
            );
        }

        // Account ID specified - validate and retrieve
        if (accountId) {
            // Normalize to lowercase for case-insensitive matching
            const normalizedId = this.normalizeAccountId(accountId);

            // Validate account ID format (after normalization)
            try {
                validateAccountId(normalizedId);
            } catch (error) {
                throw localEnvelopeError(
                    'bad_request',
                    'The account name is not a valid account name.',
                    error instanceof Error ? error.message : undefined
                );
            }

            // Get client for specified account
            const client = accounts.get(normalizedId);
            if (!client) {
                const availableAccounts = Array.from(accounts.keys()).join(', ');
                throw localEnvelopeError(
                    'account_not_found',
                    `There is no connected account called "${normalizedId}".`,
                    `Connected accounts: ${availableAccounts || 'none'}`
                );
            }

            return client;
        }

        // No account specified - use default behavior
        if (accounts.size === 1) {
            // Single account - use it automatically
            const firstClient = accounts.values().next().value;
            if (!firstClient) {
                throw localEnvelopeError(
                    'internal_error',
                    'The connected account could not be loaded.'
                );
            }
            return firstClient;
        }

        // Multiple accounts but no account specified - error
        const availableAccounts = Array.from(accounts.keys()).join(', ');
        throw localEnvelopeError(
            'account_required',
            'More than one Google account is connected, so the account to use was ambiguous.',
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
    protected getClientsForAccounts(
        accountIds: string | string[] | undefined,
        accounts: Map<string, OAuth2Client>
    ): Map<string, OAuth2Client> {
        // No accounts available
        if (accounts.size === 0) {
            throw localEnvelopeError(
                'no_credentials',
                'No Google account is connected to this server.'
            );
        }

        // Normalize to array
        const ids = this.normalizeAccountIds(accountIds);

        // If no specific accounts requested, use all available accounts
        if (ids.length === 0) {
            return accounts;
        }

        // Validate and retrieve specified accounts
        const result = new Map<string, OAuth2Client>();

        for (const id of ids) {
            // Normalize to lowercase for case-insensitive matching
            const normalizedId = this.normalizeAccountId(id);

            try {
                validateAccountId(normalizedId);
            } catch (error) {
                throw localEnvelopeError(
                    'bad_request',
                    'The account name is not a valid account name.',
                    error instanceof Error ? error.message : undefined
                );
            }

            const client = accounts.get(normalizedId);
            if (!client) {
                const availableAccounts = Array.from(accounts.keys()).join(', ');
                throw localEnvelopeError(
                    'account_not_found',
                    `There is no connected account called "${normalizedId}".`,
                    `Connected accounts: ${availableAccounts || 'none'}`
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
    protected async getAccountForCalendarAccess(
        calendarId: string,
        accounts: Map<string, OAuth2Client>,
        operation: 'read' | 'write'
    ): Promise<{ accountId: string; client: OAuth2Client } | null> {
        // Fast path for single account - skip calendar registry lookup
        if (accounts.size === 1) {
            const entry = accounts.entries().next().value;
            if (entry) {
                const [accountId, client] = entry;
                return { accountId, client };
            }
        }

        // Multi-account case - use calendar registry for permission-based selection
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
    protected async getClientWithAutoSelection(
        accountId: string | undefined,
        calendarNameOrId: string,
        accounts: Map<string, OAuth2Client>,
        operation: 'read' | 'write'
    ): Promise<{ client: OAuth2Client; accountId: string; calendarId: string; wasAutoSelected: boolean }> {
        // Account explicitly specified - use it
        if (accountId) {
            // Normalize account ID to lowercase
            const normalizedAccountId = this.normalizeAccountId(accountId);
            const client = this.getClientForAccount(normalizedAccountId, accounts);

            // If calendar looks like a name (not ID), resolve it using this account
            let resolvedCalendarId = calendarNameOrId;
            if (calendarNameOrId !== 'primary' && !calendarNameOrId.includes('@')) {
                resolvedCalendarId = await this.resolveCalendarId(client, calendarNameOrId);
            }

            return { client, accountId: normalizedAccountId, calendarId: resolvedCalendarId, wasAutoSelected: false };
        }

        // No account specified - use CalendarRegistry to resolve name and find best account
        const resolution = await this.calendarRegistry.resolveCalendarNameToId(
            calendarNameOrId,
            accounts,
            operation
        );

        if (!resolution) {
            // If an account could not be read at all, that failure is the real answer, not
            // "the calendar does not exist" (rule 6: a failure must never be reported as an absence).
            this.throwCalendarAccessFailureIfAny(`reach calendar "${calendarNameOrId}"`);
            const availableAccounts = Array.from(accounts.keys()).join(', ');
            const accessType = operation === 'write' ? 'write' : 'read';
            throw localEnvelopeError(
                'calendar_not_found',
                `No connected account has ${accessType} access to a calendar called "${calendarNameOrId}".`,
                `Connected accounts: ${availableAccounts}`
            );
        }

        const client = accounts.get(resolution.accountId);
        if (!client) {
            throw localEnvelopeError(
                'internal_error',
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
    protected normalizeAccountIds(accountIds: string | string[] | undefined): string[] {
        if (!accountIds) {
            return [];
        }
        return Array.isArray(accountIds) ? accountIds : [accountIds];
    }

    /**
     * Format a Google API failure as its envelope text without throwing.
     * Used when collecting failures in batch operations, where each item carries its own evidence.
     */
    protected formatGoogleApiError(error: unknown, action: string = 'complete the request'): string {
        return envelopeTextFor(error, action);
    }

    /**
     * Turns any failure from the Google API into the uniform envelope
     * (docs/MCP_FAILURE_ENVELOPE.md): `http_<status>`, the literal status line, and Google's
     * response body verbatim. Nothing here interprets the body: an expired credential and a
     * permission the account never had are both 403, and only the body separates them.
     */
    protected toEnvelopeError(error: unknown, action: string): EnvelopeError {
        return envelopeErrorFor(error, action);
    }

    protected handleGoogleApiError(error: unknown, action: string = 'complete the request'): never {
        throw this.toEnvelopeError(error, action);
    }

    protected getCalendar(auth: OAuth2Client): calendar_v3.Calendar {
        // Try to get project ID from credentials file for quota project header
        const quotaProjectId = getCredentialsProjectId();

        const config: any = {
            version: 'v3',
            auth,
            timeout: 3000 // 3 second timeout for API calls
        };

        // Add quota project ID if available
        if (quotaProjectId) {
            config.quotaProjectId = quotaProjectId;
        }

        return google.calendar(config);
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
    protected async setupOperation(
        accountId: string | undefined,
        calendarNameOrId: string,
        accounts: Map<string, OAuth2Client>,
        operation: 'read' | 'write'
    ): Promise<{
        client: OAuth2Client;
        calendar: calendar_v3.Calendar;
        accountId: string;
        calendarId: string;
    }> {
        const { client, accountId: selectedAccountId, calendarId: resolvedCalendarId } =
            await this.getClientWithAutoSelection(accountId, calendarNameOrId, accounts, operation);
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
    protected async getCalendarDetails(client: OAuth2Client, calendarId: string): Promise<calendar_v3.Schema$CalendarListEntry> {
        try {
            const calendar = this.getCalendar(client);
            const response = await calendar.calendarList.get({ calendarId });
            if (!response.data) {
                throw localEnvelopeError(
                    'unexpected_response',
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
    protected async getCalendarTimezone(client: OAuth2Client, calendarId: string): Promise<string> {
        try {
            const calendarDetails = await this.getCalendarDetails(client, calendarId);
            return calendarDetails.timeZone || 'UTC';
        } catch (error) {
            if (isEnvelopeError(error) && error.status === 404) {
                return 'UTC';
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
    protected async normalizeTimeRange(
        client: OAuth2Client,
        calendarId: string,
        timeMin?: string,
        timeMax?: string,
        timeZone?: string
    ): Promise<{ timeMin?: string; timeMax?: string; timezone: string }> {
        const timezone = timeZone || await this.getCalendarTimezone(client, calendarId);
        return {
            timeMin: timeMin ? convertToRFC3339(timeMin, timezone) : undefined,
            timeMax: timeMax ? convertToRFC3339(timeMax, timezone) : undefined,
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
    protected async resolveCalendarId(client: OAuth2Client, nameOrId: string): Promise<string> {
        // If it looks like an ID (contains @ or is 'primary'), return as-is
        if (nameOrId === 'primary' || nameOrId.includes('@')) {
            return nameOrId;
        }

        // Try to resolve as a calendar name by fetching calendar list
        try {
            const calendar = this.getCalendar(client);
            const response = await calendar.calendarList.list();
            const calendars = response.data.items || [];

            const lowerName = nameOrId.toLowerCase();

            // Priority 1: Exact match on summaryOverride (user's personal name)
            let match = calendars.find(cal => cal.summaryOverride === nameOrId);

            // Priority 2: Case-insensitive match on summaryOverride
            if (!match) {
                match = calendars.find(cal =>
                    cal.summaryOverride?.toLowerCase() === lowerName
                );
            }

            // Priority 3: Exact match on summary (calendar's actual title)
            if (!match) {
                match = calendars.find(cal => cal.summary === nameOrId);
            }

            // Priority 4: Case-insensitive match on summary
            if (!match) {
                match = calendars.find(cal =>
                    cal.summary?.toLowerCase() === lowerName
                );
            }

            if (match && match.id) {
                return match.id;
            }

            // Calendar name not found - provide helpful error message showing both summary and override
            const availableCalendars = calendars
                .map(cal => {
                    if (cal.summaryOverride && cal.summaryOverride !== cal.summary) {
                        return `"${cal.summaryOverride}" / "${cal.summary}" (${cal.id})`;
                    }
                    return `"${cal.summary}" (${cal.id})`;
                })
                .join(', ');

            throw localEnvelopeError(
                'calendar_not_found',
                `This account has no calendar called "${nameOrId}".`,
                `Calendars on this account: ${availableCalendars || 'none'}`
            );
        } catch (error) {
            if (isEnvelopeError(error)) {
                throw error;
            }
            throw this.handleGoogleApiError(error, 'list the calendars on this account');
        }
    }

    /**
     * If the calendar registry could not read one of the connected accounts, that HTTP failure is
     * the true answer to "why did we not find this calendar", and it is thrown with its own
     * envelope. Silence here would report a broken account as an empty calendar list.
     */
    protected throwCalendarAccessFailureIfAny(action: string): void {
        const failure = this.calendarRegistry.getLastAccessFailure();
        if (!failure) return;
        throw this.toEnvelopeError(failure.error, action);
    }

    /**
     * Sorts events by start time (chronological order).
     * Works with both regular events and extended events.
     * Mutates the array in place and returns it for chaining.
     */
    protected sortEventsByStartTime<T extends calendar_v3.Schema$Event>(events: T[]): T[] {
        return events.sort((a, b) => {
            const aStart = a.start?.dateTime || a.start?.date || '';
            const bStart = b.start?.dateTime || b.start?.date || '';
            return aStart.localeCompare(bStart);
        });
    }

    /**
     * Throws an error when no calendars could be resolved from multi-account resolution.
     * Provides a helpful error message listing available calendars.
     */
    protected async throwNoCalendarsFoundError(
        requestedCalendars: string[],
        selectedAccounts: Map<string, OAuth2Client>
    ): Promise<never> {
        const allCalendars = await this.calendarRegistry.getUnifiedCalendars(selectedAccounts);
        // An account that could not be read is a failure, not an absence.
        this.throwCalendarAccessFailureIfAny('find the requested calendars');
        const calendarList = allCalendars.map(c => `"${c.displayName}" (${c.calendarId})`).join(', ');
        throw localEnvelopeError(
            'calendar_not_found',
            `None of the requested calendars exist on the connected accounts: ${requestedCalendars.map(c => `"${c}"`).join(', ')}.`,
            `Available calendars: ${calendarList || 'none'}`
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
    protected async resolveCalendarIds(client: OAuth2Client, namesOrIds: string[]): Promise<string[]> {
        // Filter out empty/whitespace-only strings
        const validInputs = namesOrIds.filter(item => item && item.trim().length > 0);

        if (validInputs.length === 0) {
            throw localEnvelopeError(
                'bad_request',
                'No calendar was named in the request.'
            );
        }

        // Quick check: if all inputs look like IDs, skip the API call
        const needsResolution = validInputs.some(item =>
            item !== 'primary' && !item.includes('@')
        );

        if (!needsResolution) {
            // All inputs are already IDs, return as-is
            return validInputs;
        }

        // Batch resolve all calendars at once by fetching calendar list once
        const calendar = this.getCalendar(client);
        const response = await calendar.calendarList.list();
        const calendars = response.data.items || [];

        // Build name-to-ID mappings for efficient lookup
        // Priority: summaryOverride takes precedence over summary
        const overrideToIdMap = new Map<string, string>();
        const summaryToIdMap = new Map<string, string>();
        const lowerOverrideToIdMap = new Map<string, string>();
        const lowerSummaryToIdMap = new Map<string, string>();

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

        const resolvedIds: string[] = [];
        const errors: string[] = [];

        for (const nameOrId of validInputs) {
            // If it looks like an ID (contains @ or is 'primary'), use as-is
            if (nameOrId === 'primary' || nameOrId.includes('@')) {
                resolvedIds.push(nameOrId);
                continue;
            }

            const lowerName = nameOrId.toLowerCase();

            // Priority 1: Exact match on summaryOverride
            let id = overrideToIdMap.get(nameOrId);

            // Priority 2: Case-insensitive match on summaryOverride
            if (!id) {
                id = lowerOverrideToIdMap.get(lowerName);
            }

            // Priority 3: Exact match on summary
            if (!id) {
                id = summaryToIdMap.get(nameOrId);
            }

            // Priority 4: Case-insensitive match on summary
            if (!id) {
                id = lowerSummaryToIdMap.get(lowerName);
            }

            if (id) {
                resolvedIds.push(id);
            } else {
                errors.push(nameOrId);
            }
        }

        // If any calendars couldn't be resolved, throw error with helpful message
        if (errors.length > 0) {
            const availableCalendars = calendars
                .map(cal => {
                    if (cal.summaryOverride && cal.summaryOverride !== cal.summary) {
                        return `"${cal.summaryOverride}" / "${cal.summary}" (${cal.id})`;
                    }
                    return `"${cal.summary}" (${cal.id})`;
                })
                .join(', ');

            throw localEnvelopeError(
                'calendar_not_found',
                `This account has no calendar called ${errors.map(e => `"${e}"`).join(', ')}.`,
                `Calendars on this account: ${availableCalendars || 'none'}`
            );
        }

        return resolvedIds;
    }

}
