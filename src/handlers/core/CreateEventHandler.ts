import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { CreateEventInput } from "../../tools/registry.js";
import { BaseToolHandler } from "./BaseToolHandler.js";
import { calendar_v3 } from 'googleapis';
import { createTimeObject } from "../../utils/datetime.js";
import { validateEventId } from "../../utils/event-id-validator.js";
import { ConflictDetectionService } from "../../services/conflict-detection/index.js";
import { CONFLICT_DETECTION_CONFIG } from "../../services/conflict-detection/config.js";
import { createStructuredResponse, convertConflictsToStructured, createWarningsArray } from "../../utils/response-builder.js";
import { CreateEventResponse, convertGoogleEventToStructured } from "../../types/structured-responses.js";
import { localEnvelopeError } from "../../utils/failure-envelope.js";

export class CreateEventHandler extends BaseToolHandler {
    private conflictDetectionService: ConflictDetectionService;
    
    constructor() {
        super();
        this.conflictDetectionService = new ConflictDetectionService();
    }
    
    async runTool(args: any, accounts: Map<string, OAuth2Client>): Promise<CallToolResult> {
        const validArgs = args as CreateEventInput;

        // Get OAuth2Client with automatic account selection for write operations
        // Also resolves calendar name to ID if a name was provided
        const { client: oauth2Client, accountId: selectedAccountId, calendarId: resolvedCalendarId } = await this.getClientWithAutoSelection(
            args.account,
            validArgs.calendarId,
            accounts,
            'write'
        );

        // Validate primary calendar requirement for outOfOffice and workingLocation events
        if (validArgs.eventType === 'outOfOffice' || validArgs.eventType === 'workingLocation') {
            if (resolvedCalendarId !== 'primary' && !resolvedCalendarId.includes('@')) {
                const eventTypeName = validArgs.eventType === 'outOfOffice' ? 'Out of Office' : 'Working Location';
                throw localEnvelopeError(
                    'bad_request',
                    `${eventTypeName} events can only be created on the primary calendar, and "${resolvedCalendarId}" is not it.`
                );
            }
        }

        // Create the event object for conflict checking
        const timezone = args.timeZone || await this.getCalendarTimezone(oauth2Client, resolvedCalendarId);
        const eventToCheck: calendar_v3.Schema$Event = {
            summary: args.summary,
            description: args.description,
            start: createTimeObject(args.start, timezone),
            end: createTimeObject(args.end, timezone),
            attendees: args.attendees,
            location: args.location,
        };
        
        // Check for conflicts and duplicates using resolved calendar ID
        const conflicts = await this.conflictDetectionService.checkConflicts(
            oauth2Client,
            eventToCheck,
            resolvedCalendarId,
            {
                checkDuplicates: true,
                checkConflicts: true,
                calendarsToCheck: validArgs.calendarsToCheck || [resolvedCalendarId],
                duplicateSimilarityThreshold: validArgs.duplicateSimilarityThreshold || CONFLICT_DETECTION_CONFIG.DEFAULT_DUPLICATE_THRESHOLD
            }
        );

        // Block creation if exact or near-exact duplicate found
        const exactDuplicate = conflicts.duplicates.find(
            dup => dup.event.similarity >= CONFLICT_DETECTION_CONFIG.DUPLICATE_THRESHOLDS.BLOCKING
        );

        if (exactDuplicate && validArgs.allowDuplicates !== true) {
            throw localEnvelopeError(
                'duplicate_event',
                `The event was not created because "${exactDuplicate.event.title}" already exists and is ${Math.round(exactDuplicate.event.similarity * 100)}% similar.`,
                `Set allowDuplicates to true to create it anyway.`
            );
        }

        // Create the event with resolved calendar ID
        const argsWithResolvedCalendar = { ...validArgs, calendarId: resolvedCalendarId };
        const event = await this.createEvent(oauth2Client, argsWithResolvedCalendar);

        // Generate structured response with conflict warnings
        const structuredConflicts = convertConflictsToStructured(conflicts);
        const response: CreateEventResponse = {
            event: convertGoogleEventToStructured(event, resolvedCalendarId, selectedAccountId),
            conflicts: structuredConflicts.conflicts,
            duplicates: structuredConflicts.duplicates,
            warnings: createWarningsArray(conflicts)
        };

        return createStructuredResponse(response);
    }

    private async createEvent(
        client: OAuth2Client,
        args: CreateEventInput
    ): Promise<calendar_v3.Schema$Event> {
        try {
            const calendar = this.getCalendar(client);
            
            // Validate custom event ID if provided
            if (args.eventId) {
                validateEventId(args.eventId);
            }
            
            // Use provided timezone or calendar's default timezone
            const timezone = args.timeZone || await this.getCalendarTimezone(client, args.calendarId);

            // Determine transparency and visibility based on event type
            const { transparency, visibility } = this.getEventTypeDefaults(args);

            // Generate summary for workingLocation if not provided
            const summary = args.eventType === 'workingLocation' && !args.summary
                ? this.generateWorkingLocationSummary(args)
                : args.summary;

            const requestBody: calendar_v3.Schema$Event = {
                summary: summary,
                description: args.description,
                start: createTimeObject(args.start, timezone),
                end: createTimeObject(args.end, timezone),
                attendees: args.attendees,
                location: args.location,
                colorId: args.colorId,
                reminders: args.reminders,
                recurrence: args.recurrence,
                transparency: transparency,
                visibility: visibility,
                guestsCanInviteOthers: args.guestsCanInviteOthers,
                guestsCanModify: args.guestsCanModify,
                guestsCanSeeOtherGuests: args.guestsCanSeeOtherGuests,
                anyoneCanAddSelf: args.anyoneCanAddSelf,
                conferenceData: args.conferenceData,
                extendedProperties: args.extendedProperties,
                attachments: args.attachments,
                source: args.source,
                eventType: args.eventType,
                ...(args.eventId && { id: args.eventId }), // Include custom ID if provided
                ...(args.focusTimeProperties && { focusTimeProperties: args.focusTimeProperties }),
                ...(args.eventType === 'outOfOffice' && { outOfOfficeProperties: this.buildOutOfOfficeProperties(args) }),
                ...(args.eventType === 'workingLocation' && { workingLocationProperties: this.buildWorkingLocationProperties(args) })
            };
            
            // Determine if we need to enable conference data or attachments
            const conferenceDataVersion = args.conferenceData ? 1 : undefined;
            const supportsAttachments = args.attachments ? true : undefined;
            
            const response = await calendar.events.insert({
                calendarId: args.calendarId,
                requestBody: requestBody,
                sendUpdates: args.sendUpdates,
                ...(conferenceDataVersion && { conferenceDataVersion }),
                ...(supportsAttachments && { supportsAttachments })
            });
            
            if (!response.data) {
                throw localEnvelopeError('unexpected_response', 'Google accepted the event but returned nothing.');
            }
            return response.data;
        } catch (error: any) {
            // A 409 (the event id is taken) is an ordinary HTTP failure and keeps Google's body,
            // which used to be replaced by an invented sentence.
            throw this.handleGoogleApiError(error, 'create the event');
        }
    }

    /**
     * Get default transparency and visibility based on event type
     */
    private getEventTypeDefaults(args: CreateEventInput): {
        transparency: string | undefined;
        visibility: string | undefined;
    } {
        // Use explicit values if provided
        let transparency = args.transparency;
        let visibility = args.visibility;

        switch (args.eventType) {
            case 'focusTime':
            case 'outOfOffice':
                // Focus Time and Out of Office block time by default
                if (!transparency) transparency = 'opaque';
                break;
            case 'workingLocation':
                // Working Location events are visible but don't block time
                if (!transparency) transparency = 'transparent';
                if (!visibility) visibility = 'public';
                break;
        }

        return { transparency, visibility };
    }

    /**
     * Build outOfOfficeProperties from args
     */
    private buildOutOfOfficeProperties(args: CreateEventInput): calendar_v3.Schema$EventOutOfOfficeProperties {
        const props = args.outOfOfficeProperties;
        return {
            autoDeclineMode: props?.autoDeclineMode || 'declineAllConflictingInvitations',
            ...(props?.declineMessage && { declineMessage: props.declineMessage })
        };
    }

    /**
     * Build workingLocationProperties from args
     */
    private buildWorkingLocationProperties(args: CreateEventInput): calendar_v3.Schema$EventWorkingLocationProperties {
        const props = args.workingLocationProperties;
        if (!props) {
            throw localEnvelopeError(
                'bad_request',
                'A workingLocation event was requested without workingLocationProperties.'
            );
        }

        const properties: calendar_v3.Schema$EventWorkingLocationProperties = {
            type: props.type
        };

        switch (props.type) {
            case 'homeOffice':
                properties.homeOffice = {};
                break;
            case 'officeLocation':
                properties.officeLocation = props.officeLocation || {};
                break;
            case 'customLocation':
                properties.customLocation = props.customLocation || {};
                break;
        }

        return properties;
    }

    /**
     * Generate summary for working location events if not provided
     */
    private generateWorkingLocationSummary(args: CreateEventInput): string {
        const props = args.workingLocationProperties;
        if (!props) return 'Working location';

        switch (props.type) {
            case 'homeOffice':
                return 'Working from home';
            case 'officeLocation':
                return props.officeLocation?.label
                    ? `Working from ${props.officeLocation.label}`
                    : 'Working from office';
            case 'customLocation':
                return props.customLocation?.label
                    ? `Working from ${props.customLocation.label}`
                    : 'Working from custom location';
            default:
                return 'Working location';
        }
    }
}
