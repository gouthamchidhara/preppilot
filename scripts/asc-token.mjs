// Makes a 20-minute App Store Connect API pass so Claude can check (and, with your OK, fix)
// prices and product details. Nothing is sent anywhere; it only prints the pass.
//   node scripts/asc-token.mjs <path-to-AuthKey_XXXX.p8> <KEY_ID> <ISSUER_ID>
// Paste the printed pass into the secure form Claude opens (never into the chat).
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const [file, kid, iss] = process.argv.slice(2);
if (!file || !kid || !iss) {
  console.error('Usage: node scripts/asc-token.mjs <AuthKey_XXXX.p8> <KEY_ID> <ISSUER_ID>');
  process.exit(1);
}
const b64u = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = b64u({ alg: 'ES256', kid, typ: 'JWT' });
const body = b64u({ iss, iat: now, exp: now + 19 * 60, aud: 'appstoreconnect-v1' });
const sig = createSign('SHA256').update(`${head}.${body}`).sign({ key: readFileSync(file), dsaEncoding: 'ieee-p1363' }).toString('base64url');
console.log(`\nApp Store Connect pass (valid 19 minutes):\n\n${head}.${body}.${sig}\n`);
