# TK Dent — AI Voice Receptionist

A voice assistant for the TK Dent website ([tanveerkhokar.vercel.app](https://tanveerkhokar.vercel.app/)).
Patients speak or type in Urdu or English, hear a natural voice reply, and can book an appointment.

**Project documentation: [`docs/PROJECT.md`](docs/PROJECT.md)** — architecture, costs, deployment,
limitations and the demo script.
**Free-tier limits and the paid upgrade path: [`docs/FREE-VS-PAID.md`](docs/FREE-VS-PAID.md).**
This file is the quick technical reference.

```
node scripts/dev.mjs        # http://127.0.0.1:4173
http://127.0.0.1:4173/admin # bookings dashboard (key: ADMIN_KEY)
```

No dependencies, no build step — Node 20+ only.

---

## Layout

```
public/widget.js     embeddable widget (Shadow DOM, no dependencies)
public/index.html    standalone demo page
public/admin.html    bookings dashboard
api/chat.js          agent endpoint, server-sent events
api/stt.js           speech to text
api/tts.js           text to speech, cached
api/book.js          availability + direct booking
api/bookings.js      admin listing
api/health.js        provider status
lib/clinic.mjs       the facts the assistant may state + system prompt
lib/agent.mjs        model → tool → model loop
lib/tools.mjs        availability, booking, escalation
lib/voicefilter.mjs  keeps replies short and non-repetitive
lib/schedule.mjs     Pakistan-time slots
lib/store.mjs        booking storage (memory / JSON / Supabase)
lib/mock.mjs         scripted brain for key-free demos
lib/faq.mjs          fixed answers for common questions
scripts/dev.mjs      local server
scripts/selfcheck.mjs end-to-end check
test/                unit and integration tests
```

## Configuration

Copy `.env.example` to `.env`. The two keys that matter:

```env
GROQ_API_KEY=          # speech to text + language model
ELEVENLABS_API_KEY=    # voice
ADMIN_KEY=             # /admin password
```

Everything else — Azure voice, Gemini fallback, Supabase, WhatsApp — is optional and documented
in `.env.example` and `docs/PROJECT.md` §6.

## Commands

```bash
node scripts/dev.mjs   # run locally
npm test               # 18 unit + integration tests
npm run check          # end-to-end check against the running server
```

## Embedding on the clinic site

```html
<script
  src="https://<project>.vercel.app/widget.js"
  data-api="https://<project>.vercel.app"
  data-lang="en"
  data-langs="ur,en"
  defer
></script>
```

Then `TKDentVoice.open()`, `.ask('book a cleaning')` or `.language('ur')` from any button.

## Behaviour notes

- The greeting is shown as text; the assistant only speaks after the patient says or sends something.
- Conversations persist in the browser for 12 hours, so a refresh resumes the same thread.
- Replies are capped at two spoken sentences and one question — enforced server-side, not left to the model.
- Emergencies (bleeding, swelling, injury) bypass the model entirely and use a fixed script.
- ElevenLabs' free plan allows two concurrent requests; the client retries instead of switching voices.
- With no keys the app runs in demo mode: scripted answers, browser voice.
