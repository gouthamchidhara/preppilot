#!/usr/bin/env node
// Interview Lab: writes a worked answer for each question in content-src/lab-questions.json,
// has a second pass check it, and saves web/content/lab/<format>.json. Questions that already
// have an answer are kept as they are, so reruns only fill the gaps.
//   node scripts/build-lab.mjs                 every missing answer
//   node scripts/build-lab.mjs --only sql      one format
// Needs AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY. LAB_DEPLOYMENT defaults to gpt-4.1.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
const KEY = process.env.AZURE_OPENAI_API_KEY;
const DEPLOYMENT = process.env.LAB_DEPLOYMENT || 'gpt-4.1';
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
if (!ENDPOINT || !KEY) { console.error('Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY'); process.exit(1); }
const tokens = { in: 0, out: 0 };

async function ask(sys, user, max, temperature = 0.3) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=2024-10-21`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'api-key': KEY },
      body: JSON.stringify({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature, max_tokens: max, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(180000),
    });
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 5000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const d = await res.json();
    tokens.in += d.usage?.prompt_tokens || 0; tokens.out += d.usage?.completion_tokens || 0;
    return JSON.parse(d.choices[0].message.content);
  }
  throw new Error('gave up after retries');
}

// How a strong candidate lays out each kind of answer.
const SHAPE = {
  'system-design': 'Sections, in order: "Clarify the requirements" (functional and non-functional, with rough numbers), "API", "Data model", "High-level design" (the main components and how a request flows), "Scaling and bottlenecks", "Trade-offs". Name real technologies where they fit (e.g. Redis, Kafka, Postgres, S3, a CDN).',
  coding: 'Sections, in order: "Approach" (the idea in plain English, and why the obvious brute force is too slow), "Step by step", "Code" (clean Python 3, put it in the section\'s "code" field, comments only where useful), "Complexity" (time and space with one line of reasoning), "Edge cases".',
  sql: 'Sections, in order: "Tables" (a tiny example schema), "Query" (standard SQL that works on PostgreSQL, in the section\'s "code" field), "Why it works", "Variations" (e.g. ties, NULLs, another dialect if it differs).',
  lld: 'Sections, in order: "Requirements", "Classes and responsibilities", "Key code" (a compact Python sketch of the core classes and methods in the section\'s "code" field), "Patterns used" (and why), "Extensions" (how it grows).',
  behavioral: 'Sections, in order: "What they are really asking", "How to structure it" (STAR: situation, task, action, result), "Example answer" (a realistic first-person answer for a software or infrastructure engineer, 150-220 words, with a concrete result and a number), "Make it yours" (how to swap in your own story). This is guidance and an example, not a script to memorise.',
};

const clip = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
function clean(a) {
  if (!a || typeof a !== 'object') return null;
  const sections = (Array.isArray(a.sections) ? a.sections : []).slice(0, 8).map(s => ({
    h: clip(s?.h, 80),
    points: (Array.isArray(s?.points) ? s.points : []).slice(0, 9).map(p => clip(p, 400)).filter(Boolean),
    ...(typeof s?.code === 'string' && s.code.trim() ? { code: s.code.replace(/\t/g, '    ').trim().slice(0, 3000) } : {}),
  })).filter(s => s.h && (s.points.length || s.code));
  const out = {
    summary: clip(a.summary, 400),
    sections,
    followups: (Array.isArray(a.followups) ? a.followups : []).slice(0, 5).map(x => clip(x, 200)).filter(Boolean),
    mistakes: (Array.isArray(a.mistakes) ? a.mistakes : []).slice(0, 5).map(x => clip(x, 220)).filter(Boolean),
  };
  return out.summary && out.sections.length >= 3 ? out : null;
}

async function write(fmt, q) {
  const sys = `You are a senior engineer who interviews candidates. Write the worked answer a strong candidate would give, laid out so someone preparing can understand it, not just memorise it. Be technically exact and concrete; only state facts you are sure of. Plain English, short sentences, no filler. No markdown inside strings except backticks around code identifiers.
Output ONLY JSON: {"summary": "the answer in 2 sentences", "sections": [{"h": "heading", "points": ["..."], "code": "optional code"}], "followups": ["3 follow-up questions an interviewer would ask next"], "mistakes": ["3 mistakes candidates make on this one"]}.`;
  const user = `Format: ${fmt.name}\nQuestion: ${q.title}\nPitch it at ${q.level === 'all' ? 'any' : q.level} level.\n${SHAPE[fmt.id]}`;
  return clean(await ask(sys, user, 3500));
}
async function check(fmt, q, a) {
  const sys = 'You are a strict technical reviewer. Output ONLY JSON: {"ok": true|false, "why": "short"}. ok=false if anything is technically wrong, the code would not work, or the answer misses the core of the question.';
  const r = await ask(sys, `Format: ${fmt.name}\nQuestion: ${q.title}\nAnswer:\n${JSON.stringify(a)}`, 300, 0);
  if (!(r.ok === true || r.ok === 'true')) console.log(`    ✗ ${q.id}: ${r.why}`);
  return r.ok === true || r.ok === 'true';
}

const src = JSON.parse(readFileSync(resolve(root, 'content-src/lab-questions.json'), 'utf8'));
const dir = resolve(root, 'web/content/lab');
mkdirSync(dir, { recursive: true });
const index = [];
for (const fmt of src.formats) {
  const file = resolve(dir, `${fmt.id}.json`);
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { questions: [] };
  const done = Object.fromEntries(prev.questions.map(q => [q.id, q.answer]));
  const questions = fmt.questions.map(([id, title, level, tags]) => ({ id, title, level, tags, answer: done[id] || null }));
  if (!only || only === fmt.id) {
    const todo = questions.filter(q => !q.answer);
    console.log(`${fmt.id}: ${todo.length} to write`);
    for (let i = 0; i < todo.length; i += 4) {
      await Promise.all(todo.slice(i, i + 4).map(async q => {
        try {
          const a = await write(fmt, q);
          if (a && await check(fmt, q, a)) q.answer = a;
        } catch (e) { console.log(`    ! ${q.id}: ${e.message}`); }
      }));
    }
  }
  const out = { id: fmt.id, name: fmt.name, blurb: fmt.blurb, questions: questions.filter(q => q.answer) };
  writeFileSync(file, JSON.stringify(out));
  index.push({ id: fmt.id, name: fmt.name, blurb: fmt.blurb, count: out.questions.length });
  console.log(`  ${fmt.id}: ${out.questions.length}/${questions.length} answered`);
}
writeFileSync(resolve(dir, 'index.json'), JSON.stringify({ formats: index }));
console.log(`tokens in ${tokens.in}, out ${tokens.out}`);
