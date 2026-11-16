// Drafts topics for a pack with Azure OpenAI and publishes them as beta (owner decision: no human review gate).
// Usage: node scripts/gen-pack.mjs <packId|all> [--only topicId] [--concurrency 4]
// Needs AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY (env or api/.env); deployment from DRAFT_DEPLOYMENT (default gpt-4.1).
// Never overwrites a topic that is already published.
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
if (!ENDPOINT || !KEY) { console.error('Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const target = args[0];
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const concurrency = args.includes('--concurrency') ? Number(args[args.indexOf('--concurrency') + 1]) : 4;
if (!target) { console.error('usage: node scripts/gen-pack.mjs <packId|all> [--only topicId] [--concurrency 4]'); process.exit(1); }

const SYSTEM = `You write interview-preparation study material for software, data, infrastructure and quality engineering roles.
Output ONLY a JSON object: {"concepts":[...],"qa":[...]}.
concepts: 7 to 9 items, each {"t": short title, "what": 2-4 sentences explaining it precisely, "why": 1-2 sentences on why interviewers ask, "ex": a concrete example as plain text (code, commands, config, a small table or a worked example; use \\n for newlines, no markdown fences), "tip": one sentence the candidate can say in the interview}.
qa: 15 to 18 items, each {"l": 1|2|3, "q": interview question, "a": model answer in 2-5 sentences}. l=1 core/junior, l=2 mid-level, l=3 senior (design, trade-offs, debugging, production scenarios). Include at least 4 of l=1, 6 of l=2 and 4 of l=3.
Rules: cover EVERY outline bullet across the concepts and questions. Be technically correct and current; name versions where they matter. Code must be valid for the named language. No invented APIs, no marketing, no filler. Answers should sound like a strong candidate speaking, not a textbook. No markdown in values except backticks around code identifiers.`;

function userPrompt(pack, t) {
  return `Pack: ${pack.name}\nTopic: ${t.name}\nScope: ${t.blurb}\nOutline (cover all):\n- ${t.outline.join('\n- ')}`;
}

async function draft(pack, t, feedback) {
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt(pack, t) }];
  if (feedback) messages.push({ role: 'user', content: `Your previous answer failed validation: ${feedback}. Return a corrected, complete JSON object.` });
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=2024-10-21`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'api-key': KEY },
      body: JSON.stringify({ messages, temperature: 0.3, max_tokens: 12000, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(240000),
    });
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 5000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return { body: JSON.parse(data.choices[0].message.content), usage: data.usage };
  }
  throw new Error('gave up after retries');
}

function clean(out) {
  const s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  return {
    concepts: (out.concepts || []).map(c => ({ t: s(c.t, 140), what: s(c.what, 1500), why: s(c.why, 600), ex: s(c.ex, 3000), tip: s(c.tip, 400) })),
    qa: (out.qa || []).map(q => ({ l: Number(q.l), q: s(q.q, 500), a: s(q.a, 2000) })),
  };
}

const packFile = id => resolve(root, 'web/content/packs', `${id}.json`);
const tokens = { in: 0, out: 0 };

async function genPack(id) {
  const src = JSON.parse(readFileSync(resolve(root, 'content-src/packs', `${id}.json`), 'utf8'));
  const published = existsSync(packFile(id)) ? JSON.parse(readFileSync(packFile(id), 'utf8')) : { id: src.id, name: src.name, topics: [] };
  const have = new Set(published.topics.map(t => t.id));
  const todo = src.topics.filter(t => !have.has(t.id) && (!only || t.id === only));
  console.log(`${id}: ${todo.length} topic(s) to draft`);
  const results = new Map();
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const t = todo[next++];
      let feedback = null;
      for (let round = 0; round < 3; round++) {
        try {
          const { body, usage } = await draft(src, t, feedback);
          tokens.in += usage?.prompt_tokens || 0; tokens.out += usage?.completion_tokens || 0;
          const topic = { id: t.id, name: t.name, tag: t.tag || '', blurb: t.blurb, ...(t.stack ? { stack: t.stack } : {}), beta: true, ...clean(body) };
          const errs = validateTopic(topic, { strict: true });
          if (!errs.length) { results.set(t.id, topic); console.log(`  ✓ ${t.id} (${topic.concepts.length} cards, ${topic.qa.length} Qs)`); break; }
          feedback = errs.join('; ');
          console.log(`  … ${t.id} retry: ${feedback.slice(0, 160)}`);
        } catch (e) { feedback = null; console.log(`  ! ${t.id}: ${e.message}`); }
      }
      if (!results.has(t.id)) console.log(`  ✗ ${t.id} failed; rerun later with --only ${t.id}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  // Keep outline order; append new topics after already-published ones.
  const ordered = src.topics.map(t => results.get(t.id)).filter(Boolean);
  if (!ordered.length) return;
  const fresh = existsSync(packFile(id)) ? JSON.parse(readFileSync(packFile(id), 'utf8')) : published;
  fresh.topics.push(...ordered.filter(t => !fresh.topics.some(x => x.id === t.id)));
  writeFileSync(packFile(id), JSON.stringify(fresh));
}

const ids = target === 'all' ? readdirSync(resolve(root, 'content-src/packs')).map(f => f.replace(/\.json$/, '')) : [target];
for (const id of ids) await genPack(id);
execFileSync(process.execPath, [resolve(root, 'scripts/build-index.mjs')], { stdio: 'inherit' });
// gpt-4.1 list price: $2 / 1M input, $8 / 1M output.
console.log(`tokens in ${tokens.in}, out ${tokens.out}, est cost $${(tokens.in * 2e-6 + tokens.out * 8e-6).toFixed(2)}`);
