import { LEVELS, buildPlan, rankTopics, dueCards, review, readiness, profileSummary, migrateProfile, effectiveRoles } from './plan.js';
import { store } from './store.js';
import { ai } from './ai.js';
import { voice } from './voice.js';
import { VoiceSession, realtimeSupported } from './realtime.js';
import { native, signedIn, signOut, renderGoogleButton, refreshAccount, onAccountChange, nativeSignIn, nativePurchase, nativeRestore, listenNative } from './auth.js';
import { initContent, getCatalog, getManifest, roleById, topicMeta, ensureTopics, ensureForProfile, loadedTopics, reportUrl } from './content.js';

const DAY = 86400000;
const app = document.getElementById('app');
const S = { view: 'home', topic: null, ci: 0, deck: null, di: 0, reveal: false, busy: false, listening: false, chatContext: '',
  rt: null, rtMode: null, rtStatus: '', rtStarting: false, voiceServer: false, live: null, pendingUser: false, muted: false,
  googleClientId: '', plans: null, paywall: false, draft: null, roleSearch: '' };

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
function md(s) {
  const parts = String(s ?? '').split(/```[a-zA-Z]*\n?/);
  return parts.map((p, i) => (i % 2 ? `<pre><code>${esc(p.replace(/\n$/, ''))}</code></pre>` : fmt(p).replace(/^- /gm, '• '))).join('');
}
const topics = () => [...loadedTopics(), ...store.customTopics(), ...store.privatePacks().flatMap(p => p.topics.map(t => ({ ...t, private: true })))];
const topicById = id => topics().find(t => t.id === id);
const topicName = id => topicById(id)?.name || topicMeta(id)?.name || id;
const roleName = id => roleById(id)?.name || id;
const profile = () => store.profile();
const summary = () => profileSummary(profile(), { roleName, topicName });

function planFor(p) { return buildPlan(topics(), p, p.planStart || Date.now()); }
function todayIndex(p) { return Math.max(0, Math.floor((Date.now() - (p.planStart || Date.now())) / DAY)); }

function betaNote(t, where) {
  return t?.beta ? `<div class="small muted"><span class="pill beta">AI-written</span> <a class="link small" href="${esc(reportUrl(t, where))}" target="_blank" rel="noopener">Report a problem</a></div>` : '';
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
  return `<form class="card stack" id="profileForm">
    <h2>${existing ? 'Edit your profile' : 'Set up your prep'}</h2>
    <p class="muted">Stays on this device. Used to pick your topics, question difficulty and to tailor AI answers.</p>
    <fieldset class="stack"><legend>1. What roles are you preparing for? Select one or more.</legend>
      <input id="roleSearch" value="${esc(S.roleSearch)}" placeholder="Search: java, spark, react, kubernetes…" autocomplete="off" aria-label="Search roles">
      ${cat.families.map(f => `<div class="rolefam"><div class="eyebrow">${esc(f.name)}</div><div class="chips">${cat.roles.filter(r => r.family === f.id).map(roleBtn).join('')}</div></div>`).join('')}
      <div class="chips"><button type="button" class="chip ${d.roleIds.includes('other') ? 'on' : ''}" aria-pressed="${d.roleIds.includes('other')}" data-act="pickrole" data-id="other" data-search="other not listed">Other / not listed</button></div>
      ${d.roleIds.length > 1 ? '<p class="tip small" role="status">These roles cover different topics. Your plan combines them; select one role for a single-role plan, or practice cards for one role from the plan page.</p>' : ''}
      ${d.roleIds.includes('other') ? `<label>Your role<input name="otherRole" maxlength="60" value="${esc(d.otherRole || '')}" placeholder="e.g. Salesforce developer" required></label>
        <label>Closest role above (used to pick your starter topics)<select name="baseRoleId" data-act="baserole" required><option value="">Choose…</option>${cat.roles.map(r => `<option value="${r.id}" ${d.baseRoleId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>` : ''}
    </fieldset>
    ${chosen ? `
    <label>2. Experience<select name="level">${LEVELS.map(l => `<option value="${l.id}" ${d.level === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
    ${extras.length ? `<fieldset><legend>3. Extra tech you use (optional)</legend>
      <div class="chips">${extras.map(id => `<button type="button" class="chip extra ${d.extras?.includes(id) ? 'on' : ''}" data-act="extra" data-id="${id}">${esc(topicName(id))}</button>`).join('')}</div></fieldset>` : ''}
    <label>Your background (1-3 lines)<textarea name="background" rows="3" maxlength="600" placeholder="e.g. 4 yrs Java microservices, some AWS, want a senior backend role">${esc(d.background || '')}</textarea></label>
    <label>What you're preparing for<input name="goal" maxlength="200" value="${esc(d.goal || '')}" placeholder="e.g. Senior backend interviews at product companies"></label>
    <label>Interview date (optional)<input type="date" name="interviewDate" value="${esc(d.interviewDate || '')}"></label>
    <fieldset><legend>Rate yourself on the core topics (tap: neutral → strong → weak)</legend>
      <div class="chips">${core.map(id => `<button type="button" class="chip rate ${rate(id)}" data-act="rate" data-id="${id}">${esc(topicName(id))}</button>`).join('')}</div>
    </fieldset>
    <button class="btn primary" type="submit">${existing ? 'Save' : 'Build my plan'}</button>` : ''}
  </form>`;
}

async function saveProfile() {
  captureDraft();
  const d = S.draft;
  if (!d?.roleIds.length || (d.roleIds.includes('other') && (!d.baseRoleId || !d.otherRole))) return alert('Choose a role and complete the Other role details if selected.');
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
  app.innerHTML = '<div class="card">Loading your topics…</div>';
  try { await ensureForProfile(p); } catch { alert('Could not download your topics. Check your connection.'); }
  S.view = 'home'; render();
}

/* ---------- views ---------- */
function homeView() {
  const p = profile();
  const relevant = rankTopics(topics(), p);
  if (!relevant.length) return '<div class="card">Loading your topics…</div>';
  const plan = planFor(p);
  const ti = Math.min(todayIndex(p), plan.length - 1);
  const today = plan[ti];
  const r = readiness(relevant, p, store.progress());
  const due = dueCards(topics(), p, store.progress(), Date.now(), 999).length;
  const dayLabel = d => d.kind === 'mock' ? 'Mock interview (AI) + review missed' : d.kind === 'review' ? 'Mixed review of due cards' : d.topics.map(topicName).join(' + ');
  const mine = new Set(relevant.map(t => t.id));
  const others = getManifest().packs.map(pk => ({ ...pk, topics: pk.topics.filter(t => !mine.has(t.id)) })).filter(pk => pk.topics.length);
  const roleIds = migrateProfile(p).roleIds;
  const label = id => id === 'other' ? p.otherRole : roleName(id);
  return `<div class="stack">
    <section class="card">
      <div class="row between"><div><div class="eyebrow">Readiness · ${esc(roleIds.map(label).join(', '))}</div><div class="big">${r.pct}%</div></div>
      <div class="muted small">${r.known}/${r.total} known · ${due} due now</div></div>
      <div class="bar"><i style="width:${r.pct}%"></i></div>
    </section>
    <section class="card stack">
      <div class="eyebrow">Today · day ${ti + 1} of ${plan.length}</div>
      <h3>${esc(dayLabel(today))}</h3>
      <div class="row">
        ${today.kind === 'learn' ? `<button class="btn primary" data-act="learn" data-id="${today.topics[0]}">Learn</button>` : ''}
        <button class="btn ${today.kind === 'learn' ? '' : 'primary'}" data-act="deck" data-id="${today.kind === 'learn' ? today.topics.join(',') : ''}">Flashcards</button>
        ${today.kind === 'mock' ? '<button class="btn" data-act="mock">Start AI mock interview</button>' : ''}
      </div>
    </section>
    ${roleIds.length > 1 ? `<section class="card stack"><h3>Practice one role</h3><p class="muted small">Focused cards use the role's listed topics. Shared topics may appear in more than one role.</p><div class="chips">${roleIds.map(id => `<button class="chip" data-act="roledeck" data-id="${esc(id)}">${esc(label(id))}</button>`).join('')}</div></section>` : ''}
    ${roleIds.includes('other') ? `<section class="card stack"><h3>Make it specific to ${esc(p.otherRole)}</h3>
      <p class="muted small">Your plan starts from the closest listed role. Sign in and let the AI build topics for your exact role (uses 5 AI messages).</p>
      <div class="row"><button class="btn primary" data-act="buildrole" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Building…' : 'Build my role guide with AI'}</button></div></section>` : ''}
    <details class="card"><summary>Full plan (${plan.length} days)</summary><ol class="plan">${plan.map((d, i) => `<li class="${i === ti ? 'cur' : ''}">${esc(d.date)} · ${esc(dayLabel(d))}</li>`).join('')}</ol></details>
    <section class="card stack"><div class="eyebrow">Your topics, in priority order</div>
      <div class="list">${relevant.map(t => `<button class="item" data-act="learn" data-id="${t.id}"><b>${esc(t.name)}${t.beta ? ' <span class="pill beta">AI-written</span>' : ''}</b><span class="muted small">${esc(t.blurb || '')}</span></button>`).join('')}</div>
    </section>
    <details class="card"><summary>Browse all other topics</summary>
      <div class="stack" style="margin-top:10px">${others.map(pk => `<div><div class="eyebrow">${esc(pk.name)}</div><div class="chips">${pk.topics.map(t => `<button class="chip" data-act="learn" data-id="${t.id}">${esc(t.name)}</button>`).join('')}</div></div>`).join('')}</div>
    </details>
  </div>`;
}

function learnView() {
  const t = topicById(S.topic);
  if (!t) return '<div class="card">Loading…</div>';
  const c = t.concepts[S.ci];
  if (!c) return `<div class="card stack"><h2>${esc(t.name)}</h2><p class="muted">No learn cards in this topic.</p><button class="btn primary" data-act="deck" data-id="${t.id}">Flashcards</button></div>`;
  return `<div class="stack">
    <button class="link" data-act="home">← Plan</button>
    <h2>${esc(t.name)}</h2>
    ${betaNote(t, `card ${S.ci + 1}: ${c.t}`)}
    <article class="card stack">
      <div class="muted small">Card ${S.ci + 1} of ${t.concepts.length}</div>
      <h3>${esc(c.t)}</h3>
      <div><div class="lbl">What it is</div><p>${fmt(c.what)}</p></div>
      ${c.why ? `<div><div class="lbl">Why it matters</div><p>${fmt(c.why)}</p></div>` : ''}
      ${c.ex ? `<div><div class="lbl">Example</div><pre><code>${esc(c.ex)}</code></pre></div>` : ''}
      ${c.tip ? `<div class="tip"><div class="lbl">Say this in the interview</div><p>${fmt(c.tip)}</p></div>` : ''}
      <div class="row">
        <button class="btn" data-act="cprev" ${S.ci === 0 ? 'disabled' : ''}>← Back</button>
        ${S.ci < t.concepts.length - 1 ? '<button class="btn primary" data-act="cnext">Next →</button>' : `<button class="btn primary" data-act="deck" data-id="${t.id}">Flashcards →</button>`}
        <button class="btn" data-act="askcard">Ask AI about this</button>
      </div>
    </article>
  </div>`;
}

function deckView() {
  const d = S.deck;
  if (!d.cards.length) return `<div class="card stack"><h2>Nothing due 🎉</h2><p class="muted">All cards for this selection are scheduled for later. Learn a new topic or come back tomorrow.</p><button class="btn primary" data-act="home">Back to plan</button></div>`;
  if (S.di >= d.cards.length) {
    const got = d.results.filter(Boolean).length;
    return `<div class="card stack center"><h2>${got} / ${d.cards.length}</h2><p>${got / d.cards.length >= 0.8 ? 'Strong. These come back later on schedule.' : 'Missed cards come back first next time. Re-read the Learn cards for weak topics.'}</p><button class="btn primary" data-act="home">Back to plan</button></div>`;
  }
  const q = d.cards[S.di];
  const t = topicById(q.topic);
  return `<div class="stack">
    <div class="row between"><button class="link" data-act="home">← Quit</button><span class="pill">${S.di + 1} / ${d.cards.length}</span></div>
    <article class="card stack">
      <div class="muted small">${esc(t?.name || q.topic)} · tier ${q.l}</div>
      <p class="q">${fmt(q.q)}</p>
      ${S.reveal ? `<div class="ans">${fmt(q.a)}</div>
        <div class="row"><button class="btn again" data-act="grade" data-ok="0">Missed it</button><button class="btn good" data-act="grade" data-ok="1">Got it</button></div>
        <button class="link" data-act="askq">Ask AI to go deeper</button>${betaNote(t, `question: ${q.q}`)}`
      : '<button class="reveal" data-act="reveal">Say your answer out loud, then tap</button>'}
    </article>
  </div>`;
}

const STATUS = { connecting: 'Connecting…', ready: 'Listening — just talk', listening: 'Listening (won\'t interrupt)', you: 'You\'re speaking…', thinking: 'Thinking…', ai: 'Speaking — talk to interrupt' };

function voiceBar() {
  const live = !!S.rt;
  if (!live) {
    if (!(S.voiceServer && realtimeSupported)) {
      return `<div class="voicebar muted small">Realtime voice isn't available here${S.voiceServer ? ' (browser lacks WebRTC)' : ' (server not configured)'}; the 🎤 button below uses basic dictation.</div>`;
    }
    return `<div class="voicebar">
      <button class="btn primary" data-act="rtstart" data-mode="talk" ${S.rtStarting ? 'disabled' : ''}>🎙 Talking mode</button>
      <button class="btn" data-act="rtstart" data-mode="listen" ${S.rtStarting ? 'disabled' : ''}>👂 Listening mode</button>
      <span class="muted small">Talking: hands-free back-and-forth, interrupt anytime. Listening: practice a long answer; tap "Your turn" for feedback.</span>
    </div>`;
  }
  return `<div class="voicebar live">
    <span class="pill status-${S.rtStatus}" id="rtStatus">${esc(STATUS[S.rtStatus] || S.rtStatus)}</span>
    <span class="small muted">${S.rtMode === 'listen' ? 'Listening mode' : 'Talking mode'}</span>
    ${S.rtMode === 'listen' ? '<button class="btn primary" data-act="rtrespond">Your turn →</button>' : ''}
    <button class="btn" data-act="rtinterrupt">⏹ Stop talking</button>
    <button class="btn" data-act="rtmute">${S.muted ? '🔇 Unmute' : '🎤 Mute'}</button>
    <button class="btn again" data-act="rtstop">End</button>
  </div>`;
}

/* ---------- account / paywall ---------- */
const mins = sec => (sec / 60).toFixed(sec % 60 ? 1 : 0);

function accountCard() {
  const P = S.plans;
  const a = store.account();
  if (!signedIn()) {
    const offer = P ? `Free trial: ${P.free.msgs} AI messages + ${P.free.voiceMin} voice minutes. Pro: ${P.pro.price} for ${P.pro.msgs} messages + ${P.pro.voiceMin} voice minutes a month.` : '';
    const buttons = native()
      ? `<div class="row">${window.PP_PLATFORM === 'ios' ? '<button class="btn primary" data-act="nsignin" data-p="apple"> Sign in with Apple</button>' : ''}<button class="btn ${window.PP_PLATFORM === 'ios' ? '' : 'primary'}" data-act="nsignin" data-p="google">Continue with Google</button></div>`
      : (S.googleClientId ? '<div id="gbtn"></div>' : '<p class="muted small">Sign-in is being set up. Check back soon.</p>');
    return `<section class="card stack" id="accountCard">
      <h3>Sign in to use the AI coach</h3>
      <p class="muted small">Your study plan, guide and flashcards are free and work without an account. ${esc(offer)}</p>
      ${buttons}
      <details class="small"><summary>Have a beta code?</summary>
        <form id="codeForm" class="row"><input id="code" type="password" value="${esc(store.accessCode())}" autocomplete="off"><button class="btn">Save</button></form>
      </details>
    </section>`;
  }
  if (!a) return `<section class="card small muted">${store.accessCode() ? 'Using beta access code.' : 'Loading account…'} <button class="link small" data-act="signout">Sign out</button></section>`;
  const usage = a.unlimited ? 'Unlimited AI (admin)'
    : `${a.msgsLeft} of ${a.limits.msgs} messages · ${mins(a.voiceSecLeft)} of ${mins(a.limits.voiceSec)} voice min left${a.plan === 'pro' && a.periodEnds ? ` · resets ${new Date(a.periodEnds).toLocaleDateString()}` : ''}`;
  const upgrade = a.plan !== 'free' ? ''
    : native() ? `<button class="btn primary" data-act="upgrade">Upgrade to Pro · ${esc(P?.pro.price || '$11.99/month')}</button><button class="link small" data-act="restore">Restore purchase</button>
      <p class="small muted">Pro: ${P ? `${P.pro.msgs} AI messages + ${P.pro.voiceMin} voice minutes per month. ` : ''}Auto-renews monthly at ${esc(P?.pro.price || '$11.99/month')} until cancelled in your ${window.PP_PLATFORM === 'android' ? 'Google Play' : 'Apple ID'} subscription settings at least 24 hours before renewal.
      <a class="link small" href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener">Terms of Use</a> · <a class="link small" href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a></p>`
    : `<span class="small muted">Upgrade to Pro (${esc(P?.pro.price || '$11.99/month')}) in the PrepPilot iPhone app; it unlocks here too.</span>`;
  return `<section class="card stack ${S.paywall ? 'paywall' : ''}" id="accountCard">
    <div class="row between"><div><b>${esc(a.name || a.email || 'Signed in')}</b> <span class="pill">${esc(a.plan.toUpperCase())}</span></div>
      <button class="link small" data-act="signout">Sign out</button></div>
    <div class="small muted">${esc(usage)}</div>
    ${upgrade ? `<div class="row">${upgrade}</div>` : ''}
    <div class="row small"><a class="link small" href="privacy.html" target="_blank" rel="noopener">Privacy</a>
      ${a.key === 'code:admin' ? '' : '<button class="link small" data-act="delacct">Delete account</button>'}</div>
  </section>`;
}

function mountGoogleButton() {
  const el = document.getElementById('gbtn');
  if (el && !el.childElementCount) renderGoogleButton(el, S.googleClientId, msg => alert(msg)).catch(e => { el.textContent = e.message; });
}

function chatView() {
  const msgs = store.chat();
  const quick = ['Mock interview me on my weakest topic', 'Grade my answer to the last question', 'Explain the hardest topic in my plan simply', 'What would a senior panel ask about my background?'];
  const live = S.live ? `<div class="msg assistant" id="liveMsg">${md(S.live.text) || '…'}</div>` : '';
  const canUse = signedIn();
  const a = store.account();
  const usageLine = a && !a.unlimited && a.limits
    ? `<div class="small muted">${a.msgsLeft} messages · ${mins(a.voiceSecLeft)} voice min remaining</div>`
    : a?.unlimited ? '<div class="small muted">Unlimited (admin)</div>' : '';
  return `<div class="stack chat">
    <div class="row between"><h2>Ask PrepPilot</h2>
      <div class="row">${usageLine}<label class="small"><input type="checkbox" id="speakToggle" ${store.speak() ? 'checked' : ''}> Speak replies</label>
      <button class="link small" data-act="clearchat">Clear</button></div></div>
    ${!canUse || S.paywall ? accountCard() : voiceBar()}
    ${S.chatContext ? `<div class="tip small">Context: ${esc(S.chatContext.split('\n')[0])} <button class="link small" data-act="dropctx">remove</button></div>` : ''}
    <div class="msgs" id="msgs">${msgs.length || live ? msgs.map(m => `<div class="msg ${m.role}">${m.role === 'assistant' ? md(m.content) : fmt(m.content)}</div>`).join('') : `<div class="muted">Ask anything: concepts, commands, "grade my answer", or a mock interview.</div>${canUse ? `<div class="chips">${quick.map(q => `<button class="chip" data-act="quick" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}`}
    ${live}${S.busy ? '<div class="msg assistant muted">Thinking…</div>' : ''}</div>
    ${canUse ? `<form id="chatForm" class="composer">
      <textarea id="chatInput" rows="2" maxlength="2000" placeholder="${S.rt ? 'Type — answers stream instantly' : 'Type or tap the mic…'}"></textarea>
      <div class="row">
        ${S.rt ? '' : `<button type="button" class="btn ${S.listening ? 'again' : ''}" data-act="mic" ${voice.canListen ? '' : 'disabled title="Voice input not supported here"'}>${S.listening ? '■ Stop' : '🎤 Dictate'}</button>`}
        <button class="btn primary" type="submit" ${S.busy ? 'disabled' : ''}>Send</button>
      </div>
    </form>` : ''}
  </div>`;
}

/* ---------- realtime voice ---------- */
function scrollMsgs() { const m = document.getElementById('msgs'); if (m) m.scrollTop = m.scrollHeight; }

function rtHandlers() {
  return {
    status(s) {
      S.rtStatus = s;
      const el = document.getElementById('rtStatus');
      if (el) { el.textContent = STATUS[s] || s; el.className = `pill status-${s}`; }
    },
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
      if (el) { el.innerHTML = md(S.live.text); scrollMsgs(); }
    },
    done(id, text) {
      const final = text ?? S.live?.text ?? '';
      S.live = null;
      if (final.trim()) store.setChat([...store.chat(), { role: 'assistant', content: final }]);
      render();
    },
    end(reason) {
      S.rt = null; S.rtMode = null; S.rtStatus = ''; S.live = null; S.pendingUser = false; S.muted = false;
      store.setChat(store.chat().filter(m => m.content !== '🎙 …'));
      if (reason) store.setChat([...store.chat(), { role: 'assistant', content: `ℹ️ ${reason}` }]);
      if (S.view === 'chat') render();
    },
  };
}

async function startVoice(mode) {
  if (S.rt) S.rt.stop();
  voice.stopSpeaking();
  S.rtStarting = true; render();
  const session = new VoiceSession(rtHandlers());
  try {
    S.rt = session; S.rtMode = mode;
    await session.start({ mode, speak: store.speak() || mode === 'talk', profileSummary: summary(), context: S.chatContext });
  } catch (e) {
    S.rt = null; S.rtMode = null;
    if (e.code === 'quota') S.paywall = true;
    store.setChat([...store.chat(), { role: 'assistant', content: `⚠️ ${e.message}` }]);
  } finally { S.rtStarting = false; render(); }
}

function settingsView() {
  const custom = store.customTopics(), priv = store.privatePacks();
  return `<div class="stack">
    ${accountCard()}
    ${onboardingView(profile())}
    <section class="card stack"><h3>Make cards for any topic (AI)</h3>
      <p class="muted small">Not covered here? e.g. "Kafka exactly-once", "Terraform state", "Redis caching", "GraphQL federation".</p>
      <form id="genForm" class="row"><input id="genTopic" maxlength="120" placeholder="Topic" required><button class="btn primary" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Generating…' : 'Generate'}</button></form>
      ${custom.length ? `<div class="list">${custom.map(t => `<div class="item row between"><span>${esc(t.name)} <span class="muted small">${t.concepts.length} cards · ${t.qa.length} Qs</span></span><button class="link small" data-act="delcustom" data-id="${t.id}">delete</button></div>`).join('')}</div>` : ''}
    </section>
    <section class="card stack"><h3>Private packs</h3>
      <p class="muted small">Import a personal JSON pack (your own projects and stories). It stays on this device and is never shared.</p>
      <input type="file" id="importPack" accept="application/json,.json">
      ${priv.map(p => `<div class="item row between"><span>${esc(p.name)} · ${p.topics.length} topics</span><button class="link small" data-act="delpack" data-id="${esc(p.id)}">remove</button></div>`).join('')}
    </section>
    <section class="card stack"><h3>Data</h3>
      <div class="row"><button class="btn" data-act="export">Export my data</button><button class="btn again" data-act="reset">Erase everything</button></div>
    </section>
  </div>`;
}

function render() {
  const p = profile();
  document.querySelectorAll('nav [data-nav]').forEach(b => b.setAttribute('aria-current', String(b.dataset.nav === S.view)));
  document.querySelector('nav').hidden = !p;
  app.innerHTML = !p ? onboardingView(null)
    : S.view === 'learn' ? learnView()
    : S.view === 'deck' && S.deck ? deckView()
    : S.view === 'chat' ? chatView()
    : S.view === 'settings' ? settingsView()
    : homeView();
  if (S.view === 'chat') { const m = document.getElementById('msgs'); if (m) m.scrollTop = m.scrollHeight; }
  mountGoogleButton();
  filterRoles();
  window.scrollTo({ top: 0 });
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
    try { await ensureTopics([id]); } catch { alert('Could not download this topic. Check your connection.'); }
    render();
  }
}

async function buildRoleGuide() {
  const p = profile();
  if (!signedIn()) { S.view = 'chat'; return render(); }
  S.busy = true; render();
  try {
    const r = await ai.generate(`${p.otherRole}: interview essentials`, summary(), 12);
    const id = 'c-role-' + Date.now().toString(36);
    store.setCustomTopics([...store.customTopics(), { id, name: `${p.otherRole} essentials`, blurb: 'AI-generated for your role', tag: 'ai', concepts: r.concepts, qa: r.qa, custom: true, beta: true }]);
  } catch (err) { if (err.code === 'quota') S.paywall = true; alert(err.message); }
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
    const reply = await ai.chat(msgs.slice(-12), { profileSummary: summary(), context: S.chatContext, voice: fromVoice && store.speak() });
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
  if (e.target.id === 'chatForm') { const i = document.getElementById('chatInput'); const v = i.value; i.value = ''; return sendChat(v); }
  if (e.target.id === 'codeForm') { store.setAccessCode(document.getElementById('code').value.trim()); return render(); }
  if (e.target.id === 'genForm') {
    const topic = document.getElementById('genTopic').value.trim();
    S.busy = true; render();
    try {
      const r = await ai.generate(topic, summary(), 8);
      const id = 'c-' + topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36);
      store.setCustomTopics([...store.customTopics(), { id, name: topic, blurb: 'AI-generated', tag: 'ai', concepts: r.concepts, qa: r.qa, custom: true, beta: true }]);
    } catch (err) { if (err.code === 'quota') S.paywall = true; alert(err.message); }
    S.busy = false; render();
  }
});

function filterRoles() {
  const q = S.roleSearch.trim().toLowerCase();
  document.querySelectorAll('#profileForm [data-act=pickrole]').forEach(b => { b.hidden = !!q && !b.dataset.search.includes(q) && b.dataset.id !== 'other'; });
  document.querySelectorAll('#profileForm .rolefam').forEach(f => { f.hidden = ![...f.querySelectorAll('[data-act=pickrole]')].some(b => !b.hidden); });
}

app.addEventListener('keydown', e => {
  if (e.target.id !== 'chatInput' || e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault();
  const form = document.getElementById('chatForm');
  if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
});

app.addEventListener('input', e => {
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
      render();
    } catch (err) { alert('Import failed: ' + err.message); }
  }
});

document.addEventListener('click', async e => {
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
    app.innerHTML = S.view === 'settings' ? settingsView() : onboardingView(null);
    filterRoles();
    window.scrollTo({ top: scroll });
    return;
  }
  if (a === 'home') { S.view = 'home'; render(); }
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
    sendChat('Go deeper on this question: what follow-ups would an interviewer ask, and what would a strong answer add?');
  }
  else if (a === 'mock') {
    const weak = profile().weak?.[0];
    S.chatContext = ''; S.view = 'chat'; render();
    sendChat(`Run a mock interview for my target role${weak ? `, starting with ${topicById(weak)?.name || weak}` : ''}. Ask one question at a time and grade each answer honestly.`);
  }
  else if (a === 'quick') sendChat(b.dataset.q);
  else if (a === 'rtstart') startVoice(b.dataset.mode);
  else if (a === 'rtrespond') S.rt?.respond();
  else if (a === 'rtinterrupt') S.rt?.interrupt();
  else if (a === 'rtmute') { S.muted = !S.muted; S.rt?.setMuted(S.muted); render(); }
  else if (a === 'rtstop') S.rt?.stop();
  else if (a === 'nsignin') nativeSignIn(b.dataset.p);
  else if (a === 'upgrade') { const acc = store.account(); if (acc?.key) nativePurchase(acc.key); }
  else if (a === 'restore') { const acc = store.account(); if (acc?.key) nativeRestore(acc.key); }
  else if (a === 'signout') { S.rt?.stop(); store.setAccessCode(''); signOut(); S.paywall = false; render(); }
  else if (a === 'delacct') {
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Tap again to permanently delete your account'; return; }
    try {
      await ai.post('/api/me/delete', {});
      S.rt?.stop(); signOut(); S.paywall = false; render();
      alert('Your account and AI usage data were deleted. If you subscribed to Pro, cancel the subscription in Settings → Apple ID → Subscriptions (or Google Play → Subscriptions).');
    } catch (err) { alert(err.message); }
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
      S.listening = false; render();
      if (text) sendChat(text, { fromVoice: true });
    } catch (err) { S.listening = false; render(); alert(err.message); }
  }
  else if (a === 'delcustom') { store.setCustomTopics(store.customTopics().filter(t => t.id !== id)); render(); }
  else if (a === 'delpack') { store.setPrivatePacks(store.privatePacks().filter(p => p.id !== id)); render(); }
  else if (a === 'export') {
    const blob = new Blob([JSON.stringify({ profile: profile(), progress: store.progress(), customTopics: store.customTopics() }, null, 1)], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'preppilot-data.json' });
    link.click(); URL.revokeObjectURL(link.href);
  }
  else if (a === 'reset') {
    if (b.dataset.confirm === '1') { store.resetAll(); S.view = 'home'; render(); }
    else { b.dataset.confirm = '1'; b.textContent = 'Tap again to erase'; }
  }
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
  onAccountChange(acc => { if (!acc || acc.plan !== 'free' || (acc.msgsLeft > 0)) S.paywall = false; if (!S.live) render(); });
  listenNative({ onError: msg => alert(msg), onPurchased: acc => { S.paywall = false; render(); if (acc?.plan === 'pro') alert('Pro unlocked. Thank you!'); } });
  refreshAccount().catch(() => {});
  // Pre-warm the API (avoids a cold start when the user first talks) and learn what's enabled.
  ai.health().then(h => {
    S.voiceServer = !!h.voice; S.googleClientId = h.googleClientId || ''; S.plans = h.plans || null;
    if (S.view === 'chat' || S.view === 'settings') render();
  }).catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.Capacitor) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
