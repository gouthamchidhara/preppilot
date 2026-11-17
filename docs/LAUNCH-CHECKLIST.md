# PrepPilot: production launch checklist

Written 17 November 2026. Work branch: `claude/eloquent-pasteur-wdc9yd` (Azure currently serves this branch). Tick items as they are done and commit the change, so whoever picks this up next sees the current state.

Owner handles item 7. The assistant is handling the other items, with owner input for sign-in, secrets, legal agreements and purchases.

## Execution status (17 November 2026)

- Launch updates and the animated signed-out landing callout were published to `main` at `ff59390`; GitHub Actions deployment `44119581127` succeeded. The deployed JavaScript/CSS and API health were verified at the Azure hostname.
- Cloudflare website CNAMEs for `preppilot.us` and `www.preppilot.us` point to Azure in DNS-only mode. Both Azure custom domains report `Ready`; the apex verification TXT is at `@`, separate from SPF. Both new Google OAuth JavaScript origins are saved; an interactive sign-in test is still needed. Existing native builds keep the Azure URL.
- Native iOS icon/splash updated from the current paper-plane brand: 1024 x 1024 RGB PNGs, no alpha. A new native build/upload is still pending.
- Privacy text now reflects role suggestions, guide submissions, audio streaming, fresh scenarios and actual account-deletion retention. App Store privacy answers still need checking.
- Azure checks: OAuth audiences match the public app configuration; session secret is at least 32 characters; AI/storage settings exist; model deployments succeeded. This does not substitute for device sign-in or sandbox purchase testing.
- Beta `ACCESS_CODE` is absent. Sweeper is Running, enabled on a one-minute schedule, and its storage/OpenAI settings match the API. Runtime timer state recorded Last `2026-11-17T15:16:00Z`, Next `2026-11-17T15:17:00Z`.
- Billing audit: App Store Connect has `pro_monthly` at Prepare for Submission and `mock_session_60min` as a consumable draft. The subscription currently advertises 500 AI messages and 45 voice minutes, which doesn't match the plan below. Paid Apps agreement status could not be verified because the Agreements page did not render its contents. RevenueCat's active `default` offering has 3 packages, but entitlement `interview_preppilot_pro` is attached to Test Store products (`monthly`, `yearly`, `lifetime`), not the App Store products; no RevenueCat webhook is configured.
- Azure billing: `REVENUECAT_WEBHOOK_AUTH` is present, but `REVENUECAT_SECRET_KEY` is configured with an empty value. A local code change makes health report `payments: false` unless both backend credentials are set; it is not deployed yet and still cannot confirm the RevenueCat webhook itself is configured.
- Budget is configured at $20/month with enabled actual-80% and forecast-100% alerts. Current spend observed was about $1.22; forecast was unavailable. Alert delivery and real per-session cost comparison are not yet verified.
- The App Store subscription has a current price schedule covering 175 regions, but the amount could not be read. The Paid Apps agreement page did not render its status. RevenueCat's App Store product list is empty; its importer sees `pro_monthly` as Missing metadata, while the catalog currently contains only Test Store products. Never paste secret keys into chat.
- iOS build alternative: Azure DevOps can run Xcode on a Microsoft-hosted macOS agent, so no persistent App Service is needed. This repo has no Azure DevOps pipeline configured; replacing EAS still requires a DevOps organization with hosted-agent quota, Apple signing assets in secure storage, and a successful TestFlight trial. Keep EAS until that trial passes.
- Owner purchased `preppilot.us` and configured Cloudflare Email Routing for `support@preppilot.us`. Destination verification and routing rule were checked; end-to-end email delivery is not yet confirmed. Never paste secret keys into chat.
- Spot-checked Go and JavaScript/TypeScript field cards and their lesson flow/Next hooks; reviewed all 26 analogies. Corrected Go loop capture, slice sharing, errgroup and scheduler explanations, plus TLS, Kubernetes, JVM, C# and TypeScript analogies. Validators pass: 924 field cards and 98 flow/meaning entries; 73 tests pass.

## Must do before launch

### 1. Merge the branch into `main`
- [x] Merge `claude/eloquent-pasteur-wdc9yd` into `main`.
- Why: Azure is serving the branch. Every push to `main` triggers `.github/workflows/deploy.yml`, so pushing anything to `main` before the merge puts the old app back live.
- After the merge, all work happens on `main` (or short branches merged into it).

### 2. Store setup (App Store Connect and RevenueCat)
- [ ] App Store Connect: verify `pro_monthly` (auto-renewing subscription) is priced at **$10.99/month**. A current price exists, but its amount was not readable in the dashboard snapshot.
- [ ] App Store Connect: `mock_session_60min` (consumable) priced at **$15.99**. Keep the product id; change its display name and description to "Live AI, 60 minutes" (users see the name, never the id). Current draft name is "Interview 60min".
- [ ] Paid Apps agreement is Active (Agreements, Tax and Banking).
- [ ] RevenueCat: create/fix entitlement `pro` and attach the App Store product `pro_monthly`; ensure the Current offering has a package for `pro_monthly` (Monthly type) and one for `mock_session_60min`. Current entitlement is `interview_preppilot_pro` with Test Store products only.
- [ ] RevenueCat webhook: create URL `<live site>/api/billing/revenuecat`, with Authorization header equal to the Azure setting `REVENUECAT_WEBHOOK_AUTH`. No webhook currently exists.
- [ ] Azure setting `REVENUECAT_SECRET_KEY` has a non-empty RevenueCat secret (used by `/api/billing/refresh` after a purchase). The setting currently exists but is empty; never paste secret keys into chat.
- What Pro includes (keep store descriptions in line with this): unlimited AI messages (fair use 150 a day, 2,000 a month), two 30-minute Live AI sessions a month, every topic, card and diagram, plus terminology, troubleshooting and real-scenario cards. No separate voice minutes.

### 3. New iOS build
- [ ] Build and upload a new build. The current TestFlight build predates changes in `mobile/App.tsx` (purchase package selection, cancelled-purchase signal, light and dark colours, app icon badge and daily notifications).
- How: `docs/IOS-RELEASE-RUNBOOK.md` sets up the one-click "iOS release" workflow (`.github/workflows/ios-release.yml`); `docs/DEPLOY-AND-SUBMIT.md` has the manual commands.
- [x] Replace the old blue "P" in the native iOS icon and splash images in `mobile/assets/`.

### 4. Update the privacy policy (`web/privacy.html`)
- [x] Update the date and AI wording, and document:
  - Pasted experience or résumé summary is sent to Azure OpenAI to suggest roles (signed-in users, on request only).
  - Guide suggestions are stored (Table Storage) and emailed to the team when email delivery is configured.
  - Live AI "During your interview" mode streams microphone audio, which can include the other people on the call, to Azure OpenAI for the length of the session; PrepPilot does not record or store audio, but retains call metadata for accounting.
  - "Fresh from the field" scenarios are generated per role and contain no user data.
- [ ] Make the App Store privacy answers (App Privacy section) match the policy.

### 5. Turn off the beta access code
- [x] Remove or empty `ACCESS_CODE` in the Azure Static Web App settings. Anyone with the code gets unlimited AI and every locked topic.

### 6. Check the Azure settings
- [x] Sign-in: `GOOGLE_CLIENT_IDS`, `GOOGLE_WEB_CLIENT_ID`, `APPLE_AUDIENCES`, `SESSION_SECRET` (at least 32 characters; audiences checked against app configuration).
- [x] AI: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_REALTIME_DEPLOYMENT`, `AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT`.
- [x] Storage: `STORAGE_CONNECTION_STRING` (users, usage, calls, suggestions, fresh scenarios; new tables are created on first use).
- [x] Billing webhook authorization: `REVENUECAT_WEBHOOK_AUTH` is present (RevenueCat webhook is still not configured).
- [ ] Billing refresh: `REVENUECAT_SECRET_KEY` is non-empty.
- [ ] Guide-suggestion email: `ACS_EMAIL_ENDPOINT`, `ACS_EMAIL_KEY`, `ACS_EMAIL_SENDER`, `SUGGESTIONS_EMAIL` (palpriya0825@gmail.com). Without these, suggestions are stored but no email is sent.
- [ ] `ADMIN_EMAILS`: only addresses that should get unlimited access.
- [x] Price labels: leave `PRO_PRICE_LABEL` and `LIVE_PRICE_LABEL` unset (defaults are $10.99/month and $15.99) or set them to match the store exactly.
- Quick check: `curl <live site>/api/health` shows `voice: true`, `payments: true`, the Google client id, and the plan numbers.

## Owner focus

### 7. A switch to hide "During your interview" on iPhone
- [ ] Add a server setting (for example `LIVE_INTERVIEW_IOS=off`), returned by `/api/health`, that hides the "During your interview" option and its wording in the iOS app without a new build. Default it to off for App Review.
- Why: it is the feature most likely to be rejected (apps that help during a live assessment). With the switch you can pass review, then turn it on, or turn it off quickly if Apple objects later.
- Where: the option is in `liveSetupSheet()` in `web/js/app.js`; the wording also appears in `livePromo()`, the landing page, and the Pricing table and "Live AI in your interview" section in `plansView()`. The native app sets `window.PP_PLATFORM` to `ios`.

### 8. Check the sweeper is deployed and running
- [x] Confirm the Function App `func-pp-sweeper-<suffix>` exists in `rg-preppilot` and its timer runs every minute (`sweeper/src/functions/sweep.js`).
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
- [x] Read 10 to 15 cards from selected technologies in each new file type and fix anything wrong:
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
- Tests: `npm test` (73 tests). Local run: `npm run dev`, then http://localhost:5173.
