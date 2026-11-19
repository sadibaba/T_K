/**
 * Speech-to-text through Groq's Whisper (whisper-large-v3-turbo).
 * Free tier: 2000 requests/day, ~8 audio hours/day, 20 RPM.
 */
const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';

export function sttReady() {
  // Speech-to-text has its own free quota (2000 requests/day) and is separate
  // from the chat model, so it stays on even when GROQ_ENABLED=0.
  if (String(process.env.STT_ENABLED ?? '1').toLowerCase() === '0') return false;
  return Boolean(process.env.GROQ_API_KEY || process.env.STT_API_KEY);
}

/**
 * @param {Buffer} audio  recorded clip (webm/ogg/mp4/wav)
 * @param {string} filename
 * @param {string} mimeType
 * @param {'auto'|'ur'|'en'|'ps'} lang
 */
export async function transcribe(audio, filename, mimeType, lang = 'auto') {
  const key = process.env.GROQ_API_KEY || process.env.STT_API_KEY;
  if (!key) throw new Error('STT_NOT_CONFIGURED');

  const form = new FormData();
  const type = mimeType || 'audio/webm';
  form.append('file', new Blob([audio], { type }), filename || 'clip.webm');
  form.append('model', process.env.STT_MODEL || 'whisper-large-v3-turbo');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  if (lang === 'ur') form.append('language', 'ur');
  if (lang === 'en') form.append('language', 'en');
  if (lang === 'ps') form.append('language', 'ps');
  // A dental-clinic hint measurably helps with treatment names and Roman Urdu.
  form.append(
    'prompt',
    'TK Dent dental clinic, Bani Gala Islamabad. Appointment, checkup, scaling, root canal, RCT, implant, braces, aligners, whitening, veneers, extraction, filling. Urdu, English, Pashto.',
  );

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`STT_HTTP_${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  const text = String(json.text ?? '').trim();

  // Whisper often decodes Urdu speech as Hindi (Devanagari). If that happens
  // without an explicit language hint, ask again with Urdu forced.
  if (!lang || lang === 'auto') {
    if (/[\u0900-\u097F]/.test(text)) {
      return transcribe(audio, filename, mimeType, 'ur');
    }
  }
  return text;
}
