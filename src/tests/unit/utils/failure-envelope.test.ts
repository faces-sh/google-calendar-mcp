import { describe, it, expect } from 'vitest';
import {
  MAX_BODY_CHARS,
  capBody,
  envelopeErrorFor,
  envelopeTextFor,
  formatEnvelope,
  httpEnvelopeError,
  localEnvelopeError,
  redactSecrets,
  statusLineFor,
  toEnvelopeResult
} from '../../../utils/failure-envelope.js';

// The contract these tests hold the server to is docs/MCP_FAILURE_ENVELOPE.md.

describe('failure envelope', () => {
  describe('shape', () => {
    it('is [code] sentence, then the literal status line, then the body verbatim', () => {
      const text = formatEnvelope({
        code: 'http_403',
        summary: 'Could not edit the document: the account does not have permission to change it.',
        statusLine: 'HTTP 403 Forbidden',
        body: '{"error":{"code":403,"message":"The caller does not have permission","status":"PERMISSION_DENIED"}}'
      });

      expect(text).toBe(
        '[http_403] Could not edit the document: the account does not have permission to change it.\n' +
        'HTTP 403 Forbidden\n' +
        '{"error":{"code":403,"message":"The caller does not have permission","status":"PERMISSION_DENIED"}}'
      );
    });

    it('puts the code first, with nothing before it', () => {
      const text = httpEnvelopeError({ action: 'list the events', status: 401 }).envelope;
      expect(text.startsWith('[http_401] ')).toBe(true);
    });

    it('omits the status line entirely when the failure was not HTTP (rule 4)', () => {
      const text = localEnvelopeError('no_credentials', 'No Google account is connected to this server.').envelope;
      expect(text).toBe('[no_credentials] No Google account is connected to this server.');
      expect(text).not.toContain('HTTP');
    });

    it('uses the literal reason phrase the transport reported', () => {
      expect(statusLineFor(429, 'Too Many Requests')).toBe('HTTP 429 Too Many Requests');
      expect(statusLineFor(404)).toBe('HTTP 404 Not Found');
    });
  });

  describe('the body (rule 5)', () => {
    it('is passed through byte for byte', () => {
      const body = '{"error":{"code":429,"message":"Quota exceeded for quota metric \'Queries\'","status":"RESOURCE_EXHAUSTED"}}';
      expect(httpEnvelopeError({ action: 'list the events', status: 429, body }).envelope).toContain(body);
    });

    it('is capped at 4000 characters and says so', () => {
      const long = 'x'.repeat(MAX_BODY_CHARS + 500);
      const capped = capBody(long);
      expect(capped.length).toBe(MAX_BODY_CHARS + ' ...[truncated]'.length);
      expect(capped.endsWith(' ...[truncated]')).toBe(true);
    });
  });

  describe('secrets (rule 8)', () => {
    it('redacts tokens and credentials but keeps the rest of the body', () => {
      const body = JSON.stringify({
        error: 'invalid_grant',
        error_description: 'Token has been expired or revoked.',
        access_token: 'ya29.a0AfH6SMB-secret-value',
        refresh_token: '1//0gSECRETREFRESH',
        client_secret: 'GOCSPX-do-not-print-me',
        client_id: '1234.apps.googleusercontent.com'
      });

      const redacted = redactSecrets(body);

      expect(redacted).not.toContain('ya29.a0AfH6SMB-secret-value');
      expect(redacted).not.toContain('1//0gSECRETREFRESH');
      expect(redacted).not.toContain('GOCSPX-do-not-print-me');
      expect(redacted).not.toContain('1234.apps.googleusercontent.com');
      expect(redacted).toContain('<redacted>');
      // The part that tells the caller what happened is untouched.
      expect(redacted).toContain('"error":"invalid_grant"');
      expect(redacted).toContain('Token has been expired or revoked.');
    });

    it('redacts Authorization and Cookie headers', () => {
      const echoed = [
        'POST /batch/calendar/v3 HTTP/1.1',
        'Authorization: Bearer ya29.a0AfH6SMB-secret-value',
        'Cookie: SID=abc123; HSID=def456',
        'Content-Type: application/json'
      ].join('\n');

      const redacted = redactSecrets(echoed);

      expect(redacted).toContain('Authorization: <redacted>');
      expect(redacted).toContain('Cookie: <redacted>');
      expect(redacted).not.toContain('ya29.a0AfH6SMB-secret-value');
      expect(redacted).not.toContain('SID=abc123');
      expect(redacted).toContain('Content-Type: application/json');
    });

    it('redacts a bearer token anywhere in the text', () => {
      expect(redactSecrets('failed with Bearer ya29.SECRET here')).toBe('failed with Bearer <redacted> here');
    });

    it('redacts through the envelope, not only through the helper', () => {
      const text = httpEnvelopeError({
        action: 'refresh the credentials',
        status: 400,
        body: '{"access_token":"ya29.SECRET","error":"invalid_grant"}'
      }).envelope;

      expect(text).not.toContain('ya29.SECRET');
      expect(text).toContain('"error":"invalid_grant"');
    });
  });

  describe('mapping any failure', () => {
    it('reads the status and body off a googleapis error', () => {
      const error: any = new Error('Request failed with status code 403');
      error.response = {
        status: 403,
        statusText: 'Forbidden',
        data: { error: { code: 403, message: 'The caller does not have permission' } }
      };

      const envelope = envelopeErrorFor(error, 'delete the event');

      expect(envelope.envelopeCode).toBe('http_403');
      expect(envelope.statusLine).toBe('HTTP 403 Forbidden');
      expect(envelope.envelope).toContain('"message":"The caller does not have permission"');
    });

    it('never invents a status for a transport failure', () => {
      const error: any = new Error('connect ECONNREFUSED 142.250.72.10:443');
      error.code = 'ECONNREFUSED';

      const text = envelopeTextFor(error, 'list the events');

      expect(text.startsWith('[network_error] ')).toBe(true);
      expect(text).not.toContain('HTTP ');
    });

    it('marks a timeout as a timeout', () => {
      const error: any = new Error('timeout of 3000ms exceeded');
      error.code = 'ETIMEDOUT';
      expect(envelopeErrorFor(error, 'list the events').envelopeCode).toBe('timeout');
    });
  });

  describe('the MCP result (rule 1)', () => {
    it('always sets isError and leads the text with the code', () => {
      const result = toEnvelopeResult(
        localEnvelopeError('no_credentials', 'No Google account is connected to this server.'),
        'list the events'
      );

      expect(result.isError).toBe(true);
      expect((result.content as any)[0].text).toBe('[no_credentials] No Google account is connected to this server.');
    });
  });
});
