// Azure OpenAI chat completions over REST. Falls back to a mock when not configured,
// so the app runs locally without any Azure resources.
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';

export function llmConfigured() {
  return !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT);
}

export async function complete(messages, { json = false, maxTokens = 700, temperature = 0.4 } = {}) {
  if (!llmConfigured()) return mock(messages, json);
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/+$/, '');
  // Reasoning models (gpt-5*, o-series) reject temperature/max_tokens and spend tokens thinking.
  const reasoning = process.env.AZURE_OPENAI_REASONING === 'true';
  const version = process.env.AZURE_OPENAI_API_VERSION || (reasoning ? '2025-04-01-preview' : API_VERSION);
  const url = `${endpoint}/openai/deployments/${encodeURIComponent(process.env.AZURE_OPENAI_DEPLOYMENT)}/chat/completions?api-version=${version}`;
  const body = reasoning
    ? { messages, max_completion_tokens: maxTokens * 4 }
    : { messages, max_tokens: maxTokens, temperature };
  if (json) body.response_format = { type: 'json_object' };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': process.env.AZURE_OPENAI_API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  if (res.status === 429) throw Object.assign(new Error('AI is busy, try again in a minute.'), { status: 429 });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw Object.assign(new Error(`AI request failed (${res.status})`), { status: 502, detail });
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'content_filter') return 'That request was blocked by the content filter. Try rephrasing.';
  return choice?.message?.content ?? '';
}

function mock(messages, json) {
  const last = messages.filter(m => m.role === 'user').pop()?.content || '';
  if (json) {
    return JSON.stringify({
      concepts: [{ t: 'Mock concept', what: 'AI is not configured, so this is sample content.', why: 'Lets you test the app offline.', ex: 'echo "configure AZURE_OPENAI_* to get real content"', tip: 'Set the env vars in api/.env or Azure app settings.' }],
      qa: [{ l: 1, q: 'Is the AI configured?', a: 'Not yet. This is mock output.' }],
      diagram: { kind: 'flow', title: 'How a mock answer flows', caption: 'Sample picture, so the story strip works offline too.', nodes: [{ label: 'Ask', sub: 'the question' }, { label: 'Think', sub: 'work it out' }, { label: 'Answer', sub: 'say it plainly' }], steps: ['Ask: the question arrives', 'Think: work it out', 'Answer: say it plainly'] },
    });
  }
  return `(mock AI) You asked: "${last.slice(0, 200)}". Configure AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT for real answers.`;
}
