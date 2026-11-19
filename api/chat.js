import { runAgent } from '../lib/agent.mjs';
import { runMock } from '../lib/mock.mjs';
import { llmReady } from '../lib/llm.mjs';
import { looksRomanUrdu } from '../lib/clinic.mjs';
import { cors, rateLimit, readJson, sendJson } from '../lib/http.mjs';

export const config = { maxDuration: 60 };

function sse(res, event) {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.end();
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  const limit = rateLimit(req, { key: 'chat', limit: 40, windowMs: 60_000 });
  if (!limit.ok) return sendJson(res, 429, { error: 'rate_limited', retryAfter: 60 });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: 'bad_request' });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) return sendJson(res, 400, { error: 'empty_conversation' });

  const lang = ['ur', 'en', 'ps', 'auto'].includes(body.lang) ? body.lang : 'auto';
  const history = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': ping\n\n');

  // Roman Urdu has to be answered in Urdu script, otherwise the speech engine
  // reads it as English. Tell the model explicitly instead of hoping.
  const selectedSlot = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(body.selectedSlot ?? ''))
    ? String(body.selectedSlot)
    : '';

  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
  const replyScript = looksRomanUrdu(lastUser) ? 'ur' : '';

  // A closing message after a completed booking does not need the model at all.
  const CLOSING =
    /^(ok(ay)?|thanks|thank you|no thanks|no thank you|nahi|nahin|nahi thanks|shukriya|shukria|bye|goodbye|allah hafiz|khuda hafiz|شکریہ|نہیں|نہیں شکریہ|ٹھیک ہے|خدا حافظ|اللہ حافظ)[\s.!۔]*$/i;
  const recent = history.slice(-6).map((m) => String(m.content ?? '')).join(' ');
  const bookedAlready = /reference|ریفرنس|بک ہو گیا|booked|confirmed/i.test(recent);

  if (history.length && CLOSING.test(String(history.at(-1).content).trim()) && bookedAlready) {
    const closing = lang === 'en' ? 'You are welcome — see you at the clinic.' : 'شکریہ! کلینک میں ملتے ہیں۔';
    sse(res, { type: 'delta', text: closing });
    sse(res, { type: 'done', text: closing, intent: 'closing' });
    return res.end();
  }

  const started = Date.now();
  try {
    const runner = llmReady()
      ? runAgent({ history, lang, replyScript, selectedSlot })
      : runMock({ history, lang });

    for await (const event of runner) {
      if (res.writableEnded) break;
      sse(res, event);
    }
    sse(res, { type: 'meta', ms: Date.now() - started, mode: llmReady() ? 'live' : 'demo' });
  } catch (err) {
    console.error('[chat]', err?.message);
    const status = err?.status;
    const urdu = lang === 'ur';

    let text;
    if (err?.code === 'TPD') {
      const mins = err.retryAfterSec ? Math.ceil(err.retryAfterSec / 60) : null;
      text = urdu
        ? `آج کا AI quota ختم ہو گیا ہے${mins ? `، تقریباً ${mins} منٹ بعد دوبارہ کوشش کریں` : ''}۔ آپ کلینک کو 0312 3329479 پر کال کر سکتے ہیں۔`
        : `I have used today's AI quota${mins ? `, it resets in about ${mins} minutes` : ''}. You can call the clinic on 0312 3329479.`;
    } else if (status === 429) {
      text = urdu
        ? 'ایک لمحہ — لائن مصروف ہے۔ تھوڑی دیر بعد دوبارہ کہیں۔'
        : 'One moment — the line is busy. Please say that again.';
    } else {
      text = urdu
        ? 'معاف کریں، کنکشن میں مسئلہ آ گیا۔ دوبارہ کہیں؟'
        : 'Sorry, I lost the connection for a second. Could you repeat that?';
    }
    sse(res, { type: 'delta', text });
    sse(res, { type: 'done', text, error: err?.message ?? 'unknown' });
  } finally {
    res.end();
  }
}
