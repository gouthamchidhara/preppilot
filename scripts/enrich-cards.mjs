#!/usr/bin/env node
// Adds three short teaching lines to each existing card: why (how it works), ex (tiny example), trap (common mistake).
// Never changes q, a or the order, so progress and the content lock stay valid.
//   node scripts/enrich-cards.mjs --only cloud        one topic
//   node scripts/enrich-cards.mjs                     every card still missing them
// Needs AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY. ENRICH_DEPLOYMENT defaults to gpt-4.1.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
const KEY = process.env.AZURE_OPENAI_API_KEY;
const DEPLOYMENT = process.env.ENRICH_DEPLOYMENT || 'gpt-4.1';
const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
if (!ENDPOINT || !KEY) { console.error('Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY'); process.exit(1); }
const tokens = { in: 0, out: 0 };

async function ask(sys, user, max) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=2024-10-21`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'api-key': KEY },
      body: JSON.stringify({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0.2, max_tokens: max, response_format: { type: 'json_object' } }),
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

// Trim to n characters, ending at the last full sentence when it has to cut.
const clip = (s, n) => { if (typeof s !== 'string') return ''; s = s.trim(); if (s.length <= n) return s; const c = s.slice(0, n); const e = c.lastIndexOf('. '); return e > n / 3 ? c.slice(0, e + 1) : ''; };
async function enrich(topic, items) {
  const sys = `You are a senior engineer teaching a candidate who is learning this topic. For each interview card, add three short lines that make the answer understood, not memorised. Output ONLY JSON: {"cards":[{"i":0,"why":"...","ex":"...","trap":"..."}]}.
- why: at most two plain sentences, under 45 words, that teach something the answer does NOT already say: the mechanism underneath (what actually happens, step by step, cause → effect) or a plain everyday analogy. Never restate or summarise the answer. No filler words like "ensures", "helps", "improves", "leverage", "best practice".
- ex: a tiny concrete example that someone could type or picture: a 1-3 line code snippet, command, config line, or a real-world case with real numbers. Code goes in backticks. Use \\n between code lines.
- trap: the one mistake or misunderstanding an interviewer listens for, in one sentence.
Be technically exact. Only state facts you are certain of. Do not repeat the answer.`;
  const user = `Topic: ${topic.name}\n\n` + items.map(({ q, i }) => `#${i}\nQ: ${q.q}\nA: ${q.a}`).join('\n\n');
  const out = (await ask(sys, user, 4000)).cards || [];
  return out.map(x => ({ i: x.i, why: clip(x.why, 420), ex: clip(x.ex, 320), trap: clip(x.trap, 220) })).filter(x => x.why && x.ex && x.trap);
}
async function check(topic, items, adds) {
  if (!adds.length) return [];
  const sys = `You are a strict technical reviewer. Output ONLY JSON: {"verdicts":[{"k":0,"ok":true,"why":"short"}]} with EXACTLY ${adds.length} verdicts, one per card k=0..${adds.length - 1}. Mark ok=false if anything in why/ex/trap is wrong, misleading, contradicts the answer, or the example would not work.`;
  const user = `Topic: ${topic.name}\n\n` + adds.map((x, k) => { const q = items.find(y => y.i === x.i).q; return `card k=${k}\nQ: ${q.q}\nA: ${q.a}\nwhy: ${x.why}\nex: ${x.ex}\ntrap: ${x.trap}`; }).join('\n\n');
  const r = await ask(sys, user, 2500);
  const v = (r.verdicts || Object.values(r).find(Array.isArray) || []).map(x => ({ ...x, k: Number(x.k), ok: x.ok === true || x.ok === 'true' }));
  v.filter(x => !x.ok).forEach(x => console.log(`    ✗ ${adds[x.k]?.i}: ${x.why}`));
  return adds.filter((_, k) => v.some(x => x.k === k && x.ok));
}

const dir = resolve(root, 'web/content/packs');
let done = 0, dropped = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json')) {
  const file = resolve(dir, f); const pack = JSON.parse(readFileSync(file, 'utf8'));
  let changed = false;
  for (const t of pack.topics || []) {
    if (only && !only.has(t.id)) continue;
    const todo = t.qa.map((q, i) => ({ q, i })).filter(x => !x.q.why);
    if (!todo.length) continue;
    console.log(`${t.id}: ${todo.length} cards`);
    for (let s = 0; s < todo.length; s += 10) {
      const batch = todo.slice(s, s + 10);
      try {
        const adds = await enrich(t, batch);
        const ok = await check(t, batch, adds.filter(a => batch.some(b => b.i === a.i)));
        if (adds.length && !ok.length) console.log(`  no verdicts matched; ids ${adds.map(a => a.i)}`);
        for (const a of ok) Object.assign(t.qa[a.i], { why: a.why, ex: a.ex, trap: a.trap });
        done += ok.length; dropped += batch.length - ok.length; changed ||= ok.length > 0;
      } catch (e) { console.log(`  batch failed: ${e.message}`); dropped += batch.length; }
    }
  }
  if (changed) writeFileSync(file, JSON.stringify(pack));
}
console.log(`enriched ${done}, left for a rerun ${dropped}; tokens in ${tokens.in}, out ${tokens.out}`);
