import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { BaseToolHandler } from "./BaseToolHandler.js";
import { calendar_v3 } from 'googleapis';
import { buildSingleEventFieldMask } from "../../utils/field-mask-builder.js";
import { createStructuredResponse } from "../../utils/response-builder.js";
import { GetEventResponse, convertGoogleEventToStructured } from "../../types/structured-responses.js";
import { localEnvelopeError } from "../../utils/failure-envelope.js";

interface GetEventArgs {
    calendarId: string;
    eventId: string;
    fields?: string[];
    account?: string;
}

export class GetEventHandler extends BaseToolHandler {
    async runTool(args: GetEventArgs, accounts: Map<string, OAuth2Client>): Promise<CallToolResult> {
        const validArgs = args;

        // Get OAuth2Client with automatic account selection for read operations
        // Also resolves calendar name to ID if a name was provided
        const { client: oauth2Client, accountId: selectedAccountId, calendarId: resolvedCalendarId } = await this.getClientWithAutoSelection(
            args.account,
            validArgs.calendarId,
            accounts,
            'read'
        );

        try {
            // Get the event with resolved calendar ID
            const argsWithResolvedCalendar = { ...validArgs, calendarId: resolvedCalendarId };
            const event = await this.getEvent(oauth2Client, argsWithResolvedCalendar);

            const response: GetEventResponse = {
                event: convertGoogleEventToStructured(event, resolvedCalendarId, selectedAccountId)
            };

            return createStructuredResponse(response);
        } catch (error) {
            throw this.handleGoogleApiError(error, `read event "${validArgs.eventId}"`);
        }
    }

    private async getEvent(
        client: OAuth2Client,
        args: GetEventArgs
    ): Promise<calendar_v3.Schema$Event> {
        const calendar = this.getCalendar(client);

        const fieldMask = buildSingleEventFieldMask(args.fields);

        // A 404 used to be turned into null and then re-thrown as a bare Error, which threw away
        // the status and Google's body. It is a failure like any other, and it carries its
        // evidence (docs/MCP_FAILURE_ENVELOPE.md).
        const response = await calendar.events.get({
            calendarId: args.calendarId,
            eventId: args.eventId,
            ...(fieldMask && { fields: fieldMask })
        });

        if (!response.data) {
            throw localEnvelopeError(
                'unexpected_response',
                `Google returned no event for id "${args.eventId}".`
            );
        }

        return response.data;
    }
}
