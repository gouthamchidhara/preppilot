// Realtime voice session (WebRTC). Speech in, speech/text out, with barge-in.
//   talk   = hands-free conversation; the AI answers ~0.35s after you stop and stops when you interrupt
//   listen = the AI only listens/transcribes; call respond() when you want feedback
import { apiBase } from './config.js';
import { authHeaders, setAccount } from './auth.js';
import { ApiError } from './ai.js';

const IDLE_MS = 3 * 60 * 1000;

export const realtimeSupported = !!(window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia);

export class VoiceSession {
  constructor(on) {
    this.on = on; // { status(s), userStart(), user(text), delta(id, text), done(id, text), end(reason), error(msg) }
    this.pc = null; this.dc = null; this.mic = null; this.audio = null; this.timers = [];
  }

  async start({ mode, speak, profileSummary, context, live, noIdle }) {
    this.mode = mode;
    // A Live AI session runs continuously for the full session: no silence cut-off.
    this.noIdle = mode === 'live' || !!noIdle;
    this.on.status('connecting');
    const pc = this.pc = new RTCPeerConnection();
    this.audio = Object.assign(document.createElement('audio'), { autoplay: true });
    this.audio.setAttribute('playsinline', '');
    pc.ontrack = e => { this.audio.srcObject = e.streams[0]; };
    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected'].includes(pc.connectionState)) this.stop('Connection lost.');
    };

    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      this.stop(); throw new Error('Microphone permission is needed for voice mode.');
    }
    pc.addTrack(this.mic.getAudioTracks()[0], this.mic);

    this.dc = pc.createDataChannel('oai-events');
    this.dc.onmessage = e => { try { this.handle(JSON.parse(e.data)); } catch { /* ignore non-JSON */ } };
    this.dc.onopen = () => this.on.status(mode === 'listen' ? 'listening' : 'ready');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch(apiBase() + '/api/realtime', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ sdp: offer.sdp, mode, speak, profileSummary, context, ...(live ? { live, voice: live.speaker } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { this.stop(); throw new ApiError(data.error || `Voice failed (${res.status})`, res.status, data.code); }
    this.callId = data.callId; // set first: if anything below fails, stop() still ends the call and refunds
    await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
    this.degraded = data.degraded;
    this.fromPlan = !!data.fromPlan;
    this.allowedSec = data.allowedSec;
    this.bump();
    if (data.account) setAccount(data.account);
    // The server decides how long the call may run and hangs up at that point.
    const capMs = (data.allowedSec || 600) * 1000;
    this.endsAt = Date.now() + capMs;
    this.timers.push(setTimeout(() => this.stop('Voice time for this session is used up.'), capMs));
  }

  bump() {
    if (this.noIdle) return; // Live AI: the session runs until its time is up, however quiet it gets.
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.stop('Ended after 3 minutes of silence.'), IDLE_MS);
  }

  handle(e) {
    this.bump();
    switch (e.type) {
      case 'input_audio_buffer.speech_started': this.on.status('you'); this.on.userStart(); break;
      case 'input_audio_buffer.speech_stopped': this.on.status(this.mode === 'listen' ? 'listening' : 'thinking'); break;
      // What it hears, word by word while you speak (when the transcription model streams).
      case 'conversation.item.input_audio_transcription.delta': this.on.heard?.(e.delta || ''); break;
      case 'conversation.item.input_audio_transcription.completed': this.on.user(e.transcript || ''); break;
      case 'response.output_audio_transcript.delta':
      case 'response.output_text.delta': this.on.delta(e.response_id, e.delta || ''); break;
      case 'response.output_audio_transcript.done': this.on.done(e.response_id, e.transcript); break;
      case 'response.output_text.done': this.on.done(e.response_id, e.text); break;
      case 'output_audio_buffer.started': this.on.status('ai'); break;
      case 'output_audio_buffer.stopped': this.on.status(this.mode === 'listen' ? 'listening' : 'ready'); break;
      default: break;
    }
  }

  send(obj) { if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(obj)); }

  // Typed message inside a live session: streamed back instantly over the data channel.
  sendText(text) {
    this.send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
    this.send({ type: 'response.create' });
    this.on.status('thinking');
  }

  // Listening mode: "your turn" -> commit whatever was said and ask for feedback now.
  respond() {
    this.send({ type: 'input_audio_buffer.commit' });
    this.send({ type: 'response.create' });
    this.on.status('thinking');
  }

  interrupt() { this.send({ type: 'response.cancel' }); this.send({ type: 'output_audio_buffer.clear' }); }

  setMuted(m) { this.mic?.getAudioTracks().forEach(t => { t.enabled = !m; }); }

  // Silence the AI's voice; its words still appear on screen.
  setSoundOff(off) { if (this.audio) this.audio.muted = !!off; }

  stop(reason) {
    if (!this.pc && !this.mic) return;
    this.timers.forEach(clearTimeout); clearTimeout(this.idle);
    try { this.dc?.close(); } catch { /* already closed */ }
    try { this.pc?.close(); } catch { /* already closed */ }
    this.mic?.getTracks().forEach(t => t.stop());
    if (this.audio) this.audio.srcObject = null;
    this.pc = this.dc = this.mic = null;
    // Tell the server so it hangs up and refunds unused minutes (keepalive survives page close).
    if (this.callId) {
      const id = this.callId; this.callId = null;
      fetch(apiBase() + '/api/realtime/end', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify({ callId: id }) })
        .then(r => r.json()).then(d => d.account && setAccount(d.account)).catch(() => {});
    }
    this.on.end(reason || '');
  }
}
