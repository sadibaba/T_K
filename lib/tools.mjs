/**
 * Tools the model can call. Each returns { speak, card?, ...data } — `speak` is
 * what the model should say next, `card` is an optional UI payload the widget
 * renders (booking confirmation, call-the-clinic card).
 */
import { CLINIC, treatmentById, TREATMENTS } from './clinic.mjs';
import { faqAnswer, findFaq } from './faq.mjs';
import { addDaysKey, humanTime, openSlots, speakSlot, todayKey } from './schedule.mjs';
import { bookedSlotIds, isSlotBooked, saveBooking } from './store.mjs';

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'get_availability',
      description:
        'List open consultation slots for the next few days. Always call this before offering an appointment time.',
      parameters: {
        type: 'object',
        properties: {
          treatment: {
            type: 'string',
            description: 'Treatment id or name if the patient already chose one, else omit.',
          },
          days: {
            type: 'integer',
            description: 'How many days to show. 1 or 2 is usually enough.',
            minimum: 1,
            maximum: 5,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description:
        'Create the appointment. Only call after the patient confirmed their full name, phone number, treatment and slot.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Patient full name.' },
          phone: {
            type: 'string',
            description: 'Patient phone number in any Pakistani format, e.g. 03001234567.',
          },
          treatment: {
            type: 'string',
            description: `One of: ${TREATMENTS.map((t) => t.id).join(', ')}.`,
          },
          slot_id: {
            type: 'string',
            description: 'Exact slot id from get_availability, formatted YYYY-MM-DDTHH:MM.',
          },
          slot_hint: {
            type: 'string',
            description:
              'Use instead of slot_id when the patient just says a time, e.g. "10:00" or "shaam 4:00". The server maps it to the next open slot at that time.',
          },
          notes: { type: 'string', description: 'Anything the doctor should know. Optional.' },
        },
        required: ['name', 'phone', 'treatment'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup_answer',
      description:
        'Look up a factual clinic answer (address, parking, first-visit documents, children, payment, visit duration, braces age, before/after photos). Only for real questions — never for greetings, thanks or booking.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The patient question, in their own words.' },
        },
        required: ['question'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description:
        'Hand the conversation to the clinic team: the patient asked for a human/doctor/health advisor, is in pain or upset, or asked something you cannot safely answer.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'One short line for the clinic team.' },
          urgency: {
            type: 'string',
            enum: ['routine', 'urgent', 'emergency'],
            description: 'emergency = suspected dental emergency right now.',
          },
        },
        required: ['reason'],
        additionalProperties: false,
      },
    },
  },
];

export function normalizePhone(input) {
  const digits = String(input ?? '').replace(/[^\d+]/g, '');
  let n = digits.replace(/^\+/, '');
  if (n.startsWith('0092')) n = n.slice(2);
  if (n.startsWith('92') && n.length === 12) return `+${n}`;
  if (n.startsWith('0') && n.length === 11) return `+92${n.slice(1)}`;
  if (n.length === 10 && n.startsWith('3')) return `+92${n}`;
  return null;
}

function waLink(text) {
  // The dev server sets DEMO_TAG=on so test bookings cannot be mistaken for real
  // ones by whoever opens the WhatsApp link.
  const body =
    process.env.DEMO_TAG === 'on' ? `[TEST — ignore] ${text}\n\nYe demo/test booking hai.` : text;
  return `${CLINIC.whatsapp}?text=${encodeURIComponent(body)}`;
}

const EMERGENCY_WORDS =
  /(bleed|blood|swell|sujan|soojan|khoon|خون|سوجن|turauma|trauma|accident|tooth broke|toot gaya|damage|saans|damm|dil)/i;

export async function runTool(name, args = {}, { lang = 'ur' } = {}) {
  switch (name) {
    case 'get_availability': {
      // No treatment yet? Show the treatment list instead of times — the patient
      // should choose what they need before they see the diary.
      if (!args.treatment) {
        return {
          ok: false,
          reason: 'treatment_required',
          card: {
            type: 'treatments',
            items: TREATMENTS.map((t) => ({ id: t.id, label: t.label })),
          },
          speak: 'Which treatment would you like?',
        };
      }

      const days = Math.min(Math.max(Number(args.days) || 2, 1), 5);
      const from = todayKey();
      const taken = await bookedSlotIds({ from, to: addDaysKey(from, 12) });
      const slots = openSlots({ days, taken });
      if (!slots.length) {
        return {
          ok: false,
          reason: 'no_slots',
          speak: 'The next few days are fully booked. I can note your number and the team will call you with the next opening.',
        };
      }
      const flat = slots.flatMap((d) => d.slots.map((s) => ({ id: s, label: `${d.label} ${s.split('T')[1]}` })));
      return {
        ok: true,
        // Two options per day is what the prompt asks the model to offer; sending
        // all six made it list them and repeat itself.
        days: slots.map((d) => ({
          date: d.date,
          label: d.label,
          slots: d.slots.slice(0, 2).map((s) => ({ id: s, label: speakSlot(s) })),
          totalFree: d.slots.length,
        })),
        count: flat.length,
        card: {
          type: 'slots',
          days: slots.slice(0, 3).map((d) => ({
            date: d.date,
            label: d.label,
            times: d.slots.slice(0, 4).map((id) => ({ id, label: humanTime(id.split('T')[1]) })),
          })),
        },
        speak: `I have openings on ${slots[0].label} at ${slots[0].slots
          .slice(0, 2)
          .map((s) => s.split('T')[1])
          .join(' and ')}. Which one suits you?`,
      };
    }

    case 'book_appointment': {
      const treatment = treatmentById(args.treatment);
      const phone = normalizePhone(args.phone);
      const name = String(args.name ?? '').trim();
      let slotId = String(args.slot_id ?? '').trim();

      if (!name || name.length < 2) {
        return { ok: false, reason: 'name_required', speak: 'Can I have your full name for the appointment?' };
      }
      if (!phone) {
        return { ok: false, reason: 'phone_invalid', speak: 'That number does not look complete. Could you say it again, starting with zero three?' };
      }
      if (!treatment) {
        return { ok: false, reason: 'treatment_unknown', speak: 'Which treatment is this for — a checkup, a root canal, or something else?' };
      }
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slotId)) {
        // The patient may only have said a time ("10:00"); find the next open
        // slot at that time instead of failing the booking.
        const hint = String(args.slot_hint || args.slot_id || '').trim();
        const match = hint.match(/(\d{1,2})[:.](\d{2})/);
        if (match) {
          const want = `${String(match[1]).padStart(2, '0')}:${match[2]}`;
          const from = todayKey();
          const taken = await bookedSlotIds({ from, to: addDaysKey(from, 12) });
          const days = openSlots({ days: 7, taken });
          slotId = days.flatMap((d) => d.slots).find((id) => id.endsWith(`T${want}`)) ?? '';
        }
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slotId)) {
          return { ok: false, reason: 'slot_invalid', speak: 'Let me recheck the timings — which day did you prefer?' };
        }
      }
      if (await isSlotBooked(slotId)) {
        return { ok: false, reason: 'slot_taken', speak: 'That slot just went. I can offer the next one on the same day.' };
      }

      const booking = await saveBooking({
        name,
        phone,
        treatment: treatment.id,
        slotId,
        notes: String(args.notes ?? '').slice(0, 300),
      });

      const when = speakSlot(slotId);
      const message = `New appointment (AI receptionist)\nName: ${name}\nPhone: ${phone}\nTreatment: ${treatment.label}\nWhen: ${when}\nRef: ${booking.id}`;
      void notifyClinic(message);

      return {
        ok: true,
        booking: { ...booking, when, treatmentLabel: treatment.label },
        card: {
          type: 'booking',
          ref: booking.id,
          name,
          phone,
          treatment: treatment.label,
          when,
          waLink: waLink(message),
        },
        speak: `Done — ${name}, you are booked for ${treatment.label} on ${when}. Reference ${booking.id}. The team will confirm on WhatsApp.`,
      };
    }

    case 'lookup_answer': {
      const faq = findFaq(args.question);
      if (!faq) {
        return { ok: false, reason: 'unknown_question' };
      }
      return {
        ok: true,
        final: true,
        speak: faqAnswer(faq, lang),
        data: { topic: faq.id },
      };
    }

    case 'escalate_to_human': {
      const urgency = args.urgency === 'emergency' ? 'emergency' : args.urgency === 'urgent' ? 'urgent' : 'routine';
      const emergency = urgency === 'emergency' || EMERGENCY_WORDS.test(String(args.reason ?? ''));
      const emergencyLine =
        lang === 'en'
          ? `Please call the clinic right now on ${CLINIC.phone}. If the bleeding or swelling is severe, go to the nearest emergency room.`
          : `براہ کرم ابھی کلینک کو ${CLINIC.phone} پر کال کریں۔ اگر خون یا سوجن زیادہ ہے تو قریب کے ایمرجنسی میں جائیں۔`;
      void notifyClinic(
        `AI receptionist handoff (${emergency ? 'EMERGENCY' : urgency})\nReason: ${args.reason ?? 'not given'}`,
      );
      return {
        ok: true,
        reason: emergency ? 'emergency_handoff' : 'handoff',
        card: {
          type: 'handoff',
          urgency: emergency ? 'emergency' : urgency,
          reason: String(args.reason ?? '').slice(0, 200),
          phone: CLINIC.phone,
          tel: `tel:${CLINIC.phoneRaw}`,
          waLink: waLink(
            `Assalam o alaikum, I was talking to the TK Dent receptionist and need to speak to the doctor. ${args.reason ?? ''}`.trim(),
          ),
        },
        // An emergency is a fixed script: no model improvisation, no waiting on
        // another LLM call, and the phone number is always spoken.
        ...(emergency ? { final: true, speak: emergencyLine } : {}),
        speak: emergency
          ? emergencyLine
          : lang === 'en'
            ? 'I am passing this to the team now — they will call you on the number you gave. You can also reach them on WhatsApp.'
            : 'میں یہ کلینک کی ٹیم کو دے رہی ہوں، وہ آپ کے نمبر پر کال کریں گے۔ آپ واٹس ایپ پر بھی رابطہ کر سکتے ہیں۔',
      };
    }

    default:
      return { ok: false, speak: 'Let me try that again.' };
  }
}

/** Optional WhatsApp Cloud API ping so the clinic sees bookings instantly. */
async function notifyClinic(text) {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, CLINIC_WHATSAPP_TO } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID || !CLINIC_WHATSAPP_TO) return;
  try {
    await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: CLINIC_WHATSAPP_TO,
        type: 'text',
        text: { body: text },
      }),
    });
  } catch (err) {
    console.error('[whatsapp] notify failed', err?.message);
  }
}

/** Used by the mock (no-key) brain so the demo can still book. */
export function suggestedSlots(days = 2) {
  const out = openSlots({ days, from: todayKey() });
  return out.flatMap((d) => d.slots.map((s) => ({ id: s, label: speakSlot(s) })));
}
