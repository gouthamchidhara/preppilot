import { LEVELS, buildPlan, rankTopics, dueCards, review, readiness, knowledgeMap, profileSummary, migrateProfile, effectiveRoles, daysUntil } from './plan.js';
import { store } from './store.js';
import { ai } from './ai.js';
import { voice } from './voice.js';
import { VoiceSession, realtimeSupported } from './realtime.js';
import { native, signedIn, signOut, renderGoogleButton, refreshAccount, onAccountChange, nativeSignIn, nativePurchase, nativeBuyLive, nativeRestore, listenNative, notifyBadge, notifyDaily, promptNotifications } from './auth.js';
import { initContent, getCatalog, getManifest, roleById, topicMeta, ensureTopics, ensureForProfile, loadedTopics, reportUrl } from './content.js';
import { diagramHtml, diagramFor, storyView, registerDiagramSpec } from './diagrams.js';
import { todayKey, recordActivity, streakDays, lastNDays } from './stats.js';
import { ringOffset, nextStage, prevStage, sceneName } from './animate.js';

const DAY = 86400000;
const app = document.getElementById('app');
const S = { view: 'home', topic: null, ci: 0, deck: null, di: 0, reveal: false, busy: false, listening: false, chatContext: '',
  rt: null, rtMode: null, rtStatus: '', rtStarting: false, voiceServer: false, live: null, pendingUser: false, muted: false,
  googleClientId: '', plans: null, paywall: false, draft: null, roleSearch: '', showPlans: false, fullPlan: false, allTopics: false, buying: null, buyBusy: false, healthLoaded: false, lastView: '', liveHint: null, suggestPending: false, dgStages: {}, prevMap: null, sheetDg: null };

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
function md(s) {
  const parts = String(s ?? '').split(/```[a-zA-Z]*\n?/);
  return parts.map((p, i) => (i % 2 ? `<pre><code>${esc(p.replace(/\n$/, ''))}</code></pre>` : fmt(p).replace(/(^|<br>)[-*] /g, '$1• '))).join('');
}
const ICONS = {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  micoff: '<path d="M9 9v2a3 3 0 0 0 5 2.2M15 9.5V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.4 2.3M12 18v3M3 3l18 18"/>',
  ear: '<path d="M6 9a6 6 0 1 1 12 0c0 3-2.5 4-3.5 5.5S14 18 12 19.5 7.5 19 7.5 17"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-1.5 2-2 3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M4 12.5 9.5 18 20 6.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.7 7.5 9 4.3-1.3 7.5-4.5 7.5-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/>',
  cards: '<rect x="3" y="7" width="14" height="13" rx="2.5"/><path d="M7 4h11a3 3 0 0 1 3 3v10"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 2h13"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const ticks = (items, cls = '') => `<ul class="ticks ${cls}">${items.filter(Boolean).map(t => `<li>${ic('check')}<span>${t}</span></li>`).join('')}</ul>`;
function toast(msg, kind = '') {
  const t = Object.assign(document.createElement('div'), { className: `toast ${kind}`, innerHTML: `${ic(kind === 'bad' ? 'alert' : 'check')}<span>${esc(msg)}</span>` });
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'bad' ? 6000 : 4200);
}
const oops = msg => toast(msg, 'bad');
function closeSheet() { document.getElementById('sheet')?.remove(); S.sheetDg = null; }
function sheet(html) {
  closeSheet();
  document.body.appendChild(Object.assign(document.createElement('div'), { id: 'sheet', innerHTML: `<div role="dialog" aria-modal="true">${html}</div>` }));
}
// The diagram sheet lives outside #app, so a plain render() never refreshes
// it — the player inside it has to rebuild the sheet itself.
function dgSheetHtml(id) {
  return `<div class="stack"><h2>${esc(topicName(id))}</h2>${diagramHtml(id, S.dgStages[id] ?? null)}<button class="btn block" data-act="closesheet">Back to the cards</button></div>`;
}
function refreshDgSheet(id) {
  if (S.sheetDg !== id || !document.getElementById('sheet')) return;
  sheet(dgSheetHtml(id));
  S.sheetDg = id; // sheet() clears it via closeSheet(); restore it.
}

const topics = () => [...loadedTopics(), ...store.customTopics(), ...store.privatePacks().flatMap(p => p.topics.map(t => ({ ...t, private: true })))];
const topicById = id => topics().find(t => t.id === id);
const topicName = id => topicById(id)?.name || topicMeta(id)?.name || id;
const roleName = id => roleById(id)?.name || id;
const profile = () => store.profile();
const summary = () => profileSummary(profile(), { roleName, topicName });
const isNotice = m => /^(ℹ️|⚠️)/.test(m.content);

function planFor(p) { return buildPlan(topics(), p, p.planStart || Date.now()); }
function todayIndex(p) { return Math.max(0, Math.floor((Date.now() - (p.planStart || Date.now())) / DAY)); }

function betaNote(t, where) {
  return t?.beta ? `<div class="small muted"><a class="link quiet small" href="${esc(reportUrl(t, where))}" target="_blank" rel="noopener">Report a problem</a></div>` : '';
}

/* ---------- pricing facts (server-provided, with offline fallbacks) ---------- */
function offer() {
  const P = S.plans;
  const [amount, per = 'month'] = (P?.pro.price || '$7.99/month').split('/');
  const n = parseFloat(amount.replace(/[^\d.]/g, ''));
  return {
    freeMsgs: P?.free.msgs ?? 15, freeVoice: P?.free.voiceMin ?? 2,
    proMsgs: P?.pro.msgs ?? 500, proVoice: P?.pro.voiceMin ?? 45, proPrice: `${amount}/${per}`, proAmount: amount, proPer: per,
    perDay: amount.trim().startsWith('$') && n > 0 && per === 'month' ? `About ${Math.round((n / 30) * 100)}¢ a day` : '',
    livePrice: P?.live?.price || '$10.99', liveMin: P?.live?.minutes ?? 60,
  };
}
const storeName = () => (window.PP_PLATFORM === 'android' ? 'Google Play' : 'App Store');
const liveState = () => { const a = store.account(); return { credits: a?.sessionCredits || 0, left: a?.liveSecLeft || 0 }; };

/* ---------- badge + daily notification (native app only) ---------- */
// The daily nudge rotates one per day through web/content/nudges.json.
// {topic} and {due} are filled in from today's plan. The native side only
// schedules what it is sent; nothing here prompts without the user having
// finished a flashcard round first (see the grade handler below).
let NUDGES = null;
async function loadNudges() {
  try {
    const res = await fetch('content/nudges.json');
    if (res.ok) NUDGES = await res.json();
  } catch { /* fallback nudge below */ }
}
const FALLBACK_NUDGE = { title: 'Today', body: 'A quick round of {topic} is waiting.' };
function pickNudge(topic, due) {
  const list = NUDGES?.nudges?.length ? NUDGES.nudges : [FALLBACK_NUDGE];
  const pool = due === 0 ? list.filter(n => !n.body.includes('{due}')) : list;
  const use = pool.length ? pool : list;
  const today = new Date().toISOString().slice(0, 10);
  let idx = store.nudgeIndex();
  if (store.nudgeDay() !== today) { idx = (idx + 1) % use.length; store.setNudgeIndex(idx); store.setNudgeDay(today); }
  const n = use[idx % use.length];
  return { title: n.title, body: n.body.replaceAll('{topic}', topic).replaceAll('{due}', String(due)) };
}
function dailyReminder() {
  const p = profile();
  if (!p) return null;
  const plan = planFor(p);
  const ti = Math.min(todayIndex(p), plan.length - 1);
  const day = plan[ti];
  const prog = store.progress();
  const due = dueCards(topics(), p, prog, Date.now(), 999);
  const topic = day.kind === 'learn' ? topicName(day.topics[0]) : due[0] ? topicName(due[0].topic) : 'practice';
  const line = day.kind === 'live' ? 'Live coach practice test today'
    : day.kind === 'review' ? (due.length ? `${due.length} card${due.length === 1 ? '' : 's'} due for review` : 'Nothing due — pick any topic')
    : `Today: ${topic}`;
  const n = pickNudge(topic, due.length);
  return { title: n.title, body: `${line}. ${n.body}`.slice(0, 240), due: due.length };
}
let lastBadge = -1, lastDailyKey = '';
function syncNativeHome() {
  const d = dailyReminder();
  if (!d) return;
  if (d.due !== lastBadge) { lastBadge = d.due; notifyBadge(d.due); }
  const key = `${d.title}|${d.body}`;
  if (key !== lastDailyKey) { lastDailyKey = key; notifyDaily(d.title, d.body); }
}

/* ---------- onboarding ---------- */
// The form re-renders when the role changes (role decides which extras and self-rating chips appear),
// so field values are mirrored into S.draft first.
function captureDraft() {
  const f = document.getElementById('profileForm');
  if (!f || !S.draft) return;
  const fd = new FormData(f);
  for (const k of ['level', 'background', 'goal', 'interviewDate', 'otherRole', 'baseRoleId']) if (fd.has(k)) S.draft[k] = String(fd.get(k) || '').trim();
  const rated = [...f.querySelectorAll('.chip.rate')];
  if (rated.length) {
    S.draft.strong = rated.filter(b => b.classList.contains('strong')).map(b => b.dataset.id);
    S.draft.weak = rated.filter(b => b.classList.contains('weak')).map(b => b.dataset.id);
  }
  const extras = [...f.querySelectorAll('.chip.extra')];
  if (extras.length) S.draft.extras = extras.filter(b => b.classList.contains('on')).map(b => b.dataset.id);
}

function welcome() {
  return `<section class="head" style="padding:18px 0 26px">
    <h1>Prepare for the interview you actually have.</h1>
    <p class="lede" style="margin-top:12px">Tell PrepPilot the role and the date. It lays out what to study each day, drills you on what you miss, and listens while you practice your answers out loud.</p>
  </section>`;
}

function onboardingView(existing) {
  S.draft ||= migrateProfile(existing || { roleIds: [], level: 'mid', strong: [], weak: [], extras: [] });
  const d = S.draft;
  const cat = getCatalog();
  const roles = effectiveRoles(d).map(roleById).filter(Boolean);
  const chosen = d.roleIds.length && (!d.roleIds.includes('other') || d.baseRoleId);
  const rate = id => (d.strong?.includes(id) ? 'strong' : d.weak?.includes(id) ? 'weak' : '');
  const core = [...new Set(roles.flatMap(role => Object.entries(role.topics).filter(([, w]) => w === 3).map(([id]) => id)))];
  const extras = [...new Set(roles.flatMap(role => role.extras || []))];
  const roleBtn = r => `<button type="button" class="chip ${d.roleIds.includes(r.id) ? 'on' : ''}" aria-pressed="${d.roleIds.includes(r.id)}" data-act="pickrole" data-id="${r.id}" data-search="${esc((r.name + ' ' + (r.keywords || '')).toLowerCase())}">${esc(r.name)}</button>`;
  const step = (n, body) => `<div class="step"><div class="n">${n}</div><div class="stack">${body}</div></div>`;
  return `${existing ? '' : welcome()}
  <form class="stack" id="profileForm" style="gap:26px">
    ${existing ? '<div class="head"><h2>Your prep profile</h2><p class="muted">Saving rebuilds your plan. This stays on your device.</p></div>' : ''}
    ${step(1, `<fieldset class="stack"><legend>Which roles are you interviewing for?</legend>
      <input id="roleSearch" value="${esc(S.roleSearch)}" placeholder="Search roles: java, react, kubernetes" autocomplete="off" aria-label="Search roles">
      ${cat.families.map(f => `<div class="rolefam"><div class="label">${esc(f.name)}</div><div class="chips">${cat.roles.filter(r => r.family === f.id).map(roleBtn).join('')}</div></div>`).join('')}
      <div class="chips"><button type="button" class="chip ${d.roleIds.includes('other') ? 'on' : ''}" aria-pressed="${d.roleIds.includes('other')}" data-act="pickrole" data-id="other" data-search="other not listed">Other / not listed</button></div>
      ${d.roleIds.length > 1 ? '<p class="note" role="status">Your plan will combine these roles. You can still practice one role at a time from the plan.</p>' : ''}
      ${d.roleIds.includes('other') ? `<label>Your role<input name="otherRole" maxlength="60" value="${esc(d.otherRole || '')}" placeholder="e.g. Salesforce developer" required></label>
        <label>Closest role above (picks your starter topics)<select name="baseRoleId" data-act="baserole" required><option value="">Choose…</option>${cat.roles.map(r => `<option value="${r.id}" ${d.baseRoleId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>` : ''}
    </fieldset>`)}
    ${chosen ? `
    ${step(2, `<fieldset class="stack"><legend>About you</legend>
      <label>Experience<select name="level">${LEVELS.map(l => `<option value="${l.id}" ${d.level === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      <label>Interview date, if you have one<input type="date" name="interviewDate" value="${esc(d.interviewDate || '')}"></label>
      <label>Your background, in a line or two<textarea name="background" rows="3" maxlength="600" placeholder="e.g. 4 years of Java microservices, some AWS">${esc(d.background || '')}</textarea></label>
      <label>What you're aiming for<input name="goal" maxlength="200" value="${esc(d.goal || '')}" placeholder="e.g. Senior backend roles at product companies"></label>
      ${extras.length ? `<div class="stack tight"><span style="font-weight:600;font-size:14px">Other tech you use</span>
        <div class="chips">${extras.map(id => `<button type="button" class="chip extra ${d.extras?.includes(id) ? 'on' : ''}" data-act="extra" data-id="${id}">${esc(topicName(id))}</button>`).join('')}</div></div>` : ''}
    </fieldset>`)}
    ${step(3, `<fieldset class="stack"><legend>Where do you stand on the core topics?</legend>
      <p class="muted small" style="margin-top:-6px">Tap a topic once for strong, twice for weak. Weak topics are studied first.</p>
      <div class="chips">${core.map(id => `<button type="button" class="chip rate ${rate(id)}" data-act="rate" data-id="${id}">${esc(topicName(id))}</button>`).join('')}</div>
    </fieldset>`)}
    <button class="btn primary lg block" type="submit">${existing ? 'Save profile' : 'Build my plan'}</button>` : ''}
  </form>`;
}

async function saveProfile() {
  captureDraft();
  const d = S.draft;
  if (!d?.roleIds.length || (d.roleIds.includes('other') && (!d.baseRoleId || !d.otherRole))) return oops('Choose a role, and fill in the details if you picked "Other".');
  const prev = profile();
  const p = { ...d, roleId: d.roleIds[0], planStart: prev?.planStart || Date.now() };
  if (!p.roleIds.includes('other')) { delete p.otherRole; delete p.baseRoleId; }
  const roles = effectiveRoles(p).map(roleById).filter(Boolean);
  p.extras = (p.extras || []).filter(id => roles.some(role => role.extras?.includes(id)));
  p.strong = (p.strong || []).filter(id => roles.some(role => role.topics?.[id]));
  p.weak = (p.weak || []).filter(id => roles.some(role => role.topics?.[id]));
  store.setProfile(p);
  S.draft = null;
  if (p.roleIds.includes('other') && p.otherRole !== prev?.otherRole) ai.reportRole(p.otherRole).catch(() => {});
  app.innerHTML = '<p class="muted">Building your plan…</p>';
  try { await ensureForProfile(p); } catch { oops('Could not download your topics. Check your connection.'); }
  if (prev) toast('Profile saved. Your plan is updated.');
  S.view = 'home'; render();
}

/* ---------- views ---------- */
function livePromo() {
  const { credits, left } = liveState();
  const o = offer();
  const [head, title, text, cta] = left >= 20
    ? ['Session in progress', 'Your practice test is still open', `${Math.ceil(left / 60)} minutes left. Rejoin and pick up where you stopped.`, '<button class="btn invert lg" data-act="livesetup">Rejoin the session</button>']
    : credits
      ? [`${credits} session${credits > 1 ? 's' : ''} ready`, 'Your live coach is waiting', `A full hour, spoken, with hints as each question lands and feedback after every answer.`, '<button class="btn invert lg" data-act="livesetup">Start the practice test</button>']
      : [`${o.liveMin} minutes, ${o.livePrice}`, 'An hour with a live coach', 'It asks the questions your role gets asked, out loud, one after another. A hint appears as each question lands, and you hear what a strong answer would have added. Best done the day before your interview, or an hour before it.', `<button class="btn invert lg" data-act="buylive" ${S.buyBusy ? 'disabled' : ''}>Get a session</button>`];
  return `<section class="card stacked live-hero" aria-label="Live coach">
    <div class="card-head"><span>Live coach: practice test</span><span>${esc(head)}</span></div>
    <h2>${esc(title)}</h2>
    <p style="margin-top:8px">${esc(text)}</p>
    <ul class="live-points"><li>Continuous for the full session</li><li>Hints as each question lands</li><li>Verdict at the end</li></ul>
    <div class="row" style="margin-top:18px">${cta}${credits || left >= 20 ? '' : '<button class="btn quiet invert-quiet" data-act="plans">How it works</button>'}</div>
  </section>`;
}

function homeView() {
  const p = profile();
  const relevant = rankTopics(topics(), p);
  if (!relevant.length) return '<p class="muted">Loading your topics…</p>';
  const plan = planFor(p);
  const ti = Math.min(todayIndex(p), plan.length - 1);
  const today = plan[ti];
  const prog = store.progress();
  const map = knowledgeMap(relevant, p, prog);
  // Remember this render's map so the next one can highlight tiles that moved up.
  const prevMap = S.prevMap;
  S.prevMap = Object.fromEntries(map.topics.map(t => [t.id, t.state]));
  const knownTotal = map.topics.reduce((n, t) => n + t.known, 0);
  const cardsTotal = map.topics.reduce((n, t) => n + t.total, 0);
  const due = dueCards(topics(), p, prog, Date.now(), 999).length;
  const left = daysUntil(p.interviewDate);
  const dayLabel = d => d.kind === 'live' ? 'Live coach: practice test' : d.kind === 'review' ? 'Mixed review' : d.topics.map(topicName).join(', ');
  const mine = new Set(relevant.map(t => t.id));
  const others = getManifest().packs.map(pk => ({ ...pk, topics: pk.topics.filter(t => !mine.has(t.id)) })).filter(pk => pk.topics.length);
  const roleIds = migrateProfile(p).roleIds;
  const label = id => id === 'other' ? p.otherRole : roleName(id);
  const short = iso => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  const todayTopics = today.kind === 'learn' ? today.topics.map(topicById).filter(Boolean) : [];
  const nLearn = todayTopics.reduce((n, t) => n + t.concepts.length, 0);
  const nQs = todayTopics.reduce((n, t) => n + t.qa.length, 0);
  const todayHint = today.kind === 'live'
    ? 'A full practice test with the live coach: spoken questions for your role, hints as you go, and honest feedback after every answer.'
    : today.kind === 'review'
    ? (due ? `${due} card${due === 1 ? '' : 's'} due. The ones you missed come first.` : 'Nothing is due. Pick any topic below to get ahead.')
    : `${nLearn} short lesson${nLearn === 1 ? '' : 's'}, then ${nQs} question${nQs === 1 ? '' : 's'} to check it stuck.`;
  const countdown = left === null ? `Day ${ti + 1} of ${plan.length}` : left === 0 ? 'Your interview is today' : `${left} day${left === 1 ? '' : 's'} until your interview`;
  const upcoming = S.fullPlan ? plan.map((d, i) => [d, i]) : plan.map((d, i) => [d, i]).slice(ti, ti + 5);
  const topicRow = t => {
    const tr = readiness([t], p, prog);
    return `<button class="rowi" data-act="learn" data-id="${t.id}">
      <span class="main"><span class="t">${esc(t.name)}</span><span class="d">${esc(t.blurb || '')}</span></span>
      ${tr.total ? `<span class="pct"><span>${tr.pct}%</span><span class="bar"><i style="width:${tr.pct}%"></i></span></span>` : ''}</button>`;
  };
  return `<div class="stack loose">
    <section class="greet">
      <div class="label">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
      <h1>${esc(countdown)}</h1>
    </section>
    ${livePromo()}
    <section class="card stacked">
      <div class="card-head"><span>Today, day ${ti + 1} of ${plan.length}</span>${due ? `<span>${due} due</span>` : ''}</div>
      <h2>${esc(today.kind === 'review' ? 'Review what is due' : today.kind === 'live' ? 'Live coach: practice test' : dayLabel(today))}</h2>
      <p class="muted" style="margin-top:8px">${esc(todayHint)}</p>
      <div class="row" style="margin-top:20px">
        ${today.kind === 'learn' ? `<button class="btn primary" data-act="learn" data-id="${today.topics[0]}">Start today's lesson</button>` : ''}
        ${today.kind === 'live' ? `<button class="btn primary" data-act="livesetup">Start the practice test</button>` : ''}
        <button class="btn ${today.kind === 'learn' || today.kind === 'live' ? '' : 'primary'}" data-act="deck" data-id="${today.kind === 'learn' ? today.topics.join(',') : ''}">Practice flashcards</button>
      </div>
    </section>
    <section class="knowmap" aria-label="What you know">
      <div class="nums"><span><b>What you know</b></span><span><b data-countup="${knownTotal}">${knownTotal}</b> of ${cardsTotal} cards known</span></div>
      <div class="tiles">${map.topics.map((t, i) => {
        // A tile that moved up a state since the last render gets a brief highlight.
        const order = { unseen: 0, weak: 1, ok: 2, strong: 3 };
        const fresh = prevMap && prevMap[t.id] !== undefined && order[t.state] > order[prevMap[t.id]];
        return `<button class="tile ${t.state}${fresh ? ' tile-fresh' : ''}" data-act="learn" data-id="${t.id}" style="animation-delay:${S._stagger ? i * 60 : 0}ms" aria-label="${esc(t.name)}: ${t.state === 'strong' ? 'solid' : t.state === 'ok' ? 'getting there' : t.state === 'weak' ? 'shaky' : 'not started'}, ${t.known} of ${t.total} cards known">
        <span class="t">${esc(t.name)}</span><span class="bar"><i style="width:${t.pct}%;animation-delay:${S._stagger ? i * 60 + 150 : 0}ms"></i></span>
        <span class="m">${t.state === 'strong' ? 'Solid' : t.state === 'ok' ? 'Getting there' : t.state === 'weak' ? 'Shaky' : 'Not started'} · ${t.total ? `${t.known}/${t.total}` : 'no cards here'}</span></button>`; }).join('')}</div>
      <p class="muted small">${map.counts.strong} solid · ${map.counts.ok} getting there · ${map.counts.weak} shaky · ${map.counts.unseen} not started</p>
    </section>
    <section>
      <div class="sec-head"><h3>${S.fullPlan ? 'Full plan' : 'Coming up'}</h3><button class="link quiet small" data-act="toggleplan">${S.fullPlan ? 'Show less' : `All ${plan.length} days`}</button></div>
      <div class="rows">${upcoming.map(([d, i]) => `<button class="rowi ${i < ti ? 'past' : i === ti ? 'now' : ''}" ${d.kind === 'learn' ? `data-act="learn" data-id="${d.topics[0]}"` : d.kind === 'live' ? 'data-act="livesetup"' : 'data-act="deck"'}>
        <span class="when">${i === ti ? 'Today' : esc(short(d.date))}</span><span class="main"><span class="t">${esc(dayLabel(d))}</span></span></button>`).join('')}</div>
    </section>
    ${roleIds.length > 1 ? `<section><div class="sec-head"><h3>Practice one role</h3></div><div class="chips">${roleIds.map(id => `<button class="chip" data-act="roledeck" data-id="${esc(id)}">${esc(label(id))}</button>`).join('')}</div></section>` : ''}
    ${roleIds.includes('other') ? `<section class="panel stack"><h3>Make it specific to ${esc(p.otherRole)}</h3>
      <p class="muted">Your plan starts from the closest listed role. The coach can write topics for your exact role. This uses 5 AI messages.</p>
      <div class="row"><button class="btn" data-act="buildrole" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Writing your guide…' : 'Write my role guide'}</button></div></section>` : ''}
    <section>
      <div class="sec-head"><h3>Your topics</h3>${relevant.length > 8 ? `<button class="link quiet small" data-act="toggletopics">${S.allTopics ? 'Show fewer' : `All ${relevant.length} topics`}</button>` : ''}</div>
      <div class="rows">${(S.allTopics ? relevant : relevant.slice(0, 8)).map(topicRow).join('')}</div>
    </section>
    <details><summary>Browse other topics</summary>
      <div class="stack" style="margin-top:16px">${others.map(pk => `<div class="rolefam"><div class="label">${esc(pk.name)}</div><div class="chips">${pk.topics.map(t => `<button class="chip" data-act="learn" data-id="${t.id}">${esc(t.name)}</button>`).join('')}</div></div>`).join('')}</div>
    </details>
  </div>`;
}

function learnView() {
  const t = topicById(S.topic);
  if (!t) return '<p class="muted">Loading…</p>';
  const c = t.concepts[S.ci];
  if (!c) return `<div class="stack"><h2>${esc(t.name)}</h2><p class="muted">This topic has questions only.</p><div class="row"><button class="btn primary" data-act="deck" data-id="${t.id}">Practice flashcards</button></div></div>`;
  const last = S.ci >= t.concepts.length - 1;
  // The lesson is a story and the diagram is its visual thread: it builds
  // piece by piece as the cards go on, so finishing the lesson means
  // finishing the picture. Every card shows the scene it is in; cards with
  // a diagram show the building picture with the current scene highlighted.
  const story = storyView(t.id, S.ci, t.concepts.length);
  const scene = `<div class="scene"><span class="label">Scene ${S.ci + 1} of ${t.concepts.length} · ${esc(sceneName(S.ci, t.concepts.length))}</span>${story ? `<span class="muted small">Step ${story.focus + 1} of ${story.steps} · the picture builds as you read</span>` : ''}</div>`;
  return `<div class="stack">
    <div class="row between"><button class="back" data-act="home">${ic('left')}Plan</button><span class="muted small">${esc(t.name)}, ${S.ci + 1} of ${t.concepts.length}</span></div>
    <div class="segs">${t.concepts.map((_, i) => `<i class="${i <= S.ci ? 'on' : ''}"></i>`).join('')}</div>
    ${story ? `${scene}${story.html}` : scene}
    <article class="lesson" style="padding:14px 0 6px">
      <h1>${esc(c.t)}</h1>
      <div class="part body" style="margin-top:16px"><p class="lede" style="max-width:none">${fmt(c.what)}</p></div>
      ${c.why ? `<div class="part"><div class="label">Why interviewers ask</div><p style="font:400 1.05rem/1.6 var(--serif);color:var(--ink-soft)">${fmt(c.why)}</p></div>` : ''}
      ${c.ex ? `<div class="part"><div class="label">Example</div><pre><code>${esc(c.ex)}</code></pre></div>` : ''}
      ${c.tip ? `<div class="part say"><div class="label">Say it like this</div><p style="font:400 1.05rem/1.6 var(--serif)">${fmt(c.tip)}</p></div>` : ''}
      ${t.beta ? `<div class="part">${betaNote(t, `card ${S.ci + 1}: ${c.t}`)}</div>` : ''}
    </article>
    <div class="row">
      <button class="btn" data-act="cprev" ${S.ci === 0 ? 'disabled' : ''} aria-label="Previous lesson">${ic('left')}</button>
      <button class="btn" data-act="askcard">Ask the coach</button>
      ${last ? `<button class="btn primary grow" data-act="deck" data-id="${t.id}">Test yourself</button>` : '<button class="btn primary grow" data-act="cnext">Next lesson</button>'}
    </div>
    ${last ? `<p class="muted small" style="margin-top:2px">That's the whole story — the picture is finished. Test yourself while it's fresh.</p>` : ''}
  </div>`;
}

function deckView() {
  const d = S.deck;
  if (!d.cards.length) return `<div class="stack" style="padding-top:30px"><h1>Nothing is due.</h1><p class="lede">Every card in this set is scheduled for later. Start a new topic, or come back tomorrow.</p><div class="row"><button class="btn primary" data-act="home">Back to plan</button></div></div>`;
  if (S.di >= d.cards.length) {
    const got = d.results.filter(Boolean).length;
    const pct = Math.round((got * 100) / d.cards.length);
    // The topic with the most missed cards gets its diagram right here, so the
    // fix is one look away instead of a hunt through the lessons.
    const missed = {};
    d.cards.forEach((c, i) => { if (!d.results[i]) missed[c.topic] = (missed[c.topic] || 0) + 1; });
    const worst = Object.entries(missed).sort((a, b) => b[1] - a[1])[0]?.[0];
    return `<div class="stack" style="padding-top:30px">
      <div class="score-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="52"/><circle class="ring-prog" cx="60" cy="60" r="52" pathLength="100" style="stroke-dashoffset:${ringOffset(pct)}"/></svg><div class="score-num"><span class="n" data-countup="${got}">${got}</span><span class="muted small">of ${d.cards.length} · ${pct}%</span></div></div>
      <h2>${pct >= 80 ? 'A strong round.' : pct >= 50 ? 'Getting there.' : 'Better to find out now.'}</h2>
      <p class="lede">${pct >= 80 ? 'These cards come back later, spaced further apart each time.' : 'The cards you missed come back first next time. Rereading the lessons for those topics will help.'}</p>
      ${worst && diagramFor(worst) ? `<section class="stack tight"><h3>The one to reread: ${esc(topicName(worst))}</h3>${diagramHtml(worst)}<div class="row"><button class="btn" data-act="learn" data-id="${worst}">Reread the ${esc(topicName(worst))} lesson</button></div></section>` : ''}
      <div class="row"><button class="btn primary" data-act="deck" data-id="">Practice another round</button><button class="btn" data-act="home">Back to plan</button></div></div>`;
  }
  const q = d.cards[S.di];
  const t = topicById(q.topic);
  const singleTopic = d.cards.length && d.cards.every(c => c.topic === d.cards[0].topic) ? d.cards[0].topic : null;
  return `<div class="stack">
    <div class="row between"><button class="back" data-act="home">${ic('left')}Stop</button><span class="muted small">Card ${S.di + 1} of ${d.cards.length}</span></div>
    <div class="bar"><i style="width:${(S.di * 100) / d.cards.length}%"></i></div>
    ${singleTopic && diagramFor(singleTopic) ? `<div class="row between"><span></span><button class="link quiet small" data-act="dgsheet" data-id="${singleTopic}">How it works — see the diagram</button></div>` : ''}
    <article class="card stacked flash" id="flash">
      <div class="card-head"><span>${esc(t?.name || q.topic)}</span><span class="level">${['', 'Fundamentals', 'Applied', 'Advanced'][q.l] || ''}</span></div>
      <p class="q">${fmt(q.q)}</p>
      ${S.reveal ? `<div class="ans">${fmt(q.a)}</div>` : ''}
      <div class="foot">${S.reveal ? `
        <div class="row"><button class="btn miss lg" data-act="grade" data-ok="0">Missed it</button><button class="btn got lg" data-act="grade" data-ok="1">Got it</button></div>
        <div class="row between small"><button class="link quiet" data-act="askq">Go deeper with the coach</button>${betaNote(t, `question: ${q.q}`)}</div>`
      : '<button class="btn primary lg block" data-act="reveal">Show the answer</button><p class="muted small" style="text-align:center">Say your answer out loud first.</p>'}
      <p class="muted small kbd-hint" style="text-align:center">Space to reveal · ← missed · → got it</p></div>
    </article>
  </div>`;
}

const STATUS = { connecting: 'Connecting…', ready: 'Listening. Just talk.', listening: 'Listening. I won\'t interrupt.', you: 'You\'re speaking…', thinking: 'Thinking…', ai: 'Speaking. Talk to interrupt.' };
const MODE_NAME = { talk: 'Talk', listen: 'Rehearse', live: 'Live coach' };
const clock = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function voicePanel() {
  if (S.rt) {
    return `<section class="panel stage">
      <div class="pulse status-${S.rtStatus} ${S.muted ? 'muted' : ''}" id="rtOrb"></div>
      <div><div class="status" id="rtStatus">${esc(S.muted ? 'Muted' : STATUS[S.rtStatus] || S.rtStatus)}</div>
        <div class="timer" id="rtTimer">${esc(MODE_NAME[S.rtMode] || '')}</div></div>
      <div class="ctl">
        ${S.rtMode === 'listen' ? '<button class="btn primary" data-act="rtrespond">Get feedback</button>' : '<button class="btn" data-act="rtinterrupt">Interrupt</button>'}
        <button class="btn" data-act="rtmute">${S.muted ? 'Unmute' : 'Mute'}</button>
        <button class="btn danger" data-act="rtstop">End</button>
      </div>
    </section>`;
  }
  if (!(S.voiceServer && realtimeSupported)) {
    return S.healthLoaded ? `<p class="note">Live voice isn't available ${S.voiceServer ? 'in this browser' : 'right now'}. You can still type, or dictate with the microphone button.</p>` : '';
  }
  const dis = S.rtStarting ? 'disabled' : '';
  const { credits, left } = liveState();
  const o = offer();
  const liveTag = left >= 20 ? `Rejoin · ${Math.ceil(left / 60)} min left` : credits ? `${credits} session${credits > 1 ? 's' : ''} ready` : `${o.livePrice} · one-time`;
  return `${livePromo()}<div class="rows">
    <button class="mode" data-act="rtstart" data-mode="talk" ${dis}><span class="ico">${ic('mic')}</span><span class="main"><b>Talk it through</b><span class="d">A spoken conversation. Interrupt whenever you like.</span></span>${ic('right')}</button>
    <button class="mode" data-act="rtstart" data-mode="listen" ${dis}><span class="ico">${ic('ear')}</span><span class="main"><b>Rehearse an answer</b><span class="d">Speak without being interrupted, then get it graded.</span></span>${ic('right')}</button>
  </div>`;
}

/* ---------- account / paywall ---------- */
const mins = sec => (sec / 60).toFixed(sec % 60 ? 1 : 0);
const meter = (label, left, total, text) => `<div><div class="meter-top"><span>${label}</span><b>${text}</b></div><div class="bar ${left / total <= 0.2 ? 'low' : ''}"><i style="width:${total ? Math.max(0, Math.min(100, (left * 100) / total)) : 0}%"></i></div></div>`;
function usageMeters(a) {
  if (!a || a.unlimited || !a.limits) return '';
  return `<div class="meters">
    ${meter('AI messages left', a.msgsLeft, a.limits.msgs, `${a.msgsLeft} / ${a.limits.msgs}`)}
    ${meter('Voice minutes left', a.voiceSecLeft, a.limits.voiceSec, `${mins(a.voiceSecLeft)} / ${mins(a.limits.voiceSec)}`)}
  </div>`;
}

function signInCard(headline = 'Practice with a coach that knows your plan') {
  const o = offer();
  const buttons = native()
    ? `<div class="stack tight" style="max-width:300px">${window.PP_PLATFORM === 'ios' ? '<button class="btn primary block" data-act="nsignin" data-p="apple"> Sign in with Apple</button>' : ''}<button class="btn ${window.PP_PLATFORM === 'ios' ? '' : 'primary'} block" data-act="nsignin" data-p="google">Continue with Google</button></div>`
    : (S.googleClientId ? '<div id="gbtn"></div>' : `<p class="muted small">${S.healthLoaded ? 'Sign-in is being set up. Check back soon.' : 'Loading sign-in…'}</p>`);
  return `<section class="stack" id="accountCard" style="padding-top:8px">
    <div class="head"><h2>${esc(headline)}</h2>
    <p class="lede">Ask questions, have your answers graded, or rehearse out loud. It is free to try: ${o.freeMsgs} messages and ${o.freeVoice} voice minutes, no card needed.</p></div>
    ${buttons}
    <p class="muted small">Your plan and flashcards work without an account.</p>
    <details class="small"><summary class="muted" style="font-weight:400;justify-content:flex-start">Have a beta code?</summary>
      <form id="codeForm" class="row" style="margin-top:10px"><input id="code" type="password" value="${esc(store.accessCode())}" autocomplete="off" aria-label="Beta code"><button class="btn">Save code</button></form>
    </details>
  </section>`;
}

function accountCard() {
  const a = store.account();
  if (!signedIn()) return signInCard();
  if (!a) return `<section class="row between small muted"><span>${store.accessCode() ? 'Using a beta access code.' : 'Loading account…'}</span><button class="link quiet" data-act="signout">Sign out</button></section>`;
  const o = offer();
  const name = a.name || a.email || 'Signed in';
  const planTag = a.unlimited ? '<span class="tag">Admin</span>' : a.plan === 'pro' ? '<span class="tag pro">Pro</span>' : '<span class="tag">Free</span>';
  const sub = a.unlimited ? 'Unlimited AI' : a.plan === 'pro' && a.periodEnds ? `Allowance refills ${new Date(a.periodEnds).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}` : 'Free trial';
  return `<section class="panel stack" id="accountCard">
    <div class="row"><div class="avatar">${esc(name[0].toUpperCase())}</div>
      <div class="grow"><div class="row" style="gap:8px"><b style="overflow:hidden;text-overflow:ellipsis">${esc(name)}</b>${planTag}</div><div class="small muted">${esc(sub)}</div></div></div>
    ${usageMeters(a)}
    ${(() => { const { credits, left } = liveState(); return credits || left >= 20 ? `<p class="note">${left >= 20 ? `Live coach session in progress: ${Math.ceil(left / 60)} min left. ` : ''}${credits ? `${credits} Live coach session${credits > 1 ? 's' : ''} ready.` : ''} <button class="link" data-act="livesetup">${left >= 20 ? 'Rejoin' : 'Start'} →</button></p>` : ''; })()}
    ${a.plan === 'free' ? `<button class="btn primary block" data-act="plans">Upgrade to Pro, ${esc(o.proPrice)}</button>` : ''}
    <div class="links">
      ${a.plan !== 'free' || a.unlimited ? '<button class="link quiet" data-act="plans">Plans</button>' : ''}
      ${native() && !a.unlimited ? '<button class="link quiet" data-act="restore">Restore purchases</button>' : ''}
      <a class="link quiet" href="privacy.html" target="_blank" rel="noopener">Privacy</a>
      <button class="link quiet" data-act="signout">Sign out</button>
      ${a.key === 'code:admin' ? '' : '<button class="link quiet" data-act="delacct">Delete account</button>'}
    </div>
  </section>`;
}

function paywallCard() {
  const a = store.account();
  const o = offer();
  if (a?.plan === 'pro') {
    return `<section class="panel stack"><h3>This month's Pro allowance is used up</h3>
      <p class="muted">It refills ${a.periodEnds ? 'on ' + new Date(a.periodEnds).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : 'at your next billing period'}. A Live coach session is separate and works right now.</p>
      ${usageMeters(a)}<div class="row"><button class="btn primary" data-act="plans">See the Live coach</button><button class="btn" data-act="unpaywall">Close</button></div></section>`;
  }
  return `<section class="panel stack"><h3>Your free trial is used up</h3>
    <p class="muted">Pro gives you ${o.proMsgs} messages and ${o.proVoice} voice minutes every month. Your plan and flashcards stay free either way.</p>
    <div class="row"><button class="btn primary" data-act="plans">See Pro, ${esc(o.proPrice)}</button><button class="btn quiet" data-act="unpaywall">Not now</button></div></section>`;
}

function mountGoogleButton() {
  const el = document.getElementById('gbtn');
  if (el && !el.childElementCount) renderGoogleButton(el, S.googleClientId, msg => oops(msg)).catch(e => { el.textContent = e.message; });
}

function chatView() {
  const msgs = store.chat();
  const quick = ['Quiz me on my weakest topic', 'Grade my answer to the last question', 'Explain the hardest topic in my plan simply', 'What would a senior panel ask about my background?'];
  const live = S.live ? `<div class="msg assistant" id="liveMsg">${md(S.live.text) || '<span class="dots"><i></i><i></i><i></i></span>'}</div>` : '';
  const canUse = signedIn();
  const a = store.account();
  const bubble = m => isNotice(m) ? `<div class="msg sys">${fmt(m.content.replace(/^(ℹ️|⚠️)\s*/, ''))}</div>` : `<div class="msg ${m.role}">${m.role === 'assistant' ? md(m.content) : fmt(m.content)}</div>`;
  if (!canUse) return signInCard();
  const lowFree = a?.plan === 'free' && !S.paywall && (a.msgsLeft <= 5 || a.voiceSecLeft < 30);
  const started = msgs.length || live;
  return `<div class="stack chat" style="gap:18px">
    <div class="row between"><h1>Coach</h1>
      <div class="row" style="gap:16px">${S.rt ? '' : `<label class="switch"><input type="checkbox" id="speakToggle" ${store.speak() ? 'checked' : ''}>Read replies aloud</label>`}
      ${msgs.length ? '<button class="link quiet small" data-act="clearchat">Clear chat</button>' : ''}</div></div>
    ${S.paywall ? paywallCard() : voicePanel()}
    ${S.rtMode === 'live' && S.liveHint ? liveHintCard() : ''}
    ${lowFree && !S.rt ? `<p class="note row between"><span>${a.msgsLeft} message${a.msgsLeft === 1 ? '' : 's'} and ${mins(a.voiceSecLeft)} voice minutes left in your free trial.</span><button class="link" data-act="plans">See Pro</button></p>` : ''}
    ${S.chatContext ? `<p class="note row between"><span>Talking about <b>${esc(S.chatContext.split('\n')[0])}</b></span><button class="link quiet" data-act="dropctx">Remove</button></p>` : ''}
    <div class="msgs" id="msgs">${started ? msgs.map(bubble).join('') : `<div class="stack" style="padding-top:10px"><p class="muted">Or type a question. A few to start with:</p>
      <div class="rows">${quick.map(q => `<button class="rowi" data-act="quick" data-q="${esc(q)}"><span class="main"><span class="t" style="font-weight:400">${esc(q)}</span></span></button>`).join('')}</div></div>`}
    ${live}${S.busy ? '<div class="msg assistant"><span class="dots"><i></i><i></i><i></i></span></div>' : ''}</div>
    <form id="chatForm" class="composer">
      <textarea id="chatInput" rows="1" maxlength="2000" placeholder="${S.rt ? 'Or type your reply' : 'Ask your coach'}" aria-label="Message"></textarea>
      ${S.rt ? '' : `<button type="button" class="iconbtn ${S.listening ? 'on' : 'plain'}" data-act="mic" ${voice.canListen ? '' : 'disabled'} aria-label="${S.listening ? 'Stop dictation' : 'Dictate'}" title="${voice.canListen ? 'Dictate' : 'Dictation is not supported here'}">${ic(S.listening ? 'stop' : 'mic')}</button>`}
      <button class="iconbtn primary" type="submit" ${S.busy ? 'disabled' : ''} aria-label="Send">${ic('send')}</button>
    </form>
  </div>`;
}

/* ---------- live coach ---------- */
function liveSettings() {
  const p = profile();
  const saved = store.liveSettings() || {};
  return {
    lengthMin: [20, 30, 45, 60].includes(saved.lengthMin) ? saved.lengthMin : 60,
    voice: saved.voice !== false,
    style: ['friendly', 'direct', 'tough'].includes(saved.style) ? saved.style : 'friendly',
    topic: typeof saved.topic === 'string' ? saved.topic : '',
    difficulty: ['junior', 'mid', 'senior'].includes(saved.difficulty) ? saved.difficulty : (p?.level || 'mid'),
  };
}

function liveSetupSheet() {
  const s = liveSettings();
  const p = profile();
  const relevant = rankTopics(topics(), p);
  const { credits, left } = liveState();
  const o = offer();
  const state = left >= 20 ? `Your session is still open with ${Math.ceil(left / 60)} minutes left.` : credits ? `You have ${credits} session${credits > 1 ? 's' : ''} ready.` : `One session costs ${o.livePrice}, billed separately from Pro.`;
  sheet(`<form id="liveSetupForm" class="stack">
    <h2>Live coach: practice test</h2>
    <p class="muted">${esc(state)} Up to ${o.liveMin} minutes of spoken questions, with hints as you go and feedback after every answer.</p>
    <label>Session length<select name="lengthMin">${[20, 30, 45, 60].map(n => `<option value="${n}" ${s.lengthMin === n ? 'selected' : ''}>${n} minutes</option>`).join('')}</select></label>
    <label>Coach style<select name="style">${[['friendly', 'Friendly and encouraging'], ['direct', 'Direct, no small talk'], ['tough', 'Tough, probes every gap']].map(([v, n]) => `<option value="${v}" ${s.style === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Topic focus<select name="topic"><option value="">All my topics</option>${relevant.map(t => `<option value="${esc(t.name)}" ${s.topic === t.name ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    <label>Difficulty<select name="difficulty">${LEVELS.map(l => `<option value="${l.id}" ${s.difficulty === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
    <label class="switch"><input type="checkbox" name="voice" ${s.voice ? 'checked' : ''}>Coach speaks out loud</label>
    <p class="muted small">With voice off, the coach writes its questions and you can type or speak your answers.</p>
    <button class="btn primary block lg" type="submit">${left >= 20 ? 'Rejoin the session' : credits ? 'Start the practice test' : `Buy a session · ${esc(o.livePrice)}`}</button>
    <button class="btn block" type="button" data-act="closesheet">Not now</button>
  </form>`);
}

function liveHintCard() {
  const h = S.liveHint;
  if (!h) return '';
  return `<section class="panel stack"><div class="label">Hint for this question</div>
    <p style="font:400 1.05rem/1.6 var(--serif)">${h.loading ? 'Thinking of a hint…' : esc(h.hint)}</p>
    ${h.showStrong && h.strong ? `<div><div class="label">A strong answer would add</div><p class="muted" style="font:400 1.05rem/1.6 var(--serif)">${esc(h.strong)}</p></div>` : ''}
    <p class="muted small">Hints are for practice. The coach is here to prepare you, not to sit the interview for you.</p>
  </section>`;
}

/* ---------- guide suggestions ---------- */
// One form, two places: the ask-once sheet after Google sign-in, and Profile.
// The address suggestions go to lives on the server (SUGGESTIONS_EMAIL),
// never in client code. Fields are found by role, not id, so the two copies
// can share the page with the sheet open.
function suggestFormHtml(id) {
  return `<form id="${id}" class="suggest-form stack">
    <label class="small muted" for="${id}-text">What guide or topic should we add?</label>
    <textarea id="${id}-text" rows="3" maxlength="500" minlength="10" required placeholder="e.g. A guide to system design interviews for backend roles"></textarea>
    <input maxlength="120" placeholder="Topic (optional)" aria-label="Topic">
    <button class="btn primary block" type="submit">Send suggestion</button>
  </form>`;
}

function suggestSheet() {
  sheet(`<h2>What should we teach next?</h2>
    <p class="muted">You are signed in — tell us what guide or topic you want and we will look at adding it.</p>
    ${suggestFormHtml('suggestForm')}
    <button class="btn block" type="button" data-act="closesheet">Not now</button>`);
}

async function submitSuggestion(form) {
  if (!signedIn()) { toast('Sign in first, then send your suggestion.'); return; }
  const text = form.querySelector('textarea').value.trim();
  const topic = form.querySelector('input').value.trim();
  if (text.length < 10) { oops('Tell us what guide or topic you want (at least 10 characters).'); return; }
  const btn = form.querySelector('button[type=submit]');
  if (btn) btn.disabled = true;
  try {
    await ai.post('/api/suggestions', { text, topic });
    closeSheet();
    toast('Thanks — your suggestion is in. We read every one.');
    render();
  } catch (err) { aiFailed(err); }
  if (btn) btn.disabled = false;
}

async function fetchLiveHint(question) {
  S.liveHint = { question, hint: '', strong: '', showStrong: false, loading: true };
  render();
  try {
    const d = await ai.post('/api/live/hint', { question });
    S.liveHint = { question, hint: d.hint || '', strong: d.strong || '', showStrong: S.liveHint?.showStrong || false, loading: false };
  } catch { S.liveHint = null; }
  if (S.view === 'chat') render();
}

/* ---------- realtime voice ---------- */
function paintVoice() {
  const st = document.getElementById('rtStatus'), orb = document.getElementById('rtOrb'), tm = document.getElementById('rtTimer');
  if (st) st.textContent = S.muted ? 'Muted' : STATUS[S.rtStatus] || S.rtStatus;
  if (orb) orb.className = `pulse status-${S.rtStatus} ${S.muted ? 'muted' : ''}`;
  if (tm && S.rt) {
    const left = S.rt.endsAt ? Math.max(0, (S.rt.endsAt - Date.now()) / 1000) : null;
    tm.textContent = `${MODE_NAME[S.rtMode] || ''}${left === null ? '' : `, ${clock(left)} left`}`;
    tm.classList.toggle('low', left !== null && left < 60);
  }
}
setInterval(() => { if (S.rt) paintVoice(); }, 1000);

function rtHandlers() {
  return {
    status(s) { S.rtStatus = s; paintVoice(); },
    userStart() {
      // Placeholder so the user's words appear before the AI reply even if transcription lands later.
      if (!S.pendingUser) { store.setChat([...store.chat(), { role: 'user', content: '🎙 …' }]); S.pendingUser = true; if (!S.live) render(); }
    },
    user(text) {
      const msgs = store.chat();
      const i = msgs.map(m => m.content).lastIndexOf('🎙 …');
      if (i >= 0) msgs[i] = { role: 'user', content: text.trim() || '(inaudible)' };
      else if (text.trim()) msgs.push({ role: 'user', content: text.trim() });
      store.setChat(msgs); S.pendingUser = false;
      // In a practice test, once the user has answered, show what a strong answer would add.
      if (S.rtMode === 'live' && S.liveHint && text.trim()) S.liveHint.showStrong = true;
      if (!S.live) render();
    },
    delta(id, text) {
      if (!S.live || S.live.id !== id) { S.live = { id, text: '' }; S.pendingUser = false; render(); }
      S.live.text += text;
      const el = document.getElementById('liveMsg');
      if (el) { el.innerHTML = md(S.live.text); scrollEnd(); }
    },
    done(id, text) {
      const final = text ?? S.live?.text ?? '';
      S.live = null;
      if (final.trim()) store.setChat([...store.chat(), { role: 'assistant', content: final }]);
      // In a practice test, a finished question gets an instant hint.
      if (S.rtMode === 'live' && /\?\s*$/.test(final.trim())) fetchLiveHint(final.trim());
      render();
    },
    end(reason) {
      const wasLive = S.rtMode === 'live';
      S.rt = null; S.rtMode = null; S.rtStatus = ''; S.live = null; S.pendingUser = false; S.muted = false; S.liveHint = null;
      store.setChat(store.chat().filter(m => m.content !== '🎙 …'));
      if (reason) store.setChat([...store.chat(), { role: 'assistant', content: `ℹ️ ${reason}` }]);
      if (wasLive) refreshAccount().catch(() => {}); // remaining session time for the "rejoin" button
      if (S.view === 'chat') render();
    },
  };
}

async function startVoice(mode) {
  if (!(S.voiceServer && realtimeSupported)) return oops('Live voice isn\'t available on this device right now.');
  if (S.rtStarting) return;
  if (S.rt) S.rt.stop();
  voice.stopSpeaking();
  const session = new VoiceSession(rtHandlers());
  S.rt = session; S.rtMode = mode; S.rtStatus = 'connecting'; S.rtStarting = true; S.paywall = false; render();
  try {
    // Rehearse mode stays silent unless "read replies aloud" is on; talk mode is always spoken.
    // Live coach uses its own settings: voice on/off, length, style, topic focus, difficulty.
    const live = mode === 'live' ? liveSettings() : null;
    await session.start({ mode, speak: mode === 'live' ? live.voice : mode !== 'listen' || store.speak(), profileSummary: summary(), context: S.chatContext, live });
  } catch (e) {
    S.rt = null; S.rtMode = null;
    if (e.code === 'quota') S.paywall = true;
    if (e.code === 'no_credit') { refreshAccount().catch(() => {}); oops('No Live coach session on this account yet.'); }
    else store.setChat([...store.chat(), { role: 'assistant', content: `⚠️ ${e.message}` }]);
  } finally { S.rtStarting = false; render(); }
}

function settingsView() {
  const custom = store.customTopics(), priv = store.privatePacks();
  return `<div class="stack loose">
    ${accountCard()}
    ${statsSection()}
    ${onboardingView(profile())}
    <section class="stack"><div class="head"><h2>Cards for any topic</h2>
      <p class="muted">Something your interview covers that isn't here? Name it and the coach writes a set. Uses 5 AI messages.</p></div>
      <form id="genForm" class="row"><input id="genTopic" maxlength="120" placeholder="e.g. Kafka exactly-once delivery" required aria-label="Topic"><button class="btn" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Writing cards…' : 'Write cards'}</button></form>
      ${custom.length ? `<div class="rows">${custom.map(t => `<div class="rowi static"><span class="main"><span class="t">${esc(t.name)}</span><span class="d">${t.concepts.length} lessons, ${t.qa.length} questions</span></span><button class="link quiet small" data-act="delcustom" data-id="${t.id}">Delete</button></div>`).join('')}</div>` : ''}
    </section>
    <section class="stack"><div class="head"><h2>Private packs</h2>
      <p class="muted">Import your own pack as a JSON file: your projects, your stories. It never leaves this device.</p></div>
      <input type="file" id="importPack" accept="application/json,.json" aria-label="Import pack">
      ${priv.length ? `<div class="rows">${priv.map(p => `<div class="rowi static"><span class="main"><span class="t">${esc(p.name)}</span><span class="d">${p.topics.length} topics</span></span><button class="link quiet small" data-act="delpack" data-id="${esc(p.id)}">Remove</button></div>`).join('')}</div>` : ''}
    </section>
    <section class="stack"><div class="head"><h2>Suggest a guide</h2>
      <p class="muted">Want a guide or topic we don't cover? Tell us — it goes straight to the people who write them.</p></div>
      ${suggestFormHtml('suggestFormSettings')}
    </section>
    <section class="stack"><div class="head"><h2>Your data</h2>
      <p class="muted">Your profile, progress and chats are stored only on this device.</p></div>
      <div class="row"><button class="btn" data-act="export">Export my data</button><button class="btn danger" data-act="reset">Erase everything</button></div>
    </section>
  </div>`;
}

function customView() {
  const custom = store.customTopics();
  const p = profile();
  const prog = store.progress();
  const reason = customLimitReason();
  const atCap = custom.length >= CUSTOM_LIMIT;
  const rows = custom.map(t => {
    const tr = readiness([t], p, prog);
    return `<div class="rowi static"><span class="main"><span class="t">${esc(t.name)}</span><span class="d">${t.concepts.length} lessons · ${t.qa.length} questions${tr.total ? ` · ${tr.pct}% known` : ''}</span></span>
      <span class="row"><button class="link quiet small" data-act="learn" data-id="${t.id}">Open</button><button class="link quiet small" data-act="deck" data-id="${t.id}">Practice</button><button class="link quiet small" data-act="delcustom" data-id="${t.id}">Delete</button></span></div>`;
  }).join('');
  return `<div class="stack loose">
    <div class="head"><h1>Your subjects</h1>
      <p class="lede">Anything your interview covers that the 72 built-in topics don't — Ansible, Puppet, a tool only your team uses. The coach writes the full guide: lessons told like a story, plus flashcards.</p></div>
    <section class="card stacked">
      <div class="card-head"><span>Custom subjects</span><span>${custom.length} of ${CUSTOM_LIMIT}</span></div>
      ${reason === 'pro'
        ? `<p class="muted">Custom subjects are part of Pro. The subjects you already have stay usable either way.</p><div class="row"><button class="btn primary" data-act="plans">See Pro, ${esc(offer().proPrice)}</button></div>`
        : reason === 'signin'
          ? `<p class="muted">Sign in to write a custom subject.</p>`
          : `<form id="customForm" class="row"><input id="customTopic" maxlength="120" placeholder="e.g. Ansible" required aria-label="Subject"><button class="btn primary" ${S.busy || atCap ? 'disabled' : ''}>${S.busy ? 'Writing your guide…' : 'Generate my guide'}</button></form>
          <p class="muted small">Uses 5 AI messages. ${atCap ? `You have all ${CUSTOM_LIMIT} subjects — delete one to make room.` : `You can keep up to ${CUSTOM_LIMIT} subjects.`}</p>`}
      ${custom.length ? `<div class="rows" style="margin-top:14px">${rows}</div>` : `<p class="muted" style="margin-top:14px">No custom subjects yet.</p>`}
    </section>
    <p class="muted small">Custom subjects sit alongside the built-in topics everywhere — your plan, your stats, and the story diagram the coach draws for them.</p>
  </div>`;
}

// A health-app-style picture of where the user stands: rings for readiness,
// voice and today, a practice streak, a 14-day trend, per-topic readiness,
// the weakest spots, and what to do next. Everything comes from progress
// already on this device — nothing is invented.
function statRing(pct, big, small) {
  return `<div class="stat-ring"><div class="score-ring small"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="52"/><circle class="ring-prog" cx="60" cy="60" r="52" pathLength="100" style="stroke-dashoffset:${ringOffset(pct)}"/></svg><div class="score-num"><span class="n">${big}</span><span class="muted small">${small}</span></div></div></div>`;
}

function statsSection() {
  const p = profile();
  const relevant = rankTopics(topics(), p);
  const prog = store.progress();
  const map = knowledgeMap(relevant, p, prog);
  const overall = readiness(relevant, p, prog);
  const a = store.account();
  const voiceLim = a?.limits?.voiceSec;
  const voiceLeft = a?.voiceSecLeft ?? 0;
  const voiceUsed = voiceLim ? Math.max(0, voiceLim - voiceLeft) : 0;
  const voicePct = voiceLim ? Math.round((voiceUsed * 100) / voiceLim) : 0;
  const voiceBig = voiceLim ? String(Math.round(voiceUsed / 60)) : '–';
  const voiceSmall = voiceLim ? `of ${Math.round(voiceLim / 60)} min voice` : 'sign in';
  const activity = store.activity();
  const tk = todayKey();
  const todayGraded = activity[tk]?.graded || 0;
  const dueToday = dueCards(topics(), p, prog, Date.now(), 999).length;
  const todayPct = dueToday ? Math.min(100, Math.round((todayGraded * 100) / dueToday)) : (todayGraded ? 100 : 0);
  const streak = streakDays(activity, tk);
  const days = lastNDays(activity, 14, tk);
  const maxDay = Math.max(1, ...days.map(d => d.graded));
  const weakest = map.topics.filter(t => t.total > 0 && t.pct < 100).sort((x, y) => x.pct - y.pct).slice(0, 3);
  const next = weakest[0];
  const anyActivity = days.some(d => d.graded > 0);
  return `<div class="stack loose">
    <div class="head"><h2>Where you stand</h2>
      <p class="muted">Readiness, practice and voice, from your own progress on this device.</p></div>
    <section class="rings" aria-label="Rings">
      ${statRing(overall.pct, `${overall.pct}%`, 'ready')}
      ${statRing(voicePct, voiceBig, voiceSmall)}
      ${statRing(todayPct, `${todayGraded}`, dueToday ? `of ${dueToday} due today` : 'practiced today')}
    </section>
    <section class="card stacked">
      <div class="card-head"><span>Practice streak</span><span>${streak} day${streak === 1 ? '' : 's'}</span></div>
      <p class="muted">${streak ? `You have practiced ${streak} day${streak === 1 ? '' : 's'} in a row. Keep it alive with one card today.` : 'No streak yet — grade one card and the streak starts.'}</p>
      <div class="streak-dots">${days.map(d => `<span class="${d.graded ? 'on' : ''}" title="${d.label} ${d.key}: ${d.graded} card${d.graded === 1 ? '' : 's'}"></span>`).join('')}</div>
      <div class="trend" aria-label="Cards practiced, last 14 days">${days.map(d => `<span class="tb"><i style="height:${Math.max(0, Math.round((d.graded / maxDay) * 100))}%"></i><em>${d.label.slice(0, 1)}</em></span>`).join('')}</div>
      ${anyActivity ? `<p class="muted small">Cards practiced per day, last 14 days.</p>` : `<p class="muted small">Nothing logged yet — your history starts the first day you grade a card.</p>`}
    </section>
    <section class="card stacked">
      <div class="card-head"><span>What to do next</span></div>
      ${next
        ? `<p class="muted">Your weakest spot right now is <b>${esc(next.name)}</b> — ${next.known} of ${next.total} cards known.</p><div class="row"><button class="btn primary" data-act="learn" data-id="${next.id}">Open the ${esc(next.name)} lesson</button><button class="btn" data-act="deck" data-id="${next.id}">Practice its cards</button></div>`
        : `<p class="muted">Everything you have started is solid. Pick any topic below, or practice what is due.</p><div class="row"><button class="btn primary" data-act="deck" data-id="">Practice what's due</button></div>`}
    </section>
    <section>
      <div class="sec-head"><h3>Per-topic readiness</h3>${map.topics.length > 6 ? `<button class="link quiet small" data-act="toggletopics">${S.allTopics ? 'Show fewer' : `All ${map.topics.length} topics`}</button>` : ''}</div>
      <div class="rows">${(S.allTopics ? map.topics : map.topics.slice(0, 6)).map(t => `<button class="rowi" data-act="learn" data-id="${t.id}">
        <span class="main"><span class="t">${esc(t.name)}</span><span class="d">${t.state === 'strong' ? 'Solid' : t.state === 'ok' ? 'Getting there' : t.state === 'weak' ? 'Shaky' : 'Not started'} · ${t.known}/${t.total} cards</span></span>
        <span class="pct"><span>${t.pct}%</span><span class="bar"><i style="width:${t.pct}%"></i></span></span></button>`).join('')}</div>
    </section>
  </div>`;
}

function plansView() {
  const a = store.account();
  const o = offer();
  const isPro = a?.plan === 'pro';
  const dis = S.buyBusy ? 'disabled' : '';
  const manage = window.PP_PLATFORM === 'android' ? 'Google Play' : 'Apple ID';
  const { credits } = liveState();
  return `<div class="stack loose">
    <div class="row between" style="margin-bottom:-14px"><span></span><button class="iconbtn plain" data-act="pickfree" aria-label="Close">${ic('x')}</button></div>
    <div class="head">
      <h1>Say your answers out loud before the day they count.</h1>
      <p class="lede" style="margin-top:12px">Reading about an answer and giving one are different skills. Pro is the coach that listens, pushes back and tells you what an interviewer would have wanted to hear.</p>
    </div>
    <section class="card stacked live-hero">
      <div class="card-head"><span>Live coach: practice test</span><span>One-time</span></div>
      <div class="price">${esc(o.livePrice)}<span>per session</span></div>
      <div style="margin:20px 0 22px">${ticks([`A spoken practice test built for your role and level, up to ${o.liveMin} minutes`, 'One question at a time, honest feedback after each answer', 'Hints as you go, and what a strong answer would add', 'Overall assessment at the end', 'Dropped call? Rejoin within the hour, same session', 'Works with Free or Pro'])}</div>
      <button class="btn invert block lg" data-act="buylive" ${dis}>${S.buyBusy === 'live' ? `Opening the ${storeName()}…` : credits ? `Buy another (you have ${credits})` : 'Buy a session'}</button>
    </section>
    <section class="card">
      <div class="card-head"><span>PrepPilot Pro</span>${o.perDay ? `<span>${esc(o.perDay.toLowerCase())}</span>` : ''}</div>
      <div class="price">${esc(o.proAmount)}<span>per ${esc(o.proPer)}, cancel any time</span></div>
      <div style="margin:20px 0 22px">${ticks([`<b>${o.proVoice} minutes of voice practice</b> a month, spoken back to you`, `<b>${o.proMsgs} coach messages</b> a month`, 'Answers graded against what a panel listens for', 'Follow-up questions on your weak topics', 'Card sets written for any technology you name'])}</div>
      ${isPro ? '<button class="btn block lg" disabled>You are on Pro</button>' : `<button class="btn primary block lg" data-act="buysub" ${dis}>${S.buyBusy === 'pro' ? `Opening the ${storeName()}…` : `Start Pro for ${esc(o.proPrice)}`}</button>`}
    </section>
    <section class="card">
      <div class="card-head"><span>Every lesson opens with a moving picture</span></div>
      <p class="muted small" style="margin:-6px 0 4px">Diagrams draw themselves, step by step, so the idea lands before the words do. This is a real one, from the Web Fundamentals lesson — tap through it:</p>
      ${diagramHtml('web-fundamentals', S.dgStages['web-fundamentals'] ?? null, { autoplay: true })}
    </section>
    <section class="stack">
      <div class="row between"><div><h3>Free</h3><p class="muted">Your day-by-day plan, every lesson and flashcard, and ${o.freeMsgs} messages plus ${o.freeVoice} voice minutes to try the coach.</p></div></div>
      <div class="row"><button class="btn" data-act="pickfree">${isPro ? 'Back to the app' : 'Continue on Free'}</button></div>
    </section>
    <div class="faq">
      <details><summary>What counts as a message?</summary><p>Each question you send the coach is one message. Writing a custom card set uses five. Voice is counted in minutes, only while a session is live.</p></details>
      <details><summary>How many custom subjects can I keep?</summary><p>Up to 5 on Pro — Ansible, Puppet, anything your interview covers. Each one the coach writes uses 5 messages. Delete one to make room for another.</p></details>
      <details><summary>Do I need Pro for a Live coach session?</summary><p>No. A Live coach session is a separate one-time purchase and works on the free plan. It does not use your monthly voice minutes.</p></details>
      <details><summary>How do I cancel?</summary><p>In your ${manage} subscription settings, at any time. You keep Pro until the end of the period you paid for.</p></details>
      <details><summary>What happens to my progress on Free?</summary><p>Nothing changes. Your plan, cards and progress stay on this device and stay yours.</p></details>
    </div>
    <p class="legal">Pro costs ${esc(o.proPrice)} and renews automatically until you cancel in your ${manage} subscription settings, at least 24 hours before the renewal date. Payment is charged to your ${storeName()} account when you confirm the purchase.
      <a class="link quiet" href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener">Terms of Use</a>, <a class="link quiet" href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>${native() ? ', <button class="link quiet" data-act="restore">Restore purchases</button>' : ''}</p>
  </div>`;
}

function topRight() {
  const a = store.account();
  if (!profile() || S.showPlans) return '';
  if (a?.unlimited) return '<span class="tag">Admin</span>';
  if (a?.plan === 'pro') return '<button class="tag pro" style="border:0;cursor:pointer" data-act="plans">Pro</button>';
  if (signedIn() && !a) return '';
  return '<button class="link quiet small" data-act="plans">Upgrade</button>';
}

function scrollEnd() { window.scrollTo(0, document.documentElement.scrollHeight); }

// The plans-screen diagram plays itself: it steps through the stages on its
// own so the "draws themselves, step by step" claim is visibly true, then
// rests on the full diagram. Any tap on the player stops it.
let dgTimer = null;
function stopDgAutoplay() { if (dgTimer) { clearTimeout(dgTimer); dgTimer = null; } }
function startDgAutoplay() {
  stopDgAutoplay();
  const fig = document.querySelector('[data-autoplay]');
  if (!fig) return;
  const id = fig.dataset.dg;
  const n = diagramFor(id)?.steps.length || 0;
  if (!n) return;
  S.dgStages[id] = null;
  let step = -1;
  const tick = () => {
    step++;
    if (step >= n) { S.dgStages[id] = null; render(); return; }
    S.dgStages[id] = step;
    render();
    dgTimer = setTimeout(tick, 1500);
  };
  dgTimer = setTimeout(tick, 1200);
}

// After a render, count the [data-countup] numbers up to their final value
// (they are rendered at the final value, so nothing breaks if this never runs).
// Only on entering a view: background re-renders (account, health check)
// must not replay the count-up or the map stagger from zero.
function animateIn(changed) {
  if (!changed) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('[data-countup]').forEach(el => {
    const target = Number(el.dataset.countup);
    if (!target) return;
    const t0 = performance.now(), dur = 1200;
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 2)));
      if (k < 1) requestAnimationFrame(tick);
    };
    el.textContent = '0';
    requestAnimationFrame(tick);
  });
}

function render() {
  const p = profile();
  if (S.view === 'stats') S.view = 'settings'; // Stats now lives inside Profile.
  const key = S.showPlans ? 'plans' : !p ? 'onboard' : S.view === 'deck' && !S.deck ? 'home' : S.view;
  const changed = key !== S.lastView;
  S.lastView = key;
  const input = document.getElementById('chatInput');
  const keep = input && key === 'chat' ? { value: input.value, focus: document.activeElement === input } : null;
  document.querySelectorAll('nav [data-nav]').forEach(b => b.setAttribute('aria-current', String(b.dataset.nav === (S.view === 'learn' ? 'home' : S.view))));
  document.querySelector('nav').hidden = !p || S.showPlans;
  document.getElementById('topRight').innerHTML = topRight();
  // The home map assembles (tiles stagger in) only when the user arrives at
  // home, not on every background re-render.
  S._stagger = changed && key === 'home';
  const html = key === 'plans' ? plansView()
    : key === 'onboard' ? onboardingView(null)
    : key === 'learn' ? learnView()
    : key === 'deck' ? deckView()
    : key === 'chat' ? chatView()
    : key === 'custom' ? customView()
    : key === 'settings' ? settingsView()
    : homeView();
  app.innerHTML = `<div class="${changed ? 'view' : ''}">${html}</div>`;
  S._stagger = false;
  if (keep) { const i = document.getElementById('chatInput'); if (i) { i.value = keep.value; if (keep.focus) i.focus(); } }
  mountGoogleButton();
  filterRoles();
  if (key === 'chat') { paintVoice(); if (!changed || store.chat().length) scrollEnd(); else window.scrollTo({ top: 0 }); }
  else if (changed || key === 'learn' || key === 'deck') window.scrollTo({ top: 0 });
  // Ask once, after a Google sign-in, what extra guides the user wants. Waits until
  // the plans screen is closed and no voice call is live, so it never covers either.
  if (S.suggestPending && !S.showPlans && !S.live && profile()) {
    S.suggestPending = false;
    store.setSuggestAsked(true);
    suggestSheet();
  }
  // Native app: keep the icon badge and the daily reminder in step with the plan.
  if (native() && key === 'home' && profile()) syncNativeHome();
  // The plans-screen diagram plays itself when the screen opens; anywhere
  // else the player stops so timers never outlive their screen.
  if (key === 'plans' && changed) startDgAutoplay();
  else if (key !== 'plans') stopDgAutoplay();
  animateIn(changed);
}

/* ---------- purchases ---------- */
function needSignIn() {
  S.showPlans = false; S.view = 'settings'; render();
  toast('Sign in first. It takes a few seconds, then pick your plan.');
}
function storeSheet() {
  sheet(`<h2>Upgrades live in the iPhone app</h2>
    <p class="muted">Pro and Live coach sessions are bought through the App Store. Sign in there with this same account and everything unlocks here too, on any device.</p>
    <button class="btn primary block" data-act="closesheet">Got it</button>`);
}
let buyTimer;
function buy(kind) { // 'pro' | 'live' | 'restore'
  if (!store.session()) return needSignIn(); // beta-code sessions have no account to attach a purchase to
  if (!native()) return storeSheet();
  const acc = store.account();
  if (!acc?.key) return oops('Still loading your account. Try again in a moment.');
  S.buying = { kind, credits: acc.sessionCredits || 0 };
  S.buyBusy = kind; render();
  // Older app builds don't report a cancelled purchase sheet, so never leave the buttons locked.
  clearTimeout(buyTimer);
  buyTimer = setTimeout(() => { S.buyBusy = false; render(); }, 8000);
  if (kind === 'pro') nativePurchase(acc.key); else if (kind === 'live') nativeBuyLive(acc.key); else nativeRestore(acc.key);
}
function buyDone() { clearTimeout(buyTimer); const b = S.buying; S.buying = null; S.buyBusy = false; return b; }
// The store confirms a purchase before our server has heard about it; check again a few times.
function pollPurchase(before, tries = [3000, 8000, 20000]) {
  if (!tries.length) return;
  setTimeout(async () => {
    try { await ai.post('/api/billing/refresh', {}); } catch { /* try again below */ }
    const a = store.account();
    if ((a?.sessionCredits || 0) > before.credits) { S.showPlans = false; render(); return toast('Live coach session added. Start it from the Coach tab.'); }
    if (before.kind === 'pro' && a?.plan === 'pro') { S.showPlans = false; render(); return toast('You\'re on Pro. Thank you!'); }
    pollPurchase(before, tries.slice(1));
  }, tries[0]);
}
function onPurchased(acc) {
  const b = buyDone();
  S.paywall = false;
  if (acc?.plan === 'pro') { S.showPlans = false; toast(b?.kind === 'restore' ? 'Pro restored.' : 'You\'re on Pro. Thank you!'); }
  else if (b?.kind === 'restore') oops('No active subscription found for this account.');
  else if (b?.kind === 'live') { toast('Payment received. Your Live coach session will unlock in a moment.'); pollPurchase(b); }
  else { toast('Payment received. Pro will unlock in a moment.'); pollPurchase(b); }
  render();
}

/* ---------- actions ---------- */
// ids = topics the user explicitly chose (may be outside their role); null = everything relevant.
function startDeck(ids) {
  const list = ids ? topics().filter(t => ids.includes(t.id)) : topics();
  S.deck = { cards: dueCards(list, profile(), store.progress(), Date.now(), 20, { relevantOnly: !ids }), results: [] };
  S.di = 0; S.reveal = false; S.view = 'deck'; render();
}

function startRoleDeck(id) {
  const p = profile();
  const role = roleById(id === 'other' ? p.baseRoleId : id);
  const list = rankTopics(topics().filter(t => role?.topics?.[t.id]), { ...p, roleIds: [id], roleId: id, extras: [] });
  startDeck(list.map(t => t.id));
}

async function openTopic(id) {
  S.topic = id; S.ci = 0; S.view = 'learn'; render();
  if (!topicById(id)) {
    try { await ensureTopics([id]); } catch { oops('Could not download this topic. Check your connection.'); }
    render();
  }
}

// Grade a flashcard: stamp the verdict on the card so the user sees it land,
// then deal the next one. Extracted so the keyboard can grade too.
function gradeCard(ok) {
  if (S.grading || !S.deck || S.di >= S.deck.cards.length) return;
  const q = S.deck.cards[S.di], prog = store.progress();
  prog[q.id] = review(prog[q.id], ok); store.setProgress(prog);
  // Practice history for the stats view: one count per day, starting today.
  store.setActivity(recordActivity(store.activity(), todayKey(), ok));
  S.grading = true;
  const flash = document.getElementById('flash');
  if (flash) {
    flash.insertAdjacentHTML('beforeend', `<div class="verdict ${ok ? 'ok' : 'miss'}" aria-hidden="true">
      <svg viewBox="0 0 64 64"><circle class="v-ring dg-draw" cx="32" cy="32" r="28" pathLength="100" style="animation-duration:.6s"/>
      ${ok ? '<path class="v-mark dg-draw" d="M20 33 L28 41 L44 25" style="animation-delay:.5s;animation-duration:.35s"/>' : '<path class="v-mark dg-draw" d="M23 23 L41 41 M41 23 L23 41" style="animation-delay:.5s;animation-duration:.35s"/>'}</svg>
      <span>${ok ? 'Got it' : 'Missed it — back soon'}</span></div>`);
    // Let the stamp draw and sit for a beat, then the card leaves to the
    // side it was graded on. The verdict is the celebration — give it time.
    setTimeout(() => flash.classList.add(ok ? 'out-r' : 'out-l'), 850);
  }
  setTimeout(() => {
    S.grading = false; S.deck.results.push(ok); S.di++; S.reveal = false;
    // First finished round: a sensible moment to ask about daily reminders.
    if (S.di >= S.deck.cards.length && native() && !store.notifAsked()) { store.setNotifAsked(true); promptNotifications(); }
    render();
  }, 1100);
}

function aiFailed(err) {
  if (err.code === 'quota') { S.paywall = true; S.view = 'chat'; }
  else if (err.code === 'signin') S.view = 'chat';
  oops(err.message);
}

async function buildRoleGuide() {
  const p = profile();
  if (!signedIn()) { S.view = 'chat'; return render(); }
  // The role guide is written during onboarding, so it is not Pro-gated —
  // but it still takes one of the 5 custom-subject slots.
  if (store.customTopics().length >= CUSTOM_LIMIT) return toast(`You already have ${CUSTOM_LIMIT} custom subjects. Delete one to make room.`);
  S.busy = true; render();
  try {
    const r = await ai.generate(`${p.otherRole}: interview essentials`, summary(), 12);
    const id = 'c-role-' + Date.now().toString(36);
    const topic = { id, name: `${p.otherRole} essentials`, blurb: 'Written for your role', tag: 'ai', concepts: r.concepts, qa: r.qa, custom: true, beta: true };
    if (r.diagram) topic.diagram = r.diagram;
    saveCustomTopic(topic);
    toast('Your role guide is in your topics.');
  } catch (err) { aiFailed(err); }
  S.busy = false; render();
}

// ---------- custom subjects (Pro) ----------
// A Pro user keeps up to 5 custom subjects. Each one the coach writes costs
// 5 AI messages (the same cost as before — the cap is about subjects kept,
// the messages are about AI spend). Free users keep the subjects they
// already have, but cannot write new ones.
const CUSTOM_LIMIT = 5;
const isProUser = () => { const a = store.account(); return !!a && (a.plan === 'pro' || a.unlimited); };
function customLimitReason() {
  if (!signedIn()) return 'signin';
  if (!isProUser()) return 'pro';
  if (store.customTopics().length >= CUSTOM_LIMIT) return 'cap';
  return null;
}
function saveCustomTopic(topic) {
  if (topic.diagram) registerDiagramSpec(topic.id, topic.diagram);
  store.setCustomTopics([...store.customTopics(), topic]);
  return topic;
}
async function buildCustomSubject(name) {
  name = (name || '').trim();
  if (!name) return;
  const reason = customLimitReason();
  if (reason === 'signin') { S.view = 'chat'; render(); return; }
  if (reason === 'pro') { S.view = 'custom'; render(); return toast('Custom subjects are a Pro feature.'); }
  if (reason === 'cap') return toast(`You already have ${CUSTOM_LIMIT} custom subjects. Delete one to make room.`);
  S.busy = true; render();
  try {
    const r = await ai.generate(name, summary(), 8);
    const id = 'c-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36);
    const topic = { id, name, blurb: 'Custom subject', tag: 'ai', concepts: r.concepts, qa: r.qa, custom: true, beta: true };
    if (r.diagram) topic.diagram = r.diagram;
    saveCustomTopic(topic);
    toast(`"${name}" is ready — starting the first lesson.`);
    S.busy = false;
    openTopic(id);
  } catch (err) { S.busy = false; aiFailed(err); render(); }
}

async function sendChat(text, { fromVoice = false } = {}) {
  text = text.trim();
  if (!text || S.busy) return;
  if (S.rt) {
    store.setChat([...store.chat(), { role: 'user', content: text }]);
    render();
    S.rt.sendText(text);
    return;
  }
  const msgs = [...store.chat(), { role: 'user', content: text }];
  store.setChat(msgs); S.busy = true; render();
  try {
    const reply = await ai.chat(msgs.filter(m => !isNotice(m)).slice(-12), { profileSummary: summary(), context: S.chatContext, voice: fromVoice && store.speak() });
    store.setChat([...store.chat(), { role: 'assistant', content: reply }]);
    if (store.speak()) voice.speak(reply);
  } catch (e) {
    if (e.code === 'quota') S.paywall = true;
    store.setChat([...store.chat(), { role: 'assistant', content: `⚠️ ${e.message}` }]);
  } finally { S.busy = false; render(); }
}

function cardContext(t, c) { return `${t.name} — ${c.t}\n${c.what}\n${c.ex ? 'Example:\n' + c.ex.slice(0, 1200) : ''}`; }

document.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'profileForm') return saveProfile();
  if (e.target.id === 'chatForm') { const i = document.getElementById('chatInput'); const v = i.value; i.value = ''; i.style.height = ''; return sendChat(v); }
  if (e.target.id === 'codeForm') { store.setAccessCode(document.getElementById('code').value.trim()); return render(); }
  if (e.target.classList?.contains('suggest-form')) return submitSuggestion(e.target);
  if (e.target.id === 'liveSetupForm') {
    const fd = new FormData(e.target);
    const settings = {
      lengthMin: Number(fd.get('lengthMin')) || 60,
      voice: fd.get('voice') === 'on',
      style: String(fd.get('style') || 'friendly'),
      topic: String(fd.get('topic') || ''),
      difficulty: String(fd.get('difficulty') || 'mid'),
    };
    store.setLiveSettings(settings);
    closeSheet();
    const { credits, left } = liveState();
    if (left < 20 && !credits) return buy('live');
    S.view = 'chat'; render();
    return startVoice('live');
  }
  if (e.target.id === 'genForm') {
    const topic = document.getElementById('genTopic').value.trim();
    return buildCustomSubject(topic);
  }
  if (e.target.id === 'customForm') {
    const topic = document.getElementById('customTopic').value.trim();
    return buildCustomSubject(topic);
  }
});

function filterRoles() {
  const q = S.roleSearch.trim().toLowerCase();
  document.querySelectorAll('#profileForm [data-act=pickrole]').forEach(b => { b.hidden = !!q && !b.dataset.search.includes(q) && b.dataset.id !== 'other'; });
  document.querySelectorAll('#profileForm .rolefam').forEach(f => { f.hidden = ![...f.querySelectorAll('[data-act=pickrole]')].some(b => !b.hidden); });
}

app.addEventListener('keydown', e => {
  if (e.target.id !== 'chatInput' || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  e.preventDefault();
  const form = document.getElementById('chatForm');
  if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
});

// Flashcards by keyboard: Space reveals, arrows grade. Only in the deck,
// and never while typing or with a button focused.
app.addEventListener('keydown', e => {
  if (S.view !== 'deck' || !S.deck || S.di >= S.deck.cards.length) return;
  if (e.target?.matches?.('input, textarea, select, button')) return;
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (!S.reveal) { S.reveal = true; render(); }
  } else if (e.key === 'ArrowRight' && S.reveal) gradeCard(true);
  else if (e.key === 'ArrowLeft' && S.reveal) gradeCard(false);
});

app.addEventListener('input', e => {
  if (e.target.id === 'chatInput') { e.target.style.height = 'auto'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; }
  if (e.target.id !== 'roleSearch') return;
  S.roleSearch = e.target.value;
  filterRoles();
});

app.addEventListener('change', async e => {
  if (e.target.id === 'speakToggle') { store.setSpeak(e.target.checked); if (!e.target.checked) voice.stopSpeaking(); }
  if (e.target.name === 'baseRoleId') { captureDraft(); render(); }
  if (e.target.id === 'importPack') {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const pack = JSON.parse(await f.text());
      if (!Array.isArray(pack.topics) || !pack.topics.every(t => t.id && Array.isArray(t.concepts) && Array.isArray(t.qa))) throw new Error('Not a PrepPilot pack.');
      if (pack.topics.some(t => topicMeta(t.id))) throw new Error('Pack topic ids clash with built-in topics.');
      store.setPrivatePacks([...store.privatePacks().filter(p => p.id !== pack.id), { id: pack.id || f.name, name: pack.name || f.name, topics: pack.topics }]);
      toast('Pack imported.');
      render();
    } catch (err) { oops('Import failed: ' + err.message); }
  }
});

document.addEventListener('click', async e => {
  if (e.target.id === 'sheet') return closeSheet();
  const b = e.target.closest('[data-act],[data-nav]');
  if (!b || b.disabled) return;
  if (b.dataset.nav) {
    S.draft = null;
    S.roleSearch = '';
    if (b.dataset.nav === 'deck') return startDeck(null);
    S.view = b.dataset.nav; return render();
  }
  const a = b.dataset.act, id = b.dataset.id;
  if (a === 'rate') {
    const order = ['', 'strong', 'weak'];
    const cur = order.find(c => c && b.classList.contains(c)) || '';
    b.classList.remove('strong', 'weak');
    const next = order[(order.indexOf(cur) + 1) % 3];
    if (next) b.classList.add(next);
    return;
  }
  if (a === 'extra') { b.classList.toggle('on'); return; }
  if (a === 'pickrole') {
    captureDraft();
    S.draft.roleIds = S.draft.roleIds.includes(id) ? S.draft.roleIds.filter(r => r !== id) : [...S.draft.roleIds, id];
    const scroll = window.scrollY;
    render();
    window.scrollTo({ top: scroll });
    return;
  }
  if (a === 'closesheet') closeSheet();
  else if (a === 'toggletopics') { S.allTopics = !S.allTopics; const y = window.scrollY; render(); window.scrollTo({ top: y }); }
  else if (a === 'toggleplan') { S.fullPlan = !S.fullPlan; const y = window.scrollY; render(); window.scrollTo({ top: y }); }
  else if (a === 'home') { S.view = 'home'; render(); }
  else if (a === 'learn') openTopic(id);
  else if (a === 'buildrole') buildRoleGuide();
  else if (a === 'cnext') { S.ci++; render(); }
  else if (a === 'cprev') { S.ci--; render(); }
  else if (a === 'deck') startDeck(id ? id.split(',') : null);
  else if (a === 'roledeck') startRoleDeck(id);
  else if (a === 'reveal') { S.reveal = true; render(); }
  else if (a === 'grade') gradeCard(b.dataset.ok === '1');
  else if (a === 'dgprev') { stopDgAutoplay(); S.dgStages[id] = prevStage(S.dgStages[id] ?? null); refreshDgSheet(id); render(); }
  else if (a === 'dgnext') { stopDgAutoplay(); S.dgStages[id] = nextStage(S.dgStages[id] ?? null, (diagramFor(id)?.steps.length || 1)); refreshDgSheet(id); render(); }
  else if (a === 'dgreplay') { stopDgAutoplay(); S.dgStages[id] = null; refreshDgSheet(id); render(); }
  else if (a === 'dgsheet') { sheet(dgSheetHtml(id)); S.sheetDg = id; }
  else if (a === 'askcard') {
    const t = topicById(S.topic), c = t.concepts[S.ci];
    S.chatContext = cardContext(t, c); S.view = 'chat'; render();
  }
  else if (a === 'askq') {
    const q = S.deck.cards[S.di];
    S.chatContext = `Interview question: ${q.q}\nModel answer: ${q.a}`;
    S.view = 'chat'; render();
    if (signedIn()) sendChat('Go deeper on this question: what follow-ups would an interviewer ask, and what would a strong answer add?');
  }
  else if (a === 'quick') sendChat(b.dataset.q);
  else if (a === 'rtstart') startVoice(b.dataset.mode);
  else if (a === 'plans') { S.showPlans = true; render(); }
  else if (a === 'pickfree') { S.showPlans = false; render(); }
  else if (a === 'unpaywall') { S.paywall = false; render(); }
  else if (a === 'buysub') buy('pro');
  else if (a === 'buylive') buy('live');
  else if (a === 'livesetup') liveSetupSheet();
  else if (a === 'restore') buy('restore');
  else if (a === 'rtrespond') S.rt?.respond();
  else if (a === 'rtinterrupt') S.rt?.interrupt();
  else if (a === 'rtmute') { S.muted = !S.muted; S.rt?.setMuted(S.muted); render(); }
  else if (a === 'rtstop') S.rt?.stop();
  else if (a === 'nsignin') nativeSignIn(b.dataset.p);
  else if (a === 'signout') { S.rt?.stop(); store.setAccessCode(''); signOut(); S.paywall = false; render(); }
  else if (a === 'delacct') {
    sheet(`<h2>Delete your account?</h2>
      <p class="muted">This removes your email, plan and AI usage from our servers right away. It does not cancel a Pro subscription: do that in your ${window.PP_PLATFORM === 'android' ? 'Google Play' : 'Apple ID'} subscription settings.</p>
      <div class="row"><button class="btn grow" data-act="closesheet">Keep my account</button><button class="btn danger" data-act="delacct-yes">Delete permanently</button></div>`);
  }
  else if (a === 'delacct-yes') {
    closeSheet();
    try {
      await ai.post('/api/me/delete', {});
      S.rt?.stop(); signOut(); S.paywall = false; render();
      toast('Account deleted. Remember to cancel any Pro subscription in your store settings.');
    } catch (err) { oops(err.message); }
  }
  else if (a === 'dropctx') { S.chatContext = ''; render(); }
  else if (a === 'clearchat') { store.setChat([]); S.chatContext = ''; render(); }
  else if (a === 'mic') {
    if (S.listening) { voice.stopListening(); return; }
    voice.stopSpeaking();
    S.listening = true; render();
    const input = () => document.getElementById('chatInput');
    try {
      const text = await voice.listen({ onInterim: t => { if (input()) input().value = t; } });
      S.listening = false; if (input()) input().value = ''; render();
      if (text) sendChat(text, { fromVoice: true });
    } catch (err) { S.listening = false; render(); oops(err.message); }
  }
  else if (a === 'delcustom') { store.setCustomTopics(store.customTopics().filter(t => t.id !== id)); render(); }
  else if (a === 'delpack') { store.setPrivatePacks(store.privatePacks().filter(p => p.id !== id)); render(); }
  else if (a === 'export') {
    const blob = new Blob([JSON.stringify({ profile: profile(), progress: store.progress(), customTopics: store.customTopics() }, null, 1)], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'preppilot-data.json' });
    link.click(); URL.revokeObjectURL(link.href);
  }
  else if (a === 'reset') {
    sheet(`<h2>Erase everything on this device?</h2>
      <p class="muted">Your profile, card progress, chats and custom topics will be removed, and you will be signed out. Purchases stay with your account.</p>
      <div class="row"><button class="btn grow" data-act="closesheet">Cancel</button><button class="btn danger" data-act="reset-yes">Erase</button></div>`);
  }
  else if (a === 'reset-yes') { closeSheet(); S.rt?.stop(); store.resetAll(); signOut(); S.view = 'home'; S.deck = null; S.draft = null; render(); }
});

/* ---------- boot ---------- */
(async function boot() {
  try {
    await initContent();
    loadNudges().catch(() => {});
    const p = profile();
    if (p) {
      const migrated = migrateProfile(p);
      if (JSON.stringify(migrated) !== JSON.stringify(p)) store.setProfile(migrated);
      await ensureForProfile(migrated);
    }
  } catch {
    app.innerHTML = '<p class="note warn">Could not load study content. Check your connection and reload.</p>';
    return;
  }
  // Custom subjects carry their diagram with them; register the stored ones
  // so their story strips work from the first render.
  store.customTopics().forEach(t => { if (t.diagram) registerDiagramSpec(t.id, t.diagram); });
  render();
  // Account changes (sign-in, usage updates, purchases) re-render unless a voice reply is streaming.
  // Start from the stored account so the plans screen opens on a fresh sign-in, not on every launch.
  let prevAccount = store.account();
  onAccountChange(acc => {
    if (acc && !prevAccount && acc.plan === 'free' && profile()) S.showPlans = true;
    if (acc && !prevAccount && store.lastProvider() === 'google' && !store.suggestAsked()) S.suggestPending = true;
    prevAccount = acc;
    if (!acc || (acc.plan === 'free' && acc.msgsLeft > 0 && acc.voiceSecLeft >= 20)) S.paywall = false;
    if (!S.live) render();
  });
  listenNative({
    onError: msg => { buyDone(); render(); oops(msg); },
    onCancelled: () => { buyDone(); render(); },
    onPurchased,
  });
  refreshAccount().catch(() => {});
  // Pre-warm the API (avoids a cold start when the user first talks) and learn what's enabled.
  ai.health().then(h => {
    S.voiceServer = !!h.voice; S.googleClientId = h.googleClientId || ''; S.plans = h.plans || null; S.healthLoaded = true;
    render();
  }).catch(() => { S.healthLoaded = true; });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.Capacitor) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
