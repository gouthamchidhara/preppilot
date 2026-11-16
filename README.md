# PrepPilot

Personalized interview prep for infrastructure, cloud, SRE, DevOps, networking and IT-ops roles.
Users set a short profile (target role, level, background, self-rated strengths/weaknesses, interview date) and get:

- **A day-by-day plan** ordered by role relevance and their weak spots, ending with mock-interview days.
- **Learn cards** (what / why / example / what to say) and **flashcards** with spaced repetition, filtered to their level.
- **An AI coach** (chat + voice) for instant answers, "go deeper" on any card, answer grading and mock interviews.
- **AI-generated card sets** for any topic not covered (e.g. "Splunk SPL", "Terraform state").
- **Private packs**: import your own JSON pack (projects, STAR stories). It stays on the device.

No accounts. Profile and progress live in the browser/device (localStorage). Only chat text, the profile summary
and the current card are sent to the API when the user asks the AI something.

## Architecture

```
iOS / Android (Capacitor shell)  ─┐
Browser / installed PWA          ─┼─HTTPS─> Azure Static Web Apps (Free)
                                  │          ├─ web/        static PWA (no build step)
                                  │          └─ api/        managed Azure Functions (Node 20)
                                  │                 /api/chat  /api/generate  /api/health
                                  │                       │ api-key (app setting, server-side only)
                                  │                       v
                                  │                 Azure OpenAI (small chat model, low TPM quota)
                                  └─ voice: browser Web Speech API (speech-to-text + text-to-speech)
```

| Part | Where |
| --- | --- |
| UI, plan logic, spaced repetition | `web/js/` (`plan.js` is pure and unit-tested) |
| Study content | `web/content/packs/infra.json` (generated, see below) |
| API handlers (shared by Functions and local dev) | `api/src/lib/handlers.js` |
| Azure Functions wiring | `api/src/functions/index.js` |
| Infra as code | `infra/main.bicep` |
| One-command deploy | `deploy.ps1` |

Guardrails: input validation and length caps, per-client hourly limits, a daily cap, optional beta access code,
model output sanitized before it reaches the UI, CSP + security headers, AI key never sent to clients.
The real cost ceiling is the deployment's tokens-per-minute quota (`capacityK`, default 20K TPM) plus the budget alert.

## Run locally

```powershell
npm test            # 14 tests: plan logic, API guards, content leak check
npm run dev         # http://localhost:5173  (mock AI unless api/.env has Azure OpenAI values)
```

Copy `api/.env.example` to `api/.env` to use a real Azure OpenAI deployment locally.

## Deploy to Azure (personal subscription)

```powershell
az login                      # personal account
az account set -s "<personal subscription>"
./deploy.ps1 -BudgetEmail you@example.com                     # open AI
./deploy.ps1 -BudgetEmail you@example.com -AccessCode "beta"  # AI only for people with the code
```

It refuses employer accounts, picks an available small model in the region, deploys Bicep, writes the deployed URL into
`web/js/config.js` (needed by the native apps), uploads web + API, and checks `/api/health`.

CI: `.github/workflows/deploy.yml` runs tests on every push and deploys if the repo secret
`AZURE_STATIC_WEB_APPS_API_TOKEN` is set (`az staticwebapp secrets list -n <swa> --query properties.apiKey -o tsv`).

## Content

`web/content/packs/infra.json` is generated from the source study guide:

```powershell
npm run content -- "C:\path\to\Infra Interview Prep.html"
```

The script drops personal topics (writes them to git-ignored `private/packs/personal.json`), rewrites personal
phrasing, and **fails** if any employer or personal reference remains. `test/content.test.mjs` checks it again.
Import `private/packs/personal.json` in the app under Profile → Private packs.

## App stores

1. **PWA first** (works today): open the site on a phone → Share → *Add to Home Screen* (iOS) or *Install app* (Android).
2. **Google Play**: `npm install`, `npm run cap:android` (needs Android Studio + JDK), build a signed AAB, upload in
   Play Console ($25 one-time developer account). New personal accounts must run a closed test with testers before
   production access.
3. **Apple App Store**: `npm run cap:ios` on a Mac with Xcode, Apple Developer Program ($99/yr), App Store Connect.
   Apple rejects apps that are "just a website" (guideline 4.2). Before submitting, add native value: native speech
   recognition plugin (Web Speech recognition is not available in iOS WKWebView), offline mode, local notifications for
   daily study reminders.
4. Both stores need: privacy policy URL, support URL, screenshots, content rating, and an AI disclosure.
   Data collection to declare: chat text sent to the AI service (not stored by PrepPilot).

## Known limitations / next steps

- Rate limits are in-memory per Functions instance. Fine for a beta; move to Azure Table Storage or Redis for real scale.
- No accounts or sync across devices (by design for privacy). Export/import exists under Profile.
- Voice input relies on the browser; iOS app needs `@capacitor-community/speech-recognition`.
- Answers are not streamed; add streaming when moving the API to a standalone Function App.
- Content is infra-focused. Other fields work through AI-generated packs; curated packs per role would be better.
