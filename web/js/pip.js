// Floating flashcards: a small always-on-top window that stays over Outlook, VS Code, Slack…
// Chrome / Edge / Brave / Arc (desktop): Document Picture-in-Picture, fully interactive.
// Safari: the card is drawn into a video and shown in the system video pop-out; the player's
//   next-track key goes to the next card and play/pause flips it.
// Firefox and phones: not supported.

export const pipSupport = () => ('documentPictureInPicture' in window) ? 'doc'
  : (document.pictureInPictureEnabled && HTMLVideoElement.prototype.requestPictureInPicture && !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) ? 'video' : '';

let current = null;
export const pipOpen = () => !!current;
export function pipClose() { try { current?.close(); } catch { /* already closed */ } current = null; }

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>');

const CSS = `
:root { color-scheme: light dark; --bg: #f3f4f2; --paper: #fbfbfa; --ink: #1d2426; --soft: #4a5457; --muted: #7b8588; --line: #d9dddb; --accent: #2f6b55; --accent-soft: #dfe9e4; --bad: #c4493f; }
@media (prefers-color-scheme: dark) { :root { --bg: #151a1b; --paper: #1e2526; --ink: #eef1f0; --soft: #c3cbca; --muted: #8d9796; --line: #333d3e; --accent: #6fb596; --accent-soft: #23352e; --bad: #e0756c; } }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
body { display: flex; flex-direction: column; padding: 10px; gap: 8px; }
.top { display: flex; align-items: center; gap: 8px; font: 600 12px/1 inherit; color: var(--muted); }
.top .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--paper); cursor: pointer; overflow: auto; }
.q { margin: 0; font-weight: 650; font-size: 16px; line-height: 1.35; }
.a { margin: 0; color: var(--soft); line-height: 1.5; }
.hint { margin-top: auto; color: var(--muted); font-size: 12px; }
code { font: 12.5px ui-monospace, Menlo, monospace; background: var(--accent-soft); padding: 1px 4px; border-radius: 4px; }
.row { display: flex; gap: 8px; }
button { flex: 1; min-height: 38px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); color: var(--ink); font: 600 14px inherit; cursor: pointer; }
button.ok { background: var(--accent); border-color: var(--accent); color: #fff; }
button.miss { color: var(--bad); }
button.ghost { flex: none; min-height: 28px; padding: 0 10px; border: 0; background: none; color: var(--muted); font-size: 12px; }
.done { flex: 1; display: grid; place-content: center; text-align: center; gap: 8px; }
.done b { font-size: 20px; }
`;

// cards: [{ q, a, topicName }]; onGrade(card, ok) records the answer; onDone() when the stack is finished.
export async function popOutCards({ cards, onGrade, onDone }) {
  // Safari's video window can't take taps, so answers there are not graded.
  const kind = pipSupport();
  if (!kind || !cards.length) return false;
  pipClose();
  return kind === 'doc' ? docPip(cards, onGrade, onDone) : videoPip(cards, onGrade, onDone);
}

const SPEEDS = [0, 8, 15, 30, 60]; // seconds per card; 0 = off
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } };

async function docPip(cards, onGrade, onDone) {
  const w = await window.documentPictureInPicture.requestWindow({ width: 360, height: 330 });
  current = w;
  const d = w.document;
  d.head.innerHTML = `<meta charset="utf-8"><title>PrepPilot cards</title><style>${CSS}${EXTRA}</style>`;
  let queue = cards.slice(), i = 0, flipped = false, got = 0, seen = 0, streak = 0, best = 0, missed = [];
  let speed = Number(lsGet('pp.pipSpeed', '15')); if (!SPEEDS.includes(speed)) speed = 15;
  let paused = false, hover = false, elapsed = 0, cheer = '';
  const tick = setInterval(() => {
    if (!speed || paused || hover || !queue[i]) return;
    elapsed += 0.2;
    const bar = d.getElementById('tbar'); if (bar) bar.style.width = `${Math.min(100, (elapsed / speed) * 100)}%`;
    // Glance mode: show the answer halfway, move on at the end.
    if (!flipped && elapsed >= speed * 0.55) { flipped = true; paint(); }
    else if (elapsed >= speed) advance();
  }, 200);
  w.addEventListener('pagehide', () => { clearInterval(tick); if (current === w) current = null; });
  const advance = () => { i++; seen++; flipped = false; elapsed = 0; paint(); };
  const grade = ok => {
    const c = queue[i]; onGrade?.(c, ok);
    if (ok) { got++; streak++; best = Math.max(best, streak); if ([3, 5, 10, 20].includes(streak)) cheer = streak >= 10 ? `🔥 ${streak} in a row. On fire.` : `🔥 ${streak} in a row!`; }
    else { streak = 0; if (!c._again) { missed.push(c); queue.splice(Math.min(queue.length, i + 4), 0, { ...c, _again: true }); } } // missed: comes back in a few cards
    advance();
  };
  const paint = () => {
    const c = queue[i];
    if (!c) {
      w.document.body.innerHTML = `<div class="done"><b>Round done</b>
        <span>${got} known · ${missed.length} to revisit${best >= 3 ? ` · best streak ${best}` : ''}</span>
        <div class="row"><button class="ok" data-a="again">Another round</button><button data-a="close">Close</button></div></div>`;
      onDone?.();
      return;
    }
    const pct = Math.round((i / queue.length) * 100);
    d.body.innerHTML = `<div class="top"><span class="t">${esc(c.topicName || '')}</span>${streak >= 2 ? `<span class="streak">🔥${streak}</span>` : ''}<span>${i + 1}/${queue.length}</span><button class="ghost" data-a="close" aria-label="Close">✕</button></div>
      <div class="prog"><i style="width:${pct}%"></i></div>
      <div class="card ${c._again ? 'again' : ''}" data-a="flip">${c._again ? '<span class="tag">Again</span>' : ''}<p class="q">${fmt(c.q)}</p>${flipped ? `<p class="a">${fmt(c.a)}</p>` : '<span class="hint">Tap to reveal</span>'}
        ${speed ? `<div class="timer"><i id="tbar" style="width:${Math.min(100, (elapsed / speed) * 100)}%"></i></div>` : ''}</div>
      ${cheer ? `<div class="cheer">${esc(cheer)}</div>` : ''}
      <div class="row">${flipped ? '<button class="miss" data-a="miss">Not quite</button><button class="ok" data-a="ok">Knew it</button>' : '<button data-a="flip">Show answer</button>'}</div>
      <div class="bar2"><button class="chip" data-a="speed" title="Auto-advance">⏱ ${speed ? speed + 's' : 'Off'}</button>${speed ? `<button class="chip" data-a="pause">${paused ? '▶ Resume' : '⏸ Pause'}</button>` : ''}<button class="chip" data-a="skip">Skip ›</button></div>`;
    cheer = '';
  };
  d.addEventListener('mouseover', () => { hover = true; });
  d.addEventListener('mouseout', e => { if (!e.relatedTarget) hover = false; });
  d.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'close') return w.close();
    if (a === 'flip') { flipped = !flipped; paint(); }
    else if (a === 'skip') advance();
    else if (a === 'speed') { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; lsSet('pp.pipSpeed', String(speed)); elapsed = 0; paint(); }
    else if (a === 'pause') { paused = !paused; paint(); }
    else if (a === 'again') { queue = [...missed, ...cards.filter(x => !missed.includes(x))].map(x => ({ ...x, _again: false })); i = 0; got = 0; missed = []; streak = 0; flipped = false; elapsed = 0; paint(); }
    else grade(a === 'ok');
  });
  d.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipped = !flipped; paint(); }
    else if (e.key === 'p') { paused = !paused; paint(); }
    else if (flipped && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) grade(e.key === 'ArrowRight');
  });
  paint();
  return true;
}
const EXTRA = `
.prog { height: 3px; border-radius: 3px; background: var(--line); overflow: hidden; } .prog i { display: block; height: 100%; background: var(--accent); transition: width .3s; }
.card { position: relative; } .card.again { border-color: var(--bad); }
.tag { align-self: flex-start; padding: 1px 8px; border-radius: 99px; background: var(--bad); color: #fff; font: 700 11px inherit; }
.timer { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: transparent; } .timer i { display: block; height: 100%; background: var(--accent); opacity: .6; transition: width .2s linear; }
.streak { color: #d9822b; font-weight: 700; }
.cheer { text-align: center; font-weight: 700; color: #d9822b; animation: pop .5s ease-out; } @keyframes pop { from { transform: scale(.7); opacity: 0; } }
.bar2 { display: flex; gap: 6px; } .chip { flex: none; min-height: 26px; padding: 0 10px; border-radius: 99px; font-size: 12px; color: var(--soft); }
.bar2 .chip:last-child { margin-left: auto; }
`;

// Safari: draw the card on a canvas, play it as a video, show it in the system pop-out window.
async function videoPip(cards, onGrade, onDone) {
  const W = 640, H = 400, cv = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = cv.getContext('2d');
  const video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, autoplay: true });
  video.srcObject = cv.captureStream(4);
  Object.assign(video.style, { position: 'fixed', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none', bottom: '0', left: '0' });
  document.body.appendChild(video);
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  let i = 0, flipped = false, timer = 0;
  const wrap = (text, x, y, maxW, lh, maxLines) => {
    const words = String(text).replace(/`/g, '').split(/\s+/); let line = '', n = 0;
    for (const word of words) {
      const t = line ? line + ' ' + word : word;
      if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y + n * lh); line = word; if (++n >= maxLines - 1) break; } else line = t;
    }
    g.fillText(n >= maxLines - 1 && line ? line + '…' : line, x, y + n * lh);
  };
  const draw = () => {
    const c = cards[i];
    g.fillStyle = dark ? '#1e2526' : '#fbfbfa'; g.fillRect(0, 0, W, H);
    g.fillStyle = dark ? '#8d9796' : '#7b8588'; g.font = '600 20px -apple-system, sans-serif';
    g.fillText(c ? `${c.topicName || 'PrepPilot'} · ${i + 1}/${cards.length}` : 'PrepPilot', 32, 44);
    g.fillStyle = dark ? '#eef1f0' : '#1d2426';
    if (!c) { g.font = '700 34px -apple-system, sans-serif'; g.fillText('Stack done', 32, 200); return; }
    g.font = '700 28px -apple-system, sans-serif'; wrap(c.q, 32, 96, W - 64, 36, flipped ? 3 : 7);
    if (flipped) { g.fillStyle = dark ? '#c3cbca' : '#4a5457'; g.font = '22px -apple-system, sans-serif'; wrap(c.a, 32, 220, W - 64, 30, 5); }
    else { g.fillStyle = dark ? '#6fb596' : '#2f6b55'; g.font = '600 18px -apple-system, sans-serif'; g.fillText('⏯ show answer   ⏭ next card', 32, H - 30); }
  };
  const next = () => { i++; flipped = false; draw(); if (i >= cards.length) onDone?.(); };
  const speed = Number((() => { try { return localStorage.getItem('pp.pipSpeed'); } catch { return null; } })() ?? 15) || 0;
  let el = 0;
  draw(); timer = setInterval(() => { // keep frames flowing so the window stays live, and auto-advance
    if (speed && cards[i]) { el += 0.5; if (!flipped && el >= speed * 0.55) flipped = true; else if (el >= speed) { el = 0; i++; flipped = false; if (i >= cards.length) onDone?.(); } }
    draw();
  }, 500);
  await video.play().catch(() => {});
  await video.requestPictureInPicture();
  const ms = navigator.mediaSession;
  ms?.setActionHandler?.('play', () => { flipped = !flipped; draw(); });
  ms?.setActionHandler?.('pause', () => { flipped = !flipped; draw(); });
  ms?.setActionHandler?.('nexttrack', () => { el = 0; next(); });
  ms?.setActionHandler?.('previoustrack', () => { if (i > 0) { i--; flipped = false; draw(); } });
  const close = () => { clearInterval(timer); video.remove(); ['play', 'pause', 'nexttrack', 'previoustrack'].forEach(a => { try { ms?.setActionHandler?.(a, null); } catch { /* unsupported */ } }); if (current?.video === video) current = null; };
  video.addEventListener('leavepictureinpicture', close, { once: true });
  current = { video, close: () => { document.exitPictureInPicture?.().catch(() => {}); close(); } };
  return true;
}
