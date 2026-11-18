# PrepPilot: what is still pending

Snapshot: 17 November 2026, after the custom domain (`preppilot.us`) went live and Google sign-in was fixed.
Full background for each item: `docs/LAUNCH-CHECKLIST.md`. Tick items here as they are done and commit.

Status in one line: the site and app work; **paid purchases do not unlock anything yet**, because RevenueCat is not connected to the server.

## 0. Site down (18 November, from about 05:00 UTC)

- [ ] **Every address returns Azure's generic "404: Not found"**, including `/api/health`, on `preppilot.us`, `www` and `lively-pond-0ad55040f.8.azurestaticapps.net`. GitHub deploy runs 55, 56 (branch) and 57 (`main`, known-good content) all report "Deployment Complete" to the right site, yet nothing is served. Not caused by code: redeploying `main` gives the same 404. Check in the Azure Portal:
  - Static Web App `swa-preppilot-cmncqy5swqngi` → Environments: does Production show a recent deployment and status Ready?
  - Activity log on the resource and resource group: any change since 17 November evening (plan, environments, deletion, custom domain, "default domain")?
  - Subscription: Active, no spending limit hit or disabled state.
  - Service Health: any Static Web Apps incident in East US 2.
  - Last resort: `./deploy.ps1` redeploys the infrastructure and content.

## 1. Before anyone can pay

- [x] **Merge `claude/eloquent-pasteur-wdc9yd` into `main`.** Done 17 November 2026 (fast-forward to `a31efcf`); Azure now serves `main`. (The Google sign-in fix `ffb3865` is in.)
- [x] **RevenueCat: entitlement `pro`** exists and contains `pro_monthly`. Done 17 November 2026.
- [x] **RevenueCat: Current offering** has a Monthly package for `pro_monthly` and a package for `mock_session_60min`. Done 17 November 2026 (offering `default`, 4 packages).
- [ ] **RevenueCat: webhook** URL `https://preppilot.us/api/billing/revenuecat`, Authorization header equal to the Azure setting `REVENUECAT_WEBHOOK_AUTH`. Send RevenueCat's test event; the API should answer 200.
- [ ] **Azure: `REVENUECAT_SECRET_KEY`** set to RevenueCat's secret API key (currently empty). Used right after a purchase to unlock Pro or the session.
- [ ] **App Store Connect: `pro_monthly`** at $10.99/month (current amount not confirmed).
- [ ] **App Store Connect: `mock_session_60min`** at $15.99; display name and description "Live AI, 60 minutes". Keep the product id.
- [ ] **App Store Connect: Paid Apps agreement** Active (Agreements, Tax and Banking).
- [ ] **New iOS build** to TestFlight (`docs/IOS-RELEASE-RUNBOOK.md`, workflow "iOS release"). The current build predates the purchase fixes, light/dark colours, badge and notifications.
- [ ] **App Store Connect: App Privacy answers** match `web/privacy.html` (updated 17 November).
- [ ] **TestFlight purchase test** with a sandbox account: buy Pro, buy a Live AI session, Restore purchases, and check the AI page shows "Unlimited" and "2 of 2" Live AI sessions.

## 2. Email

- [ ] **`support@preppilot.us` receives mail.** DNS (MX, SPF, DKIM) and the routing rule are correct. Check in Cloudflare → Email Routing:
  - the `support@` rule's Status toggle is on;
  - Destination addresses shows `palpriya0825@gmail.com` as **Verified** (resend the verification if Pending);
  - Settings says Email Routing is Enabled with no DNS warning;
  - Activity log after a test from a different mailbox: nothing listed (sender side; retry after 30 minutes from a personal mailbox), Forwarded (check Gmail Spam and All Mail), or Rejected/Dropped (read the reason).
- [ ] Optional: DMARC record, TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:palpriya0825@gmail.com`.
- [ ] **App suggestion emails:** create Azure Communication Services + Email Communication Services, add `preppilot.us` (records go in Cloudflare, DNS only) or use the Azure-managed domain, then set `ACS_EMAIL_ENDPOINT`, `ACS_EMAIL_KEY`, `ACS_EMAIL_SENDER`, `SUGGESTIONS_EMAIL`. Until then suggestions are stored but not emailed.

## 3. Owner focus items

- [x] **Hide "During your interview" on iPhone** with a server setting (for example `LIVE_INTERVIEW_IOS=off` returned by `/api/health`), default off for App Review. Done 17 November 2026: `/api/health` returns `liveInterviewIos` (on only when `LIVE_INTERVIEW_IOS=on`); the option is hidden in `liveSetupSheet()`, `livePromo()` and the Pricing table / "Live AI in your interview" section in `plansView()` when off. Landing page needed no change (it never mentions the mode).
- [x] **Support page** `web/support.html` (does not exist yet; `/support.html` currently shows the home page). Contact `support@preppilot.us`, how to cancel Pro, restore purchases, delete the account, what Live AI includes, refunds through Apple. Done 17 November 2026; linked from Profile and Pricing. Setting it as the Support URL in App Store Connect still needs an Apple sign-in (blocked from Muse's browser).
- [ ] **Costs:** after the first 20 to 30 Live AI sessions, compare Azure Cost Management (Azure OpenAI resource) with `docs/COST-AND-PRICING.md`.
- [ ] **Budget alert** email reaches you.
- [ ] **`ADMIN_EMAILS`** contains only your own addresses (they get unlimited access).

## Done (for reference)

Custom domain and HTTPS on `preppilot.us` and `www`; Google sign-in fixed (referrer policy); privacy policy updated; native icon and splash; beta access code removed; sign-in, AI, storage and price settings checked; sweeper running; content spot-check; field cards, lesson flow and analogies for all 72 topics.
