// Builds web/content/trending.json: a light feed of what is new in tech, written as short cards.
// Sources are primary and free: official release feeds, cloud provider updates, engineering blogs,
// Hacker News and Lobsters. The AI picks what an interviewer might bring up and writes each card in
// its own words (nothing is copied), with a link back to the source.
//
// Usage: node scripts/build-trending.mjs [--max 24] [--dry]
// Needs AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY (env or api/.env); DRAFT_DEPLOYMENT (default gpt-4.1).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

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
const MAX = Number(args.includes('--max') ? args[args.indexOf('--max') + 1] : 24);
const DRY = args.includes('--dry');
const OUT = resolve(root, 'web/content/trending.json');
const KEEP_DAYS = 21;
const now = Date.now();

// Releases of the tools interviews ask about. GitHub serves an Atom feed per repo.
const REPOS = {
  'facebook/react': 'react', 'vercel/next.js': 'react', 'angular/angular': 'angular', 'microsoft/TypeScript': 'javascript',
  'nodejs/node': 'javascript', 'spring-projects/spring-boot': 'java', 'openjdk/jdk': 'java', 'python/cpython': 'python',
  'fastapi/fastapi': 'python', 'pandas-dev/pandas': 'python', 'golang/go': 'go', 'kubernetes/kubernetes': 'kubernetes',
  'docker/compose': 'docker', 'apache/kafka': 'kafka', 'apache/spark': 'data', 'postgres/postgres': 'sql',
  'hashicorp/terraform': 'cloud', 'microsoft/playwright': 'qa', 'dotnet/runtime': 'dotnet', 'flutter/flutter': 'mobile',
  'huggingface/transformers': 'ai', 'langchain-ai/langchain': 'ai', 'ollama/ollama': 'ai',
};
const RSS = {
  'AWS': ['https://aws.amazon.com/about-aws/whats-new/recent/feed/', 'cloud'],
  'Azure': ['https://azure.microsoft.com/en-us/updates/feed/', 'cloud'],
  'Google Cloud': ['https://cloudblog.withgoogle.com/rss/', 'cloud'],
  'Cloudflare blog': ['https://blog.cloudflare.com/rss/', 'infra'],
  'Netflix Tech Blog': ['https://netflixtechblog.com/feed', 'system-design'],
  'Uber Engineering': ['https://www.uber.com/blog/engineering/rss/', 'system-design'],
  'GitHub blog': ['https://github.blog/feed/', 'devops'],
  'Stripe engineering': ['https://stripe.com/blog/feed.rss', 'system-design'],
  'Kubernetes blog': ['https://kubernetes.io/feed.xml', 'kubernetes'],
  'Python Insider': ['https://blog.python.org/feeds/posts/default?alt=rss', 'python'],
  'Spring blog': ['https://spring.io/blog.atom', 'java'],
  'Node.js blog': ['https://nodejs.org/en/feed/blog.xml', 'javascript'],
  'Hugging Face blog': ['https://huggingface.co/blog/feed.xml', 'ai'],
};

function curl(url) {
  try { return execFileSync('curl', ['-sSL', '--compressed', '--max-time', '20', '-A', 'PrepPilot-trending/1.0', url], { encoding: 'utf8', maxBuffer: 8e6 }); } catch { return ''; }
}
async function get(url) {
  try { const r = await fetch(url, { headers: { 'user-agent': 'PrepPilot-trending/1.0' }, signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.text(); } catch { /* fall back */ }
  return curl(url); // some sandboxes only allow curl
}
const strip = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const tag = (xml, t) => (xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')) || [])[1] || '';
function parseFeed(xml) {
  const items = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(m => m[0]);
  return items.map(it => {
    const link = (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || strip(tag(it, 'link'));
    const date = Date.parse(strip(tag(it, 'pubDate') || tag(it, 'updated') || tag(it, 'published') || tag(it, 'dc:date')));
    return { title: strip(tag(it, 'title')), url: link, date: Number.isFinite(date) ? date : 0, text: strip(tag(it, 'description') || tag(it, 'summary') || tag(it, 'content')).slice(0, 500) };
  }).filter(x => x.title && x.url);
}

async function collect() {
  const since = now - 4 * 864e5;
  const raw = [];
  await Promise.all(Object.entries(REPOS).map(async ([repo, area]) => {
    for (const r of parseFeed(await get(`https://github.com/${repo}/releases.atom`)).slice(0, 3)) {
      if (r.date < since || /rc|alpha|beta|nightly|preview|canary/i.test(r.title)) continue;
      raw.push({ ...r, source: `${repo.split('/')[1]} release`, area });
    }
  }));
  await Promise.all(Object.entries(RSS).map(async ([name, [url, area]]) => {
    for (const r of parseFeed(await get(url)).slice(0, 15)) if (r.date >= since) raw.push({ ...r, source: name, area });
  }));
  try {
    const hn = JSON.parse(await get(`https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i>${Math.floor(since / 1000)},points>150&hitsPerPage=40`));
    for (const h of hn.hits || []) if (h.url) raw.push({ title: h.title, url: h.url, date: h.created_at_i * 1000, text: '', source: 'Hacker News', area: 'general', points: h.points });
  } catch { /* skip */ }
  try {
    const lb = JSON.parse(await get('https://lobste.rs/hottest.json'));
    for (const l of lb.slice(0, 25)) if (Date.parse(l.created_at) >= since) raw.push({ title: l.title, url: l.url || l.short_id_url, date: Date.parse(l.created_at), text: (l.tags || []).join(', '), source: 'Lobsters', area: 'general' });
  } catch { /* skip */ }
  const seen = new Set();
  return raw.filter(r => { const k = r.url.replace(/[?#].*$/, ''); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.points || 0) - (a.points || 0) || b.date - a.date).slice(0, 120);
}

async function ai(messages, maxTokens) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=2024-10-21`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'api-key': KEY },
      body: JSON.stringify({ messages, temperature: 0.3, max_tokens: maxTokens, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(180000),
    });
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 5000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    return JSON.parse((await res.json()).choices[0].message.content);
  }
  throw new Error('gave up');
}

const SYSTEM = `You write a light, factual tech feed for software engineers preparing for interviews. Output ONLY JSON: {"cards":[...]}.
From the candidate items, choose the ones a working engineer would genuinely want to know this week and that could come up in an interview: releases and features of major tools, cloud changes, notable engineering write-ups, important outages or security issues, meaningful AI developments. Skip funding, business news, opinion pieces, politics, drama, self-promotion, tutorials for beginners, and anything you cannot describe accurately from the item.
For each chosen item write: {"i": index of the item, "title": a plain headline in your own words (max 70 chars), "what": what happened in 1-2 sentences, "why": why it matters to an engineer in 1 sentence, "q": one interview question about the underlying concept this news touches (a regex vulnerability → "What is ReDoS and how do you prevent it?"; a cross-region failover feature → "How would you design cross-region failover?"), never trivia about the news itself, "a": a crisp answer in 1-2 sentences, "area": one of react, angular, javascript, java, python, go, dotnet, mobile, kubernetes, docker, cloud, infra, devops, sql, data, kafka, ai, qa, security, system-design, general}.
Rules: write in your own words, never copy sentences from the source. Only state facts present in the item or that you are certain of; if the item is too thin to describe, skip it. No hype, no emoji, no exclamation marks.`;

async function main() {
  const items = await collect();
  console.log(`collected ${items.length} items`);
  if (DRY) { items.slice(0, 15).forEach(x => console.log(`- [${x.source}] ${x.title}`)); return; }
  if (!ENDPOINT || !KEY) { console.error('Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY'); process.exit(1); }
  const cards = [];
  for (let off = 0; off < items.length && cards.length < MAX; off += 40) {
    const batch = items.slice(off, off + 40);
    const list = batch.map((x, i) => `#${i} [${x.source}] ${x.title}${x.text ? ` — ${x.text}` : ''}`).join('\n');
    const out = await ai([{ role: 'system', content: SYSTEM }, { role: 'user', content: `Pick up to ${MAX - cards.length} items.\n\n${list}` }], 4000);
    for (const c of out.cards || []) {
      const src = batch[c.i];
      if (!src || !c.title || !c.what || !c.q || !c.a) continue;
      cards.push({ id: Buffer.from(src.url).toString('base64url').slice(-16), title: String(c.title).slice(0, 90), what: String(c.what).slice(0, 320), why: String(c.why || '').slice(0, 220), q: String(c.q).slice(0, 200), a: String(c.a).slice(0, 360), area: String(c.area || src.area || 'general'), source: src.source, url: src.url, date: src.date || now });
    }
  }
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).cards || [] : [];
  const ids = new Set(cards.map(c => c.id));
  const merged = [...cards, ...prev.filter(c => !ids.has(c.id) && c.date > now - KEEP_DAYS * 864e5)].sort((a, b) => b.date - a.date).slice(0, 150);
  writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), cards: merged }, null, 0));
  console.log(`wrote ${cards.length} new, ${merged.length} total`);
}
main().catch(e => { console.error(e); process.exit(1); });
