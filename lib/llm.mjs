/**
 * LLM access through any OpenAI-compatible endpoint.
 *
 * Primary is Groq. Its free tier caps at 200k tokens/day, which a full day of
 * demos can exhaust — so a second free provider (Gemini, also OpenAI-compatible)
 * is used as a fallback when Groq answers "tokens per day".
 *
 * Streaming only — the widget speaks sentences as they arrive.
 */

const DEFAULTS = {
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'openai/gpt-oss-120b',
};

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

export function llmConfig() {
  return {
    baseUrl: (process.env.LLM_BASE_URL || DEFAULTS.baseUrl).replace(/\/$/, ''),
    apiKey: process.env.GROQ_API_KEY || process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || DEFAULTS.model,
  };
}

/**
 * A provider that answered "tokens per day" stays exhausted for minutes;
 * retrying it every turn costs seconds of dead air. Cool it down instead.
 */
const cooldownUntil = new Map();

function isAvailable(provider) {
  return (cooldownUntil.get(provider.model) ?? 0) <= Date.now();
}

function coolDown(provider, ms) {
  cooldownUntil.set(provider.model, Date.now() + ms);
}

/**
 * Primary model, then the smaller Groq model — the daily token cap is per model,
 * so gpt-oss-20b keeps answering when gpt-oss-120b is exhausted — and finally
 * Gemini if a key is configured.
 */
export function providerChain() {
  const primary = llmConfig();
  const chain = [primary];

  const smallModel = process.env.LLM_FALLBACK_MODEL || 'openai/gpt-oss-20b';
  if (primary.apiKey && !primary.baseUrl.includes('googleapis') && smallModel !== primary.model) {
    chain.push({ ...primary, model: smallModel, fallback: true });
  }

  if (process.env.GEMINI_API_KEY) {
    chain.push({
      baseUrl: (process.env.GEMINI_BASE_URL || GEMINI_BASE).replace(/\/$/, ''),
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      fallback: true,
    });
  }
  const ready = chain.filter((p) => p.apiKey);
  const fresh = ready.filter(isAvailable);
  // If everything is cooling down, still try the best one rather than going dark.
  return fresh.length ? fresh : ready;
}

export function llmReady() {
  // GROQ_ENABLED=0 turns the hosted brain off entirely and lets the built-in
  // scripted brain answer — useful when the free quota is spent.
  if (String(process.env.GROQ_ENABLED).toLowerCase() === '0') return false;
  return providerChain().length > 0;
}

/** One attempt per provider. Failover is handled by the caller, so a rate
 * limit costs no extra seconds. */
async function openStream(provider, payload) {
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    signal: AbortSignal.timeout(45_000),
    body: payload,
  });

  if (res.ok && res.body) return res;

  const text = await res.text().catch(() => '');

  // A daily token cap will not clear in a few seconds — fail over at once.
  if (/tokens per day|TPD/i.test(text)) {
    const wait = text.match(/in (\d+)m([\d.]+)s/);
    const err = new Error(`LLM_TPD: ${text.slice(0, 200)}`);
    err.code = 'TPD';
    err.retryAfterSec = wait ? Math.round(Number(wait[1]) * 60 + Number(wait[2])) : null;
    throw err;
  }

  const err = new Error(`LLM_HTTP_${res.status}: ${text.slice(0, 200)}`);
  err.status = res.status;
  throw err;
}

/**
 * Stream a chat completion.
 * @returns {AsyncGenerator<{content?:string, toolCallDeltas?:Array, finishReason?:string}>}
 */
export async function* streamChat(messages, { tools, temperature = 0.5, maxTokens = 400 } = {}) {
  const chain = providerChain();
  if (!chain.length) throw new Error('LLM_NOT_CONFIGURED');

  let res;
  let lastError;

  for (const provider of chain) {
    const payload = JSON.stringify({
      model: provider.model,
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      // gpt-oss thinks for several seconds by default; "low" cuts roughly 4 s
      // off the first token and the answers are short anyway.
      ...(provider.model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
      ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
    });

    try {
      res = await openStream(provider, payload);
      break;
    } catch (err) {
      lastError = err;
      const exhausted = err.code === 'TPD' || err.status === 429 || err.status === 503;
      if (!exhausted) throw err;
      // Daily cap: skip this model for ten minutes. Per-minute limit: one minute.
      coolDown(provider, err.code === 'TPD' ? 10 * 60_000 : 60_000);
      console.warn(`[llm] ${provider.model} unavailable (${err.code ?? err.status}), trying next provider`);
    }
  }

  if (!res) throw lastError;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      const choice = json.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      yield {
        content: delta.content ?? '',
        toolCallDeltas: delta.tool_calls,
        finishReason: choice.finish_reason ?? undefined,
      };
    }
  }
}

/** Merge OpenAI-style tool_call deltas into complete calls. */
export function mergeToolCalls(acc = [], deltas = []) {
  for (const d of deltas) {
    const i = d.index ?? 0;
    const slot = (acc[i] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
    if (d.id) slot.id = d.id;
    if (d.function?.name) slot.function.name += d.function.name;
    if (d.function?.arguments) slot.function.arguments += d.function.arguments;
  }
  return acc;
}
