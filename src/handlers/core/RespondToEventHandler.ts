import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { BaseToolHandler } from "./BaseToolHandler.js";
import { calendar_v3 } from 'googleapis';
import { createStructuredResponse } from "../../utils/response-builder.js";
import { RespondToEventResponse, convertGoogleEventToStructured } from "../../types/structured-responses.js";
import { RecurringEventHelpers, RecurringEventError, RECURRING_EVENT_ERRORS } from './RecurringEventHelpers.js';
import { isEnvelopeError, localEnvelopeError } from "../../utils/failure-envelope.js";

export type RespondToEventInput = {
    calendarId: string;
    eventId: string;
    response: "accepted" | "declined" | "tentative" | "needsAction";
    comment?: string;
    modificationScope?: "thisEventOnly" | "all";
    originalStartTime?: string;
    sendUpdates?: "all" | "externalOnly" | "none";
    account?: string;
};

export class RespondToEventHandler extends BaseToolHandler {
    async runTool(args: RespondToEventInput, accounts: Map<string, OAuth2Client>): Promise<CallToolResult> {
        const validArgs = args;

        // Setup write operation: get client, calendar API, and resolve calendar name to ID
        const { calendar, accountId: selectedAccountId, calendarId: resolvedCalendarId } =
            await this.setupOperation(args.account, validArgs.calendarId, accounts, 'write');

        try {
            const helpers = new RecurringEventHelpers(calendar);

            // 1. Determine the target event ID (may be instance-specific for recurring events)
            let targetEventId = validArgs.eventId;

            // Handle recurring event scopes
            if (validArgs.modificationScope === 'thisEventOnly') {
                if (!validArgs.originalStartTime) {
                    throw new RecurringEventError(
                        'originalStartTime is required when modificationScope is "thisEventOnly"',
                        RECURRING_EVENT_ERRORS.MISSING_ORIGINAL_TIME
                    );
                }

                // Detect if event is recurring
                const eventType = await helpers.detectEventType(validArgs.eventId, resolvedCalendarId);
                if (eventType !== 'recurring') {
                    throw new RecurringEventError(
                        'modificationScope "thisEventOnly" can only be used with recurring events',
                        RECURRING_EVENT_ERRORS.NON_RECURRING_SCOPE
                    );
                }

                // Format instance ID for single instance response
                targetEventId = helpers.formatInstanceId(validArgs.eventId, validArgs.originalStartTime);
            } else if (validArgs.modificationScope === 'all') {
                // Extract base event ID by removing instance suffix if present
                // Instance IDs have format: baseId_YYYYMMDDTHHMMSSZ
                // Base IDs have no underscore, so split is safe for both cases
                targetEventId = validArgs.eventId.split('_')[0];
            }
            // If no scope specified, default to 'all' behavior (use base event ID)

            // 2. Get the event to find the current user's attendee entry
            const eventResponse = await calendar.events.get({
                calendarId: resolvedCalendarId,
                eventId: targetEventId
            });

            const event = eventResponse.data;
            if (!event) {
                throw localEnvelopeError(
                    'unexpected_response',
                    `Google returned no event for id "${targetEventId}".`
                );
            }

            // 3. Find the authenticated user's attendee entry (marked with self: true)
            const attendees = event.attendees || [];
            const selfAttendeeIndex = attendees.findIndex(a => a.self === true);

            if (selfAttendeeIndex === -1) {
                throw localEnvelopeError(
                    'not_an_attendee',
                    'The response was not recorded because this account is not an attendee of the event.'
                );
            }

            const selfAttendee = attendees[selfAttendeeIndex];

            // 4. Check if user is the organizer (organizers don't respond to their own events)
            if (selfAttendee.organizer === true) {
                throw localEnvelopeError(
                    'is_organizer',
                    'The response was not recorded because this account is the organizer of the event.'
                );
            }

            // 5. Update the response status and optionally comment for the authenticated user
            const updatedAttendees = [...attendees];
            updatedAttendees[selfAttendeeIndex] = {
                ...selfAttendee,
                responseStatus: validArgs.response,
                ...(validArgs.comment !== undefined && { comment: validArgs.comment })
            };

            // 6. Patch the event with the updated attendee list
            const actualSendUpdates = validArgs.sendUpdates || "none";
            const updateResponse = await calendar.events.patch({
                calendarId: resolvedCalendarId,
                eventId: targetEventId,
                requestBody: {
                    attendees: updatedAttendees
                },
                sendUpdates: actualSendUpdates
            });

            if (!updateResponse.data) {
                throw localEnvelopeError('unexpected_response', 'Google accepted the response but returned nothing.');
            }

            // 7. Create structured response
            let message = `Your response has been set to "${validArgs.response}"`;
            if (validArgs.modificationScope === 'thisEventOnly') {
                message += ' for this instance only';
            } else if (validArgs.modificationScope === 'all') {
                message += ' for all instances';
            }
            if (validArgs.comment) {
                message += ` with note: "${validArgs.comment}"`;
            }

            const response: RespondToEventResponse = {
                event: convertGoogleEventToStructured(updateResponse.data, resolvedCalendarId, selectedAccountId),
                responseStatus: validArgs.response,
                sendUpdates: actualSendUpdates,
                message: message
            };

            return createStructuredResponse(response);
        } catch (error: any) {
            if (isEnvelopeError(error)) {
                throw error;
            }
            throw this.handleGoogleApiError(error, `respond to event "${validArgs.eventId}"`);
        }
    }
}
