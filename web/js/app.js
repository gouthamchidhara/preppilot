import { LEVELS, buildPlan, rankTopics, dueCards, review, readiness, profileSummary, migrateProfile, effectiveRoles, daysUntil } from './plan.js';
import { store } from './store.js';
import { ai } from './ai.js';
import { voice } from './voice.js';
import { VoiceSession, realtimeSupported } from './realtime.js';
import { native, signedIn, signOut, renderGoogleButton, refreshAccount, onAccountChange, nativeSignIn, nativePurchase, nativeBuyMock, nativeRestore, listenNative } from './auth.js';
import { initContent, getCatalog, getManifest, roleById, topicMeta, ensureTopics, ensureForProfile, loadedTopics, reportUrl } from './content.js';

const DAY = 86400000;
const app = document.getElementById('app');
const S = { view: 'home', topic: null, ci: 0, deck: null, di: 0, reveal: false, busy: false, listening: false, chatContext: '',
  rt: null, rtMode: null, rtStatus: '', rtStarting: false, voiceServer: false, live: null, pendingUser: false, muted: false,
  googleClientId: '', plans: null, paywall: false, draft: null, roleSearch: '', showPlans: false, buying: null, buyBusy: false, healthLoaded: false, lastView: '' };

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
function ring(pct, label = `${pct}<small>%</small>`) {
  const c = 2 * Math.PI * 52;
  return `<div class="ring" role="img" aria-label="${pct} percent"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"/><circle class="val" cx="60" cy="60" r="52" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - Math.min(100, pct) / 100)).toFixed(1)}"/></svg><div class="num"><span>${label}</span></div></div>`;
}

function toast(msg, kind = '') {
  const t = Object.assign(document.createElement('div'), { className: `toast ${kind}`, innerHTML: `${ic(kind === 'bad' ? 'alert' : 'check')}<span>${esc(msg)}</span>` });
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'bad' ? 6000 : 4200);
}
const oops = msg => toast(msg, 'bad');
function closeSheet() { document.getElementById('sheet')?.remove(); }
function sheet(html) {
  closeSheet();
  document.body.appendChild(Object.assign(document.createElement('div'), { id: 'sheet', innerHTML: `<div role="dialog" aria-modal="true">${html}</div>` }));
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
  return t?.beta ? `<div class="small muted"><span class="pill beta">AI-written</span> <a class="link quiet small" href="${esc(reportUrl(t, where))}" target="_blank" rel="noopener">Report a problem</a></div>` : '';
}

/* ---------- pricing facts (server-provided, with offline fallbacks) ---------- */
function offer() {
  const P = S.plans;
  const [amount, per = 'month'] = (P?.pro.price || '$11.99/month').split('/');
  const n = parseFloat(amount.replace(/[^\d.]/g, ''));
  return {
    freeMsgs: P?.free.msgs ?? 15, freeVoice: P?.free.voiceMin ?? 2,
    proMsgs: P?.pro.msgs ?? 500, proVoice: P?.pro.voiceMin ?? 30, proPrice: `${amount}/${per}`, proAmount: amount, proPer: per,
    perDay: amount.trim().startsWith('$') && n > 0 && per === 'month' ? `About ${Math.round((n / 30) * 100)}¢ a day` : '',
    mockPrice: P?.mock?.price || '$10.99', mockMin: P?.mock?.minutes ?? 60,
  };
}
const storeName = () => (window.PP_PLATFORM === 'android' ? 'Google Play' : 'App Store');
const mockState = () => { const a = store.account(); return { credits: a?.sessionCredits || 0, left: a?.mockSecLeft || 0 }; };

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
  const cat = getCatalog();
  const nTopics = getManifest().packs.reduce((n, p) => n + p.topics.length, 0);
  return `<section class="welcome">
    <h1>Walk into your interview <em>ready.</em></h1>
    <p>A day-by-day plan for your exact role, flashcards that remember what you miss, and an AI coach you can talk to out loud.</p>
    <div class="proof">
      <div><b>${cat.roles.length}</b><span>tech roles, mix and match</span></div>
      <div><b>${nTopics}</b><span>interview topics, by level</span></div>
      <div><b>${offer().mockMin} min</b><span>spoken AI mock interviews</span></div>
    </div>
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
  <form class="card stack" id="profileForm" style="gap:22px">
    <div><h2>${existing ? 'Your prep profile' : 'Build your plan'}</h2>
    <p class="muted small" style="margin-top:6px">${existing ? 'Changes rebuild your plan. ' : 'Takes about a minute. '}Stays on this device.</p></div>
    ${step(1, `<fieldset class="stack"><legend>Which roles are you interviewing for?</legend>
      <input id="roleSearch" value="${esc(S.roleSearch)}" placeholder="Search: java, spark, react, kubernetes…" autocomplete="off" aria-label="Search roles">
      ${cat.families.map(f => `<div class="rolefam"><div class="eyebrow">${esc(f.name)}</div><div class="chips">${cat.roles.filter(r => r.family === f.id).map(roleBtn).join('')}</div></div>`).join('')}
      <div class="chips"><button type="button" class="chip ${d.roleIds.includes('other') ? 'on' : ''}" aria-pressed="${d.roleIds.includes('other')}" data-act="pickrole" data-id="other" data-search="other not listed">Other / not listed</button></div>
      ${d.roleIds.length > 1 ? '<p class="note" role="status">Your plan will combine these roles. You can still drill one role at a time from the plan page.</p>' : ''}
      ${d.roleIds.includes('other') ? `<label>Your role<input name="otherRole" maxlength="60" value="${esc(d.otherRole || '')}" placeholder="e.g. Salesforce developer" required></label>
        <label>Closest role above (picks your starter topics)<select name="baseRoleId" data-act="baserole" required><option value="">Choose…</option>${cat.roles.map(r => `<option value="${r.id}" ${d.baseRoleId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>` : ''}
    </fieldset>`)}
    ${chosen ? `
    ${step(2, `<fieldset class="stack"><legend>About you</legend>
      <label>Experience<select name="level">${LEVELS.map(l => `<option value="${l.id}" ${d.level === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      <label>Interview date (optional)<input type="date" name="interviewDate" value="${esc(d.interviewDate || '')}"></label>
      <label>Your background, in a line or two<textarea name="background" rows="3" maxlength="600" placeholder="e.g. 4 yrs Java microservices, some AWS, want a senior backend role">${esc(d.background || '')}</textarea></label>
      <label>What you're aiming for<input name="goal" maxlength="200" value="${esc(d.goal || '')}" placeholder="e.g. Senior backend interviews at product companies"></label>
      ${extras.length ? `<div class="stack tight"><span class="small" style="font-weight:600">Extra tech you use (optional)</span>
        <div class="chips">${extras.map(id => `<button type="button" class="chip extra ${d.extras?.includes(id) ? 'on' : ''}" data-act="extra" data-id="${id}">${esc(topicName(id))}</button>`).join('')}</div></div>` : ''}
    </fieldset>`)}
    ${step(3, `<fieldset class="stack"><legend>How do you feel about the core topics?</legend>
      <div class="legend"><i>Tap to cycle:</i><i>neutral</i><i class="s">▲ strong</i><i class="w">▼ weak (studied first)</i></div>
      <div class="chips">${core.map(id => `<button type="button" class="chip rate ${rate(id)}" data-act="rate" data-id="${id}">${esc(topicName(id))}</button>`).join('')}</div>
    </fieldset>`)}
    <button class="btn primary lg block" type="submit">${existing ? 'Save changes' : 'Build my plan'} ${ic('right')}</button>` : ''}
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
  app.innerHTML = '<div class="card muted">Building your plan…</div>';
  try { await ensureForProfile(p); } catch { oops('Could not download your topics. Check your connection.'); }
  if (prev) toast('Profile saved. Your plan is updated.');
  S.view = 'home'; render();
}

/* ---------- views ---------- */
function mockPromo() {
  const { credits, left } = mockState();
  const o = offer();
  const body = left >= 20
    ? ['Session in progress', 'Your mock interview is still open', `${Math.ceil(left / 60)} minutes left. Rejoin and pick up where you stopped.`, `<button class="btn primary" data-act="gomock">Rejoin now</button>`]
    : credits
      ? ['Ready when you are', 'Your mock interview is waiting', `${credits} session${credits > 1 ? 's' : ''} available. ${o.mockMin} minutes, spoken, with feedback after every answer.`, `<button class="btn primary" data-act="gomock">Start the interview</button>`]
      : ['Full mock interview', `${o.mockMin} minutes with an AI interviewer`, 'Spoken questions for your role, honest feedback after every answer, and an overall verdict at the end.', `<button class="btn primary" data-act="buymock" ${S.buyBusy ? 'disabled' : ''}>Get a session · ${esc(o.mockPrice)}</button>`];
  return `<section class="card promo"><div class="badge">${ic('target')}</div>
    <div class="stack tight grow"><div class="eyebrow">${body[0]}</div><h3>${esc(body[1])}</h3><p class="muted small">${esc(body[2])}</p><div class="row" style="margin-top:6px">${body[3]}</div></div></section>`;
}

function homeView() {
  const p = profile();
  const relevant = rankTopics(topics(), p);
  if (!relevant.length) return '<div class="card muted">Loading your topics…</div>';
  const plan = planFor(p);
  const ti = Math.min(todayIndex(p), plan.length - 1);
  const today = plan[ti];
  const prog = store.progress();
  const r = readiness(relevant, p, prog);
  const due = dueCards(topics(), p, prog, Date.now(), 999).length;
  const left = daysUntil(p.interviewDate);
  const dayLabel = d => d.kind === 'mock' ? 'Mock interview + review' : d.kind === 'review' ? 'Mixed review' : d.topics.map(topicName).join(' + ');
  const todayTitle = today.kind === 'mock' ? 'Mock interview day' : today.kind === 'review' ? 'Review what is due' : dayLabel(today);
  const todayHint = today.kind === 'mock' ? 'Rehearse under real conditions, then clear the cards you missed.' : today.kind === 'review' ? `${due} card${due === 1 ? '' : 's'} due. Missed ones come first.` : 'Read the learn cards, then lock it in with flashcards.';
  const mine = new Set(relevant.map(t => t.id));
  const others = getManifest().packs.map(pk => ({ ...pk, topics: pk.topics.filter(t => !mine.has(t.id)) })).filter(pk => pk.topics.length);
  const roleIds = migrateProfile(p).roleIds;
  const label = id => id === 'other' ? p.otherRole : roleName(id);
  const short = iso => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const topicRow = (t, i) => {
    const tr = readiness([t], p, prog);
    return `<button class="item" data-act="learn" data-id="${t.id}"><span class="rank">${i + 1}</span>
      <span class="body"><b>${esc(t.name)}${t.beta ? ' <span class="pill beta">AI-written</span>' : ''}</b><span class="muted small">${esc(t.blurb || '')}</span></span>
      <span class="mini ${tr.pct >= 80 ? 'done' : ''}">${tr.total ? tr.pct + '%' : ''}</span>${ic('right')}</button>`;
  };
  return `<div class="stack">
    <section class="card hero-card">
      ${ring(r.pct)}
      <div class="grow"><div class="eyebrow">Interview readiness</div>
        <div class="muted small" style="margin-top:2px">${esc(roleIds.map(label).join(' · '))}</div>
        <div class="stats">
          <div class="stat"><b>${r.known}<span style="font-size:.8rem"> / ${r.total}</span></b><span>cards known</span></div>
          <div class="stat"><b>${due}</b><span>due now</span></div>
          <div class="stat"><b>${left ?? plan.length - ti}</b><span>${left === null ? 'days in plan' : left === 1 ? 'day to go' : 'days to go'}</span></div>
        </div>
      </div>
    </section>
    <section class="card glow stack today">
      <div class="row between"><div class="eyebrow">Today · day ${ti + 1} of ${plan.length}</div>${due ? `<span class="pill accent">${due} due</span>` : ''}</div>
      <div><h3>${esc(todayTitle)}</h3><p class="muted small" style="margin-top:6px">${esc(todayHint)}</p></div>
      <div class="row">
        ${today.kind === 'learn' ? `<button class="btn primary grow" data-act="learn" data-id="${today.topics[0]}">${ic('book')}Start learning</button>` : ''}
        <button class="btn ${today.kind === 'learn' ? '' : 'primary'} grow" data-act="deck" data-id="${today.kind === 'learn' ? today.topics.join(',') : ''}">${ic('cards')}Flashcards</button>
        ${today.kind === 'mock' ? `<button class="btn grow" data-act="mock">${ic('spark')}Chat mock interview</button>` : ''}
      </div>
    </section>
    <div class="days" id="days">${plan.map((d, i) => `<button class="day ${i < ti ? 'past' : i === ti ? 'cur' : ''} ${d.kind === 'mock' ? 'mock' : ''}" ${d.kind === 'learn' ? `data-act="learn" data-id="${d.topics[0]}"` : d.kind === 'mock' ? 'data-act="mock"' : 'data-act="deck"'}>
      <span class="d">${i === ti ? 'Today' : 'Day ' + (i + 1)} · ${esc(short(d.date))}</span><span class="t">${esc(dayLabel(d))}</span></button>`).join('')}</div>
    ${mockPromo()}
    ${roleIds.length > 1 ? `<section class="card stack"><h3>Drill one role</h3><p class="muted small">Focused flashcards from a single role's topics.</p><div class="chips">${roleIds.map(id => `<button class="chip" data-act="roledeck" data-id="${esc(id)}">${esc(label(id))}</button>`).join('')}</div></section>` : ''}
    ${roleIds.includes('other') ? `<section class="card stack"><h3>Make it specific to ${esc(p.otherRole)}</h3>
      <p class="muted small">Your plan starts from the closest listed role. Let the AI write topics for your exact role (uses 5 AI messages).</p>
      <div class="row"><button class="btn primary" data-act="buildrole" ${S.busy ? 'disabled' : ''}>${ic('spark')}${S.busy ? 'Building…' : 'Build my role guide'}</button></div></section>` : ''}
    <div class="sec-head"><h3>Your topics</h3><span class="muted small">most important first</span></div>
    <div class="list">${relevant.map(topicRow).join('')}</div>
    <details class="card"><summary>Browse everything else</summary>
      <div class="stack" style="margin-top:14px">${others.map(pk => `<div class="rolefam"><div class="eyebrow">${esc(pk.name)}</div><div class="chips">${pk.topics.map(t => `<button class="chip" data-act="learn" data-id="${t.id}">${esc(t.name)}</button>`).join('')}</div></div>`).join('')}</div>
    </details>
  </div>`;
}

function learnView() {
  const t = topicById(S.topic);
  if (!t) return '<div class="card muted">Loading…</div>';
  const c = t.concepts[S.ci];
  if (!c) return `<div class="card stack"><h2>${esc(t.name)}</h2><p class="muted">No learn cards in this topic.</p><button class="btn primary" data-act="deck" data-id="${t.id}">Flashcards</button></div>`;
  const last = S.ci >= t.concepts.length - 1;
  return `<div class="stack">
    <div class="row between"><button class="back" data-act="home">${ic('left')}Plan</button><span class="muted small">${S.ci + 1} of ${t.concepts.length}</span></div>
    <div class="segs">${t.concepts.map((_, i) => `<i class="${i <= S.ci ? 'on' : ''}"></i>`).join('')}</div>
    <article class="card stack lesson" style="gap:18px">
      <div><div class="eyebrow">${esc(t.name)}</div><h3 style="margin-top:6px">${esc(c.t)}</h3></div>
      <div><div class="lbl">What it is</div><p>${fmt(c.what)}</p></div>
      ${c.why ? `<div><div class="lbl">Why it matters</div><p>${fmt(c.why)}</p></div>` : ''}
      ${c.ex ? `<div><div class="lbl">Example</div><pre><code>${esc(c.ex)}</code></pre></div>` : ''}
      ${c.tip ? `<div class="tip"><div class="lbl">Say this in the interview</div><p>${fmt(c.tip)}</p></div>` : ''}
      ${betaNote(t, `card ${S.ci + 1}: ${c.t}`)}
    </article>
    <div class="row">
      <button class="btn" data-act="cprev" ${S.ci === 0 ? 'disabled' : ''} aria-label="Previous card">${ic('left')}</button>
      <button class="btn" data-act="askcard">${ic('spark')}Ask the coach</button>
      ${last ? `<button class="btn primary grow" data-act="deck" data-id="${t.id}">Test yourself ${ic('right')}</button>` : `<button class="btn primary grow" data-act="cnext">Next ${ic('right')}</button>`}
    </div>
  </div>`;
}

function deckView() {
  const d = S.deck;
  if (!d.cards.length) return `<div class="card stack center result">${ring(100, ic('check'))}<h2>All caught up</h2><p class="muted">Nothing is due for this selection. Learn a new topic or come back tomorrow.</p><button class="btn primary" data-act="home">Back to plan</button></div>`;
  if (S.di >= d.cards.length) {
    const got = d.results.filter(Boolean).length;
    const pct = Math.round((got * 100) / d.cards.length);
    return `<div class="card stack center result">${ring(pct, `${got}<small>/${d.cards.length}</small>`)}
      <h2>${pct >= 80 ? 'Strong round.' : pct >= 50 ? 'Getting there.' : 'Good to know now.'}</h2>
      <p class="muted">${pct >= 80 ? 'These cards come back later, on schedule.' : 'Missed cards come back first next time. Re-read the learn cards for the weak spots.'}</p>
      <div class="row"><button class="btn" data-act="home">Back to plan</button><button class="btn primary" data-act="deck" data-id="">Another round</button></div></div>`;
  }
  const q = d.cards[S.di];
  const t = topicById(q.topic);
  return `<div class="stack">
    <div class="row between"><button class="back" data-act="home">${ic('x')}Quit</button><span class="muted small">${S.di + 1} of ${d.cards.length}</span></div>
    <div class="bar"><i style="width:${(S.di * 100) / d.cards.length}%"></i></div>
    <article class="card stack flash">
      <div class="stack">
        <div class="row between"><span class="pill">${esc(t?.name || q.topic)}</span><span class="tier" title="Difficulty ${q.l} of 3">${[1, 2, 3].map(n => `<i class="${n <= q.l ? 'on' : ''}"></i>`).join('')}</span></div>
        <p class="q">${fmt(q.q)}</p>
        ${S.reveal ? `<div class="ans">${fmt(q.a)}</div>` : ''}
      </div>
      ${S.reveal ? `<div class="stack">
        <div class="row"><button class="btn again lg" data-act="grade" data-ok="0">${ic('x')}Missed it</button><button class="btn good lg" data-act="grade" data-ok="1">${ic('check')}Got it</button></div>
        <div class="row between"><button class="link small" data-act="askq">Go deeper with the coach →</button>${betaNote(t, `question: ${q.q}`)}</div></div>`
      : '<button class="reveal" data-act="reveal">Say your answer out loud, then tap to check</button>'}
    </article>
  </div>`;
}

const STATUS = { connecting: 'Connecting…', ready: 'Listening. Just talk.', listening: 'Listening. I won\'t interrupt.', you: 'You\'re speaking…', thinking: 'Thinking…', ai: 'Speaking. Talk to interrupt.' };
const MODE_NAME = { talk: 'Talk', listen: 'Rehearse', mock: 'Mock interview' };
const clock = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function voicePanel() {
  if (S.rt) {
    return `<section class="card stage">
      <div class="orb status-${S.rtStatus} ${S.muted ? 'muted' : ''}" id="rtOrb"></div>
      <div><div class="status" id="rtStatus">${esc(S.muted ? 'Muted' : STATUS[S.rtStatus] || S.rtStatus)}</div>
        <div class="timer" id="rtTimer">${esc(MODE_NAME[S.rtMode] || '')}</div></div>
      <div class="ctl">
        ${S.rtMode === 'listen' ? `<div><button class="iconbtn primary" data-act="rtrespond" aria-label="Get feedback now">${ic('check')}</button>My turn's done</div>` : ''}
        <div><button class="iconbtn" data-act="rtinterrupt" aria-label="Stop the coach talking">${ic('stop')}</button>Interrupt</div>
        <div><button class="iconbtn ${S.muted ? 'on' : ''}" data-act="rtmute" aria-label="${S.muted ? 'Unmute' : 'Mute'} microphone">${ic(S.muted ? 'micoff' : 'mic')}</button>${S.muted ? 'Unmute' : 'Mute'}</div>
        <div><button class="iconbtn danger" data-act="rtstop" aria-label="End session">${ic('x')}</button>End</div>
      </div>
    </section>`;
  }
  if (!(S.voiceServer && realtimeSupported)) {
    return S.healthLoaded ? `<div class="note">Live voice isn't available ${S.voiceServer ? 'in this browser' : 'right now'}. You can still type, or use the mic button to dictate.</div>` : '';
  }
  const { credits, left } = mockState();
  const o = offer();
  const dis = S.rtStarting ? 'disabled' : '';
  const mockTag = left >= 20 ? `Rejoin · ${Math.ceil(left / 60)} min left` : credits ? `${credits} session${credits > 1 ? 's' : ''} ready` : `${o.mockPrice} · one-time`;
  return `<div class="modes">
    <button class="mode talk" data-act="rtstart" data-mode="talk" ${dis}><span class="ico">${ic('mic')}</span><span class="txt"><b>Talk</b><span>Hands-free conversation. Interrupt any time.</span></span></button>
    <button class="mode listen" data-act="rtstart" data-mode="listen" ${dis}><span class="ico">${ic('ear')}</span><span class="txt"><b>Rehearse</b><span>Answer out loud without interruptions, then get graded.</span></span></button>
    <button class="mode mock" data-act="${left >= 20 || credits ? 'gomock' : 'buymock'}" ${dis || (S.buyBusy ? 'disabled' : '')}><span class="ico">${ic('target')}</span><span class="txt"><b>Mock interview</b><span>${o.mockMin} minutes, full interview, scored.</span><span class="tag">${esc(mockTag)}</span></span></button>
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

function signInCard(headline = 'Meet your AI interview coach') {
  const o = offer();
  const buttons = native()
    ? `<div class="stack tight" style="width:100%;max-width:300px">${window.PP_PLATFORM === 'ios' ? '<button class="btn primary block" data-act="nsignin" data-p="apple"> Sign in with Apple</button>' : ''}<button class="btn ${window.PP_PLATFORM === 'ios' ? '' : 'primary'} block" data-act="nsignin" data-p="google">Continue with Google</button></div>`
    : (S.googleClientId ? '<div id="gbtn"></div>' : `<p class="muted small">${S.healthLoaded ? 'Sign-in is being set up. Check back soon.' : 'Loading sign-in…'}</p>`);
  return `<section class="card stack signin" id="accountCard">
    <div class="ico">${ic('spark')}</div>
    <h2>${esc(headline)}</h2>
    <p class="muted">Ask anything, get your answers graded, or practice out loud. Your plan and flashcards stay free without an account.</p>
    ${ticks([`<b>Free to try:</b> ${o.freeMsgs} AI messages and ${o.freeVoice} voice minutes`, 'No card needed. Sign in takes a few seconds.'])}
    ${buttons}
    <details class="small"><summary class="muted" style="font-weight:500">Have a beta code?</summary>
      <form id="codeForm" class="row" style="margin-top:10px"><input id="code" type="password" value="${esc(store.accessCode())}" autocomplete="off" aria-label="Beta code"><button class="btn">Save</button></form>
    </details>
  </section>`;
}

function accountCard() {
  const a = store.account();
  if (!signedIn()) return signInCard();
  if (!a) return `<section class="card row between small muted"><span>${store.accessCode() ? 'Using a beta access code.' : 'Loading account…'}</span><button class="link small" data-act="signout">Sign out</button></section>`;
  const o = offer();
  const { credits, left } = mockState();
  const name = a.name || a.email || 'Signed in';
  const planPill = a.unlimited ? '<span class="pill">ADMIN</span>' : a.plan === 'pro' ? '<span class="pill pro">PRO</span>' : '<span class="pill">FREE</span>';
  const sub = a.unlimited ? 'Unlimited AI' : a.plan === 'pro' && a.periodEnds ? `Allowance resets ${new Date(a.periodEnds).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : `Free trial: ${o.freeMsgs} messages, ${o.freeVoice} voice minutes`;
  return `<section class="card stack" id="accountCard">
    <div class="row"><div class="avatar">${esc(name[0].toUpperCase())}</div>
      <div class="grow"><div class="row" style="gap:8px"><b style="overflow:hidden;text-overflow:ellipsis">${esc(name)}</b>${planPill}</div><div class="small muted">${esc(sub)}</div></div></div>
    ${usageMeters(a)}
    ${credits || left >= 20 ? `<div class="note">${left >= 20 ? `Mock interview in progress: ${Math.ceil(left / 60)} min left. ` : ''}${credits ? `${credits} mock interview session${credits > 1 ? 's' : ''} ready.` : ''} <button class="link small" data-act="gomock">${left >= 20 ? 'Rejoin' : 'Start'} →</button></div>` : ''}
    ${a.plan === 'free' ? `<button class="btn primary block" data-act="plans">${ic('bolt')}Upgrade to Pro · ${esc(o.proPrice)}</button>` : ''}
    <div class="row small" style="gap:16px">
      ${a.plan !== 'free' || a.unlimited ? '<button class="link quiet small" data-act="plans">Plans</button>' : ''}
      ${native() && !a.unlimited ? '<button class="link quiet small" data-act="restore">Restore purchases</button>' : ''}
      <a class="link quiet small" href="privacy.html" target="_blank" rel="noopener">Privacy</a>
      <button class="link quiet small" data-act="signout">Sign out</button>
      ${a.key === 'code:admin' ? '' : '<button class="link quiet small" data-act="delacct">Delete account</button>'}
    </div>
  </section>`;
}

function paywallCard() {
  const a = store.account();
  const o = offer();
  if (a?.plan === 'pro') {
    return `<section class="card paywall stack"><div class="eyebrow">Monthly allowance used</div><h3>You've used this month's Pro allowance</h3>
      <p class="muted small">It refills ${a.periodEnds ? 'on ' + new Date(a.periodEnds).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : 'at your next billing period'}. A mock interview session is separate and works right now.</p>
      ${usageMeters(a)}<div class="row"><button class="btn primary" data-act="plans">See mock interview</button><button class="btn ghost" data-act="unpaywall">Dismiss</button></div></section>`;
  }
  return `<section class="card paywall stack"><div class="eyebrow">Free trial used up</div><h3>Keep your coach for the whole prep</h3>
    <p class="muted small">Pro gives you ${o.proMsgs} AI messages and ${o.proVoice} voice minutes every month. Your plan and flashcards stay free either way.</p>
    ${usageMeters(a)}
    <div class="row"><button class="btn primary grow" data-act="plans">${ic('bolt')}See plans · from ${esc(o.proPrice)}</button><button class="btn ghost" data-act="unpaywall">Not now</button></div></section>`;
}

function mountGoogleButton() {
  const el = document.getElementById('gbtn');
  if (el && !el.childElementCount) renderGoogleButton(el, S.googleClientId, msg => oops(msg)).catch(e => { el.textContent = e.message; });
}

function chatView() {
  const msgs = store.chat();
  const quick = ['Mock interview me on my weakest topic', 'Grade my answer to the last question', 'Explain the hardest topic in my plan simply', 'What would a senior panel ask about my background?'];
  const live = S.live ? `<div class="msg assistant" id="liveMsg">${md(S.live.text) || '<span class="dots"><i></i><i></i><i></i></span>'}</div>` : '';
  const canUse = signedIn();
  const a = store.account();
  const bubble = m => isNotice(m) ? `<div class="msg sys">${fmt(m.content.replace(/^(ℹ️|⚠️)\s*/, ''))}</div>` : `<div class="msg ${m.role}">${m.role === 'assistant' ? md(m.content) : fmt(m.content)}</div>`;
  if (!canUse) return `<div class="stack">${signInCard()}</div>`;
  const lowFree = a?.plan === 'free' && !S.paywall && (a.msgsLeft <= 5 || a.voiceSecLeft < 30);
  return `<div class="stack chat">
    <div class="row between"><h2>Coach</h2>
      <div class="row" style="gap:14px">${S.rt ? '' : `<label class="switch"><input type="checkbox" id="speakToggle" ${store.speak() ? 'checked' : ''}>Read replies aloud</label>`}
      ${msgs.length ? '<button class="link quiet small" data-act="clearchat">Clear</button>' : ''}</div></div>
    ${S.paywall ? paywallCard() : voicePanel()}
    ${lowFree && !S.rt ? `<div class="note row between"><span>${a.msgsLeft} message${a.msgsLeft === 1 ? '' : 's'} and ${mins(a.voiceSecLeft)} voice min left in your free trial.</span><button class="link small" data-act="plans">Upgrade →</button></div>` : ''}
    ${S.chatContext ? `<div class="note row between"><span>About: <b style="color:var(--ink)">${esc(S.chatContext.split('\n')[0])}</b></span><button class="link quiet small" data-act="dropctx">Remove</button></div>` : ''}
    <div class="msgs" id="msgs">${msgs.length || live ? msgs.map(bubble).join('') : `<div class="empty"><h3>What do you want to work on?</h3><p class="muted">Ask about a concept, paste an answer to get it graded, or start a mock interview.</p>
      <div class="chips">${quick.map(q => `<button class="chip" data-act="quick" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`}
    ${live}${S.busy ? '<div class="msg assistant"><span class="dots"><i></i><i></i><i></i></span></div>' : ''}</div>
    <form id="chatForm" class="composer">
      <textarea id="chatInput" rows="1" maxlength="2000" placeholder="${S.rt ? 'Or type. Answers stream in.' : 'Message your coach…'}" aria-label="Message"></textarea>
      ${S.rt ? '' : `<button type="button" class="iconbtn ${S.listening ? 'on' : ''}" data-act="mic" ${voice.canListen ? '' : 'disabled'} aria-label="${S.listening ? 'Stop dictation' : 'Dictate'}" title="${voice.canListen ? 'Dictate' : 'Dictation is not supported here'}">${ic(S.listening ? 'stop' : 'mic')}</button>`}
      <button class="iconbtn primary" type="submit" ${S.busy ? 'disabled' : ''} aria-label="Send">${ic('send')}</button>
    </form>
  </div>`;
}

/* ---------- realtime voice ---------- */
function paintVoice() {
  const st = document.getElementById('rtStatus'), orb = document.getElementById('rtOrb'), tm = document.getElementById('rtTimer');
  if (st) st.textContent = S.muted ? 'Muted' : STATUS[S.rtStatus] || S.rtStatus;
  if (orb) orb.className = `orb status-${S.rtStatus} ${S.muted ? 'muted' : ''}`;
  if (tm && S.rt) {
    const left = S.rt.endsAt ? Math.max(0, (S.rt.endsAt - Date.now()) / 1000) : null;
    tm.textContent = `${MODE_NAME[S.rtMode] || ''}${left === null ? '' : ` · ${clock(left)} left`}`;
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
      render();
    },
    end(reason) {
      const wasMock = S.rtMode === 'mock';
      S.rt = null; S.rtMode = null; S.rtStatus = ''; S.live = null; S.pendingUser = false; S.muted = false;
      store.setChat(store.chat().filter(m => m.content !== '🎙 …'));
      if (reason) store.setChat([...store.chat(), { role: 'assistant', content: `ℹ️ ${reason}` }]);
      if (wasMock) refreshAccount().catch(() => {}); // remaining session time for the "rejoin" button
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
    // Rehearse mode stays silent unless "read replies aloud" is on; talk and mock interviews are always spoken.
    await session.start({ mode, speak: mode !== 'listen' || store.speak(), profileSummary: summary(), context: S.chatContext });
  } catch (e) {
    S.rt = null; S.rtMode = null;
    if (e.code === 'quota') S.paywall = true;
    if (e.code === 'no_credit') { refreshAccount().catch(() => {}); oops('No mock interview session on this account yet.'); }
    else store.setChat([...store.chat(), { role: 'assistant', content: `⚠️ ${e.message}` }]);
  } finally { S.rtStarting = false; render(); }
}

function settingsView() {
  const custom = store.customTopics(), priv = store.privatePacks();
  return `<div class="stack">
    ${accountCard()}
    ${onboardingView(profile())}
    <section class="card stack"><div><h3>Cards for any topic</h3>
      <p class="muted small" style="margin-top:4px">Not covered? The AI writes a set: "Kafka exactly-once", "Terraform state", "GraphQL federation". Uses 5 AI messages.</p></div>
      <form id="genForm" class="row"><input id="genTopic" maxlength="120" placeholder="Topic" required aria-label="Topic"><button class="btn primary" ${S.busy ? 'disabled' : ''}>${ic('spark')}${S.busy ? 'Writing…' : 'Generate'}</button></form>
      ${custom.length ? `<div class="list">${custom.map(t => `<div class="item" style="cursor:default"><span class="body"><b>${esc(t.name)}</b><span class="muted small">${t.concepts.length} cards · ${t.qa.length} questions</span></span><button class="link quiet small" data-act="delcustom" data-id="${t.id}">Delete</button></div>`).join('')}</div>` : ''}
    </section>
    <section class="card stack"><div><h3>Private packs</h3>
      <p class="muted small" style="margin-top:4px">Import your own JSON pack (projects, STAR stories). It never leaves this device.</p></div>
      <input type="file" id="importPack" accept="application/json,.json" aria-label="Import pack">
      ${priv.map(p => `<div class="item" style="cursor:default"><span class="body"><b>${esc(p.name)}</b><span class="muted small">${p.topics.length} topics</span></span><button class="link quiet small" data-act="delpack" data-id="${esc(p.id)}">Remove</button></div>`).join('')}
    </section>
    <section class="card stack"><h3>Your data</h3>
      <p class="muted small">Profile, progress and chats are stored only on this device.</p>
      <div class="row"><button class="btn" data-act="export">Export my data</button><button class="btn again" style="flex:none" data-act="reset">Erase everything</button></div>
    </section>
  </div>`;
}

function plansView() {
  const a = store.account();
  const o = offer();
  const isPro = a?.plan === 'pro';
  const { credits } = mockState();
  const dis = S.buyBusy ? 'disabled' : '';
  return `<div class="stack" style="gap:20px">
    <div class="plans-top"><button class="iconbtn" data-act="pickfree" aria-label="Close">${ic('x')}</button></div>
    <div class="plans-hero">
      <h1>Practice out loud.<br><em>Walk in ready.</em></h1>
      <p>The plan and flashcards are free. Add the AI coach for the part that decides interviews: saying your answers and getting honest feedback.</p>
    </div>
    <div class="plans-grid">
      <div class="plan-card pro">
        <div class="plan-flag">Best for daily practice</div>
        <div><div class="eyebrow">Pro</div><div class="name">Your coach, all month</div></div>
        <div class="price">${esc(o.proAmount)}<span>/ ${esc(o.proPer)}</span></div>
        ${o.perDay ? `<div class="sub">${esc(o.perDay)}. Cancel any time.</div>` : ''}
        ${ticks([`<b>${o.proMsgs} AI messages</b> every month`, `<b>${o.proVoice} voice minutes</b> every month: talk it through or rehearse out loud`, 'Answers graded, with the follow-ups a panel would ask', 'Chat mock interviews on your weakest topics', 'Custom card sets for any technology'])}
        ${isPro ? `<button class="btn block lg" disabled>${ic('check')}Your current plan</button>` : `<button class="btn primary block lg" data-act="buysub" ${dis}>${S.buyBusy === 'pro' ? `Opening the ${storeName()}…` : 'Start Pro'}</button>`}
      </div>
      <div class="plan-card mockp">
        <div class="plan-flag">Interview this week?</div>
        <div><div class="eyebrow">One-time</div><div class="name">Full mock interview</div></div>
        <div class="price">${esc(o.mockPrice)}<span>/ session</span></div>
        <div class="sub">${o.mockMin} minutes of voice. No subscription.</div>
        ${ticks(['A spoken interview built for your role and level', 'One question at a time, honest feedback after each answer', 'Overall assessment at the end', 'Dropped call? Rejoin within the hour, same session', 'Works with Free or Pro'])}
        <button class="btn block lg" data-act="buymock" ${dis}>${S.buyBusy === 'mock' ? `Opening the ${storeName()}…` : credits ? `Buy another (you have ${credits})` : 'Buy a session'}</button>
      </div>
      <div class="plan-card free">
        <div class="row between"><div><div class="eyebrow" style="color:var(--muted)">Free</div><div class="name">Study guide</div></div><div class="price" style="font-size:1.8rem">$0</div></div>
        ${ticks(['Personal day-by-day plan', 'Every learn card and flashcard, with spaced repetition', `${o.freeMsgs} AI messages and ${o.freeVoice} voice minutes to try the coach`], 'dim')}
        <button class="btn ghost block" data-act="pickfree">${isPro ? 'Back to the app' : 'Continue free'}</button>
      </div>
    </div>
    <div class="assure"><span>${ic('shield')}Billed by ${native() ? storeName() : 'Apple or Google'}</span><span>${ic('refresh')}Cancel any time</span><span>${ic('lock')}Study data stays on your device</span></div>
    <div class="faq">
      <details><summary>What counts as an AI message?</summary><p>Each question you send the coach is one message. Generating a custom card set uses five. Voice is counted in minutes, only while a session is live.</p></details>
      <details><summary>Do I need Pro for the full mock interview?</summary><p>No. A mock interview session is a separate one-time purchase and works on the free plan. It does not use your monthly voice minutes.</p></details>
      <details><summary>How do I cancel Pro?</summary><p>In your ${window.PP_PLATFORM === 'android' ? 'Google Play' : 'Apple ID'} subscription settings, any time. You keep Pro until the end of the period you paid for.</p></details>
      <details><summary>What happens to my progress if I stay free?</summary><p>Nothing changes. Your plan, cards and progress are yours and stay on this device.</p></details>
    </div>
    <p class="legal">Pro is ${esc(o.proPrice)} and renews automatically until cancelled in your ${window.PP_PLATFORM === 'android' ? 'Google Play' : 'Apple ID'} subscription settings at least 24 hours before the renewal date. Payment is charged to your ${storeName()} account at confirmation of purchase.<br>
      <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener">Terms of Use</a> · <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>${native() ? ' · <button class="link" data-act="restore">Restore purchases</button>' : ''}</p>
  </div>`;
}

function topRight() {
  const a = store.account();
  if (!profile() || S.showPlans) return '';
  if (a?.unlimited) return '<span class="pill">ADMIN</span>';
  if (a?.plan === 'pro') return '<button class="pill pro" style="border:0;cursor:pointer" data-act="plans">PRO</button>';
  if (signedIn() && !a) return '';
  return `<button class="upsell" data-act="plans">${ic('bolt')}Go Pro</button>`;
}

function scrollEnd() { window.scrollTo(0, document.documentElement.scrollHeight); }

function render() {
  const p = profile();
  const key = S.showPlans ? 'plans' : !p ? 'onboard' : S.view === 'deck' && !S.deck ? 'home' : S.view;
  const changed = key !== S.lastView;
  S.lastView = key;
  const input = document.getElementById('chatInput');
  const keep = input && key === 'chat' ? { value: input.value, focus: document.activeElement === input } : null;
  document.querySelectorAll('nav [data-nav]').forEach(b => b.setAttribute('aria-current', String(b.dataset.nav === (S.view === 'learn' ? 'home' : S.view))));
  document.querySelector('nav').hidden = !p || S.showPlans;
  document.getElementById('topRight').innerHTML = topRight();
  const html = key === 'plans' ? plansView()
    : key === 'onboard' ? onboardingView(null)
    : key === 'learn' ? learnView()
    : key === 'deck' ? deckView()
    : key === 'chat' ? chatView()
    : key === 'settings' ? settingsView()
    : homeView();
  app.innerHTML = `<div class="${changed ? 'view' : ''}">${html}</div>`;
  if (keep) { const i = document.getElementById('chatInput'); if (i) { i.value = keep.value; if (keep.focus) i.focus(); } }
  mountGoogleButton();
  filterRoles();
  if (key === 'chat') { paintVoice(); if (!changed || store.chat().length) scrollEnd(); else window.scrollTo({ top: 0 }); }
  else if (changed || key === 'learn' || key === 'deck') window.scrollTo({ top: 0 });
  if (key === 'home') { const d = document.getElementById('days'), c = d?.querySelector('.cur'); if (c) d.scrollLeft = c.offsetLeft - d.offsetLeft - 16; }
}

/* ---------- purchases ---------- */
function needSignIn() {
  S.showPlans = false; S.view = 'settings'; render();
  toast('Sign in first. It takes a few seconds, then pick your plan.');
}
function storeSheet() {
  sheet(`<h2>Upgrades live in the iPhone app</h2>
    <p class="muted">Pro and mock interview sessions are bought through the App Store. Sign in there with this same account and everything unlocks here too, on any device.</p>
    <button class="btn primary block" data-act="closesheet">Got it</button>`);
}
let buyTimer;
function buy(kind) { // 'pro' | 'mock' | 'restore'
  if (!store.session()) return needSignIn(); // beta-code sessions have no account to attach a purchase to
  if (!native()) return storeSheet();
  const acc = store.account();
  if (!acc?.key) return oops('Still loading your account. Try again in a moment.');
  S.buying = { kind, credits: acc.sessionCredits || 0 };
  S.buyBusy = kind; render();
  // Older app builds don't report a cancelled purchase sheet, so never leave the buttons locked.
  clearTimeout(buyTimer);
  buyTimer = setTimeout(() => { S.buyBusy = false; render(); }, 8000);
  if (kind === 'pro') nativePurchase(acc.key); else if (kind === 'mock') nativeBuyMock(acc.key); else nativeRestore(acc.key);
}
function buyDone() { clearTimeout(buyTimer); const b = S.buying; S.buying = null; S.buyBusy = false; return b; }
// The store confirms a purchase before our server has heard about it; check again a few times.
function pollPurchase(before, tries = [3000, 8000, 20000]) {
  if (!tries.length) return;
  setTimeout(async () => {
    try { await ai.post('/api/billing/refresh', {}); } catch { /* try again below */ }
    const a = store.account();
    if ((a?.sessionCredits || 0) > before.credits) { S.showPlans = false; render(); return toast('Mock interview added. Start it from the Coach tab.'); }
    if (before.kind === 'pro' && a?.plan === 'pro') { S.showPlans = false; render(); return toast('You\'re on Pro. Thank you!'); }
    pollPurchase(before, tries.slice(1));
  }, tries[0]);
}
function onPurchased(acc) {
  const b = buyDone();
  S.paywall = false;
  if (b?.kind === 'mock') {
    if ((acc?.sessionCredits || 0) > b.credits) { S.showPlans = false; toast('Mock interview added. Start it from the Coach tab.'); }
    else { toast('Payment received. Your session will show up in a moment.'); pollPurchase(b); }
  } else if (acc?.plan === 'pro') { S.showPlans = false; toast(b?.kind === 'restore' ? 'Pro restored.' : 'You\'re on Pro. Thank you!'); }
  else if (b?.kind === 'restore') oops('No active subscription found for this account.');
  else { toast('Payment received. Pro will unlock in a moment.'); pollPurchase(b || { kind: 'pro', credits: 0 }); }
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

function aiFailed(err) {
  if (err.code === 'quota') { S.paywall = true; S.view = 'chat'; }
  else if (err.code === 'signin') S.view = 'chat';
  oops(err.message);
}

async function buildRoleGuide() {
  const p = profile();
  if (!signedIn()) { S.view = 'chat'; return render(); }
  S.busy = true; render();
  try {
    const r = await ai.generate(`${p.otherRole}: interview essentials`, summary(), 12);
    const id = 'c-role-' + Date.now().toString(36);
    store.setCustomTopics([...store.customTopics(), { id, name: `${p.otherRole} essentials`, blurb: 'AI-generated for your role', tag: 'ai', concepts: r.concepts, qa: r.qa, custom: true, beta: true }]);
    toast('Your role guide is in your topics.');
  } catch (err) { aiFailed(err); }
  S.busy = false; render();
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

app.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'profileForm') return saveProfile();
  if (e.target.id === 'chatForm') { const i = document.getElementById('chatInput'); const v = i.value; i.value = ''; i.style.height = ''; return sendChat(v); }
  if (e.target.id === 'codeForm') { store.setAccessCode(document.getElementById('code').value.trim()); return render(); }
  if (e.target.id === 'genForm') {
    if (!signedIn()) { S.view = 'chat'; return render(); }
    const topic = document.getElementById('genTopic').value.trim();
    S.busy = true; render();
    try {
      const r = await ai.generate(topic, summary(), 8);
      const id = 'c-' + topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36);
      store.setCustomTopics([...store.customTopics(), { id, name: topic, blurb: 'AI-generated', tag: 'ai', concepts: r.concepts, qa: r.qa, custom: true, beta: true }]);
      toast(`"${topic}" added to your topics.`);
    } catch (err) { aiFailed(err); }
    S.busy = false; render();
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
  else if (a === 'home') { S.view = 'home'; render(); }
  else if (a === 'learn') openTopic(id);
  else if (a === 'buildrole') buildRoleGuide();
  else if (a === 'cnext') { S.ci++; render(); }
  else if (a === 'cprev') { S.ci--; render(); }
  else if (a === 'deck') startDeck(id ? id.split(',') : null);
  else if (a === 'roledeck') startRoleDeck(id);
  else if (a === 'reveal') { S.reveal = true; render(); }
  else if (a === 'grade') {
    const q = S.deck.cards[S.di], ok = b.dataset.ok === '1', prog = store.progress();
    prog[q.id] = review(prog[q.id], ok); store.setProgress(prog);
    S.deck.results.push(ok); S.di++; S.reveal = false; render();
  }
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
  else if (a === 'mock') {
    const weak = profile().weak?.[0];
    S.chatContext = ''; S.view = 'chat'; render();
    if (signedIn()) sendChat(`Run a mock interview for my target role${weak ? `, starting with ${topicById(weak)?.name || weak}` : ''}. Ask one question at a time and grade each answer honestly.`);
  }
  else if (a === 'quick') sendChat(b.dataset.q);
  else if (a === 'rtstart') startVoice(b.dataset.mode);
  else if (a === 'gomock') {
    if (!signedIn()) return needSignIn();
    S.showPlans = false; S.chatContext = ''; S.view = 'chat'; render();
    startVoice('mock');
  }
  else if (a === 'plans') { S.showPlans = true; render(); }
  else if (a === 'pickfree') { S.showPlans = false; render(); }
  else if (a === 'unpaywall') { S.paywall = false; render(); }
  else if (a === 'buysub') buy('pro');
  else if (a === 'buymock') buy('mock');
  else if (a === 'restore') buy('restore');
  else if (a === 'rtrespond') S.rt?.respond();
  else if (a === 'rtinterrupt') S.rt?.interrupt();
  else if (a === 'rtmute') { S.muted = !S.muted; S.rt?.setMuted(S.muted); render(); }
  else if (a === 'rtstop') S.rt?.stop();
  else if (a === 'nsignin') nativeSignIn(b.dataset.p);
  else if (a === 'signout') { S.rt?.stop(); store.setAccessCode(''); signOut(); S.paywall = false; render(); }
  else if (a === 'delacct') {
    sheet(`<h2>Delete your account?</h2>
      <p class="muted">This removes your email, plan and AI usage from our servers right away. It does not cancel a Pro subscription: do that in your ${window.PP_PLATFORM === 'android' ? 'Google Play' : 'Apple ID'} subscription settings. Unused mock interview sessions are lost.</p>
      <div class="row"><button class="btn grow" data-act="closesheet">Keep my account</button><button class="btn again" data-act="delacct-yes">Delete permanently</button></div>`);
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
      <div class="row"><button class="btn grow" data-act="closesheet">Cancel</button><button class="btn again" data-act="reset-yes">Erase</button></div>`);
  }
  else if (a === 'reset-yes') { closeSheet(); S.rt?.stop(); store.resetAll(); signOut(); S.view = 'home'; S.deck = null; S.draft = null; render(); }
});

/* ---------- boot ---------- */
(async function boot() {
  try {
    await initContent();
    const p = profile();
    if (p) {
      const migrated = migrateProfile(p);
      if (JSON.stringify(migrated) !== JSON.stringify(p)) store.setProfile(migrated);
      await ensureForProfile(migrated);
    }
  } catch {
    app.innerHTML = '<div class="card">Could not load study content. Check your connection and reload.</div>';
    return;
  }
  render();
  // Account changes (sign-in, usage updates, purchases) re-render unless a voice reply is streaming.
  // Start from the stored account so the plans screen opens on a fresh sign-in, not on every launch.
  let prevAccount = store.account();
  onAccountChange(acc => {
    if (acc && !prevAccount && acc.plan === 'free' && profile()) S.showPlans = true;
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
