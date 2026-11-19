/**
 * Answers to the questions a receptionist hears every day. Only facts that are
 * safe to state without a clinician; anything policy-like defers to the team.
 */
export const FAQ = [
  {
    id: 'location',
    answerUr: 'ہاؤس 34-سی، اکرم روڈ، بنی گالہ، اسلام آباد — بنی گالہ کی مین روڈ سے ذرا اندر، پرسکون گلی میں۔',
    keys: ['where', 'address', 'location', 'kahan', 'pata', 'jaga', 'ایڈریس', 'کہاں', 'پتہ', 'ځای'],
    answer:
      'House 34-C, Akram Road, Bani Gala, Islamabad — a quiet lane just off the main Bani Gala road.',
  },
  {
    id: 'parking',
    answerUr: 'اکرم روڈ پر گلی میں پارکنگ عام طور پر دستیاب ہوتی ہے، صبح کے وقت آسانی رہتی ہے۔',
    keys: ['parking', 'park', 'gaari', 'car', 'گاڑی', 'پارکنگ'],
    answer: 'Street parking on Akram Road is usually free; mornings are the easiest time to find a spot.',
  },
  {
    id: 'hours',
    answerUr: 'پیر سے ہفتے تک، صبح 10 سے شام 7 بجے تک۔ اتوار صرف اپائنٹمنٹ پر۔',
    keys: ['hours', 'timing', 'open', 'close', 'band', 'khulta', 'اوقات', 'وقت', 'کھلتا', 'بند'],
    answer: 'Monday to Saturday, 10:00 AM to 7:00 PM. Sunday is by appointment only.',
  },
  {
    id: 'first-visit',
    answerUr: 'شناختی کارڈ اور پرانی ایکس رے یا رپورٹس ساتھ لائیں۔ اگر کوئی دوا باقاعدگی سے لیتے ہیں تو اس کی فہرست لائیں۔',
    keys: ['first visit', 'pehli baar', 'bring', 'cnid', 'documents', 'پہلی بار', 'کیا لانا'],
    answer:
      'Bring your CNIC and any previous X-rays or reports. If you take regular medicines, a list helps the doctor.',
  },
  {
    id: 'children',
    answerUr: 'بچے خوش آمدید — ان کے ساتھ والدین یا سرپرست رہیں۔',
    keys: ['child', 'kids', 'bachay', 'bacha', 'بچے', 'بچہ'],
    answer: 'Children are welcome — a parent or guardian should stay with them during the visit.',
  },
  {
    id: 'payment',
    answerUr: 'ادائیگی وزٹ کے بعد کلینک پر ہوتی ہے۔ ٹیم کال پر طریقے بتا دے گی۔',
    keys: ['payment', 'pay', 'cash', 'card', 'easypaisa', 'jazzcash', 'paise', 'پیسے', 'ادائیگی'],
    answer: 'Payment is settled at the clinic after the visit. The team will confirm the accepted methods when they call.',
  },
  {
    id: 'insurance',
    answerUr: 'اپنی انشورنس کے بارے میں ٹیم سے پوچھیں — میں آپ کا نمبر دے دیتی ہوں، وہ تصدیق کر دیں گے۔',
    keys: ['insurance', 'panel', 'claim', 'انشورنس'],
    answer: 'Please ask the team about your insurance panel — I can pass your number on and they will confirm.',
  },
  {
    id: 'pain',
    answerUr: 'مجھے افسوس ہے کہ تکلیف ہے۔ ڈاکٹر کو دیکھنا ضروری ہے؛ میں جلد سے جلد وقت دے سکتی ہوں، یا شدید ہو تو 0312 3329479 پر کال کریں۔',
    keys: ['pain', 'hurt', 'dard', 'درد', 'تکلیف'],
    answer:
      'I am sorry it is hurting. The doctor needs to see it; I can book the earliest slot, or call the clinic on 0312 3329479 if it is severe.',
  },
  {
    id: 'kids-braces',
    answerUr: 'بریکس یا الائنرز کا فیصلہ ڈاکٹر دانت اور بائٹ دیکھ کر کرتے ہیں، عام طور پر نوعمری کے بعد۔',
    keys: ['braces age', 'aligners age', 'age', 'عمر'],
    answer: 'Braces and aligners are planned after the doctor sees the teeth and the bite, usually from the teenage years onwards.',
  },
  {
    id: 'duration',
    answerUr: 'چیک اپ تقریباً بیس منٹ لیتا ہے، جبکہ روٹ کینال یا امپلانٹ کا مشورہ پینتالیس سے نوے منٹ۔',
    keys: ['how long', 'duration', 'kitna time', 'کتنا وقت'],
    answer: 'A checkup takes about twenty minutes; treatments such as a root canal or an implant consultation run forty-five to ninety minutes.',
  },
  {
    id: 'results',
    answerUr: 'ویب سائٹ پر پہلے اور بعد کی تصاویر موجود ہیں، اور ڈاکٹر مشورے میں ایسے کیس دکھا سکتے ہیں۔',
    keys: ['before after', 'photos', 'result', 'pehle baad', 'نتائج'],
    answer: 'Before-and-after photographs of treated patients are on the website, and the doctor can show similar cases at the consultation.',
  },
];

/** Answer in the language the patient is using. */
export function faqAnswer(item, lang = 'ur') {
  if (!item) return '';
  return lang === 'ur' ? item.answerUr || item.answer : item.answer;
}

export function findFaq(text) {
  const value = String(text ?? '').toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const item of FAQ) {
    const score = item.keys.reduce((total, key) => (value.includes(key.toLowerCase()) ? total + key.length : total), 0);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

export const FAQ_FOR_PROMPT = FAQ.map((f) => `- ${f.id}: ${f.answer}`).join('\n');
