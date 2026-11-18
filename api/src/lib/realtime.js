// Low-latency voice: Azure OpenAI Realtime API over WebRTC.
// The browser sends its SDP offer here; we mint a short-lived client secret with the session config
// (instructions stay server-side) and exchange SDP with Azure. Audio then flows browser <-> Azure directly.
import { chatSystemPrompt } from './prompts.js';

export function realtimeConfigured() {
  return !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT);
}

const VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'cedar', 'echo', 'marin', 'sage', 'shimmer', 'verse']);

const LIVE_LENGTHS = new Set([20, 30, 45, 60, 240]); // 240 = admin 'no limit'
const LIVE_STYLES = new Set(['friendly', 'direct', 'tough']);
const LIVE_LEVELS = new Set(['junior', 'mid', 'senior']);

export function validateRealtime(body) {
  const sdp = typeof body?.sdp === 'string' ? body.sdp : '';
  if (!sdp.startsWith('v=0') || sdp.length > 30000) return { error: 'valid SDP offer required' };
  const live = body?.mode === 'live' ? {
    lengthMin: LIVE_LENGTHS.has(Number(body.live?.lengthMin)) ? Number(body.live.lengthMin) : 60,
    style: LIVE_STYLES.has(body.live?.style) ? body.live.style : 'friendly',
    topic: typeof body.live?.topic === 'string' ? body.live.topic.slice(0, 120) : '',
    difficulty: LIVE_LEVELS.has(body.live?.difficulty) ? body.live.difficulty : '',
    // 'interview': the app listens during the user's own interview and shows talking points on screen.
    use: ['interview', 'talk'].includes(body.live?.use) ? body.live.use : 'practice',
  } : null;
  const interview = live?.use === 'interview';
  return {
    sdp,
    mode: body.mode === 'listen' ? 'listen' : body.mode === 'live' ? 'live' : 'talk',
    speak: interview ? false : body.speak !== false,
    voice: VOICES.has(body.voice) ? body.voice : 'marin',
    profile: typeof body.profileSummary === 'string' ? body.profileSummary.slice(0, 1500) : '',
    context: typeof body.context === 'string' ? body.context.slice(0, 3000) : '',
    live,
  };
}

export function voiceInstructions(v) {
  const base = chatSystemPrompt({ profile: v.profile, context: v.context, voice: true });
  const mode = v.mode === 'live' && v.live?.use === 'interview'
    ? `INTERVIEW MODE: you are listening to the candidate's real job interview through their microphone. You will hear the interviewer and the candidate. You never speak; your text appears silently on the candidate's screen. When the interviewer asks the candidate a question, reply at once with 3 to 5 short bullet points the candidate can glance at: the key points to make, in order, plus one concrete example drawn from the candidate's background when it fits. For a coding or design question, add the approach in one line. Keep the whole reply under 70 words. Do not write full sentences to read aloud, greetings or commentary. When what you heard is not a question for the candidate (small talk, the candidate answering, silence or noise), reply with exactly: …${v.live?.topic ? ` The interview is likely to focus on: ${v.live.topic}.` : ''}`
    : v.mode === 'live' && v.live?.use === 'talk'
    ? `OPEN CONVERSATION MODE: an uninterrupted spoken session with the candidate for as long as they want. Listen fully, answer naturally in 2-4 sentences, then hand the turn back; ask a follow-up question when they go quiet so the conversation keeps moving. Explain concepts, quiz them, discuss their stories, or role-play an interviewer if they ask.${v.live?.style === 'tough' ? ' Be demanding and probe gaps.' : v.live?.style === 'direct' ? ' Be direct, no small talk.' : ' Be warm and encouraging.'}${v.live?.topic ? ` Lean towards: ${v.live.topic}.` : ''}${v.live?.difficulty ? ` Pitch it at ${v.live.difficulty} level.` : ''}`
    : v.mode === 'live'
    ? `LIVE COACH MODE: run a structured practice test, not a real interview. Ask one question at a time, wait for the answer, give brief honest feedback (strong / ok / weak + one improvement), then move to the next question.${v.live?.style === 'tough'
      ? ' Be demanding: short follow-ups that probe gaps, no softening.'
      : v.live?.style === 'direct' ? ' Be direct and businesslike: no small talk, straight to the next question.'
      : ' Be encouraging but honest: warm tone, clear about what is missing.'}${v.live?.topic ? ` Focus the questions on: ${v.live.topic}.` : ' Cover the candidate\'s core topics progressively from fundamentals to scenarios.'}${v.live?.difficulty ? ` Pitch the questions at ${v.live.difficulty} level.` : ''} Keep feedback concise (2-3 sentences). Every turn after feedback MUST end with the next question; never stop at the improvement tip. Grade strictly: strong = accurate, complete and specific; ok = right but shallow or missing key points; weak = wrong, vague, "I don't know", or not an answer to the question you asked. Begin every feedback with the grade as its own word: "Strong.", "Ok." or "Weak.". The style changes only your tone, never the grade.${v.live?.style === 'tough' ? ' Rarely say strong; probe one gap before moving on.' : ''}${v.live?.difficulty === 'senior' ? ' Senior level: ask about trade-offs, scale and failure modes, not definitions.' : ''} Keep a tally of the grades; after ~8-10 questions, give an overall assessment that matches the actual grades.`
    : v.mode === 'listen'
    ? 'LISTENING MODE: the user is practicing an interview answer out loud. Do not interrupt. When asked to respond, grade the answer (strong / ok / weak), say the two most important missing points, and give one follow-up question an interviewer would ask.'
    : 'TALKING MODE: natural spoken conversation. Start answering immediately. Keep answers to 2-4 sentences unless asked for more; offer to go deeper.';
  return v.live?.use === 'interview' ? `${base}\n${mode}` : `${base}\n${mode}\nIf the user interrupts, stop and address what they said.`;
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
          // In interview mode the interviewer is often on laptop speakers, further from the mic.
          noise_reduction: { type: v.live?.use === 'interview' ? 'far_field' : 'near_field' },
          turn_detection: {
            // Open conversation: a slightly higher threshold so a cough or background noise doesn't cut the coach off.
            type: 'server_vad', threshold: v.live?.use === 'talk' ? 0.62 : 0.5, prefix_padding_ms: 300,
            // How long a pause counts as "finished speaking". Measured Nov 2026 with real speech and
            // thinking pauses: at 350 ms the coach cut in at every pause; at 800 ms it still talked over
            // a 0.9 s pause; at 1200 ms it never did, replying ~1.5 s after the answer ended.
            // 1000 ms still talked over a 1.3 s pause in conversation, so every spoken mode waits 1200 ms. Listening never
            // auto-answers (the app sends response.create); interview mode only shows silent text.
            silence_duration_ms: v.mode === 'listen' ? 900 : v.live?.use === 'interview' ? 600 : 1200,
            create_response: v.mode !== 'listen',
            interrupt_response: v.live?.use !== 'interview',
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
  // Location: .../realtime/calls/{call_id} -> needed to hang up from the server when the paid time runs out.
  const callId = (res.headers.get('location') || '').split('?')[0].split('/').filter(Boolean).pop() || null;
  return { sdp: answer, degraded, callId };
}

export async function hangupCall(callId) {
  if (!callId || !realtimeConfigured()) return;
  const base = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/+$/, '');
  await fetch(`${base}/openai/v1/realtime/calls/${encodeURIComponent(callId)}/hangup`, {
    method: 'POST',
    headers: { 'api-key': process.env.AZURE_OPENAI_API_KEY },
    signal: AbortSignal.timeout(8000),
  });
}
