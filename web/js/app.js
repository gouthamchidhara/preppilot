import { ROLES, LEVELS, buildPlan, rankTopics, dueCards, review, readiness, profileSummary } from './plan.js';
import { store } from './store.js';
import { ai } from './ai.js';
import { voice } from './voice.js';
import { VoiceSession, realtimeSupported } from './realtime.js';

const DAY = 86400000;
const app = document.getElementById('app');
const S = { view: 'home', topic: null, ci: 0, deck: null, di: 0, reveal: false, busy: false, listening: false, chatContext: '',
  rt: null, rtMode: null, rtStatus: '', rtStarting: false, voiceServer: false, live: null, pendingUser: false, muted: false };
let PUBLIC = [];

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
function md(s) {
  const parts = String(s ?? '').split(/```[a-zA-Z]*\n?/);
  return parts.map((p, i) => (i % 2 ? `<pre><code>${esc(p.replace(/\n$/, ''))}</code></pre>` : fmt(p).replace(/^- /gm, '• '))).join('');
}
const topics = () => [...PUBLIC, ...store.customTopics(), ...store.privatePacks().flatMap(p => p.topics)];
const topicById = id => topics().find(t => t.id === id);
const profile = () => store.profile();

function planFor(p) { return buildPlan(topics(), p, p.planStart || Date.now()); }
function todayIndex(p) { return Math.max(0, Math.floor((Date.now() - (p.planStart || Date.now())) / DAY)); }

/* ---------- views ---------- */
function onboardingView(existing) {
  const p = existing || { role: 'infra', level: 'mid', strong: [], weak: [] };
  const state = id => (p.strong?.includes(id) ? 'strong' : p.weak?.includes(id) ? 'weak' : '');
  return `<form class="card stack" id="profileForm">
    <h2>${existing ? 'Edit your profile' : 'Set up your prep'}</h2>
    <p class="muted">Stays on this device. Used to order topics, pick question difficulty and tailor AI answers.</p>
    <label>Target role<select name="role">${ROLES.map(r => `<option value="${r.id}" ${p.role === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
    <label>Experience<select name="level">${LEVELS.map(l => `<option value="${l.id}" ${p.level === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
    <label>Your background (1-3 lines)<textarea name="background" rows="3" maxlength="600" placeholder="e.g. 8 yrs Windows/VMware admin, some Azure, moving to cloud engineering">${esc(p.background || '')}</textarea></label>
    <label>What you're preparing for<input name="goal" maxlength="200" value="${esc(p.goal || '')}" placeholder="e.g. Senior cloud engineer interviews at large enterprises"></label>
    <label>Interview date (optional)<input type="date" name="interviewDate" value="${esc(p.interviewDate || '')}"></label>
    <fieldset><legend>Rate yourself (tap to cycle: neutral → strong → weak)</legend>
      <div class="chips">${PUBLIC.map(t => `<button type="button" class="chip rate ${state(t.id)}" data-act="rate" data-id="${t.id}">${esc(t.name)}</button>`).join('')}</div>
    </fieldset>
    <button class="btn primary" type="submit">${existing ? 'Save' : 'Build my plan'}</button>
  </form>`;
}

function homeView() {
  const p = profile();
  const plan = planFor(p);
  const ti = Math.min(todayIndex(p), plan.length - 1);
  const today = plan[ti];
  const r = readiness(topics(), p, store.progress());
  const due = dueCards(topics(), p, store.progress(), Date.now(), 999).length;
  const dayLabel = d => d.kind === 'mock' ? 'Mock interview (AI) + review missed' : d.kind === 'review' ? 'Mixed review of due cards' : d.topics.map(id => topicById(id)?.name || id).join(' + ');
  return `<div class="stack">
    <section class="card">
      <div class="row between"><div><div class="eyebrow">Readiness at your level</div><div class="big">${r.pct}%</div></div>
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
    <details class="card"><summary>Full plan (${plan.length} days)</summary><ol class="plan">${plan.map((d, i) => `<li class="${i === ti ? 'cur' : ''}">${esc(d.date)} · ${esc(dayLabel(d))}</li>`).join('')}</ol></details>
    <section class="card stack"><div class="eyebrow">Your topics, in priority order</div>
      <div class="list">${rankTopics(topics(), p).map(t => `<button class="item" data-act="learn" data-id="${t.id}"><b>${esc(t.name)}</b><span class="muted small">${esc(t.blurb || '')}</span></button>`).join('')}</div>
    </section>
  </div>`;
}

function learnView() {
  const t = topicById(S.topic);
  if (!t) return homeView();
  const c = t.concepts[S.ci];
  if (!c) return `<div class="card stack"><h2>${esc(t.name)}</h2><p class="muted">No learn cards in this topic.</p><button class="btn primary" data-act="deck" data-id="${t.id}">Flashcards</button></div>`;
  return `<div class="stack">
    <button class="link" data-act="home">← Plan</button>
    <h2>${esc(t.name)}</h2>
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
  return `<div class="stack">
    <div class="row between"><button class="link" data-act="home">← Quit</button><span class="pill">${S.di + 1} / ${d.cards.length}</span></div>
    <article class="card stack">
      <div class="muted small">${esc(topicById(q.topic)?.name || q.topic)} · tier ${q.l}</div>
      <p class="q">${fmt(q.q)}</p>
      ${S.reveal ? `<div class="ans">${fmt(q.a)}</div>
        <div class="row"><button class="btn again" data-act="grade" data-ok="0">Missed it</button><button class="btn good" data-act="grade" data-ok="1">Got it</button></div>
        <button class="link" data-act="askq">Ask AI to go deeper</button>`
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

function chatView() {
  const msgs = store.chat();
  const quick = ['Mock interview me on my weakest topic', 'Grade my answer to the last question', 'Explain BDP like I\'m in an interview', 'What would a senior panel ask about my background?'];
  const live = S.live ? `<div class="msg assistant" id="liveMsg">${md(S.live.text) || '…'}</div>` : '';
  return `<div class="stack chat">
    <div class="row between"><h2>Ask PrepPilot</h2>
      <div class="row"><label class="small"><input type="checkbox" id="speakToggle" ${store.speak() ? 'checked' : ''}> Speak replies</label>
      <button class="link small" data-act="clearchat">Clear</button></div></div>
    ${voiceBar()}
    ${S.chatContext ? `<div class="tip small">Context: ${esc(S.chatContext.split('\n')[0])} <button class="link small" data-act="dropctx">remove</button></div>` : ''}
    <div class="msgs" id="msgs">${msgs.length || live ? msgs.map(m => `<div class="msg ${m.role}">${m.role === 'assistant' ? md(m.content) : fmt(m.content)}</div>`).join('') : `<div class="muted">Ask anything: concepts, commands, "grade my answer", or a mock interview.</div><div class="chips">${quick.map(q => `<button class="chip" data-act="quick" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}
    ${live}${S.busy ? '<div class="msg assistant muted">Thinking…</div>' : ''}</div>
    <form id="chatForm" class="composer">
      <textarea id="chatInput" rows="2" maxlength="4000" placeholder="${S.rt ? 'Type — answers stream instantly' : 'Type or tap the mic…'}"></textarea>
      <div class="row">
        ${S.rt ? '' : `<button type="button" class="btn ${S.listening ? 'again' : ''}" data-act="mic" ${voice.canListen ? '' : 'disabled title="Voice input not supported here"'}>${S.listening ? '■ Stop' : '🎤 Dictate'}</button>`}
        <button class="btn primary" type="submit" ${S.busy ? 'disabled' : ''}>Send</button>
      </div>
    </form>
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
    await session.start({ mode, speak: store.speak() || mode === 'talk', profileSummary: profileSummary(profile()), context: S.chatContext });
  } catch (e) {
    S.rt = null; S.rtMode = null;
    store.setChat([...store.chat(), { role: 'assistant', content: `⚠️ ${e.message}` }]);
  } finally { S.rtStarting = false; render(); }
}

function settingsView() {
  const custom = store.customTopics(), priv = store.privatePacks();
  return `<div class="stack">
    ${onboardingView(profile())}
    <section class="card stack"><h3>Make cards for any topic (AI)</h3>
      <p class="muted small">Not covered here? e.g. "Terraform state", "Splunk SPL", "Palo Alto firewalls", "PostgreSQL ops".</p>
      <form id="genForm" class="row"><input id="genTopic" maxlength="120" placeholder="Topic" required><button class="btn primary" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Generating…' : 'Generate'}</button></form>
      ${custom.length ? `<div class="list">${custom.map(t => `<div class="item row between"><span>${esc(t.name)} <span class="muted small">${t.concepts.length} cards · ${t.qa.length} Qs</span></span><button class="link small" data-act="delcustom" data-id="${t.id}">delete</button></div>`).join('')}</div>` : ''}
    </section>
    <section class="card stack"><h3>Private packs</h3>
      <p class="muted small">Import a personal JSON pack (your own projects and stories). It stays on this device and is never shared.</p>
      <input type="file" id="importPack" accept="application/json,.json">
      ${priv.map(p => `<div class="item row between"><span>${esc(p.name)} · ${p.topics.length} topics</span><button class="link small" data-act="delpack" data-id="${esc(p.id)}">remove</button></div>`).join('')}
    </section>
    <section class="card stack"><h3>Access code</h3>
      <p class="muted small">Only needed while the AI is in private beta.</p>
      <form id="codeForm" class="row"><input id="code" type="password" value="${esc(store.accessCode())}" autocomplete="off"><button class="btn">Save</button></form>
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
  window.scrollTo({ top: 0 });
}

/* ---------- actions ---------- */
function startDeck(ids) {
  const list = ids ? topics().filter(t => ids.includes(t.id)) : topics();
  S.deck = { cards: dueCards(list, profile(), store.progress(), Date.now(), 20), results: [] };
  S.di = 0; S.reveal = false; S.view = 'deck'; render();
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
    const reply = await ai.chat(msgs.slice(-12), { profileSummary: profileSummary(profile()), context: S.chatContext, voice: fromVoice && store.speak() });
    store.setChat([...store.chat(), { role: 'assistant', content: reply }]);
    if (store.speak()) voice.speak(reply);
  } catch (e) {
    store.setChat([...store.chat(), { role: 'assistant', content: `⚠️ ${e.message}` }]);
  } finally { S.busy = false; render(); }
}

function cardContext(t, c) { return `${t.name} — ${c.t}\n${c.what}\n${c.ex ? 'Example:\n' + c.ex.slice(0, 1200) : ''}`; }

function saveProfile(form) {
  const fd = new FormData(form);
  const rate = [...form.querySelectorAll('.chip.rate')];
  const prev = profile();
  const p = {
    role: fd.get('role'), level: fd.get('level'),
    background: String(fd.get('background') || '').trim(), goal: String(fd.get('goal') || '').trim(),
    interviewDate: fd.get('interviewDate') || '',
    strong: rate.filter(b => b.classList.contains('strong')).map(b => b.dataset.id),
    weak: rate.filter(b => b.classList.contains('weak')).map(b => b.dataset.id),
    planStart: prev?.planStart || Date.now(),
  };
  store.setProfile(p);
  S.view = 'home'; render();
}

app.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'profileForm') return saveProfile(e.target);
  if (e.target.id === 'chatForm') { const i = document.getElementById('chatInput'); const v = i.value; i.value = ''; return sendChat(v); }
  if (e.target.id === 'codeForm') { store.setAccessCode(document.getElementById('code').value.trim()); return alert('Saved.'); }
  if (e.target.id === 'genForm') {
    const topic = document.getElementById('genTopic').value.trim();
    S.busy = true; render();
    try {
      const r = await ai.generate(topic, profileSummary(profile()), 8);
      const id = 'c-' + topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36);
      store.setCustomTopics([...store.customTopics(), { id, name: topic, blurb: 'AI-generated', tag: 'ai', roles: {}, concepts: r.concepts, qa: r.qa, custom: true }]);
    } catch (err) { alert(err.message); }
    S.busy = false; render();
  }
});

app.addEventListener('change', async e => {
  if (e.target.id === 'speakToggle') { store.setSpeak(e.target.checked); if (!e.target.checked) voice.stopSpeaking(); }
  if (e.target.id === 'importPack') {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const pack = JSON.parse(await f.text());
      if (!Array.isArray(pack.topics) || !pack.topics.every(t => t.id && Array.isArray(t.concepts) && Array.isArray(t.qa))) throw new Error('Not a PrepPilot pack.');
      const taken = new Set(PUBLIC.map(t => t.id));
      if (pack.topics.some(t => taken.has(t.id))) throw new Error('Pack topic ids clash with built-in topics.');
      store.setPrivatePacks([...store.privatePacks().filter(p => p.id !== pack.id), { id: pack.id || f.name, name: pack.name || f.name, topics: pack.topics }]);
      render();
    } catch (err) { alert('Import failed: ' + err.message); }
  }
});

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act],[data-nav]');
  if (!b || b.disabled) return;
  if (b.dataset.nav) { if (b.dataset.nav === 'deck') return startDeck(null); S.view = b.dataset.nav; return render(); }
  const a = b.dataset.act, id = b.dataset.id;
  if (a === 'rate') {
    const order = ['', 'strong', 'weak'];
    const cur = order.find(c => c && b.classList.contains(c)) || '';
    b.classList.remove('strong', 'weak');
    const next = order[(order.indexOf(cur) + 1) % 3];
    if (next) b.classList.add(next);
    return;
  }
  if (a === 'home') { S.view = 'home'; render(); }
  else if (a === 'learn') { S.topic = id; S.ci = 0; S.view = 'learn'; render(); }
  else if (a === 'cnext') { S.ci++; render(); }
  else if (a === 'cprev') { S.ci--; render(); }
  else if (a === 'deck') startDeck(id ? id.split(',') : null);
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
    const res = await fetch('content/packs/infra.json');
    PUBLIC = (await res.json()).topics;
  } catch {
    app.innerHTML = '<div class="card">Could not load study content. Check your connection and reload.</div>';
    return;
  }
  render();
  // Pre-warm the API (avoids a cold start when the user first talks) and learn whether realtime voice is enabled.
  ai.health().then(h => { S.voiceServer = !!h.voice; if (S.view === 'chat') render(); }).catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.Capacitor) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
