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

async function docPip(cards, onGrade, onDone) {
  const w = await window.documentPictureInPicture.requestWindow({ width: 340, height: 300 });
  current = w;
  w.addEventListener('pagehide', () => { if (current === w) current = null; });
  w.document.head.innerHTML = `<meta charset="utf-8"><title>PrepPilot cards</title><style>${CSS}</style>`;
  let i = 0, flipped = false, got = 0;
  const paint = () => {
    const c = cards[i];
    if (!c) {
      w.document.body.innerHTML = `<div class="done"><b>Stack done</b><span>${got} of ${cards.length} known</span><div class="row"><button class="ok" data-a="close">Close</button></div></div>`;
      onDone?.();
      return;
    }
    w.document.body.innerHTML = `<div class="top"><span class="t">${esc(c.topicName || '')}</span><span>${i + 1}/${cards.length}</span><button class="ghost" data-a="close" aria-label="Close">✕</button></div>
      <div class="card" data-a="flip"><p class="q">${fmt(c.q)}</p>${flipped ? `<p class="a">${fmt(c.a)}</p>` : '<span class="hint">Tap to see the answer</span>'}</div>
      ${flipped ? '<div class="row"><button class="miss" data-a="miss">Not quite</button><button class="ok" data-a="ok">Knew it</button></div>' : '<div class="row"><button data-a="flip">Show answer</button><button class="ghost" data-a="skip">Skip</button></div>'}`;
  };
  w.document.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'close') return w.close();
    if (a === 'flip') flipped = !flipped;
    else if (a === 'skip') { i++; flipped = false; }
    else { const ok = a === 'ok'; if (ok) got++; onGrade?.(cards[i], ok); i++; flipped = false; }
    paint();
  });
  w.document.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipped = !flipped; paint(); }
    else if (flipped && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { const ok = e.key === 'ArrowRight'; if (ok) got++; onGrade?.(cards[i], ok); i++; flipped = false; paint(); }
  });
  paint();
  return true;
}

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
  draw(); timer = setInterval(draw, 500); // keep frames flowing so the window stays live
  await video.play().catch(() => {});
  await video.requestPictureInPicture();
  const ms = navigator.mediaSession;
  ms?.setActionHandler?.('play', () => { flipped = !flipped; draw(); });
  ms?.setActionHandler?.('pause', () => { flipped = !flipped; draw(); });
  ms?.setActionHandler?.('nexttrack', () => next());
  ms?.setActionHandler?.('previoustrack', () => { if (i > 0) { i--; flipped = false; draw(); } });
  const close = () => { clearInterval(timer); video.remove(); ['play', 'pause', 'nexttrack', 'previoustrack'].forEach(a => { try { ms?.setActionHandler?.(a, null); } catch { /* unsupported */ } }); if (current?.video === video) current = null; };
  video.addEventListener('leavepictureinpicture', close, { once: true });
  current = { video, close: () => { document.exitPictureInPicture?.().catch(() => {}); close(); } };
  return true;
}
