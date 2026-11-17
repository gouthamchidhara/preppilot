# Task sheet for a smaller model

You are working in the repository `gouthamchidhara/preppilot`. Follow this sheet exactly. Do one task at a time, in order. Do not start a task marked "needs a stronger model".

## Rules (read first)

1. Work only on the branch `claude/eloquent-pasteur-wdc9yd`. Never push to `main`.
2. After **each** task: run `npm test`. All tests must pass. Then commit and push:
   ```bash
   git add -A && git commit -m "<what you did>" && git push -u origin claude/eloquent-pasteur-wdc9yd
   ```
3. Change only what the task names. Do not restyle, rename or "improve" anything else.
4. Do not change colours, fonts or layout in `web/app.css`. The design is final: calm paper-and-ink. No bright colours, gradients or glow.
5. Do not deploy and do not open a pull request. The owner does that.
6. If a step does not match what you see in the file, stop and report what you found. Do not guess.
7. Text shown to users: plain sentences, sentence case, no emoji, no exclamation marks.

## How the app is built (30 seconds)

- `web/` is the app (plain JavaScript, no build step). Screens are functions in `web/js/app.js` that return HTML strings.
- `api/src/lib/` is the server. `plans.js` holds prices and limits.
- `test/` holds the tests. Run them with `npm test`.
- To look at the app: `npm run dev`, then open `http://localhost:5173`.

---

## Task A: remove the "AI-written" label (easy)

**Goal:** the words "AI-written" never appear in the app. The "Report a problem" link stays.

File: `web/js/app.js`

1. In the function `betaNote`, delete only this part: `<span class="tag">AI-written</span> ` (keep the `<a ...>Report a problem</a>` link).
2. In the function `homeView`, inside `topicRow`, delete this part: `${t.beta ? ' <span class="tag">AI-written</span>' : ''}`.

**Check:** run `grep -rn "AI-written" web/` and get no results. Run `npm test`.

---

## Task B: new monthly price and voice minutes (easy)

**Goal:** the monthly plan shows $7.99 per month and gives 45 voice minutes a month. One voice call on the monthly plan lasts at most 10 minutes.

1. `api/src/lib/plans.js`
   - Change `num('PRO_VOICE_SEC', 30 * 60)` to `num('PRO_VOICE_SEC', 45 * 60)`.
   - Change `num('MAX_CALL_SEC', 15 * 60)` to `num('MAX_CALL_SEC', 10 * 60)`.
   - Change `'$11.99/month'` to `'$7.99/month'`.
   - Update the comment line that starts `// Pro:` to say `$7.99/month` and `45 voice min`.
2. `web/js/app.js`, function `offer`
   - Change `'$11.99/month'` to `'$7.99/month'`.
   - Change `P?.pro.voiceMin ?? 30` to `P?.pro.voiceMin ?? 45`.
3. `README.md`: change `$11.99/month` to `$7.99/month`.
4. `docs/DEPLOY-AND-SUBMIT.md`: change both `$11.99/month` to `$7.99/month`, and `30 voice min/month` to `45 voice min/month`.
5. `test/api.test.mjs`: find the test named `quota messages quote the configured price and limits`. Change `/\$11\.99\/month/` to `/\$7\.99\/month/`.

**Check:** run `grep -rn "11.99" api web README.md docs/DEPLOY-AND-SUBMIT.md test` and get no results. Run `npm test`.

**Tell the owner:** the real price must also be changed by hand in App Store Connect and RevenueCat. The code only displays it.

---

## Task C: write 50 notification messages (easy, writing only)

**Goal:** a file of 50 short daily reminder messages. No app code changes.

1. Create the file `web/content/nudges.json` with this shape:
   ```json
   { "version": 1, "nudges": [ { "title": "...", "body": "..." } ] }
   ```
2. Write exactly 50 entries.
   - `title`: at most 40 characters. `body`: at most 110 characters.
   - Tone: warm, a little funny, never guilt-tripping. The reader is a software or IT person preparing for a job interview.
   - `body` may contain the placeholder `{topic}` (today's topic) or `{due}` (number of cards due). At least 20 entries use one of them.
   - Write them yourself. Do not copy lines from other apps or the web.
   - No emoji. No exclamation marks. No insults, no jokes about being unemployed.
   - Example: title `Your future team is waiting`, body `Ten minutes on {topic} today and Friday's interview gets a little less scary.`

**Check:** run this and see `50`:
```bash
node -e "const n=require('./web/content/nudges.json').nudges;console.log(n.length);n.forEach(x=>{if(x.title.length>40||x.body.length>110)throw new Error(x.title)})"
```

---

## Task D: rename for the 1-hour product (easy, text only)

**Goal:** prepare the wording. The feature itself is built later by a stronger model.

1. Open `docs/NEXT-SESSION.md`. Do not edit it. Read the section "Decisions already made by the owner".
2. Run `grep -rni "mock interview\|live interview" web/js web/index.html`. If there are results in text that users see, replace the wording with `Live coach` (the product) and `practice test` (the session). Report every line you changed.
3. If there are no results, write "Task D: nothing to change" in your report.

---

## Needs a stronger model: do not start these

Leave these for a larger model. They are specified in `docs/NEXT-SESSION.md`.

- The 1-hour "Live coach: practice test" session ($10.99, separate purchase, continuous 60 minutes, instant suggestions, settings).
- The suggestions form that emails the owner (needs an email service and server code).
- Animated visual lessons and the knowledge map.
- App icon badge and push notifications (native code and a new iOS build).

## Report when you finish

For each task A to D, write one line: done, or blocked and why. Add the output of `npm test` (the pass and fail counts) and the last commit hash from `git log --oneline -1`.
