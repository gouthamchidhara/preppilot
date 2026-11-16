// Low-latency voice: Azure OpenAI Realtime API over WebRTC.
// The browser sends its SDP offer here; we mint a short-lived client secret with the session config
// (instructions stay server-side) and exchange SDP with Azure. Audio then flows browser <-> Azure directly.
import { chatSystemPrompt } from './prompts.js';

export function realtimeConfigured() {
  return !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT);
}

const VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'cedar', 'echo', 'marin', 'sage', 'shimmer', 'verse']);

export function validateRealtime(body) {
  const sdp = typeof body?.sdp === 'string' ? body.sdp : '';
  if (!sdp.startsWith('v=0') || sdp.length > 30000) return { error: 'valid SDP offer required' };
  return {
    sdp,
    mode: body.mode === 'listen' ? 'listen' : 'talk',
    speak: body.speak !== false,
    voice: VOICES.has(body.voice) ? body.voice : 'marin',
    profile: typeof body.profileSummary === 'string' ? body.profileSummary.slice(0, 1500) : '',
    context: typeof body.context === 'string' ? body.context.slice(0, 3000) : '',
  };
}

export function voiceInstructions(v) {
  const base = chatSystemPrompt({ profile: v.profile, context: v.context, voice: true });
  const mode = v.mode === 'listen'
    ? 'LISTENING MODE: the user is practicing an interview answer out loud. Do not interrupt. When asked to respond, grade the answer (strong / ok / weak), say the two most important missing points, and give one follow-up question an interviewer would ask.'
    : 'TALKING MODE: natural spoken conversation. Start answering immediately. Keep answers to 2-4 sentences unless asked for more; offer to go deeper.';
  return `${base}\n${mode}\nIf the user interrupts, stop and address what they said.`;
}

// Full config first; if Azure rejects an optional field, retry with the minimal documented shape.
export function sessionConfigs(v) {
  const model = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT;
  const transcribe = process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT;
  const full = {
    session: {
      type: 'realtime',
      model,
      instructions: voiceInstructions(v),
      output_modalities: [v.speak ? 'audio' : 'text'],
      max_output_tokens: 900,
      audio: {
        input: {
          noise_reduction: { type: 'near_field' },
          turn_detection: {
            type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300,
            // Talking: answer ~0.35s after you stop. Listening: never auto-answer; the app sends response.create.
            silence_duration_ms: v.mode === 'listen' ? 900 : 350,
            create_response: v.mode !== 'listen',
            interrupt_response: true,
          },
          ...(transcribe ? { transcription: { model: transcribe } } : {}),
        },
        output: { voice: v.voice },
      },
    },
  };
  const minimal = { session: { type: 'realtime', model, instructions: voiceInstructions(v), audio: { output: { voice: v.voice } } } };
  return [full, minimal];
}

async function mintSecret(base, config) {
  const res = await fetch(`${base}/openai/v1/realtime/client_secrets`, {
    method: 'POST',
    headers: { 'api-key': process.env.AZURE_OPENAI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(config),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) return { status: res.status, detail: text.slice(0, 400) };
  const data = JSON.parse(text);
  return { secret: data.value || data.client_secret?.value };
}

export async function startRealtime(v, log) {
  const base = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/+$/, '');
  let minted;
  let degraded = false;
  for (const [i, cfg] of sessionConfigs(v).entries()) {
    minted = await mintSecret(base, cfg);
    if (minted.secret) { degraded = i > 0; break; }
    log?.(`realtime client_secrets ${minted.status}: ${minted.detail}`);
    if (minted.status !== 400) break;
  }
  if (!minted?.secret) throw Object.assign(new Error('Could not start a voice session.'), { status: minted?.status === 429 ? 429 : 502 });

  // webrtcfilter=on keeps instructions and internal events off the browser's data channel.
  const res = await fetch(`${base}/openai/v1/realtime/calls?webrtcfilter=on`, {
    method: 'POST',
    headers: { authorization: `Bearer ${minted.secret}`, 'content-type': 'application/sdp' },
    body: v.sdp,
    signal: AbortSignal.timeout(15000),
  });
  const answer = await res.text();
  if (!res.ok) {
    log?.(`realtime calls ${res.status}: ${answer.slice(0, 400)}`);
    throw Object.assign(new Error('Voice connection failed.'), { status: 502 });
  }
  return { sdp: answer, degraded };
}
