/**
 * Text-to-speech with a small LRU cache.
 *
 * Azure is the primary provider: it is the cheapest way to get neural Urdu
 * (ur-PK-UzmaNeural) and Pashto (ps-AF-LatifaNeural), and the free F0 tier
 * gives 500k characters/month (≈10 hours of audio).
 *
 * ElevenLabs (eleven_v3) is optional and sounds noticeably more human for
 * Urdu/Pashto, but the free tier is only ~10k characters/month — use it for
 * demos or premium fallback, not for every message.
 */
import { createHash } from 'node:crypto';

const AZURE_VOICES = {
  ur: process.env.TTS_VOICE_UR || 'ur-PK-UzmaNeural',
  en: process.env.TTS_VOICE_EN || 'en-US-JennyNeural',
  ps: process.env.TTS_VOICE_PS || 'ps-AF-LatifaNeural',
};

const AZURE_LANG = { ur: 'ur-PK', en: 'en-US', ps: 'ps-AF' };

const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v3';
// Bella. Free API keys cannot use "library" voices (Rachel, Sam, …) — they
// answer 402 paid_plan_required — while the premade voices work.
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

const MAX_CACHE_ENTRIES = 400;
const cache = new Map(); // key -> { buffer, contentType }

/**
 * ElevenLabs' free plan is 10,000 characters a month — about ten minutes of
 * speech. Spread over a month of demos that is ~330 characters a day, so the
 * provider is hard-capped per day and falls back to the keyless demo voice
 * once the day's budget is gone. Set ELEVENLABS_DAILY_CHARS=0 to remove the cap.
 */
const ELEVEN_DAILY_LIMIT = Math.max(0, Number(process.env.ELEVENLABS_DAILY_CHARS ?? 320));
let elevenDay = '';
let elevenUsed = 0;

function elevenBudget() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== elevenDay) {
    elevenDay = today;
    elevenUsed = 0;
  }
  const limit = ELEVEN_DAILY_LIMIT;
  return { used: elevenUsed, limit, left: limit === 0 ? Infinity : Math.max(0, limit - elevenUsed) };
}

function spendEleven(chars) {
  elevenUsed += chars;
}

export function ttsProvider() {
  const forced = (process.env.TTS_PROVIDER || 'auto').toLowerCase();
  if (forced !== 'auto') return forced;
  if (process.env.AZURE_SPEECH_KEY) return 'azure';
  if (process.env.ELEVENLABS_API_KEY) return 'elevenlabs';
  // Keyless demo voice so the widget can be shown to a client before any
  // account exists. Set DEMO_TTS=off to disable.
  if ((process.env.DEMO_TTS || 'on').toLowerCase() !== 'off') return 'demo';
  return 'none';
}

export function ttsReady() {
  return ttsProvider() !== 'none';
}

export function voiceFor(lang) {
  const l = AZURE_LANG[lang] ? lang : 'en';
  const provider = ttsProvider();
  if (provider === 'elevenlabs') return ELEVEN_VOICE;
  if (provider === 'demo') return 'demo-google-tts';
  return AZURE_VOICES[l];
}

function cacheKey(provider, lang, text, style) {
  return createHash('sha1').update(`${provider}|${lang}|${style}|${text}`).digest('hex');
}

function remember(key, value) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

function xmlEscape(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Strip things a speech engine should not read out: markdown, emoji, URLs. */
export function speakable(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_#`~>]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function azureSpeak(text, lang, style) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error('TTS_NOT_CONFIGURED');

  const voice = AZURE_VOICES[lang] || AZURE_VOICES.en;
  const langTag = AZURE_LANG[lang] || AZURE_LANG.en;
  const prosody =
    style === 'greeting'
      ? '<prosody rate="-4%" pitch="+0%">'
      : '<prosody rate="+2%" pitch="+0%">';

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${langTag}"><voice name="${voice}">${prosody}${xmlEscape(
    text,
  )}</prosody></voice></speak>`;

  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'tkdent-voice',
    },
    body: ssml,
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`AZURE_TTS_HTTP_${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }

  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: 'audio/mpeg' };
}

async function elevenSpeak(text, lang) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('TTS_NOT_CONFIGURED');

  const bodyText = JSON.stringify({
    text,
    model_id: ELEVEN_MODEL,
    language_code: lang === 'ur' ? 'ur' : lang === 'ps' ? 'ps' : 'en',
    voice_settings: { stability: 0.45, similarity_boost: 0.8, speed: 1.02 },
  });

  // The free plan allows only two concurrent requests. A short retry keeps the
  // voice consistent instead of dropping to the fallback for one sentence.
  let res;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: bodyText,
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (res.ok) break;

    const body = await res.text().catch(() => '');
    const concurrent = /concurrent_limit_exceeded/i.test(body);
    if (!concurrent || attempt === 2) {
      const err = new Error(`ELEVEN_TTS_HTTP_${res.status}: ${body.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    await new Promise((r) => setTimeout(r, 700 + attempt * 500));
  }

  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: 'audio/mpeg' };
}

/**
 * Keyless demo voice (Google Translate's read-aloud endpoint). No account, no
 * key, but unofficial and rate-limited — good enough to demo, never the
 * production path. Urdu and English only; Pashto needs the Azure key.
 */
async function demoSynthesize(text, lang) {
  if (lang === 'ps') throw new Error('TTS_NOT_CONFIGURED');

  const tl = lang === 'en' ? 'en' : 'ur';
  const chunks = [];
  let rest = text;

  while (rest.length) {
    if (rest.length <= 180) {
      chunks.push(rest);
      break;
    }
    let cut = rest.lastIndexOf(' ', 180);
    if (cut < 100) cut = 180;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }

  const parts = [];
  for (const chunk of chunks) {
    const url = new URL('https://translate.google.com/translate_tts');
    url.searchParams.set('ie', 'UTF-8');
    url.searchParams.set('client', 'tw-ob');
    url.searchParams.set('tl', tl);
    url.searchParams.set('ttsspeed', '1');
    url.searchParams.set('q', chunk);

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Referer: 'https://translate.google.com/',
      },
      signal: AbortSignal.timeout(12_000),
    });

    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('audio/')) {
      throw new Error(`DEMO_TTS_HTTP_${res.status}`);
    }
    parts.push(Buffer.from(await res.arrayBuffer()));
  }

  if (!parts.length) throw new Error('DEMO_TTS_EMPTY');
  return { buffer: Buffer.concat(parts), contentType: 'audio/mpeg' };
}

/**
 * Streaming variant used by the widget when ElevenLabs is the provider: bytes
 * are forwarded as they arrive, so playback starts ~1 s earlier than waiting
 * for the whole file.
 */
export async function synthesizeStream(text, lang = 'ur') {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || ttsProvider() !== 'elevenlabs') throw new Error('TTS_NOT_STREAMABLE');

  const clean = speakable(text).slice(0, 600);
  if (!clean) throw new Error('EMPTY_TEXT');

  const payload = JSON.stringify({
    text: clean,
    model_id: ELEVEN_MODEL,
    language_code: lang === 'ur' ? 'ur' : lang === 'ps' ? 'ps' : 'en',
    voice_settings: { stability: 0.45, similarity_boost: 0.8, speed: 1.02 },
  });

  let res;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}/stream?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (res.ok && res.body) break;

    const body = await res.text().catch(() => '');
    // Free plan allows two concurrent streams; wait a moment and retry.
    if (/concurrent_limit_exceeded/i.test(body) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 600 + attempt * 600));
      continue;
    }
    const err = new Error(`ELEVEN_STREAM_HTTP_${res.status}: ${body.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }

  if (!res.ok || !res.body) throw new Error(`ELEVEN_STREAM_HTTP_${res.status}`);

  return { body: res.body, contentType: 'audio/mpeg' };
}

/**
 * @returns {Promise<{buffer: Buffer, contentType: string, cached: boolean}>}
 */
export async function synthesize(text, lang = 'ur', { style = 'normal' } = {}) {
  const clean = speakable(text).slice(0, 900);
  if (!clean) throw new Error('EMPTY_TEXT');

  let provider = ttsProvider();
  if (provider === 'none') throw new Error('TTS_NOT_CONFIGURED');

  const key = cacheKey(provider, lang, clean, style);
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };

  // No automatic provider switching: the chosen voice must stay the same for
  // the whole conversation. A failure is reported instead of silently changing.
  let result;
  if (provider === 'elevenlabs') {
    result = await elevenSpeak(clean, lang);
    spendEleven(clean.length);
  } else if (provider === 'demo') {
    result = await demoSynthesize(clean, lang);
  } else {
    result = await azureSpeak(clean, lang, style);
  }

  remember(key, result);
  return { ...result, cached: false };
}

export function cacheStats() {
  return { entries: cache.size, max: MAX_CACHE_ENTRIES };
}

export function elevenStats() {
  return elevenBudget();
}
