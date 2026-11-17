# PrepPilot: pricing and launch plan

## The model

| Tier | Price | What you get | Our worst-case AI cost |
| --- | --- | --- | --- |
| **No account** | Free | Personalized plan, full study guide, flashcards, private packs. No AI. | $0 |
| **Free trial** (signed in) | Free | 15 AI messages + 2 voice minutes, **lifetime** | ~$0.10 per user |
| **Pro** | **$4.99 / month** (auto-renewing, App Store / Google Play) | 500 AI messages + 45 voice minutes per month | ~$2.45 per user per month |
| **Admin** | n/a | Unlimited (emails listed in `private/secrets.json` → `adminEmails`) | your own usage |

Cost basis (Azure list prices, Nov 2026): `gpt-4.1-mini` $0.40 / $1.60 per 1M tokens, so about $0.0013 per chat message;
`gpt-realtime-mini` audio $10 / $20 per 1M tokens, about $0.02 to $0.04 per conversation minute, plus about $0.003 per minute for transcription.

Apple keeps 15% under the App Store Small Business Program (enroll; otherwise 30% in year one), so Pro nets about $4.24.
At worst-case usage the margin is about $1.80 per user per month; typical users use far less voice time.

### Keeping the free tier from costing you money

- **Lifetime** trial (it doesn't reset), tied to the Google/Apple account ID. Deleting the account and signing up again doesn't reset it.
- **Global free pool per day**, shared by every free user: 200 messages + 10 voice minutes, which is about $0.65 per day maximum.
  When the pool is used up, free users see "Free AI is at capacity today. Upgrade or try tomorrow."
- Per-user hourly rate limits, per-call voice caps (10 minutes on the monthly plan; 60 for a Live coach session), Azure tokens-per-minute quotas, and a $20 per month budget alert.
- All limits can be changed without a code change through Static Web App app settings:
  `FREE_MSGS`, `FREE_VOICE_SEC`, `FREE_DAILY_MSGS`, `FREE_DAILY_VOICE_SEC`, `PRO_MSGS`, `PRO_VOICE_SEC`, `MAX_CALL_SEC`.

### How usage is enforced (the server doesn't trust the app)

- **Messages:** charged on the server before the AI call and refunded if the call fails.
- **Voice:** when a call starts, the server reserves the minutes you have left (up to 15 per call). When the call ends, it
  hangs up the call through Azure (`/realtime/calls/{id}/hangup`) and refunds the unused seconds.
  A timer function (`sweeper/`) runs every minute and hangs up any call that has run past its reserved time,
  so a modified app can't keep talking for free. Tested: an overdue call was cut off within about 60 seconds.
- **Pro status:** granted only by a RevenueCat webhook or a server-side RevenueCat lookup, never by the app saying "I paid".

## What's done

- Google sign-in (web), plus Google and Apple sign-in inside the native app (Apple requires Sign in with Apple whenever Google login is offered).
- Accounts, quotas, the free pool, admin access, voice reserve/refund/hangup, the sweeper, RevenueCat webhook and refresh.
- In-app account deletion (App Review guideline 5.1.1(v)) and a privacy policy at `/privacy.html`.
- Expo app `mobile/` (bundle `com.gchid.preppilot`, EAS project `@gchid/preppilot`, App Store app 6835532732):
  - WebView shell for the app, native sign-in, RevenueCat purchase and restore, microphone permission, export-compliance flag.

## What only you can do (about 1 to 2 hours), in order

### 1. Google sign-in (15 min): console.cloud.google.com, signed in with your **personal** Google account
1. Create a project called "PrepPilot". Under **APIs & Services → OAuth consent screen**: External, app name PrepPilot,
   support email, privacy policy `https://lively-pond-0ad55040f.8.azurestaticapps.net/privacy.html`, scopes `openid email profile`. Publish it.
2. **Credentials → Create OAuth client ID → Web application**: Authorized JavaScript origins
   `https://lively-pond-0ad55040f.8.azurestaticapps.net` and `http://localhost:5173`.
3. **Create OAuth client ID → iOS**: bundle ID `com.gchid.preppilot`.
4. Android (later): an **Android** client with package `com.gchid.preppilot` and the SHA-1 from `eas credentials -p android`.
5. Paste the IDs:
   - `deploy.settings.json`: `googleWebClientId` = the web client; `googleClientIds` = web,ios,android (comma-separated)
   - `mobile/app.settings.json`: `googleWebClientId`, `googleIosClientId`
6. Run `./deploy.ps1 -BudgetEmail <you>`. The web "Continue with Google" button then appears.

### 2. App Store Connect (20 min)
1. **Agreements, Tax and Banking**: accept the Paid Apps agreement and add bank and tax details (purchases won't work without it).
2. Enroll in the **App Store Small Business Program** (15% instead of 30%).
3. App 6835532732 → **Monetization → Subscriptions**: create the group "PrepPilot Pro", then an auto-renewable subscription
   with product ID `pro_monthly`, duration 1 month, price $4.99, and a display name and description.
4. **Users and Access → Integrations → In-App Purchase**: generate a key (for RevenueCat).
5. **App Privacy**: declare Email and Name (account), User ID, Product Interaction (usage counts),
   and Audio Data (voice, sent to a processor, not stored). None of it is used for tracking.

### 3. RevenueCat (15 min): app.revenuecat.com
1. Create the project PrepPilot and add an **App Store** app with bundle `com.gchid.preppilot` and the In-App Purchase key from step 2.4.
2. Products: `pro_monthly`. **Entitlement** identifier: `pro`, with `pro_monthly` attached.
   **Offering** "default" with one package containing `pro_monthly`.
3. **Integrations → Webhooks**: URL `https://lively-pond-0ad55040f.8.azurestaticapps.net/api/billing/revenuecat`.
   For the Authorization header, use the exact `revenueCatWebhookAuth` value from `private/secrets.json`.
4. API keys:
   - **Public iOS SDK key** → `mobile/app.settings.json` → `revenueCatIosKey`
   - **Secret API key (v1)** → `private/secrets.json` → `revenueCatSecretKey`
   - then run `./deploy.ps1` again

### 4. Build and submit the iOS app (EAS builds in the cloud, no Mac needed)
```powershell
cd mobile
npx eas-cli build -p ios --profile production   # first run asks for your Apple ID and creates certificates and profiles
npx eas-cli submit -p ios --latest              # uploads to App Store Connect / TestFlight
```
Test in TestFlight with a **Sandbox** Apple ID: sign in, use up the free trial, buy Pro, restore, delete the account.

### 5. App Review notes (paste these into App Store Connect)
> PrepPilot is a free interview-prep study app. AI coaching requires sign-in (Sign in with Apple or Google) and includes
> a free trial; Pro ($4.99/month) is an auto-renewable in-app subscription. To review without purchasing: sign in with
> Apple, then the AI coach and voice mode work within the free trial. Voice mode uses the microphone. Account deletion:
> Profile → Delete account.

The in-app upgrade card already shows price, allowance, auto-renewal terms, Terms of Use (Apple standard EULA) and Privacy Policy links, as Apple requires.

## Risks and open items

- **Guideline 4.2 (minimum functionality):** the native app shows the website. Native sign-in, purchases, mic voice, and study
  content that works offline help, but rejection is possible. If it's rejected, the fallback is to bundle the web files inside the app (no remote URL).
- **Web has no checkout yet.** Web users can use the free trial; Pro bought in the app unlocks the web as well (same account).
  Stripe on the web is a later step; RevenueCat Web Billing can reuse the same `pro` entitlement.
- **The beta access code** acts as an unlimited admin key. Once Google sign-in works, run
  `./deploy.ps1 -AccessCode ""` to turn it off.
- **Cold starts:** the first request after an idle period can take 1 to 3 seconds (Static Web Apps Free tier). Voice is fast after it connects.
