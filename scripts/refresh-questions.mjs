// Keeps the question bank current. For each topic it reads what developers are dealing with right now:
//   - Stack Overflow: the most-voted questions of the last 90 days for the topic's tags (titles only)
//   - Hacker News: recent popular stories for the topic (releases, outages, new features)
// and asks the AI to write a few NEW, original interview questions that reflect those trends.
// Sources are used only as signals; nothing is copied. New questions are appended (published
// questions never change; progress is keyed by position) and marked with the month they were added.
//
// Usage: node scripts/refresh-questions.mjs [--per 3] [--only topicId[,topicId]] [--pack java] [--dry]
// Needs AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY (env or api/.env); DRAFT_DEPLOYMENT (default gpt-4.1).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateTopic } from './lib/content.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(root, 'api/.env');
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
const KEY = process.env.AZURE_OPENAI_API_KEY;
const DEPLOYMENT = process.env.DRAFT_DEPLOYMENT || 'gpt-4.1';
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const PER = Number(opt('--per', 3));
const ONLY = opt('--only', '') ? new Set(opt('--only', '').split(',')) : null;
const PACK = opt('--pack', '');
const DRY = args.includes('--dry');
// Daily runs: stop adding to a topic once it has this many new questions this month, so no topic balloons.
const MONTH_CAP = Number(opt('--month-cap', 8));
const MONTH = new Date().toISOString().slice(0, 7);
if (!DRY && (!ENDPOINT || !KEY)) { console.error('Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY'); process.exit(1); }

// Stack Overflow tags and a news search term per topic. Topics not listed use their name.
const TAGS = {
  'java-core': ['java'], jvm: ['jvm', 'garbage-collection'], spring: ['spring-boot'], 'java-build': ['maven', 'gradle'],
  'python-core': ['python'], 'python-async': ['python-asyncio'], 'python-web': ['fastapi', 'django'], 'python-data': ['pandas'], 'python-packaging': ['pip', 'python-poetry'],
  'js-core': ['javascript'], typescript: ['typescript'], 'node-runtime': ['node.js'], 'express-nest': ['nestjs', 'express'],
  react: ['reactjs'], angular: ['angular'], 'state-management': ['redux', 'zustand'], 'html-css': ['css'], 'browser-performance': ['web-performance'], accessibility: ['accessibility'],
  'csharp-core': ['c#'], 'aspnet-core': ['asp.net-core'], efcore: ['entity-framework-core'], 'dotnet-runtime': ['.net'],
  'go-core': ['go'], 'go-concurrency': ['goroutine'], 'android-kotlin': ['kotlin', 'android'], 'ios-swift': ['swift', 'swiftui'], flutter: ['flutter'], 'react-native': ['react-native'],
  sql: ['sql'], 'sql-advanced': ['postgresql'], 'data-modeling': ['database-design'], spark: ['apache-spark', 'pyspark'], airflow: ['airflow'], streaming: ['apache-kafka'], warehouses: ['snowflake-cloud-data-platform', 'google-bigquery'], 'etl-elt': ['dbt'], 'data-quality': ['great-expectations'],
  'llm-apps': ['large-language-model', 'langchain'], 'ml-fundamentals': ['machine-learning'], 'ml-ops': ['mlops', 'mlflow'], statistics: ['statistics'],
  docker: ['docker'], k8s: ['kubernetes'], cicd: ['github-actions'], cloud: ['amazon-web-services'], linux: ['linux'], network: ['networking'], monitoring: ['prometheus'], git: ['git'],
  'selenium-playwright': ['playwright', 'selenium-webdriver'], 'api-testing': ['api-testing'], 'performance-testing': ['load-testing'],
  appsec: ['security'], 'threat-modeling': ['security'], 'api-design': ['rest'], 'system-design': ['system-design'], concurrency: ['multithreading'],
};
const SKIP = new Set(['behavioral', 'onboarding', 'scenarios', 'troubleshoot', 'dsa', 'windows', 'virt', 'lb', 'scripting', 'oop-design-patterns', 'web-fundamentals', 'security', 'testing', 'test-strategy']);

const since = Math.floor(Date.now() / 1000) - 90 * 86400;
// JSON over HTTPS; falls back to curl where a sandbox or proxy blocks Node's own fetch.
async function getJson(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(15000) }); if (r.ok) return await r.json(); } catch { /* try curl */ }
  try { return JSON.parse(execFileSync('curl', ['-sS', '--compressed', '--max-time', '15', url], { encoding: 'utf8' })); } catch { return {}; }
}
const decode = s => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
async function stackOverflow(tags) {
  const out = [];
  for (const tag of tags) {
    try {
      const d = await getJson(`https://api.stackexchange.com/2.3/questions?order=desc&sort=votes&tagged=${encodeURIComponent(tag)}&site=stackoverflow&pagesize=12&fromdate=${since}`);
      out.push(...(d.items || []).map(q => decode(q.title)));
      if (d.backoff) await new Promise(res => setTimeout(res, d.backoff * 1000));
    } catch { /* a missing signal only means fewer hints */ }
  }
  return [...new Set(out)].slice(0, 15);
}
async function hackerNews(term) {
  try {
    const d = await getJson(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(term)}&tags=story&numericFilters=created_at_i>${since},points>40&hitsPerPage=10`);
    return (d.hits || []).map(h => h.title).filter(Boolean).slice(0, 8);
  } catch { return []; }
}

const words = s => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2));
const similar = (a, b) => { const A = words(a), B = words(b); const n = [...A].filter(w => B.has(w)).length; return n / Math.max(1, Math.min(A.size, B.size)); };

async function draft(t, so, hn) {
  const sys = `You write interview questions for software, data, cloud and QA engineers. Output ONLY JSON: {"qa":[{"l":1|2|3,"q":"...","a":"..."}]}.
Write ${PER} NEW interview questions about the topic that reflect what is current in ${MONTH}: new versions and features, recently common problems, and practices that changed. Use the signals as hints about what developers are dealing with now; do not copy them, and skip any that are not interview material.
Rules: each question must be different from every existing question listed. Mix levels (l=1 core, 2 mid, 3 senior). Answers 2-4 sentences, technically correct, concrete (name the API, setting, version or trade-off), sounding like a strong candidate. Only mention versions and features you are certain exist; never state when something was released or integrated unless certain. Write questions in your own words: never reuse a signal's wording. No markdown except backticks around code identifiers.`;
  const user = `Topic: ${t.name}\nScope: ${t.blurb || ''}\n\nExisting questions (do not repeat):\n- ${t.qa.map(q => q.q).join('\n- ')}\n\nRecent Stack Overflow questions (signals):\n- ${so.join('\n- ') || 'none'}\n\nRecent tech news (signals):\n- ${hn.join('\n- ') || 'none'}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=2024-10-21`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'api-key': KEY },
      body: JSON.stringify({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0.4, max_tokens: 1800, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(120000),
    });
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 4000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    tokens.in += data.usage?.prompt_tokens || 0; tokens.out += data.usage?.completion_tokens || 0;
    return JSON.parse(data.choices[0].message.content).qa || [];
  }
  throw new Error('gave up after retries');
}

// Second pass: an independent check that every claim in each new Q&A is correct. Anything doubtful is dropped.
async function factCheck(topic, items) {
  if (!items.length) return items;
  const sys = 'You are a strict technical reviewer. Output ONLY JSON: {"verdicts":[{"i":0,"ok":true|false,"why":"short"}]}. Mark ok=false if any claim (version, date, API name, behaviour) is wrong, unverifiable or misleading, or if the question is not a fair interview question.';
  const user = `Topic: ${topic}\n` + items.map((x, i) => `#${i}\nQ: ${x.q}\nA: ${x.a}`).join('\n\n');
  const res = await fetch(`${ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=2024-10-21`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'api-key': KEY },
    body: JSON.stringify({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0, max_tokens: 600, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) return []; // no verdict, no publish
  const data = await res.json();
  tokens.in += data.usage?.prompt_tokens || 0; tokens.out += data.usage?.completion_tokens || 0;
  const v = JSON.parse(data.choices[0].message.content).verdicts || [];
  v.filter(x => !x.ok).forEach(x => items[x.i] && console.log(`    ✗ dropped: ${items[x.i].q.slice(0, 80)} (${x.why})`));
  return items.filter((_, i) => v.some(x => x.i === i && x.ok));
}

const tokens = { in: 0, out: 0 };
const dir = resolve(root, 'web/content/packs');
const files = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json' && (!PACK || f === `${PACK}.json`));
let added = 0;
const report = [];
for (const f of files) {
  const pack = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
  let changed = false;
  for (const t of pack.topics) {
    if (t.private || SKIP.has(t.id) || (ONLY && !ONLY.has(t.id))) continue;
    if (t.qa.filter(q => q.new === MONTH).length >= MONTH_CAP) continue;
    const tags = TAGS[t.id] || [];
    const [so, hn] = await Promise.all([stackOverflow(tags), hackerNews(t.name.replace(/&/g, ' '))]);
    if (DRY) { console.log(`${t.id}: ${so.length} SO, ${hn.length} HN`, so.slice(0, 3)); continue; }
    let fresh;
    try { fresh = await draft(t, so, hn); } catch (e) { console.log(`  ! ${t.id}: ${e.message}`); continue; }
    let keep = [];
    for (const q of fresh) {
      const item = { l: Number(q.l), q: String(q.q || '').trim().slice(0, 500), a: String(q.a || '').trim().slice(0, 2000), new: MONTH };
      if (![1, 2, 3].includes(item.l) || item.q.length < 8 || item.a.length < 20) continue;
      if ([...t.qa, ...keep].some(x => similar(x.q, item.q) > 0.7)) continue;
      if ([...so, ...hn].some(x => similar(x, item.q) > 0.6)) { console.log(`    ✗ too close to a source: ${item.q.slice(0, 80)}`); continue; }
      keep.push(item);
    }
    try { keep = await factCheck(t.name, keep); } catch { keep = []; }
    const trial = { ...t, qa: [...t.qa, ...keep] };
    if (validateTopic(trial).length) { console.log(`  ! ${t.id}: failed validation, skipped`); continue; }
    if (keep.length) { t.qa.push(...keep); changed = true; added += keep.length; report.push({ topic: t.id, qs: keep.map(k => k.q) }); }
    console.log(`  ✓ ${t.id}: +${keep.length} (signals: ${so.length} SO, ${hn.length} HN)`);
  }
  if (changed) writeFileSync(resolve(dir, f), JSON.stringify(pack));
}
if (!DRY && added) {
  execFileSync(process.execPath, [resolve(root, 'scripts/build-index.mjs')], { stdio: 'inherit' });
  // Validate everything and lock the new questions in, so later edits cannot reorder them.
  execFileSync(process.execPath, [resolve(root, 'scripts/validate-packs.mjs'), '--lock'], { stdio: 'inherit' });
  writeFileSync(resolve(root, 'content-src/last-refresh.json'), JSON.stringify({ month: MONTH, at: new Date().toISOString(), added, report }, null, 2));
}
console.log(`added ${added} questions; tokens in ${tokens.in}, out ${tokens.out}, est cost $${(tokens.in * 2e-6 + tokens.out * 8e-6).toFixed(2)}`);
