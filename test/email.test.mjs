import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { emailConfigured, signAcsRequest, sendSuggestionEmail } from '../api/src/lib/email.js';

test('ACS signing: headers, content hash and signature match the documented scheme', () => {
  const body = JSON.stringify({ a: 1 });
  const key = Buffer.from('test-key-material').toString('base64');
  const date = 'Tue, 17 Nov 2026 00:00:00 GMT';
  const h = signAcsRequest({ method: 'POST', pathAndQuery: '/emails:send?api-version=2023-03-31', host: 'x.communication.azure.com', body, key, date });
  assert.equal(h['x-ms-date'], date);
  assert.equal(h['x-ms-content-sha256'], createHash('sha256').update(body, 'utf8').digest('base64'));
  const stringToSign = `POST\n/emails:send?api-version=2023-03-31\n${date};x.communication.azure.com;${h['x-ms-content-sha256']}`;
  const sig = createHmac('sha256', Buffer.from(key, 'base64')).update(stringToSign, 'utf8').digest('base64');
  assert.equal(h.Authorization, `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${sig}`);
});

test('suggestion email is skipped, not failed, when ACS is not configured', async () => {
  for (const k of ['ACS_EMAIL_ENDPOINT', 'ACS_EMAIL_KEY', 'ACS_EMAIL_SENDER']) delete process.env[k];
  assert.equal(emailConfigured(), false);
  const r = await sendSuggestionEmail({ text: 'x', topic: '', userEmail: '', createdAt: '2026-11-17T00:00:00.000Z' });
  assert.equal(r.sent, false);
  assert.match(r.reason, /not configured/);
});
