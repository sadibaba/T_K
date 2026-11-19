/**
 * Key-free demo brain. It is NOT the product — it exists so the UI, the audio
 * pipeline and the booking flow can be tested before any API key is issued.
 * With GROQ_API_KEY set, /api/chat uses the real model instead.
 */
import { CLINIC, TREATMENTS, treatmentById } from './clinic.mjs';
import { faqAnswer, findFaq } from './faq.mjs';
import { openSlots, speakSlotIn } from './schedule.mjs';
import { runTool, suggestedSlots } from './tools.mjs';

const T = {
  greet: /(salam|assalam|hello|hi\b|hey|sat sri|پښه|سلام|ہیلو)/i,
  hours: /(timing|timings|hours|open|close|band|khulta|وقت|اوقات|کھلتا|بند)/i,
  address: /(address|location|where|kahan|pata|jaga|ایڈریس|کہاں|پتہ)/i,
  price: /(price|cost|fee|charge|kitna|kitne|rate|قیمت|کتنا|فیس|ریٹ)/i,
  book: /(book|appointment|slot|milna|visit|time chahiye|ubu|بکنگ|اپائنٹمنٹ|وقت چاہیے)/i,
  human: /(human|doctor se baat|insan|agent|staff|baat karni|ڈاکٹر|انسان|بات کرنی)/i,
  emergency: /(bleed|blood|swell|sujan|khoon|درد شدید|خون|سوجن|toot|ٹوٹ)/i,
  thanks: /(thank|shukriya|jazak|شکریہ)/i,
};

const DAYS = {
  aaj: 0,
  today: 0,
  kal: 1,
  tomorrow: 1,
  parso: 2,
  'day after': 2,
};

function has(text, re) {
  return re.test(text);
}

function findPhone(text) {
  const m = text.match(/(\+?92|0)?3\d{2}[\s-]?\d{7}/);
  return m ? m[0] : null;
}

function findTreatment(text) {
  const t = text.toLowerCase();
  if (/check ?up|general|معائنہ/i.test(t)) return treatmentById('checkup');
  for (const tr of TREATMENTS) {
    if (new RegExp(`\\b${tr.id}\\b`).test(t)) return tr;
    if (t.includes(tr.label.toLowerCase().split(' ')[0])) return tr;
  }
  if (/dant|tooth|dand|دانت/i.test(text)) return treatmentById('checkup');
  return null;
}

function pickLang(text) {
  if (/[\u0600-\u06FF]/.test(text)) return 'ur';
  if (/[\u06A9\u0689\u069A\u067C\u0693]/.test(text)) return 'ps';
  return 'ur';
}

const COPY = {
  ur: {
    greet: `السلام علیکم! ٹی کے ڈینٹ میں خوش آمدید۔ میں عائشہ ہوں۔ اپائنٹمنٹ بک کرنی ہے یا کسی علاج کے بارے میں پوچھنا ہے؟`,
    greetBack: `میں ٹھیک ہوں، شکریہ! بتائیے — اپائنٹمنٹ بک کرنی ہے یا کسی علاج کے بارے میں پوچھنا ہے؟`,
    hours: `کلینک پیر سے ہفتے تک، صبح دس بجے سے شام سات بجے تک کھلا ہے۔ اتوار صرف اپائنٹمنٹ پر۔`,
    address: `ہم ہاؤس 34-سی، اکرم روڈ، بنی گالہ، اسلام آباد میں ہیں۔`,
    askTreatment: `ضرور۔ کس علاج کے لیے اپائنٹمنٹ چاہیے — چیک اپ، روٹ کینال، یا کچھ اور؟`,
    askName: `ٹھیک ہے۔ اپنا پورا نام بتا دیجیے۔`,
    askPhone: `شکریہ۔ اب اپنا موبائل نمبر بتا دیجیے، صفر تین سے شروع ہوتا ہے۔`,
    askSlot: `یہ اوقات خالی ہیں — {slots}۔ کون سا ٹھیک رہے گا؟`,
    noSlot: `ان دنوں اوقات پوری طرح بھر گئے ہیں۔ آپ کا نمبر نوٹ کر لوں، ٹیم کال کر لے گی؟`,
    human: `میں آپ کو کلینک کی ٹیم سے ملا رہی ہوں۔ آپ {phone} پر کال بھی کر سکتے ہیں۔`,
    emergency: `براہ کرم ابھی کلینک کو {phone} پر کال کریں۔ اگر خون یا سوجن زیادہ ہے تو قریب کے ایمرجنسی میں جائیں۔`,
    thanks: `شکریہ! اللہ حافظ۔`,
    fallback: `میں مدد کر سکتی ہوں: اپائنٹمنٹ بک کرنا، اوقات، پتہ، یا کسی علاج کی تفصیل۔ کیا چاہیے؟`,
    booked: `ہو گیا — {name}، آپ {when} پر {treatment} کے لیے بک ہو گئے ہیں۔ ریفرنس {ref}۔ ٹیم واٹس ایپ پر تصدیق کرے گی۔`,
  },
  en: {
    greet: `Assalam o alaikum! Welcome to TK Dent. I am Ayesha. Would you like to book an appointment, or ask about a treatment?`,
    hours: `The clinic runs Monday to Saturday, ten in the morning to seven in the evening. Sundays are by appointment only.`,
    address: `We are at House 34-C, Akram Road, Bani Gala, Islamabad.`,
    askTreatment: `Of course. Which treatment is the appointment for — a checkup, a root canal, or something else?`,
    askName: `Can I have your full name, please?`,
    askPhone: `Thank you. And your mobile number, starting with zero three?`,
    askSlot: `These slots are open — {slots}. Which one works for you?`,
    noSlot: `The next few days are full. Shall I take your number and have the team call you?`,
    human: `I am connecting you to the clinic team. You can also call ${CLINIC.phone}.`,
    emergency: `Please call the clinic right now on ${CLINIC.phone}. If the bleeding or swelling is severe, go to the nearest emergency room.`,
    thanks: `Thank you — take care.`,
    greetBack: `I am well, thank you! Would you like to book an appointment, or ask about a treatment?`,
    fallback: `I can help with booking, timings, the address, or details of a treatment. What do you need?`,
    booked: `Done — {name}, you are booked for {treatment} on {when}. Reference {ref}. The team will confirm on WhatsApp.`,
  },
  ps: {
    greet: `السلام عليكم! TK Dent ته ښه راغلاست. زه عایشه یم. غواړئ وقت ونیسئ که د درملنې په اړه پوښتنه لرئ?`,
    hours: `کلینیک دوشنبې څخه شنبې پورې، سهار لس بجې څخه تر ماښام اوو بجو پورې خلاص دی. یکشنبه یوازې د وخت په اساس.`,
    address: `موږ د بني گالا، اسلام آباد، اکرم روډ، 34-C کور کې یو.`,
    askTreatment: `ښه. د کومې درملنې لپاره وخت غواړئ؟`,
    askName: `مهرباني وکړئ خپل بشپړ نوم ووایاست.`,
    askPhone: `مننه. اوس خپل موبایل نمبر ووایاست.`,
    askSlot: `دا وختونه خالي دي: {slots}. کوم یې ستاسو لپاره ښه دی?`,
    noSlot: `راتلونکې ورځې ډکې دي. نمبر ولیکم چې ټیم تاسو ته زنګ ووهي?`,
    human: `زه تاسو د کلینیک ټیم سره نښلوم. تاسو کولای شئ ${CLINIC.phone} ته زنګ ووهئ.`,
    emergency: `مهرباني وکړئ اوس ${CLINIC.phone} ته زنګ ووهئ. که وینه یا پړسوب ډیر وي، بیړني ځای ته لاړ شئ.`,
    thanks: `مننه، خدای پامان.`,
    greetBack: `زه ښه یم، مننه! غواړئ وخت ونیسئ که د درملنې په اړه پوښتنه لرئ?`,
    fallback: `زه کولای شم د وخت نیولو، ساعتونو، پتې یا درملنې په اړه مرسته وکړم.`,
    booked: `شو — {name}، تاسو د {when} لپاره {treatment} بک شوئ. ریفرنس {ref}.`,
  },
};

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
}

export async function* runMock({ history = [], lang = 'auto' }) {
  const userMessages = history.filter((m) => m.role === 'user').map((m) => m.content);
  const text = userMessages.at(-1) ?? '';
  const all = userMessages.join(' \n ');
  const L = lang === 'auto' ? pickLang(text) : lang;
  const c = COPY[L] ?? COPY.ur;

  let reply = c.fallback;
  let card;

  if (has(text, T.emergency)) {
    reply = c.emergency;
    const res = await runTool('escalate_to_human', { reason: text.slice(0, 120), urgency: 'emergency' });
    card = res.card;
  } else if (has(text, T.human)) {
    reply = c.human;
    const res = await runTool('escalate_to_human', { reason: 'Patient asked for the clinic team' });
    card = res.card;
  } else if (userMessages.some((m) => has(m, T.book))) {
    const phone = findPhone(all);
    const name = userMessages
      .map((m) => m.trim())
      .filter(
        (m) =>
          /^[A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF .]{2,39}$/.test(m) &&
          !has(m, T.book) &&
          !has(m, T.greet) &&
          !findTreatment(m) &&
          !findPhone(m),
      )
      .at(-1);
    const treatment = findTreatment(all);

    if (!treatment) reply = c.askTreatment;
    else if (!name) reply = c.askName;
    else if (!phone) reply = c.askPhone;
    else {
      const slots = suggestedSlots(2);
      if (!slots.length) reply = c.noSlot;
      else {
        // Demo shortcut: try the next few slots so a taken slot does not dead-end.
        let booked = null;
        for (const candidate of slots.slice(0, 6)) {
          const res = await runTool('book_appointment', {
            name: name.trim(),
            phone,
            treatment: treatment.id,
            slot_id: candidate.id,
            notes: 'Booked in demo mode',
          });
          if (res.ok) {
            booked = { res, slot: candidate };
            break;
          }
        }

        if (booked) {
          reply = fill(c.booked, {
            name: name.trim(),
            when: speakSlotIn(booked.slot.id, L),
            treatment: treatment.label,
            ref: booked.res.booking.id,
          });
          card = booked.res.card;
        } else {
          reply = c.noSlot;
        }
      }
    }
  } else if (has(text, T.hours)) reply = c.hours;
  else if (has(text, T.address)) reply = c.address;
  else if (has(text, T.price)) {
    const t = findTreatment(all);
    reply = t
      ? `${t.label}: ${t.price}.`
      : `Har treatment ka price consultation par confirm hota hai. Aap kis treatment ke baare mein poochna chahte hain?`;
  } else if (has(text, T.greet)) reply = userMessages.length > 1 ? c.greetBack : c.greet;
  else if (has(text, T.thanks)) reply = c.thanks;

  // Stream word by word so the widget exercises the same path as the real model.
  for (const word of reply.split(/(\s+)/)) {
    yield { type: 'delta', text: word };
    await new Promise((r) => setTimeout(r, 18));
  }
  if (card) yield { type: 'card', card };
  yield { type: 'done', text: reply, mock: true };
}
