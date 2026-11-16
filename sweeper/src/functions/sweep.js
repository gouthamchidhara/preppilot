import { app } from '@azure/functions';
import { sweepCalls } from '../lib/account.js';
import { hangupCall } from '../lib/realtime.js';

// Every minute: hang up voice calls whose reserved (paid) time has run out.
// Without this, a modified client could keep a call open past its allowance.
app.timer('sweep', {
  schedule: '0 */1 * * * *',
  handler: async (_timer, ctx) => {
    const n = await sweepCalls(hangupCall);
    if (n) ctx.log(`hung up ${n} overdue call(s)`);
  },
});
