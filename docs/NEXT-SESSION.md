# Next session: work order

Requested by the owner on 2026-11-17. Start here. Branch: `claude/eloquent-pasteur-wdc9yd` (live on Azure, 1 commit ahead of `main` at time of writing). Commit and push after every item. Publish to Azure by running the `deploy.yml` workflow on the branch, then the owner checks and merges to `main`.

Read first: `docs/PRODUCT-STRATEGY.md` (direction), `web/app.css` header comment (design system: calm paper-and-ink, serif reading text, one muted accent). Do not bring back bright colours, gradients or glow.

## Tasks, in the owner's order

1. **Bring back the 1-hour interview session, inside the plan.**
   - Continuous two-way voice: listening and talking back and forth for up to 60 minutes.
   - Settings must be flexible (owner's words: "all settings in place with flexibility"): at least session length, voice on/off, interviewer style, topic focus, difficulty.
   - "Instant suggestions based on the questions being asked."
   - The earlier implementation was removed in commit `5dd540f`; the server side (credit, 60-minute resumable window, mock prompt) is in commit `e3c1035` and can be restored from there.
   - **Clarify with the owner before building the suggestions part:** is this for practice (the AI interviewer asks, the app shows hints and a model answer) or for use while a real interviewer is asking questions? Practice is fine. Live assistance during a real interview should not be built: App Store rejection risk and it is cheating. Build the practice version unless told otherwise.
   - Decide with the owner: is the session included in the subscription, or a separate purchase?

2. **Monthly subscription down to $7.99, with the AI coach.**
   - Server label: `PRO_PRICE_LABEL` env var / default in `api/src/lib/plans.js`. Web fallback in `offer()` in `web/js/app.js`. Docs: README, `docs/DEPLOY-AND-SUBMIT.md`, `docs/COST-AND-PRICING.md`.
   - The real price is set by the owner in App Store Connect and RevenueCat; code only displays it.
   - Re-check the margin: voice costs about $0.02 to $0.04 per minute; a 60-minute session costs about $1.20 to $2.40.

3. **Remove the "AI-written" wording everywhere in the app.**
   - `betaNote()` and the topic rows in `web/js/app.js` (`t.beta`). Keep a quiet "Report a problem" link.

4. **Guide suggestions from signed-in users.**
   - After Google sign-in, ask what extra guides or topics they want. The same form must stay available in Profile.
   - Submissions are emailed to `palpriya0825@gmail.com`. Put the address in a server setting (for example `SUGGESTIONS_EMAIL`), not in client code. Needs an email service: Azure Communication Services Email fits the existing Azure setup. Also store each suggestion in Table Storage. Rate limit per user.

5. **More animated, visual learning: the "wow" the owner wants.**
   - Owner's point: progress bars and topic lists are in every app; a picture is worth more than text. Users should understand what they are learning by seeing it.
   - Direction to propose: animated concept diagrams for lessons (request flow, memory layout, Kubernetes objects, and so on) as lightweight SVG/CSS or Lottie, plus a visual map of the user's knowledge instead of a percentage.
   - Azure Blob Storage may be used for animation assets.
   - Keep it calm: motion that explains, not decoration. Respect reduced-motion.

6. **App icon badge and daily notifications.**
   - Badge count on the phone icon (cards due today).
   - Daily push notification: what to prepare today, with a light, funny, motivational line. Owner's reference is the tone of Swiggy's notifications. About 50 rotating messages.
   - Write the 50 messages fresh in that spirit; do not copy other apps' text.
   - Needs `expo-notifications`, a permission prompt at a sensible moment, and a new iOS build.

## Still open from this session

- Native icon and splash PNGs in `mobile/assets/` are the old blue "P".
- Web visitors cannot buy anything (store purchases only).
- Progress is stored per device; no sync.
