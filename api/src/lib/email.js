// Outgoing email via Azure Communication Services Email, plain REST + HMAC-SHA256 signing.
// No SDK dependency: the ACS email SDK would add a package for one call a day.
// Config (server-side only; none of these reach the client):
//   ACS_EMAIL_ENDPOINT  e.g. https://preppilot.communication.azure.com
//   ACS_EMAIL_KEY       the Communication Services access key (base64)
//   ACS_EMAIL_SENDER    a verified sender address, e.g. DoNotReply@<domain>.azurecomm.net
//   SUGGESTIONS_EMAIL   where guide suggestions go (default palpriya0825@gmail.com)
// Without the ACS settings, sending is skipped and the caller stores the
// suggestion anyway — the API reports emailed: false instead of failing.
import { createHash, createHmac } from 'node:crypto';

const API_VERSION = '2023-03-31';

export const suggestionsEmail = () => process.env.SUGGESTIONS_EMAIL || 'palpriya0825@gmail.com';

export function emailConfigured() {
  return !!(process.env.ACS_EMAIL_ENDPOINT && process.env.ACS_EMAIL_KEY && process.env.ACS_EMAIL_SENDER);
}

// Pure signing step, exported so tests can check it without sending mail.
// StringToSign = VERB\npathAndQuery\n{date};{host};{contentHash}
// (Microsoft Learn: Azure Communication Services authentication.)
export function signAcsRequest({ method, pathAndQuery, host, body, key, date = new Date().toUTCString() }) {
  const contentHash = createHash('sha256').update(body, 'utf8').digest('base64');
  const stringToSign = `${method}\n${pathAndQuery}\n${date};${host};${contentHash}`;
  const signature = createHmac('sha256', Buffer.from(key, 'base64')).update(stringToSign, 'utf8').digest('base64');
  return {
    'x-ms-date': date,
    'x-ms-content-sha256': contentHash,
    Authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
  };
}

export async function sendSuggestionEmail({ text, topic, userEmail, createdAt }) {
  if (!emailConfigured()) return { sent: false, reason: 'email not configured' };
  const endpoint = process.env.ACS_EMAIL_ENDPOINT.replace(/\/$/, '');
  const url = new URL(`${endpoint}/emails:send?api-version=${API_VERSION}`);
  const body = JSON.stringify({
    senderAddress: process.env.ACS_EMAIL_SENDER,
    content: {
      subject: `PrepPilot guide suggestion${topic ? `: ${topic}` : ''}`,
      plainText: `New guide suggestion from ${userEmail || 'a signed-in user'} (${createdAt}):\n\n${text}`,
    },
    recipients: { to: [{ address: suggestionsEmail() }] },
  });
  const headers = signAcsRequest({
    method: 'POST', pathAndQuery: `${url.pathname}${url.search}`, host: url.host,
    body, key: process.env.ACS_EMAIL_KEY,
  });
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { sent: false, reason: `ACS ${res.status} ${detail.slice(0, 200)}` };
  }
  return { sent: true };
}
