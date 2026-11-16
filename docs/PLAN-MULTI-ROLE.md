# Plan: PrepPilot for every tech role (execution brief)

**Owner:** Luna. **Repo:** `C:\Projects\PrepPilot` (github.com/gouthamchidhara/preppilot, CI auto-deploys `main`).
**Goal:** Anyone (Java/Python/.NET/frontend developer, data engineer, data scientist, QA, security, and the existing
infra/cloud/SRE/DevOps/network/support roles) gets a study guide, flashcards and plan built for their role, stack and level.
The AI coach and the pricing model stay as they are.

Read first: `README.md`, `docs/MONETIZATION-AND-LAUNCH.md`, `web/js/plan.js`, `web/js/app.js`, `scripts/extract-content.mjs`.

---

## 1. What exists today (and why it's infra-only)

| Area | Today | Problem |
| --- | --- | --- |
| Content | One pack `web/content/packs/infra.json`: 16 topics, 139 concept cards, 254 Q&As, generated from a personal HTML guide by `scripts/extract-content.mjs` | Infra only |
| Roles | `ROLES` in `web/js/plan.js`: infra, sre, cloud, devops, network, support | Only infra roles |
| Topic relevance | `topic.roles = {infra:3, sre:2, ...}` weights, hard-coded in `ROLE_WEIGHTS` in the extract script | Doesn't scale to 20+ roles |
| Onboarding | Role dropdown, level, background text, interview date, strong/weak chips for every topic | Chips would become 100+ |
| AI prompts | `api/src/lib/prompts.js` says "coach for infrastructure, cloud, SRE…" | Wrong persona for developers |
| AI card generation | `/api/generate` makes a custom topic on demand (costs 5 message credits) | Works for any role, but quality varies and it's paid |
| Progress IDs | `${topicId}-${qaIndex}` in localStorage | Changing topic IDs or reordering Q&As wipes progress |

Constraints that must not break:
- The study guide is **free and works without sign-in** (no AI calls are allowed to build a user's guide).
- Progress keys are `${topicId}-${index}`: never rename a topic ID, and only **append** Q&As.
- No personal or employer data in public packs (`private/sanitize.json` leak check stays).
- PWA offline cache (`web/sw.js`) and the native Expo shell load the same `web/` files.

---

## 2. Target design

### 2.1 Role catalog (`web/content/roles.json`)
Data, not code. Each role lists the topics it needs, with a weight (3 = core, 2 = important, 1 = nice to know).

```json
{
  "version": 1,
  "families": [
    { "id": "dev", "name": "Software development" },
    { "id": "data", "name": "Data & AI" },
    { "id": "infra", "name": "Infrastructure & cloud" },
    { "id": "quality", "name": "Quality & security" }
  ],
  "roles": [
    {
      "id": "backend-java", "family": "dev", "name": "Backend developer (Java)",
      "stacks": ["java"],
      "topics": { "java-core": 3, "spring": 3, "jvm": 2, "sql": 3, "api-design": 3, "system-design": 3,
                  "dsa": 3, "testing": 2, "git": 2, "docker": 2, "cicd": 1, "cloud": 1, "behavioral": 3 }
    }
  ]
}
```

Roles in v1 (22). Add more later by editing this JSON only:
- **dev:** backend-java, backend-python, backend-dotnet, backend-node, backend-go, frontend-react, frontend-angular,
  fullstack-js, mobile-ios, mobile-android, mobile-cross (React Native/Flutter)
- **data:** data-engineer, data-analyst, data-scientist, ml-engineer
- **infra:** infra, sre, cloud, devops, network, support (existing IDs, unchanged)
- **quality:** qa-automation, security-engineer
- Product/engineering-manager roles: **out of scope for v1** (owner decision).

### 2.2 Content packs (one file per topic family, loaded on demand)
`web/content/packs/<packId>.json`, same topic schema as today (`id, name, tag, blurb, concepts[], qa[]`) **without** the
`roles` field (relevance now lives in `roles.json`). Each topic adds `"pack"` and optional `"stack"`.

| Pack | Topics (IDs are permanent) |
| --- | --- |
| `infra` (exists) | linux, scripting, windows, network, lb, docker, k8s, cicd, monitoring, cloud, onboarding, troubleshoot, virt, security, scenarios |
| `core-dev` | dsa, system-design, api-design, sql, git, testing, oop-design-patterns, concurrency, web-fundamentals (HTTP, auth, caching) |
| `java` | java-core, jvm, spring, java-build (Maven/Gradle) |
| `python` | python-core, python-web (Django/FastAPI/Flask), python-async, python-packaging |
| `dotnet` | csharp-core, aspnet-core, efcore, dotnet-runtime |
| `node` | js-core, typescript, node-runtime, express-nest |
| `go` | go-core, go-concurrency |
| `frontend` | html-css, react, angular, browser-performance, accessibility, state-management |
| `mobile` | ios-swift, android-kotlin, react-native, flutter |
| `data` | data-modeling, etl-elt, spark, airflow, streaming (Kafka), warehouses (Snowflake/BigQuery/Databricks), data-quality, sql-advanced |
| `ml` | ml-fundamentals, statistics, python-data (pandas/numpy), ml-ops, llm-apps (RAG, evaluation) |
| `quality` | test-strategy, selenium-playwright, api-testing, performance-testing, appsec (OWASP), threat-modeling |
| `behavioral` (shared) | behavioral (move the existing topic here; keep ID `behavioral`) |

Rule: a topic exists in exactly one pack; roles reference topics across packs. The existing `cloud`, `docker`, `k8s`,
`cicd`, `security`, `monitoring` topics are reused by developer roles at weight 1–2.

`web/content/packs/index.json` (manifest): `{ "packs": [{ "id", "version", "topics": [ids], "bytes" }] }`.
The client fetches the manifest + `roles.json`, then only the packs the user's role needs.

### 2.3 Personalization (extends `web/js/plan.js`)
- Profile gains `roleId` (from catalog), `stacks: []` (extra tech the user picks, e.g. a Java dev who also uses Kafka),
  `level`, `background`, `goal`, `interviewDate`, `weak[]`, `strong[]`.
  Migration: old `profile.role` values (`infra|sre|cloud|devops|network|support`) map 1:1 to the same `roleId`.
- `scoreTopic(topic, profile, roleCatalog)`: weight from `role.topics[topic.id]` (missing = 0, so not shown),
  +1 if the topic's `stack` is in `profile.stacks`, then the existing weak/strong/level adjustments.
- Topics with weight 0 are hidden from the plan but still searchable under "Browse all topics".
- `buildPlan`, `dueCards`, `readiness` keep their signatures but take the filtered topic list. All existing tests must pass.

### 2.4 Onboarding UX (keep it short)
1. "What role are you preparing for?" Family tabs → role list, plus a search box (type "spark" → Data engineer).
2. "Your level" (existing). 3. "Extra tech you use" chips: only stacks related to the chosen role (from `roles.json`).
4. Background + interview date (existing). 5. Strong/weak chips: **only the role's weight-3 topics** (max ~10).
Then "Build my plan". The profile summary sent to the AI includes role name and stacks.

### 2.5 AI changes (small)
- `api/src/lib/prompts.js`: persona becomes "interview coach for software, data, infrastructure and quality
  roles"; the role, stack and level come from `profileSummary`. Keep the honesty/grading rules.
- `generateSystemPrompt` unchanged; the UI pre-fills the topic with the role's stack ("Spring Boot transactions").
- No change to quotas or pricing.

### 2.6 "Role not listed" fallback
- Onboarding "Other / not listed": user types a role ("Salesforce developer", "SAP Basis"). The plan uses the shared packs
  (core-dev or infra by keyword, plus behavioral) and shows **"Build a guide for this role with AI"**.
- Signed-in users: one tap runs `/api/generate` for up to 5 topics derived from the role (each counts as usual).
- Log anonymous counts of unlisted roles (no PII): new `POST /api/telemetry/role` storing `{role, count}` in a table, rate limited.
  This decides which curated packs to write next.

---

## 3. Content production (the real work)

Writing ~120 new topics by hand isn't realistic. Use AI (gpt-4.1) to draft and gate quality with scripts; packs publish as beta without a human review.

### 3.1 Generator script `scripts/gen-pack.mjs`
- Input: `content-src/<pack>.yaml` listing topics: `id, name, blurb, stack, outline` (5–10 bullet subtopics the
  card must cover, written by a human; this is what keeps quality high), target `concepts` (6–10) and `qa` (12–20, mix of tiers 1/2/3).
- Calls Azure OpenAI (**`gpt-4.1`**, owner decision; add a `gpt-4.1` deployment to the Foundry account, e.g. in Bicep, or
  run with `AZURE_OPENAI_DEPLOYMENT` override), one topic per call, JSON mode, schema from `generateSystemPrompt`
  extended with "cover every outline bullet; code examples must compile/run; no vendor marketing".
- Writes the topic into its pack in `web/content/packs/` after validation passes. Never overwrites a published topic.
- Cost estimate: ~120 topics × ~6K output tokens ≈ 0.7M tokens, under $10 even on a large model. One-time.

### 3.2 Validation script `scripts/validate-packs.mjs` (also run in CI via `npm test`)
- Schema: required fields, `l ∈ {1,2,3}`, lengths, unique topic IDs across all packs, every topic referenced in
  `roles.json` exists, every role has ≥ 8 topics and a `behavioral` topic.
- Append-only check: for topics already published (`content-lock.json` stores `{topicId: qaCount}`), the Q&A count may
  only grow and existing questions may not change their index.
- Leak check (existing private rules) on every pack.
- Code check: extract fenced examples tagged with a language; for `python`, `js`, `ts`, `java`, `csharp`, `go`, `sql`
  run a syntax check where a local toolchain exists (python `py_compile`, `node --check`, `tsc --noEmit`, `javac`,
  `dotnet` skip if missing). Report, don't block, for missing toolchains.

### 3.3 Publishing (no human review gate, owner decision)
- Drafts that pass `validate-packs.mjs` publish automatically: the generator writes straight to `web/content/packs/`
  (still never overwriting a published topic; changes to published topics must be append-only).
- Every AI-drafted topic gets `"beta": true`. The UI shows a small "AI-written" label on those cards and a
  "Report a problem" link (opens a prefilled GitHub issue: topic ID, card/question index, user note; no PII).
- Prompt-side quality rules stay mandatory: cover every outline bullet, name versions, 2�5 sentence answers,
  = 3 tier-3 questions per topic, one interview tip per card, no invented APIs.
- Optional later: spot-check the 5 most-viewed topics per pack when someone with that background is available.

### 3.4 Order of packs (by expected users)
1. `core-dev` + `behavioral` (needed by every developer role)
2. `java`, `python`, `dotnet`, `node`, `frontend`
3. `data`, `ml`
4. `quality`, `mobile`, `go`

---

## 4. Work breakdown (do in this order; each step ships on its own)

| # | Task | Files | Done when |
| --- | --- | --- | --- |
| 1 | Role catalog + loader. Create `roles.json` with the 6 existing infra roles, mapping today's `ROLE_WEIGHTS` into `role.topics`. Move `behavioral` into `packs/behavioral.json`. Add `packs/index.json`. | `web/content/*`, `scripts/extract-content.mjs` (write roles-free infra pack) | App behaves exactly as today; existing tests pass; old profiles still load |
| 2 | Refactor `plan.js` to score via the catalog; add `stacks`; profile migration | `web/js/plan.js`, `test/plan.test.mjs` | New tests: weight-0 topics hidden, stack bonus, migration of `role:"infra"` |
| 3 | Lazy pack loading + offline cache | `web/js/app.js` (boot), `web/sw.js` (cache manifest + fetched packs; bump `VERSION`) | Only needed packs downloaded (check Network tab); works offline after first load |
| 4 | New onboarding (family → role → stacks → weak/strong of core topics) + "Browse all topics" | `web/js/app.js`, `web/app.css` | Under 60 s to complete; works on 375 px wide screen |
| 5 | Persona-neutral prompts | `api/src/lib/prompts.js` | AI answers in the role's language (spot check Java + data engineer) |
| 6 | Content pipeline: `gen-pack.mjs`, `validate-packs.mjs`, `content-lock.json`, CI wiring | `scripts/*`, `content-src/*`, `package.json` | `npm test` fails on a broken pack, renamed topic or shrunk Q&A list |
| 7 | Packs, in the order of 3.4, each as its own PR: outline YAML → generate → validate → publish (beta) → add roles to `roles.json` | `content-src/`, `web/content/packs/` | Each role has ≥ 8 topics, ≥ 120 Q&As across them, validation green |
| 8 | "Role not listed" flow + anonymous role telemetry | `web/js/app.js`, `api/src/lib/handlers.js`, `routes.js`, `infra/main.bicep` (table `pproles`) | Typing an unknown role yields a usable plan; AI build button works for signed-in users |
| 9 | Store listing refresh: screenshots for 3 roles (Java dev, data engineer, infra), description mentions all families | `docs/` | Ready for App Store submission |

Estimated effort: steps 1–6 ≈ 3–4 days of engineering; step 7 ≈ 0.5 day per pack (outline + generate + validate); step 8 ≈ 1 day.

---

## 5. Tests to add

- `plan.test.mjs`: catalog scoring; hidden weight-0 topics; stack bonus; legacy profile migration; plan length unchanged.
- `content.test.mjs`: runs `validate-packs` logic: unique IDs, catalog references, append-only lock, leak rules.
- `api.test.mjs`: role telemetry endpoint validates input, rate-limits, stores no PII.
- Manual: Playwright smoke for onboarding of 3 roles (Java backend, data engineer, infra) on desktop and 375 px width.

## 6. Acceptance criteria (whole project)

1. A Java backend developer, a Python data engineer and a .NET developer each get a plan whose first 5 topics are
   relevant to them, with no infra-only topics unless weighted for their role.
2. Existing infra users see no change in their plan or progress after upgrade.
3. First load downloads ≤ 2 packs; the app works offline for the user's role.
4. `npm test` covers content integrity; CI blocks bad packs.
5. The guide never requires sign-in; AI pricing and quotas are unchanged.
6. No personal/employer text in any public pack.

## 7. Out of scope (later)

- Coding sandbox / live code execution in the app.
- Company-specific question banks.
- Localization.
- Web payments (Stripe or RevenueCat Web Billing).

## 8. Owner decisions (Nov 16, 2026)

- Drafting model: **gpt-4.1**.
- Packs **go live without human review**, marked beta/"AI-written" with a report link.
- Product manager and engineering manager roles are **removed from v1**.