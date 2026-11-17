# PrepPilot: production launch checklist

Written 17 November 2026. Work branch: `claude/eloquent-pasteur-wdc9yd` (Azure currently serves this branch). Tick items as they are done and commit the change, so whoever picks this up next sees the current state.

Owner focus: items 7, 8, 9, 10 and 11.

## Must do before launch

### 1. Merge the branch into `main`
- [ ] Merge `claude/eloquent-pasteur-wdc9yd` into `main`.
- Why: Azure is serving the branch. Every push to `main` triggers `.github/workflows/deploy.yml`, so pushing anything to `main` before the merge puts the old app back live.
- After the merge, all work happens on `main` (or short branches merged into it).

### 2. Store setup (App Store Connect and RevenueCat)
- [ ] App Store Connect: `pro_monthly` (auto-renewing subscription) priced at **$10.99/month**.
- [ ] App Store Connect: `mock_session_60min` (consumable) priced at **$15.99**. Keep the product id; change its display name and description to "Live AI, 60 minutes" (users see the name, never the id).
- [ ] Paid Apps agreement is Active (Agreements, Tax and Banking).
- [ ] RevenueCat: entitlement `pro` contains `pro_monthly`; the Current offering has a package for `pro_monthly` (Monthly type) and one for `mock_session_60min`.
- [ ] RevenueCat webhook: URL `<live site>/api/billing/revenuecat`, Authorization header equal to the Azure setting `REVENUECAT_WEBHOOK_AUTH`.
- [ ] Azure setting `REVENUECAT_SECRET_KEY` is set (used by `/api/billing/refresh` after a purchase).
- What Pro includes (keep store descriptions in line with this): unlimited AI messages (fair use 150 a day, 2,000 a month), two 30-minute Live AI sessions a month, every topic, card and diagram, plus terminology, troubleshooting and real-scenario cards. No separate voice minutes.

### 3. New iOS build
- [ ] Build and upload a new build. The current TestFlight build predates changes in `mobile/App.tsx` (purchase package selection, cancelled-purchase signal, light and dark colours, app icon badge and daily notifications).
- How: `docs/IOS-RELEASE-RUNBOOK.md` sets up the one-click "iOS release" workflow (`.github/workflows/ios-release.yml`); `docs/DEPLOY-AND-SUBMIT.md` has the manual commands.
- [ ] Native icon and splash images in `mobile/assets/` still show the old blue "P"; replace before submitting.

### 4. Update the privacy policy (`web/privacy.html`)
- [ ] Still dated 16 November 2026 and still says "coach". Add:
  - Pasted experience or résumé summary is sent to Azure OpenAI to suggest roles (signed-in users, on request only).
  - Guide suggestions are stored (Table Storage) and emailed to the team.
  - Live AI "During your interview" mode streams microphone audio, which can include the other people on the call, to Azure OpenAI for the length of the session; nothing is recorded or stored by PrepPilot.
  - "Fresh from the field" scenarios are generated per role and contain no user data.
- [ ] Make the App Store privacy answers (App Privacy section) match the policy.

### 5. Turn off the beta access code
- [ ] Remove or empty `ACCESS_CODE` in the Azure Static Web App settings. Anyone with the code gets unlimited AI and every locked topic.

### 6. Check the Azure settings
- [ ] Sign-in: `GOOGLE_CLIENT_IDS`, `GOOGLE_WEB_CLIENT_ID`, `APPLE_AUDIENCES`, `SESSION_SECRET` (long and random).
- [ ] AI: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_REALTIME_DEPLOYMENT`, `AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT`.
- [ ] Storage: `STORAGE_CONNECTION_STRING` (users, usage, calls, suggestions, fresh scenarios; new tables are created on first use).
- [ ] Billing: `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_SECRET_KEY`.
- [ ] Guide-suggestion email: `ACS_EMAIL_ENDPOINT`, `ACS_EMAIL_KEY`, `ACS_EMAIL_SENDER`, `SUGGESTIONS_EMAIL` (palpriya0825@gmail.com). Without these, suggestions are stored but no email is sent.
- [ ] `ADMIN_EMAILS`: only addresses that should get unlimited access.
- [ ] Price labels: leave `PRO_PRICE_LABEL` and `LIVE_PRICE_LABEL` unset (defaults are $10.99/month and $15.99) or set them to match the store exactly.
- Quick check: `curl <live site>/api/health` shows `voice: true`, `payments: true`, the Google client id, and the plan numbers.

## Owner focus

### 7. A switch to hide "During your interview" on iPhone
- [ ] Add a server setting (for example `LIVE_INTERVIEW_IOS=off`), returned by `/api/health`, that hides the "During your interview" option and its wording in the iOS app without a new build. Default it to off for App Review.
- Why: it is the feature most likely to be rejected (apps that help during a live assessment). With the switch you can pass review, then turn it on, or turn it off quickly if Apple objects later.
- Where: the option is in `liveSetupSheet()` in `web/js/app.js`; the wording also appears in `livePromo()`, the landing page, and the Pricing table and "Live AI in your interview" section in `plansView()`. The native app sets `window.PP_PLATFORM` to `ios`.

### 8. Check the sweeper is deployed and running
- [ ] Confirm the Function App `func-pp-sweeper-<suffix>` exists in `rg-preppilot` and its timer runs every minute (`sweeper/src/functions/sweep.js`).
- Why: it hangs up voice calls whose paid time is over. The browser stops on time on its own, but a modified client could keep a call open without the sweeper.
- Note: the normal deploy (`deploy.yml`) ships only `web/` and `api/`; the sweeper is defined in `infra/main.bicep` and deployed by `deploy.ps1`. It needs the same `STORAGE_CONNECTION_STRING` and Azure OpenAI settings as the API.

### 9. Watch real costs
- [ ] After the first 20 to 30 Live AI sessions, open Azure Cost Management, filter on the Azure OpenAI resource, and compare with `docs/COST-AND-PRICING.md` (estimates: 30-minute call about $0.80 to $1.80, 60-minute call about $2 to $4).
- [ ] Make sure the budget alert email (set by `deploy.ps1 -BudgetEmail`) reaches you.
- Levers if costs run high, all Azure settings, no code change: `PRO_MSGS_PER_DAY` (150), `PRO_MSGS` (2,000), `PRO_LIVE_SEC` (1,800), `PRO_LIVE_SESSIONS` (2), `LIVE_CALL_SEC` (3,600), `FREE_MSGS` (15), `FREE_VOICE_SEC` (120), `FREE_DAILY_MSGS` and `FREE_DAILY_VOICE_SEC` (global free pool per day), `RATE_*_PER_HOUR`, `FRESH_TTL_HOURS` (6).

### 10. A real support page
- [ ] Replace the support URL (currently GitHub issues) with a simple page, for example `web/support.html`, with a contact email and short answers: how to cancel Pro, restore purchases, delete the account, what Live AI sessions include, refunds go through Apple.
- [ ] Use its URL in App Store Connect (Support URL) and link it from Profile and Pricing.

### 11. Spot-check the AI-written content
- [ ] Read 10 to 15 cards from your own technologies in each new file type and fix anything wrong:
  - `web/content/field/<pack>.json`: terminology, troubleshooting and real scenarios (about 900 cards, written by helper agents; Git was checked).
  - `web/content/flow/<pack>.json`: lesson order and the "Next" line on each card.
  - `scripts/analogies.mjs`: the 26 analogies (rerun `node scripts/analogies.mjs` after editing).
- Validate after edits: `node scripts/validate-field.mjs`, `node scripts/validate-flow.mjs`, `npm test`.
- Users can flag mistakes with "Report a problem" on every card (opens a GitHub issue).

## Fine to launch without; add later
- Web payments: web visitors cannot buy; they are sent to the iPhone app. RevenueCat Web Billing or Stripe would add this.
- Android: `revenueCatAndroidKey` in `mobile/app.settings.json` is empty, so Android purchases do not work yet.
- Analytics: nothing measures landing → sign-up → paywall → purchase. RevenueCat covers purchases; add something light for the funnel.
- Server-side content locks: Free/Pro locks on lessons, cards and diagrams are enforced in the app; the content files are public. AI usage is enforced on the server.
- Rate limits are kept in memory per server instance and reset on restart; fine at launch scale.
- Résumé file upload (PDF): users paste text for now.

## Where things are
- Product and pricing reasoning: `docs/PRODUCT-STRATEGY.md`, `docs/COST-AND-PRICING.md`.
- Content rules: `docs/CONTENT-BRIEF.md`, `docs/FIELD-BRIEF.md`.
- Deploy and store submission: `docs/DEPLOY-AND-SUBMIT.md`, `docs/IOS-RELEASE-RUNBOOK.md`.
- Tests: `npm test` (72 tests). Local run: `npm run dev`, then http://localhost:5173.
