# TK Dent — AI Voice Receptionist

**Project handover**
Client: TK Dent Dental & Aesthetic Care, Bani Gala, Islamabad
Website: tanveerkhokar.vercel.app
Document date: 19 November 2026

---

## 1. Overview

The AI Voice Receptionist is an embeddable assistant for the clinic website. A patient speaks or
types in Urdu or English; the assistant answers in a natural voice and can book a real appointment
against the clinic's slot list.

The purpose is to remove the dependency on a phone call for routine booking, and to answer common
questions outside clinic hours, while keeping every answer within facts approved by the clinic.

```
Patient speaks  ->  speech-to-text  ->  language model  ->  tools (availability / booking / hand-off)
                                              |
Patient hears   <-  text-to-speech  <-  short spoken reply
```

All statements the assistant is permitted to make are defined in a single file, `lib/clinic.mjs`
(prices, hours, treatments, doctor credentials). The assistant cannot invent a price, give a
diagnosis, or promise an outcome.

---

## 2. Delivery status

| Area                              | Status             | Notes                                                                   |
| --------------------------------- | ------------------ | ----------------------------------------------------------------------- |
| Voice input (microphone)          | Delivered          | Whisper; browser recognition as fallback                                |
| Voice output                      | Delivered          | ElevenLabs, Urdu and English                                            |
| Conversational replies            | Delivered          | Requires a Groq key; scripted fallback available                        |
| Appointment booking               | Delivered          | Slot locking, reference number, WhatsApp hand-off                       |
| Treatment selection               | Delivered          | Eleven treatments presented as selectable options                       |
| Time selection                    | Delivered          | Days and times, selected by tap                                         |
| Escalation to clinic staff        | Delivered          | Call and WhatsApp card                                                  |
| Emergency handling                | Delivered          | Fixed script with the clinic number; bypasses the model                 |
| Admin dashboard                   | Delivered          | `/admin`; list, search, CSV export, cancel                              |
| Conversation memory               | Delivered          | The chat survives a page refresh and resumes where it stopped           |
| Quick replies                     | Delivered          | Four starter options on first open                                      |
| FAQ answers                       | Delivered          | Location, parking, documents, children, payment, duration, pain, photos |
| Bilingual interface               | Delivered          | Urdu and English                                                        |
| Pashto                            | Disabled by design | Implemented, hidden from the interface                                  |
| Google Calendar synchronisation   | Not included       | Requires clinic calendar access                                         |
| WhatsApp Cloud API                | Not configured     | Currently opens WhatsApp with a pre-filled message                      |
| Mobile device testing             | Pending            | Requires an HTTPS deployment and a physical device                      |
| Patient self-service cancellation | Not included       | Staff cancel from the dashboard; the patient cannot yet                 |

Overall: suitable for a client demonstration. Not yet suitable for production use; the remaining
items are listed in section 12.

---

## 3. Architecture

```
+-----------------------------+
| Clinic website (any stack)  |   one <script> tag
|   widget.js                 |   Shadow DOM, no dependencies
+--------------+--------------+
               |  HTTPS
+--------------v--------------+
| Serverless API (Vercel)     |
|  /api/stt    speech -> text |  -> Groq Whisper
|  /api/chat   agent + tools  |  -> Groq gpt-oss (fallback: Gemini)
|  /api/tts    text -> audio  |  -> ElevenLabs (fallback: Azure or demo voice)
|  /api/book   availability   |  -> booking store
|  /api/bookings  admin list  |
+--------------+--------------+
               |
        +------v------+
        |  Bookings   |  JSON file (local) or Supabase (production)
        +-------------+
```

The clinic website requires one additional line. No rebuild, no framework dependency, no change to
existing pages.

---

## 4. Technology selection

| Layer          | Choice                         | Reason                                                                            |
| -------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| Widget         | Vanilla JavaScript, Shadow DOM | Independent of the host site; cannot conflict with existing styles; no build step |
| Backend        | Node serverless functions      | Same platform as the clinic site; no runtime dependencies                         |
| Speech to text | Groq Whisper                   | Approximately 400 ms; free allowance of 8 audio hours per day                     |
| Language model | Groq `gpt-oss-120b`            | Function calling support, free tier, low latency                                  |
| Text to speech | ElevenLabs `eleven_v3`         | The most natural Urdu voice available; Azure Neural as a paid alternative         |
| Storage        | JSON file, then Supabase       | Zero setup for demonstration; one free Postgres table for production              |

Each provider can be replaced through configuration; no code changes are required.

---

## 5. Running the project locally

```bash
cp .env.example .env      # add the keys described in section 6
node scripts/dev.mjs      # http://127.0.0.1:4173
```

- Website demonstration: `http://127.0.0.1:4173`
- Admin dashboard: `http://127.0.0.1:4173/admin` (key defined by `ADMIN_KEY`)

Requirements: Node.js 20 or later. No package installation is required; the project has no
dependencies.

Without API keys the application runs in demonstration mode: a scripted response set and the
browser's built-in voice. This is sufficient to review the interaction flow.

---

## 6. Configuration

All settings are read from `.env`, which is excluded from version control and from the delivery
archive.

| Variable                                                    | Required    | Purpose                                                                      |
| ----------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| `GROQ_API_KEY`                                              | Yes         | Speech to text and language model (one key covers both)                      |
| `GROQ_ENABLED`                                              | No          | `0` disables the language model and uses the scripted response set           |
| `STT_ENABLED`                                               | No          | `0` disables microphone transcription only                                   |
| `ELEVENLABS_API_KEY`                                        | Yes         | Voice output                                                                 |
| `ELEVENLABS_VOICE_ID`                                       | No          | Default `EXAVITQu4vr4xnSDxMaL` (Bella). Free plans cannot use library voices |
| `ELEVENLABS_MODEL`                                          | No          | `eleven_v3`, the only model covering Urdu and Pashto                         |
| `ELEVENLABS_DAILY_CHARS`                                    | No          | Daily character limit; `0` means no limit                                    |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`                   | Optional    | Alternative voice provider, 500,000 free characters per month                |
| `GEMINI_API_KEY`                                            | Optional    | Secondary language model used when the Groq daily allowance is exhausted     |
| `ADMIN_KEY`                                                 | Yes         | Password for the admin dashboard                                             |
| `BOOKINGS_FILE`                                             | No          | Location of the local booking file                                           |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`                      | Optional    | Production booking storage                                                   |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `CLINIC_WHATSAPP_TO` | Optional    | Sends each booking to the clinic automatically                               |
| `ALLOWED_ORIGINS`                                           | Recommended | Restricts API access to the clinic domain                                    |

---

## 7. Deployment

```bash
vercel                    # link the project
vercel env add GROQ_API_KEY
vercel env add ELEVENLABS_API_KEY
vercel env add ADMIN_KEY
vercel --prod
```

Add the following to the clinic website immediately before the closing `</body>` tag:

```html
<script
  src="https://<project>.vercel.app/widget.js"
  data-api="https://<project>.vercel.app"
  data-lang="en"
  data-langs="ur,en"
  defer
></script>
```

Setting `data-langs="ur,en,ps"` restores the Pashto option in the interface.

### Production booking storage

The serverless file system is temporary; bookings must be stored externally. Create one table in
Supabase (free tier) and set the two Supabase variables:

```sql
create table bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id text not null,
  name text not null,
  phone text not null,
  treatment text not null,
  notes text default '',
  language text default 'ur',
  status text not null default 'confirmed',
  source text default 'ai-receptionist',
  created_at timestamptz default now()
);
create unique index bookings_slot_unique on bookings (slot_id) where status = 'confirmed';
```

The unique index prevents two patients from being given the same slot.

---

## 8. Admin dashboard

`/admin` lists all bookings: reference, patient name, telephone number, treatment, date, time,
status and the time the booking was created. It also shows the total, the number of bookings for
the current day, and the next appointment. The page refreshes automatically every 20 seconds.

Functions available on the page:

- **Search** by patient name, telephone number or reference.
- **Cancel** a booking; the slot is released immediately and becomes bookable again.
- **Export CSV** of the current view, for the clinic's own records.
- **Status** is shown per booking: `confirmed` or `cancelled`.

Access is protected by `ADMIN_KEY`. The key should be changed before the page is given to the
clinic, since the page displays patient contact information.

---

## 9. API reference

| Endpoint        | Method | Request                              | Response                                            |
| --------------- | ------ | ------------------------------------ | --------------------------------------------------- |
| `/api/health`   | GET    | —                                    | Provider status, voices, treatment list             |
| `/api/chat`     | POST   | `{ messages, lang, selectedSlot? }`  | Server-sent events: `delta`, `tool`, `card`, `done` |
| `/api/stt`      | POST   | `{ audio: base64, mime, lang }`      | `{ text }`                                          |
| `/api/tts`      | POST   | `{ text, lang }`                     | `audio/mpeg`                                        |
| `/api/book`     | GET    | —                                    | Available slots                                     |
| `/api/book`     | POST   | `{ name, phone, treatment, slotId }` | Booking record and confirmation card                |
| `/api/bookings` | GET    | `?key=...`                           | All bookings                                        |
| `/api/bookings` | POST   | `{ action: "cancel", ref }`          | Cancels a booking and frees the slot                |

`lang` accepts `ur`, `en`, `ps` or `auto`.

---

## 10. Operating costs

| Component                        | Free allowance                                        | Cost thereafter            |
| -------------------------------- | ----------------------------------------------------- | -------------------------- |
| Groq (speech and language model) | 200,000 tokens per day, 2,000 transcriptions per day  | Billed per token; low      |
| ElevenLabs (voice)               | 10,000 characters per month, approximately 10 minutes | From $5 per month          |
| Azure Speech (voice alternative) | 500,000 characters per month                          | $15 per million characters |
| Supabase                         | 500 MB                                                | $25 per month              |
| Vercel                           | Hobby plan                                            | $20 per month              |

A clinic handling approximately twenty conversations per day can operate within the free voice
allowance only if replies remain short and cached. A realistic production budget is
**USD 15 to 30 per month**, predominantly voice synthesis.

The exact limits of the current free configuration, the safeguards that exist because of them, and
the cost of moving to paid plans are documented separately in [`FREE-VS-PAID.md`](FREE-VS-PAID.md).

---

## 11. Security and privacy

- Credentials are held in environment variables and are never exposed to the browser.
- The public API applies rate limiting and can be restricted to the clinic domain.
- Stored patient data: name, telephone number, treatment and slot. No clinical notes and no audio
  recordings are retained.
- Audio is transmitted to Groq for transcription; text is transmitted to ElevenLabs or Google for
  synthesis. Both are third-party processors.
- The assistant identifies itself as an AI and never claims to be a doctor.
- Before public launch, the clinic should publish a privacy notice covering AI-handled bookings and
  obtain patient consent where required.

---

## 12. Known limitations

1. No calendar synchronisation. Bookings are held in this system, not in the clinic's calendar.
   Until the two are connected, reception and the assistant can disagree on availability.
2. WhatsApp confirmation is manual. The patient opens WhatsApp with a prepared message; nothing is
   sent automatically until the Cloud API is configured.
3. Free-tier allowances. A busy day can exhaust the token or character allowance. The application
   degrades gracefully, but the experience changes.
4. Pashto is implemented but disabled, because no free neural Pashto voice is available.
5. Mobile devices have not been tested.
6. The system serves a single clinic. Multiple locations would require a change to the data model.
7. Payment and insurance flows are outside the agreed scope.

---

## 13. Conversation behaviour

The assistant is designed to behave like a receptionist rather than a form.

- **Memory.** The conversation is stored in the browser and survives a page refresh or a closed
  tab for twelve hours. Reopening continues the same thread, including the treatment and slot
  already chosen. The refresh icon at the top of the panel starts a new conversation.
- **Quick replies.** Four common requests are offered on first open: book an appointment, timings,
  treatments and prices, talk to a person.
- **Brevity.** Replies are limited to two sentences and one question, enforced on the server, so the
  spoken answer never rambles.
- **Order.** Name, telephone number and treatment are collected before any time is offered. The booking
  tools are not even offered to the model until a telephone number is present, and a picker is shown
  only when the assistant is asking about that step.
- **Deterministic answers.** Emergencies and FAQ topics are answered from a fixed text bank rather
  than by the model, which keeps them accurate and fast.
- **No auto-speech.** The greeting is shown as text; the assistant speaks only after the patient
  sends something or presses "Play again".
- **Language.** Urdu and English can be switched at any point; the greeting and all following
  replies follow the selected language.
- **Closings.** "Thanks", "no thanks", "bye" and similar endings are answered with a fixed closing
  line without calling the model, so the assistant cannot restart the booking flow after it ends.
- **No repeated questions.** The full conversation is sent with every turn, and details already
  given (name, telephone number) are restated to the model, so the patient is not asked twice.
- **Transcription accuracy.** Whisper occasionally decodes Urdu speech as Hindi; when that happens
  the request is retried with Urdu forced, so the transcript comes back in Urdu script.

## 14. Recommended next steps

| Priority | Task                                                           | Reason                               |
| -------- | -------------------------------------------------------------- | ------------------------------------ |
| 1        | Deploy to Vercel and test on a physical phone                  | The microphone requires HTTPS        |
| 2        | Connect Google Calendar, or adopt this list as the only source | Prevents conflicting availability    |
| 3        | Move bookings to Supabase                                      | Serverless storage is temporary      |
| 4        | Configure the WhatsApp Cloud API                               | Removes the manual confirmation step |
| 5        | Rotate the admin key and API keys                              | Standard handover practice           |

---

## 15. Demonstration script

The following sequence takes approximately three minutes and exercises every delivered feature.

1. Open the assistant. The greeting is displayed as text with four quick replies; it does not
   speak until asked.
2. Type or say: "I need an appointment tomorrow."
3. Select a treatment from the list.
4. Select a time from the picker.
5. Provide a name and a telephone number.
6. A booking card appears with a reference number; "Confirm on WhatsApp" opens the clinic chat.
7. Open `/admin`; the booking is listed, searchable by name or reference, and can be cancelled
   or exported to CSV.
8. Say: "I want to talk to the doctor." A call and WhatsApp card appears.
9. Say: "my gum is bleeding." The assistant stops the booking flow and gives the clinic number.
10. Refresh the page: the conversation is still there and continues from the same point.

If the language model is disabled (`GROQ_ENABLED=0`), open-ended conversation should be avoided
during the demonstration; the scripted response set covers booking, timings, prices, emergencies
and hand-off only.
