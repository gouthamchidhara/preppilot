# Security review, 19 Nov 2026

## Secrets
- Repository and full git history scanned for API keys, tokens, private keys and connection strings: none found.
- The only key-like value in history is the RevenueCat iOS **public** SDK key (`appl_…`). It is designed to ship inside the app; not a secret.
- All real secrets live in Azure Static Web Apps application settings (encrypted at rest, never in git):
  `AZURE_OPENAI_API_KEY`, `SESSION_SECRET`, `STORAGE_CONNECTION_STRING`, `REVENUECAT_WEBHOOK_AUTH`, plus non-secret config.
- CI secrets (`AZURE_STATIC_WEB_APPS_API_TOKEN`, `EXPO_TOKEN`, `ASC_*`) are GitHub Actions secrets.
- `.gitignore` covers `.env`, `api/.env`, `api/local.settings.json`, `*.p12`, `*.pfx`, keystores.

## Fixed in this review
- Job focus tickets were signed with a fixed fallback (`dev-only-secret`) if `SESSION_SECRET` was missing. They now use the same secret rules as sign-in sessions (random per process when unset, never a known value).
- Added `Strict-Transport-Security` (HSTS) to the site headers.

## Checked, no change needed
- Every paid or AI endpoint requires sign-in and is rate-limited; Pro features are checked on the server.
- `/api/fresh` is public but only serves 23 known roles from a cache (one AI call per role per day).
- RevenueCat webhook uses a constant-time secret comparison.
- Content Security Policy blocks third-party scripts (only Google sign-in allowed), framing is denied, mic only on our own pages.
- User text is escaped before it is put on the page (chat, cards, floating window).
- API dependencies: `npm audit` clean. Mobile: 3 moderate findings in build-time tooling (`minimatch`), not shipped in the app.
- GitHub workflows use least-privilege `permissions` (read-only except the daily refresh, which commits content).

## Recommended next steps
1. **Azure Key Vault**: Key Vault references for app settings need the Static Web Apps **Standard** plan (about $9/month) with a managed identity. The site is on the **Free** plan today, so settings stay as encrypted app settings. When you upgrade, move `AZURE_OPENAI_API_KEY`, `SESSION_SECRET`, `STORAGE_CONNECTION_STRING` and `REVENUECAT_WEBHOOK_AUTH` into a vault and point the settings at it.
2. **Rotate the Azure OpenAI key** every few months (Azure portal → the OpenAI resource → Keys → regenerate key 2, update the app setting, then regenerate key 1).
3. A personal email address is the default recipient for user suggestions in `api/src/lib/email.js`. Set `SUGGESTIONS_EMAIL` in Azure and remove the default if you'd rather keep it out of the code.
4. `REVENUECAT_SECRET_KEY` is empty in Azure; purchase refresh falls back to webhooks. Add it when you want instant purchase checks.
