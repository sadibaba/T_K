import { speakable, synthesize, synthesizeStream, ttsProvider, ttsReady, voiceFor } from '../lib/tts.mjs';
import { cors, rateLimit, readJson, sendJson } from '../lib/http.mjs';

/**
 * POST /api/tts  { text, lang, style? }   -> audio/mpeg
 * GET  /api/tts?t=...&l=ur               -> audio/mpeg (handy for curl / <audio src>)
 */
export const config = { maxDuration: 30 };

async function produce(res, text, lang, style) {
  if (!ttsReady()) return sendJson(res, 501, { error: 'tts_not_configured' });
  if (!speakable(text)) return sendJson(res, 400, { error: 'empty_text' });
  if (speakable(text).length > 900) return sendJson(res, 413, { error: 'text_too_long' });

  try {
    const { buffer, contentType, cached } = await synthesize(text, lang, { style });
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Voice', voiceFor(lang));
    res.setHeader('X-TTS-Cache', cached ? 'hit' : 'miss');
    res.end(buffer);
  } catch (err) {
    console.error('[tts]', err?.message);
    if (err?.message === 'TTS_NOT_CONFIGURED') return sendJson(res, 501, { error: 'tts_not_configured' });
    return sendJson(res, err?.status === 429 ? 429 : 502, { error: 'tts_failed' });
  }
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.end();

  if (req.method === 'GET') {
    if (!rateLimit(req, { key: 'tts-get', limit: 60, windowMs: 60_000 }).ok) {
      return sendJson(res, 429, { error: 'rate_limited' });
    }
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const text = url.searchParams.get('t') ?? '';
    const lang = url.searchParams.get('l') ?? 'ur';

    // Progressive audio: the browser starts playing before the file is complete.
    if (url.searchParams.get('stream') === '1' && ttsProvider() === 'elevenlabs') {
      try {
        const { body, contentType } = await synthesizeStream(text, lang);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
          'X-Voice': voiceFor(lang),
          'X-TTS-Stream': '1',
        });
        for await (const chunk of body) {
          if (res.writableEnded) break;
          res.write(chunk);
        }
        return res.end();
      } catch (err) {
        console.error('[tts] stream failed:', err?.message);
        if (res.headersSent) return res.end();
        // fall through to the buffered path
      }
    }

    return produce(res, text, lang, url.searchParams.get('s') ?? 'normal');
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!rateLimit(req, { key: 'tts', limit: 90, windowMs: 60_000 }).ok) {
    return sendJson(res, 429, { error: 'rate_limited' });
  }

  let body;
  try {
    body = await readJson(req, 64 * 1024);
  } catch {
    return sendJson(res, 400, { error: 'bad_request' });
  }

  return produce(res, String(body.text ?? ''), body.lang ?? 'ur', body.style ?? 'normal');
}
