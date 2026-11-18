# PrepPilot: handoff for the next agent

Last updated 18 Nov 2026. Branch: `claude/eloquent-pasteur-wdc9yd` (not merged to `main`; the owner decides when).
Read this first, then `docs/PENDING-CHECKLIST.md` and `docs/PRODUCT-STRATEGY.md`.

## 1. How the product is built

| Part | Where | Notes |
|---|---|---|
| Web app (the whole UI) | `web/` (vanilla JS PWA) | `web/js/app.js` holds every screen as a function returning HTML; state in the `S` object; one `render()` |
| Styles | `web/app.css` | Light/dark tokens on `:root`; system font everywhere (`--sans`, `--serif` = SF Pro / Segoe / Roboto) |
| Service worker | `web/sw.js` | **Bump `VERSION` (`pp-vNN`) on every web deploy** or phones keep the old copy |
| API | `api/src/lib/*.js` (Azure Functions, Node) | Routes in `api/src/lib/routes.js`; handlers in `handlers.js`; tests in `test/*.mjs` |
| iOS / Android app | `mobile/` (Expo, React Native WebView) | A thin shell that loads the website. Native bits only: Apple/Google sign-in, RevenueCat purchases, notifications, microphone |
| Content | `web/content/packs/*.json` | 72 topics, ~1,200 questions. Append-only (`content-src/content-lock.json`); progress is keyed by `topicId-index` |
| Google pages | `scripts/build-seo.mjs` | Generates `/questions/` + `sitemap.xml` at deploy time (not committed) |
| Daily question refresh | `scripts/refresh-questions.mjs`, `.github/workflows/refresh-questions.yml` | Stack Overflow + Hacker News signals, AI writes new questions, fact-check pass, appends. Runs daily once on `main` |

**Key rule:** web changes reach the iPhone app instantly after an Azure deploy (close and reopen the app). Only changes in `mobile/` need a new iOS build.

## 2. Deploy and build

- **Web + API to Azure:** GitHub Actions `deploy.yml` (workflow_dispatch on the branch). Check `curl -s https://preppilot.us/sw.js | grep pp-v` shows the new version.
- **iOS to TestFlight:** use **`ios-release.yml` with `{"submit": true}`** (Expo/EAS build, free queue, then auto-submit). The owner asked to use Expo for now.
  - `ios-fast.yml` (GitHub macOS runner) exists but GitHub Mac minutes are exhausted; do not use until the owner fixes billing. Pushing a change to that file triggers it.
- **Tests:** `npm test` (82 passing). Dev server: `node dev/server.mjs` (port 5173). Playwright is preinstalled for screenshots.
- **Secrets (in GitHub):** `AZURE_STATIC_WEB_APPS_API_TOKEN`, `EXPO_TOKEN`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`. Never print or commit them.
- **Owner preferences:** plain-language updates, one topic at a time; ask before merging to `main`, before App Store submission, and before starting an iOS build ("build"); deploy to Azure when the owner says "deploy".

## 3. What exists now (all live on preppilot.us as of pp-v44)

### App layout (ChatGPT-style), done
- No bottom tab bar. Round menu button top-left on every signed-in screen; **swipe right anywhere** opens the side panel; the page slides right with rounded corners; tap it or swipe left to close.
- Side panel (`navDrawerHtml()` / `syncDrawer()` in `app.js`, styles `.nd*`, `#shell`, `body.has-drawer`, `body.drawer-open`):
  - Header "PrepPilot" + round search button (jumps to the Home search).
  - Home, Cards, Job focus, Live AI interview, Custom subjects, Pricing (free users only).
  - Recent chats (6) + "See all…" (grouped Today / Yesterday / weekday / date), privacy line, black "Chat" button (new chat), profile avatar with initials (opens Profile).
- Wide screens (>= 900px): permanent sidebar, menu button hidden.
- `web/index.html` wraps header + main in `<div id="shell">` and has `<div id="appDrawer">`.
- Swipe is disabled on the flashcard swipe screen, text inputs, code blocks and sheets.

### Home
- "What do you want to learn today?" search: topics start flashcards; questions offer "Ask the AI coach"; empty focus shows Quick picks (New this month, Troubleshooting, Real scenarios, Terminology).
- "Curated for you": Up next, swipe-mode intro (once), Job focus entry, one topics list (6 + show all).

### Cards
- Steady (regular, in order) vs Swipe (Tinder-style card stack, 3D flip, swipe up = know it cold, "It's a match!" when a topic is fully known). Toggle pill in the card top bar; default in Profile.
- Rounds always go easy to hard and stick to core interview topics (`interviewRound()` in `web/js/plan.js`).

### AI tab
- Chat first, ChatGPT typography (`mdChat()` renders paragraphs, headings, lists, code).
- Slim "Live AI mock interview" strip always on top (this is the paid product; keep it prominent).
- Conversations stored on device (`store.chats()` in `web/js/store.js`: max 30 chats, 120 messages each). The API only reads the last 8 messages.
- Small talk ("hi", "thanks", "bye") is answered by the server for free and not counted (`smallTalk()` in `api/src/lib/guard.js`).
- Input docked above the bottom edge with a fade; speaker button inside the composer.

### Profile
- Account card, "Your prep" summary (role, level, interview countdown, % ready, cards known, streak) with Edit, Display (text size S/M/L, default card mode), everything else under "More".

### iPhone-specific
- In the app (`window.PP_PLATFORM` set by the shell), `<body>` is the scroller (`html.in-app`), giving Safari's momentum even on older builds; double-tap zoom off.
- `mobile/App.tsx`: `decelerationRate="normal"`, pull-to-refresh off, back-swipe gesture off, purchases prefetched (`identify` message from web). These are in the latest Expo build.

## 4. Next tasks (in the owner's priority order)

1. **Verify on device** after the newest TestFlight build: scrolling feel, swipe-right panel, swipe cards, purchase sheet speed. Fix anything that still feels "webby".
2. **Browser payments** (owner asked: after the iOS build). Plan in `docs/PENDING-CHECKLIST.md` section 4: RevenueCat Web Billing (Stripe), same `pro` entitlement and `mock_session_60min` product; web plans screen opens web checkout. Owner creates the Stripe account and connects it in RevenueCat.
3. **Chat sync across devices** (optional, opt-in). Today chats are device-only and the privacy line says so. If added, store on the server per user and update the privacy text.
4. **Landing v2**: preview at `https://preppilot.us/?v2` (feature showcase + Free vs Pro). Owner has not said "make it default" yet; flip `LANDING_V2` when they do.
5. **Merge to `main`** when the owner approves; the daily question refresh schedule only starts there.
6. **Submit sitemap** in Google Search Console (owner action, about 5 minutes).

## 5. Gotchas

- `.top` is the header class: never name another element `top` (it broke the swipe cards once; cards use `is-top` / `is-next`).
- In the app, `<body>` scrolls, not `window`: use `scrollToY()` / `scrollYNow()` helpers, not `window.scrollTo`.
- A scroll container's padding pushes sticky elements; in-app tab clearance lives on `#app`, not `<body>`.
- With the drawer layout `--tabs` is `0px` (`body.has-drawer`); older calcs still reference it.
- Content packs are append-only; never edit or reorder existing questions.
- After any web change: bump `web/sw.js` VERSION, run `npm test`, commit, push, then run `deploy.yml`.
