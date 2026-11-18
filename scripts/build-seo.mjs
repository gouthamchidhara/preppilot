// Builds public, crawlable interview-question pages from the flashcard packs, for Google.
//   web/questions/index.html            all topics
//   web/questions/<topic-id>/index.html  one topic: questions with answers, link into the app
//   web/sitemap.xml, web/robots.txt
// Runs in the deploy workflow before upload; the output is not committed.
// Usage: node scripts/build-seo.mjs [--site https://preppilot.us]
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = resolve(root, 'web');
const args = process.argv.slice(2);
const SITE = (args.includes('--site') ? args[args.indexOf('--site') + 1] : 'https://preppilot.us').replace(/\/+$/, '');
const OPEN_ANSWERS = 12; // answers shown in full per page; the rest open in the app
const now = new Date();
const today = now.toISOString().slice(0, 10);
const month = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Card text uses `code` spans; keep them, escape everything else.
const rich = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const LEVEL = { 1: 'Core', 2: 'Intermediate', 3: 'Senior' };

const packs = readdirSync(resolve(web, 'content/packs')).filter(f => f.endsWith('.json') && f !== 'index.json').sort()
  .map(f => JSON.parse(readFileSync(resolve(web, 'content/packs', f), 'utf8')))
  .map(p => ({ ...p, topics: p.topics.filter(t => !t.private && Array.isArray(t.qa) && t.qa.length >= 5) }))
  .filter(p => p.topics.length);

const CSS = `
@font-face { font-family: "Newsreader"; src: url(/fonts/newsreader.woff2) format("woff2"); font-display: swap; }
@font-face { font-family: "Instrument Sans"; src: url(/fonts/instrument-sans.woff2) format("woff2"); font-display: swap; }
:root { --paper:#fafbfa; --bg:#eceeed; --ink:#1c2426; --ink-soft:#3b4649; --muted:#647074; --line:#d5dad8; --accent:#2f6b5c; --accent-soft:#dfeae5; --sunk:#e3e6e4;
  --serif:"Newsreader",Georgia,serif; --sans:"Instrument Sans",system-ui,sans-serif; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --paper:#1d2324; --bg:#151a1b; --ink:#e4e9e7; --ink-soft:#c3cbc8; --muted:#8f9b9c; --line:#2c3435; --accent:#86bfae; --accent-soft:#223631; --sunk:#101415; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 var(--sans); }
a { color: var(--accent); }
.wrap { max-width: 760px; margin: 0 auto; padding: 0 16px 64px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 0 8px; }
.brand { display: inline-flex; gap: 8px; align-items: center; color: var(--ink); text-decoration: none; font-weight: 700; }
.brand svg { width: 20px; height: 20px; }
.btn { display: inline-block; padding: 10px 16px; border-radius: 12px; background: var(--ink); color: var(--paper); text-decoration: none; font-weight: 600; font-size: 15px; }
.crumbs { font-size: 13px; color: var(--muted); margin: 18px 0 6px; } .crumbs a { color: var(--muted); }
h1 { font: 600 clamp(28px, 6vw, 40px)/1.15 var(--serif); margin: 0 0 10px; letter-spacing: -.01em; }
.lede { color: var(--ink-soft); margin: 0 0 6px; }
.meta { font-size: 13px; color: var(--muted); margin: 0 0 22px; }
.cta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 16px; margin: 0 0 28px; border-left: 3px solid var(--accent); border-radius: 0 14px 14px 0; background: var(--accent-soft); }
.cta p { flex: 1 1 260px; margin: 0; color: var(--ink-soft); font-size: 15px; } .cta b { color: var(--ink); }
h2 { font: 700 13px var(--sans); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 34px 0 10px; }
.qa { padding: 16px 18px; margin: 0 0 10px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); }
.qa h3 { font: 600 18px/1.4 var(--sans); margin: 0 0 8px; }
.qa p { margin: 0; color: var(--ink-soft); font: 400 17px/1.6 var(--serif); }
.qa.locked p a { font: 600 15px var(--sans); }
.qa.new { border-color: var(--accent); }
code { font: 14px ui-monospace, Menlo, Consolas, monospace; padding: 1px 5px; border-radius: 5px; background: var(--sunk); }
.topics { display: grid; gap: 8px; padding: 0; list-style: none; }
.topics a { display: flex; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); color: var(--ink); text-decoration: none; }
.topics small { color: var(--muted); white-space: nowrap; }
.topics span span { display: block; color: var(--muted); font-size: 14px; }
footer { margin-top: 40px; font-size: 14px; color: var(--muted); }
`;
const LOGO = '<svg viewBox="0 0 512 512" aria-hidden="true"><path d="M72 300 440 76 332 444l-90-144z" fill="currentColor"/><path d="M242 300 440 76 72 300z" fill="currentColor" opacity=".55"/></svg>';

const page = ({ title, desc, path, body, ld }) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${path}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="article"><meta property="og:url" content="${SITE}${path}">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<style>${CSS}</style>
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
</head><body><div class="wrap">
<header><a class="brand" href="/">${LOGO}PrepPilot</a><a class="btn" href="/">Practise free</a></header>
${body}
<footer>PrepPilot · interview prep, the short way · <a href="/questions/">All interview questions</a> · <a href="/privacy.html">Privacy</a></footer>
</div></body></html>`;

rmSync(resolve(web, 'questions'), { recursive: true, force: true });
const urls = [{ loc: '/', pri: '1.0' }, { loc: '/questions/', pri: '0.9' }];
let pages = 0, total = 0;

for (const p of packs) for (const t of p.topics) {
  const qa = [...t.qa].sort((a, b) => (a.l || 1) - (b.l || 1));
  total += qa.length;
  const path = `/questions/${t.id}/`;
  const title = `${t.name} interview questions and answers (${now.getFullYear()})`;
  const desc = `${qa.length} ${t.name} interview questions with short, clear answers: ${t.blurb || ''}. Practise them as flashcards.`.slice(0, 300);
  let shown = 0;
  const groups = [1, 2, 3].map(l => [l, qa.filter(x => (x.l || 1) === l)]).filter(([, xs]) => xs.length);
  const list = groups.map(([l, xs]) => `<h2>${LEVEL[l]} questions</h2>\n` + xs.map(x => {
    const open = shown++ < OPEN_ANSWERS;
    return `<section class="qa${open ? '' : ' locked'}"><h3>${rich(x.q)}</h3><p>${open ? rich(x.a) : `<a href="/">See the answer in the app, free</a>`}</p></section>`;
  }).join('\n')).join('\n');
  const recent = qa.filter(x => x.new && x.new >= new Date(now.getTime() - 62 * 86400000).toISOString().slice(0, 7));
  const fresh = recent.length ? `<h2>New this month</h2>\n` + recent.map(x => `<section class="qa new"><h3>${rich(x.q)}</h3><p>${rich(x.a)}</p></section>`).join('\n') : '';
  const related = p.topics.filter(o => o.id !== t.id);
  const body = `<nav class="crumbs"><a href="/questions/">Interview questions</a> › ${esc(p.name)}</nav>
<h1>${esc(t.name)} interview questions</h1>
<p class="lede">${esc(t.blurb || '')}</p>
<p class="meta">${qa.length} questions · ${t.tag ? esc(t.tag) + ' · ' : ''}updated ${month}</p>
<div class="cta"><p><b>Practise these as flashcards.</b> One or two lines each; the ones you miss come back first.</p><a class="btn" href="/">Start free</a></div>
${fresh}
${list}
${related.length ? `<h2>More ${esc(p.name)} topics</h2><ul class="topics">${related.map(o => `<li><a href="/questions/${o.id}/"><span>${esc(o.name)}</span><small>${o.qa.length} questions</small></a></li>`).join('')}</ul>` : ''}`;
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Interview questions', item: `${SITE}/questions/` },
    { '@type': 'ListItem', position: 2, name: t.name, item: `${SITE}${path}` }] };
  mkdirSync(resolve(web, `questions/${t.id}`), { recursive: true });
  writeFileSync(resolve(web, `questions/${t.id}/index.html`), page({ title, desc, path, body, ld }));
  urls.push({ loc: path, pri: '0.8' }); pages++;
}

const hub = `<h1>Tech interview questions and answers</h1>
<p class="lede">${total.toLocaleString('en-US')} questions across ${pages} topics, from Java and React to Kubernetes, SQL and machine learning. Short answers you can say out loud.</p>
<p class="meta">Updated ${month}</p>
<div class="cta"><p><b>Turn any topic into flashcards.</b> Pick your role and PrepPilot orders the topics for you.</p><a class="btn" href="/">Start free</a></div>
${packs.map(p => `<h2>${esc(p.name)}</h2><ul class="topics">${p.topics.map(t => `<li><a href="/questions/${t.id}/"><span>${esc(t.name)}<span>${esc(t.blurb || '')}</span></span><small>${t.qa.length} questions</small></a></li>`).join('')}</ul>`).join('\n')}`;
writeFileSync(resolve(web, 'questions/index.html'), page({ title: `Tech interview questions and answers (${now.getFullYear()}) · PrepPilot`, desc: `${total} interview questions with short answers for developer, data, cloud and QA roles. Practise them free as flashcards.`, path: '/questions/', body: hub }));

writeFileSync(resolve(web, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${SITE}${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`);
writeFileSync(resolve(web, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`SEO: ${pages} topic pages, ${total} questions, sitemap with ${urls.length} URLs`);
