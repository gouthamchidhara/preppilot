# PrepPilot

Personalized interview prep for software developers (Java, Python, .NET, Node, Go, frontend, mobile), data and AI,
infrastructure/cloud/SRE/DevOps, QA and security roles: 23 roles, 72 topics.
Users set a short profile (one or more target roles, level, background, self-rated strengths/weaknesses, interview date) and get:

- **A day-by-day plan** ordered by role relevance and their weak spots, ending with a Live coach practice test.
- **Learn cards** (what / why / example / what to say) and **flashcards** with spaced repetition, filtered to their level.
- **Multi-role prep** combines selected roles into one plan; role-specific flashcards allow focused practice. Shared topics
  and their card progress are not duplicated. Select one role in Profile for a single-role plan.
- **An AI coach** for instant answers, "go deeper" on any card, answer grading, quizzes, and Live coach practice tests:
  - **Talking mode**: hands-free speech-to-speech (Azure OpenAI Realtime over WebRTC). Replies start ~0.35 s after you
    stop speaking; talk over it to interrupt. Measured: first reply token ~250 ms after the turn ends.
  - **Listening mode**: mic stays open, the coach transcribes and does **not** interrupt while you practice a long answer;
    tap "Your turn" for instant feedback (spoken, or text-only with "Speak replies" off).
  - Typing during a voice session streams over the same connection. Without a voice session, text chat uses
    `/api/chat` (~1.4 s for a full, non-streamed answer).
- **AI-generated card sets** for any topic not covered (e.g. "Splunk SPL", "Terraform state").
- **Private packs**: import your own JSON pack (projects, STAR stories). It stays on the device.

Study data (profile, progress, chats) lives only on the device (localStorage). Signing in is needed only for AI;
the server then stores just the account ID, email, plan and usage counters. Chat text, the profile summary and the
current card are sent to the API only when the user asks the AI something.

**Plans and launch:** the guide is free without an account. AI needs sign-in (Google, or Apple in the iOS app): free trial,
then Pro at $7.99/month, or a one-time $10.99 60-minute Live coach practice test, through in-app purchase. Usage is enforced on the server. See
[docs/MONETIZATION-AND-LAUNCH.md](docs/MONETIZATION-AND-LAUNCH.md) for pricing math, enforcement design and the setup steps.

## Architecture

```
iOS / Android (Capacitor shell)  ─┐
Browser / installed PWA          ─┼─HTTPS─> Azure Static Web Apps (Free)
                                  │          ├─ web/        static PWA (no build step)
                                  │          └─ api/        managed Azure Functions (Node 20)
                                  │                 /api/chat  /api/generate  /api/realtime  /api/health
                                  │                       │ api-key (app setting, server-side only)
                                  │                       v
                                  │                 Azure AI Foundry (AIServices) account:
                                  │                   gpt-4.1-mini (chat), gpt-realtime-mini (voice),
                                  │                   gpt-4o-mini-transcribe (shows what you said)
                                  └─ voice audio: WebRTC directly between device and Azure (after /api/realtime
                                     mints a short-lived secret and exchanges SDP; instructions never reach the client)
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

Role catalog: `web/content/roles.json` (which topics each role needs, weight 1-3). Packs: `web/content/packs/*.json`, loaded on demand.
To add a pack: write an outline in `content-src/packs/<pack>.json`, run `npm run content:gen -- <pack>` (gpt-4.1, publishes as beta),
add the topics to roles in `roles.json`, then `npm run content:validate` and `npm run content:lock`. See `docs/PLAN-MULTI-ROLE.md`.

`web/content/packs/infra.json` and `behavioral.json` are generated from the source study guide:

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
3. **Apple App Store** (app record exists in App Store Connect): `npm run cap:ios` on a Mac with Xcode.
   - `appId` in `capacitor.config.json` must equal the Bundle ID shown in App Store Connect → App Information.
   - Add `NSMicrophoneUsageDescription` to `ios/App/App/Info.plist` ("PrepPilot uses the microphone for voice
     practice with the AI coach."). Realtime voice uses WebRTC, which works in the iOS WebView (iOS 14.3+).
   - Put the beta access code in App Review notes, or reviewers can't use the AI.
   - Apple rejects "just a website" apps (guideline 4.2); realtime voice, offline study and daily reminders help.
4. Both stores need: privacy policy URL, support URL, screenshots, content rating, and an AI disclosure.
   Data collection to declare: chat text sent to the AI service (not stored by PrepPilot).

## Known limitations / next steps

- Rate limits are in-memory per Functions instance. Fine for a beta; move to Azure Table Storage or Redis for real scale.
- **Before a public launch, replace the shared access code** with per-user protection (Sign in with Apple + per-user
  quotas, or App Attest/DeviceCheck). Voice costs real money per minute; an open endpoint can be abused.
  Voice sessions auto-end after 3 minutes of silence or 10 minutes total (60 minutes for a Live coach session, which has no silence cut-off).
- No accounts or sync across devices (by design for privacy). Export/import exists under Profile.
- Voice input relies on WebRTC + microphone permission; the 🎤 Dictate fallback uses the browser's speech API.
- Answers are not streamed; add streaming when moving the API to a standalone Function App.
- Content is infra-focused. Other fields work through AI-generated packs; curated packs per role would be better.
