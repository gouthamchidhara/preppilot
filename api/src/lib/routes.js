import * as h from './handlers.js';

// "METHOD route" -> handler(req, log). Routes are relative to /api/.
export const ROUTES = {
  'GET health': () => h.handleHealth(),
  'GET me': h.handleMe,
  'POST me/delete': h.handleDeleteAccount,
  'POST auth/google': (req, log) => h.handleAuth('google', req, log),
  'POST auth/apple': (req, log) => h.handleAuth('apple', req, log),
  'POST chat': h.handleChat,
  'POST generate': h.handleGenerate,
  'POST realtime': h.handleRealtime,
  'POST realtime/end': h.handleRealtimeEnd,
  'POST billing/revenuecat': h.handleRevenueCatWebhook,
  'POST billing/refresh': h.handleBillingRefresh,
  'POST telemetry/role': h.handleRoleTelemetry,
};
