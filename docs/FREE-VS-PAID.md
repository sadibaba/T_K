# Free-Tier Constraints and the Paid Upgrade Path

Companion to `PROJECT.md`. This document records exactly where the current build depends on
free-tier services, what the user experiences at those limits, and what changes when the clinic
moves to paid plans.

The short version: **no code changes are required.** Every constraint below is a configuration
value or a runtime safeguard that either becomes inactive on a paid plan or keeps working without
harm.

---

## 1. Current configuration

| Component       | Service                                                   | Plan in use |
| --------------- | --------------------------------------------------------- | ----------- |
| Language model  | Groq `openai/gpt-oss-120b`, fallback `openai/gpt-oss-20b` | Free        |
| Speech to text  | Groq `whisper-large-v3-turbo`                             | Free        |
| Text to speech  | ElevenLabs `eleven_v3`, voice `Bella`                     | Free        |
| Booking storage | JSON file on the server                                   | Local       |
| Notifications   | WhatsApp deep link opened by the patient                  | None        |

The application never calls a paid endpoint and holds no billing details.

---

## 2. Constraints and their visible effect

| Area            | Free-tier limit                                     | What the patient or staff notices                                                                                              | Behaviour on a paid plan                                                                            |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Language model  | 200,000 tokens per day, per model; 8,000 per minute | After roughly 130 turns in a day the assistant answers from the scripted fallback, or reports that the daily quota is finished | Limits rise by one to two orders of magnitude; the fallback stays dormant                           |
| Speech to text  | 2,000 transcriptions per day                        | Only reached by extreme use; the microphone falls back to the browser recogniser                                               | No visible change                                                                                   |
| Text to speech  | 10,000 characters per month; 2 concurrent streams   | Voice stops after roughly 60 to 70 spoken replies in a month; a third simultaneous sentence can return a concurrency error     | Character allowance and concurrency both increase; the retry logic becomes unnecessary but harmless |
| Voice catalogue | Library voices are blocked on the free plan         | Only the premade voices (Bella, Adam, Antoni) are available                                                                    | Library voices and voice cloning become selectable by changing `ELEVENLABS_VOICE_ID`                |
| Model latency   | Shared capacity                                     | Occasional slow turn, typically two to four seconds                                                                            | More consistent latency, no queueing                                                                |
| Booking storage | Local file                                          | Bookings are lost when the server instance is replaced                                                                         | Unchanged; Supabase is a separate, free-tier service                                                |

---

## 3. Safeguards in the code

These were added for the free tier. Each is designed to remain correct after an upgrade.

| Safeguard                                                   | Purpose on free tier                                                              | Effect on a paid plan                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Model fallback `gpt-oss-120b` to `gpt-oss-20b`              | Keeps answering when the daily token cap is reached                               | Never triggers; the primary model succeeds                                                   |
| Ten-minute provider cooldown                                | Stops retrying an exhausted model on every turn, which cost two seconds per reply | Never triggers                                                                               |
| `reasoning_effort: low`                                     | Removes roughly four seconds of model deliberation before the first word          | Still applies and still improves latency; may be raised to `medium` for more careful answers |
| Scripted fallback brain                                     | Allows a demonstration with no key at all                                         | Unused while a key is present                                                                |
| Speech retry on concurrency errors                          | Absorbs the two-stream limit                                                      | Harmless                                                                                     |
| One-ahead audio preload                                     | Avoids gaps between sentences without exceeding two concurrent streams            | Can be increased if the plan allows more concurrency                                         |
| Streaming audio playback                                    | Reduces time to first sound                                                       | Works identically, and faster                                                                |
| Character budget in history (20 messages, 3,000 characters) | Keeps the token bill predictable                                                  | Can be raised; it exists to protect cost, not to work around a defect                        |

---

## 4. Upgrade cost

Approximate figures, to be confirmed against current vendor pricing at the time of purchase.

| Item                             | Free                | Typical paid entry point          | Monthly estimate                |
| -------------------------------- | ------------------- | --------------------------------- | ------------------------------- |
| Groq                             | 200k tokens per day | Pay per token                     | USD 5 to 15 for a single clinic |
| ElevenLabs                       | 10,000 characters   | Starter or Creator tier           | USD 5 to 22                     |
| Azure Speech (alternative voice) | 500,000 characters  | Pay per character                 | USD 0 to 15                     |
| Supabase                         | 500 MB              | Free tier is sufficient           | USD 0                           |
| Vercel                           | Hobby               | Hobby is sufficient for one site  | USD 0 to 20                     |
| WhatsApp Cloud API               | 1,000 conversations | Free tier is sufficient initially | USD 0                           |

Realistic total for a clinic handling twenty to forty conversations per day: **USD 15 to 40 per
month**, dominated by voice synthesis.

---

## 5. Migration checklist

1. Create the paid accounts and copy the new keys.
2. Replace `GROQ_API_KEY`, `ELEVENLABS_API_KEY` in `.env` locally and in the Vercel project.
3. Optional, only if desired:
   - `ELEVENLABS_VOICE_ID` to a library voice.
   - `LLM_MODEL` to a stronger model.
   - `ELEVENLABS_DAILY_CHARS` to a monthly budget guard.
4. Redeploy, or restart the local server.
5. Run `npm run check`. The expected result is `mode=live` with all checks passing.
6. Confirm in the provider dashboards that usage is being billed to the correct account.

No source file, database schema or interface element changes.

---

## 6. What must be decided before a paid plan is chosen

| Question                                                  | Why it matters                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Which account holds the billing details, clinic or agency | Determines who controls the keys and the spending limit                               |
| Monthly character budget for voice                        | The only cost that scales quickly with usage                                          |
| Whether library voices or voice cloning are required      | Cloning needs written consent from the speaker and a higher tier                      |
| Whether Pashto must be enabled                            | Requires a voice provider with Pashto support; the code is already present and hidden |
| Retention period for patient names and telephone numbers  | A privacy decision, not a technical one                                               |

---

## 7. Summary

The current build is deliberately conservative: free services, hard limits, and safeguards that
degrade the experience rather than fail it. Moving to paid plans removes the limits without
requiring a rewrite. The only lasting cost driver is voice synthesis, and that is controlled by a
single configuration value.
