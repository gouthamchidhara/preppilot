# PrepPilot — Deployment & App Store Submission Guide

> **For AI agents (Claude Cloud, etc.):** This file is a step-by-step runbook. Follow it top-to-bottom. Do NOT skip steps. All commands run from `C:\Projects\PrepPilot` (or the cloned repo root on Linux/macOS).

---

## Prerequisites

| Requirement | Check |
|---|---|
| Node.js ≥ 20 | `node --version` |
| Git | `git --version` |
| EAS CLI | `npx eas-cli --version` (or `eas --version` if globally installed) |
| Expo account | `eas whoami` → should return `gchid` |
| Apple Developer account | Active Paid Apps Agreement in App Store Connect |
| Repo | `gouthamchidhara/preppilot` on GitHub |

---

## Phase 1: Clone & Verify

```bash
git clone https://github.com/gouthamchidhara/preppilot.git
cd preppilot
npm install
npm test
```

**Expected:** 34 tests pass (1 skipped). If any fail, STOP and fix before continuing.

---

## Phase 2: EAS Login

```bash
# If not logged in:
npx eas-cli login
# Enter Expo credentials (account: gchid, email: gvgsgoutham@gmail.com)
# If you don't have the password, ask the user to run this step manually.

# Verify:
npx eas-cli whoami
# Should output: gchid
```

**Important:** On Windows with corporate SSL, you may need:
```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED = '0'
```

---

## Phase 3: Verify iOS Credentials

```bash
cd mobile
npx eas-cli credentials --platform ios
# This is INTERACTIVE. Select:
#   1. "Set up Distribution Certificate" → "Use existing" (cert is already on Expo server)
#   2. "Set up Provisioning Profile" → "Use existing" (profile is already on Expo server)
#
# If credentials are missing, select "Generate new" for both.
# You'll need to log in to your Apple account when prompted.
```

**Expected output:**
```
Distribution Certificate  Serial Number: 49C0CD18...  Expiration: Jun 2027
Provisioning Profile      Developer Portal ID: 9SXJZ99MUK  Status: active
```

---

## Phase 4: Build for iOS

```bash
cd mobile

# Set environment for TLS issues (Windows):
export NODE_TLS_REJECT_UNAUTHORIZED=0   # Linux/macOS
# $env:NODE_TLS_REJECT_UNAUTHORIZED = '0'   # PowerShell

# Skip fingerprint computation (can be slow):
export EAS_SKIP_AUTO_FINGERPRINT=1

# Build (this uploads project to EAS and starts a cloud build):
npx eas-cli build -p ios --profile production
```

**What happens:**
1. Compresses project files (~1 MB)
2. Uploads to EAS Build
3. Starts an iOS build on Apple's build servers
4. Returns a build URL like: `https://expo.dev/accounts/gchid/projects/preppilot/builds/<id>`
5. Build takes **15-30 minutes**

**Monitor the build:**
```bash
npx eas-cli build:list --platform ios --limit 1
# Or visit the build URL in a browser
```

**Build completes when status = "FINISHED".**

---

## Phase 5: Submit to TestFlight

```bash
# Option A: Auto-submit right after build completes
npx eas-cli build -p ios --profile production --auto-submit-with-profile production

# Option B: Submit a specific build
npx eas-cli submit -p ios --latest
# Or by build ID:
npx eas-cli submit -p ios --id <build-id>
```

**What happens:**
1. Downloads the IPA from EAS
2. Uploads it to App Store Connect via App Store Connect API
3. Build appears in TestFlight within **5-30 minutes**
4. Apple may run a brief automated review before TestFlight availability

**Verify in App Store Connect:**
- Go to: `https://appstoreconnect.apple.com/apps/6835532732/testflight`
- The build should appear under "Builds" with a version like `1.0 (7)`

---

## Phase 6: TestFlight Configuration

After the build appears in TestFlight:

1. **Add testers:** App Store Connect → TestFlight → Add testers (email or internal group)
2. **What to test:** Sign in, study plan, flashcards, AI chat, voice modes, Live coach practice test
3. **Build notes:** "Multi-role interview prep with AI coaching, voice practice, and live coach practice tests"

---

## Phase 7: Push Code Changes

If you made any code changes:

```bash
cd /path/to/preppilot
git add -A
git commit -m "description of changes"

# Include Co-authored-by trailer:
git commit -m "Your message" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

git push origin main
```

**CI/CD:** Every push to `main` auto-deploys the web app to Azure Static Web Apps via GitHub Actions. Tests run automatically.

---

## Phase 8: App Store Submission (Production)

When ready to submit for App Review (not just TestFlight):

1. **App Store Connect** → App 6835532732 → **1.0 Prepare for Submission**
2. Fill in:
   - App description, keywords, screenshots (6.7" and 5.5" iPhone)
   - Privacy policy URL: `https://lively-pond-0ad55040f.8.azurestaticapps.net/privacy.html`
   - Support URL: `https://github.com/gouthamchidhara/preppilot/issues`
3. **Attach IAP:** Add `mock_session_60min` and the `pro_monthly` subscription to the review
4. **App Review notes:**
   > PrepPilot is a free interview-prep study app. AI coaching requires sign-in (Google or Apple) and includes a free trial. Pro ($11.99/month) is an auto-renewing subscription. Live coach ($10.99) is a consumable one-time purchase: a practice test, not help during a real interview. Voice mode uses the microphone. Account deletion: Profile → Delete account.
5. **Submit for Review**

---

## Key IDs Reference

| Item | Value |
|---|---|
| Bundle ID | `com.gchid.preppilot` |
| App Store Connect App ID | `6835532732` |
| EAS Project ID | `2d0fc27c-f525-4610-895b-72c66b08815b` |
| EAS Project Slug | `@gchid/preppilot` |
| Apple Team ID | `KSD8FCH7C9` |
| Web App URL | `https://lively-pond-0ad55040f.8.azurestaticapps.net` |
| GitHub Repo | `gouthamchidhara/preppilot` |
| Azure Resource Group | `rg-preppilot` |
| Google OAuth Web Client | `372383686135-jj1mv49jbskilvqk6qfiqguh4uqjkdl5.apps.googleusercontent.com` |
| Google OAuth iOS Client | `372383686135-dvfs7h64g3vlnhkclilepbjtrnah55rd.apps.googleusercontent.com` |

## Products

| Product ID | Type | Price | Description |
|---|---|---|---|
| `pro_monthly` | Subscription (auto-renew) | $11.99/month | 500 AI messages + 30 voice min/month |
| `mock_session_60min` | Consumable | $10.99 | One 60-min Live coach practice test (rejoinable within the hour) |

## Troubleshooting

| Problem | Fix |
|---|---|
| `unable to get local issuer certificate` | Set `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| `Distribution Certificate is not validated` | Run `eas credentials --platform ios` interactively and select "Use existing" or "Generate new" |
| Build fingerprint timeout | Set `EAS_SKIP_AUTO_FINGERPRINT=1` |
| `--non-interactive` flag not recognized | Use `CI=1` env var instead |
| 405 Method Not Allowed on sign-in | Google GSI must use `ux_mode: 'popup'` (redirect sends POST which Azure SWA rejects) |
| `redirect_uri_mismatch` | Register both `https://<domain>` and `https://<domain>/` (with trailing slash) in Google Cloud Console |
| TestFlight build not appearing | Wait 30 min; check App Store Connect → TestFlight → Builds tab |
| RevenueCat webhook not firing | Verify webhook URL and auth token in RevenueCat dashboard → Integrations → Webhooks |

---

## File Map

```
preppilot/
├── web/                    # PWA frontend (vanilla JS)
│   ├── index.html
│   ├── app.css             # UI styles
│   └── js/                 # app.js, auth.js, plan.js, etc.
├── api/                    # Azure Functions API (Node 20)
│   └── src/lib/            # handlers.js, auth.js, billing.js, account.js
├── mobile/                 # Expo native shell
│   ├── App.tsx             # WebView + native auth/purchases
│   ├── app.config.js       # Expo config
│   ├── app.settings.json   # Public IDs (client IDs, RevenueCat keys)
│   └── eas.json            # Build profiles
├── infra/                  # Azure Bicep IaC
│   └── main.bicep
├── docs/                   # Documentation
│   ├── COST-AND-PRICING.md
│   └── PLAN-MULTI-ROLE.md
├── scripts/                # Content generation & validation
└── deploy.ps1              # Azure deployment script
```
