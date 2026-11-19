/**
 * TK Dent voice receptionist — embeddable widget.
 *
 *   <script src="https://your-voice-api.vercel.app/widget.js" data-api="https://your-voice-api.vercel.app" defer></script>
 *
 * No dependencies, no build step, styles live in a shadow root so nothing on
 * the host page can break it. Works with server STT/TTS when keys are present
 * and falls back to the browser's own speech APIs when they are not.
 */
(function () {
  'use strict';

  const script = document.currentScript;
  if (!script || window.__tkdentWidget) return;
  window.__tkdentWidget = true;

  const API = (script.dataset.api || new URL(script.src, location.href).origin).replace(/\/$/, '');
  const POSITION = script.dataset.position === 'left' ? 'left' : 'right';
  const START_LANG = ['ur', 'en', 'ps', 'auto'].includes(script.dataset.lang) ? script.dataset.lang : 'en';
  // Pashto is implemented end to end but switched off in the UI for now:
  //   data-langs="ur,en"        (default)
  //   data-langs="ur,en,ps"     to bring the پښتو pill back
  const LANGS = (script.dataset.langs || 'ur,en')
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
  const GREETING_UR = 'السلام علیکم! میں عائشہ ہوں، ٹی کے ڈینٹ کی ریسپشنسٹ۔ اپائنٹمنٹ بک کرنی ہے یا کسی علاج کے بارے میں پوچھنا ہے؟';
  const GREETING_EN = 'Assalam o alaikum! I am Ayesha, the TK Dent receptionist. Would you like to book an appointment, or ask about a treatment?';
  const greetingFor = (lang) => (lang === 'ur' ? GREETING_UR : GREETING_EN);

  const LANG_TAG = { ur: 'ur-PK', en: 'en-US', ps: 'ps-AF', auto: 'ur-PK' };

  const ICON = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/><path d="M9 11h6M9 14.5h4"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 10v4h3l4 3V7l-4 3H4Z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7 7 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 10v4h3l4 3V7l-4 3H4Z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 12a8 8 0 1 1 2.3 5.7"/><path d="M4 20v-5h5"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 3h3l2 5-2 1a12 12 0 0 0 6 6l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.2 1.2-1.7 1.2-.4 0-1 .1-3.2-.9-2.7-1.2-4.4-4-4.5-4.2-.1-.2-1.1-1.5-1.1-2.8 0-1.3.7-2 .9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2c.1.2.1.4 0 .6l-.4.5c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 1.6 1.1 1.9 1.2.2.1.4 0 .5-.1l.7-.8c.2-.2.3-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.6-.1 1.2Z"/></svg>',
  };

  const CSS = `
    :host {
      all: initial;
      --ink: #f7f3ea;
      --muted: #a7a29a;
      --gold: #d8b877;
      --gold-soft: rgba(216,184,119,.16);
      --panel: #0e2521;
      --panel-2: #14332c;
      --line: rgba(255,255,255,.09);
      position: fixed;
      bottom: 22px;
      ${POSITION}: 22px;
      z-index: 2147483000;
      font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Noto Nastaliq Urdu", sans-serif;
      color: var(--ink);
      -webkit-font-smoothing: antialiased;
      line-height: normal;
    }
    *, *::before, *::after { box-sizing: border-box; }
    .launcher {
      display: flex; align-items: center; gap: 10px;
      height: 54px; padding: 0 20px 0 16px; border-radius: 999px;
      background: linear-gradient(140deg, #16362f, #0a1f1b);
      border: 1px solid rgba(216,184,119,.45);
      color: var(--ink); font-size: 14px; letter-spacing: .01em;
      box-shadow: 0 18px 40px -18px rgba(0,0,0,.9), 0 0 0 1px rgba(216,184,119,.08) inset;
      cursor: pointer; transition: transform .18s ease, box-shadow .18s ease;
    }
    .launcher:hover { transform: translateY(-2px); box-shadow: 0 22px 46px -18px rgba(0,0,0,.95); }
    .launcher:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    .launcher svg { width: 22px; height: 22px; color: var(--gold); }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #6fcf97; box-shadow: 0 0 0 3px rgba(111,207,151,.18); }

    .panel {
      position: absolute; bottom: 0; ${POSITION}: 0;
      width: min(390px, calc(100vw - 32px));
      height: min(640px, calc(100vh - 40px));
      display: flex; flex-direction: column;
      background: linear-gradient(180deg, var(--panel), #081a17 72%);
      border: 1px solid rgba(216,184,119,.22);
      border-radius: 22px; overflow: hidden;
      box-shadow: 0 40px 80px -30px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.03) inset;
      opacity: 0; transform: translateY(14px) scale(.98); pointer-events: none;
      transition: opacity .2s ease, transform .24s cubic-bezier(.2,.9,.3,1);
    }
    .panel[data-open="true"] { opacity: 1; transform: none; pointer-events: auto; }

    header { padding: 16px 16px 12px; border-bottom: 1px solid var(--line); display: grid; gap: 12px; }
    .head-row { display: flex; align-items: center; gap: 10px; }
    .avatar {
      width: 38px; height: 38px; border-radius: 50%;
      background: radial-gradient(circle at 30% 25%, #f0dcb2, #b8934f);
      color: #17181b; display: grid; place-items: center;
      font-family: Georgia, "Times New Roman", serif; font-size: 16px; letter-spacing: .02em;
    }
    .who { flex: 1; min-width: 0; }
    .who b { display: block; font-family: Georgia, "Times New Roman", serif; font-size: 16px; font-weight: 500; letter-spacing: .01em; }
    .who span { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); letter-spacing: .04em; text-transform: uppercase; }
    .icon-btn {
      width: 34px; height: 34px; display: grid; place-items: center;
      background: transparent; border: 1px solid var(--line); border-radius: 50%;
      color: var(--muted); cursor: pointer; transition: color .15s, border-color .15s;
    }
    .icon-btn:hover { color: var(--ink); border-color: rgba(216,184,119,.4); }
    .icon-btn[aria-pressed="true"] { color: #e2b04a; border-color: rgba(226,176,74,.6); background: rgba(226,176,74,.1); }
    .icon-btn svg { width: 16px; height: 16px; }
    .badge {
      font-style: normal; white-space: nowrap; font-size: 9px; letter-spacing: .08em; padding: 2px 6px;
      border-radius: 5px; border: 1px solid rgba(216,184,119,.45); color: var(--gold);
      background: var(--gold-soft);
    }
    .langs { display: flex; gap: 6px; }
    .langs button {
      flex: 1; padding: 7px 0; font-size: 12px; letter-spacing: .02em;
      background: transparent; color: var(--muted);
      border: 1px solid var(--line); border-radius: 9px; cursor: pointer;
      transition: all .15s ease;
    }
    .langs button[hidden] { display: none; }
    .langs button[aria-pressed="true"] { background: var(--gold-soft); color: var(--gold); border-color: rgba(216,184,119,.45); }

    .stream { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 16px; display: flex; flex-direction: column; gap: 12px; scroll-behavior: smooth; }
    .stream::-webkit-scrollbar { width: 6px; }
    .stream::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 3px; }

    .msg { max-width: 88%; font-size: 14.5px; line-height: 1.55; word-break: break-word; }
    .msg.assistant {
      align-self: flex-start; padding: 11px 14px; border-radius: 14px 14px 14px 4px;
      background: var(--panel-2); border: 1px solid var(--line); color: var(--ink);
    }
    .msg.user {
      align-self: flex-end; padding: 11px 14px; border-radius: 14px 14px 4px 14px;
      background: linear-gradient(140deg, #e8d3a4, #c9a86a); color: #1a1a1d; font-weight: 500;
    }
    .msg[dir="rtl"] { text-align: right; }
    .msg .tail { margin-top: 6px; display: flex; gap: 10px; align-items: center; }
    .replay {
      background: none; border: 0; padding: 0; cursor: pointer; color: var(--gold);
      font-size: 11px; letter-spacing: .05em; text-transform: uppercase; display: inline-flex; align-items: center; gap: 5px;
    }
    .replay svg { width: 13px; height: 13px; }

    .typing { display: inline-flex; gap: 4px; padding: 4px 2px; }
    .typing i { width: 5px; height: 5px; border-radius: 50%; background: var(--gold); opacity: .35; animation: blink 1.2s infinite; }
    .typing i:nth-child(2) { animation-delay: .15s } .typing i:nth-child(3) { animation-delay: .3s }
    @keyframes blink { 0%,80%,100% { opacity: .25; transform: translateY(0) } 40% { opacity: 1; transform: translateY(-2px) } }

    .card { align-self: stretch; border-radius: 14px; border: 1px solid rgba(216,184,119,.35); background: rgba(216,184,119,.07); padding: 13px 14px; display: grid; gap: 9px; }
    .card h4 { margin: 0; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--gold); font-weight: 600; }
    .card dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px; }
    .card dt { color: var(--muted); }
    .card dd { margin: 0; }
    .card a {
      display: inline-flex; align-items: center; justify-content: center; gap: 7px;
      padding: 10px; border-radius: 10px; text-decoration: none; font-size: 13px; font-weight: 600;
      background: #1faa59; color: #fff;
    }
    .card a.call { background: transparent; border: 1px solid rgba(216,184,119,.5); color: var(--gold); }
    .card a svg { width: 15px; height: 15px; }
    .card p { margin: 0; font-size: 12px; color: var(--muted); }

    .quick { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 2px; }
    .quick button {
      padding: 8px 13px; border-radius: 999px; font-size: 12.5px; cursor: pointer;
      border: 1px solid rgba(216,184,119,.35); background: transparent; color: var(--gold);
      font-family: inherit;
    }
    .quick button:hover { background: var(--gold-soft); }
    .divider { align-self: center; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #6f6c66; margin: 2px 0; }

    .card.slots .days { display: grid; gap: 11px; }
    .card.slots .day { display: grid; gap: 7px; }
    .card.slots .day b { font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    .card.slots .times { display: flex; flex-wrap: wrap; gap: 7px; }
    .card.slots .times button {
      padding: 8px 13px; border-radius: 9px; font-size: 12.5px; cursor: pointer;
      border: 1px solid rgba(216,184,119,.35); background: transparent; color: var(--ink);
      font-family: inherit; transition: background .15s, color .15s;
    }
    .card.slots .times button:hover { background: var(--gold-soft); color: var(--gold); }
    .card.slots[data-done="true"] .times button { opacity: .3; pointer-events: none; }
    .card.slots .chosen { font-size: 12px; color: var(--gold); }

    .card.treatments .chips { display: flex; flex-wrap: wrap; gap: 7px; }
    .card.treatments .chips button {
      padding: 8px 13px; border-radius: 9px; font-size: 12.5px; cursor: pointer;
      border: 1px solid rgba(216,184,119,.35); background: transparent; color: var(--ink);
      font-family: inherit; transition: background .15s, color .15s;
    }
    .card.treatments .chips button:hover { background: var(--gold-soft); color: var(--gold); }
    .card.treatments[data-done="true"] .chips button { opacity: .3; pointer-events: none; }
    .card.treatments .chosen { font-size: 12px; color: var(--gold); }

    .composer { padding: 12px 14px 14px; border-top: 1px solid var(--line); display: grid; gap: 9px; }
    .input-row { display: flex; align-items: center; gap: 8px; }
    .field {
      flex: 1; height: 44px; padding: 0 14px; font-size: 14px;
      background: #0a1c19; color: var(--ink);
      border: 1px solid var(--line); border-radius: 12px; outline: none;
      font-family: inherit;
    }
    .field::placeholder { color: #6f7d77; }
    .field:focus { border-color: rgba(216,184,119,.45); }
    .round {
      width: 44px; height: 44px; flex: none; display: grid; place-items: center;
      border-radius: 12px; border: 1px solid var(--line); background: #0a1c19; color: var(--ink);
      cursor: pointer; transition: all .15s ease;
    }
    .round:hover { border-color: rgba(216,184,119,.45); color: var(--gold); }
    .round svg { width: 19px; height: 19px; }
    .round.mic[data-missing="true"] { opacity: .45; border-style: dashed; }
    .round.mic[data-rec="true"] { background: #b3261e; border-color: #b3261e; color: #fff; animation: pulse 1.4s infinite; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(179,38,30,.5) } 70% { box-shadow: 0 0 0 12px rgba(179,38,30,0) } 100% { box-shadow: 0 0 0 0 rgba(179,38,30,0) } }

    .status { min-height: 14px; font-size: 11px; letter-spacing: .05em; color: var(--muted); text-transform: uppercase; }
    .status[data-tone="warn"] { color: #e2b04a; }
    .status[data-tone="err"] { color: #e07a72; }
    .hint { font-size: 10.5px; color: #6f6c66; letter-spacing: .03em; }
    .hint a { color: #8d887f; }
    @media (max-width: 420px) {
      :host { bottom: 0; ${POSITION}: 0; }
      .panel { width: 100vw; height: 100dvh; border-radius: 0; ${POSITION}: 0; bottom: 0; }
      .launcher { margin: 16px; }
    }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  `;

  const root = document.createElement('div');
  root.className = 'root';
  root.setAttribute('part', 'root');

  const shadow = root.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <button class="launcher" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Open the TK Dent AI assistant">
      ${ICON.chat}
      <span>AI Assistant</span>
      <span class="dot" aria-hidden="true"></span>
    </button>
    <section class="panel" role="dialog" aria-modal="false" aria-label="TK Dent voice receptionist" data-open="false">
      <header>
        <div class="head-row">
          <div class="avatar" aria-hidden="true">A</div>
          <div class="who">
            <b>Ayesha · TK Dent</b>
            <span><i class="dot" aria-hidden="true"></i> AI assistant
              <em class="badge" hidden>demo voice</em></span>
          </div>
          <button class="icon-btn newchat" type="button" aria-label="Start a new conversation">${ICON.refresh}</button>
          <button class="icon-btn mute" type="button" aria-label="Mute the assistant" aria-pressed="false">${ICON.sound}</button>
          <button class="icon-btn close" type="button" aria-label="Close">${ICON.close}</button>
        </div>
        <div class="langs" role="group" aria-label="Reply language">
          <button type="button" data-lang="auto" aria-pressed="true">Auto</button>
          <button type="button" data-lang="ur" aria-pressed="false">اردو</button>
          <button type="button" data-lang="en" aria-pressed="false">English</button>
          <button type="button" data-lang="ps" aria-pressed="false">پښتو</button>
        </div>
      </header>
      <div class="stream" role="log" aria-live="polite" aria-relevant="additions text"></div>
      <div class="composer">
        <div class="input-row">
          <button class="round mic" type="button" aria-label="Talk to the assistant" data-rec="false">${ICON.mic}</button>
          <input class="field" type="text" inputmode="text" placeholder="Type, or tap the mic…" aria-label="Message">
          <button class="round send" type="button" aria-label="Send">${ICON.send}</button>
        </div>
        <div class="status" role="status"></div>
      </div>
    </section>
  `;

  shadow.append(style, wrap);
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(root), { once: true });
  if (document.readyState !== 'loading') document.body.appendChild(root);

  const el = {
    launcher: wrap.querySelector('.launcher'),
    panel: wrap.querySelector('.panel'),
    stream: wrap.querySelector('.stream'),
    field: wrap.querySelector('.field'),
    mic: wrap.querySelector('.mic'),
    send: wrap.querySelector('.send'),
    close: wrap.querySelector('.close'),
    mute: wrap.querySelector('.mute'),
    newchat: wrap.querySelector('.newchat'),
    status: wrap.querySelector('.status'),
    langs: [...wrap.querySelectorAll('.langs button')],
  };

  const state = {
    open: false,
    lang: START_LANG,
    muted: false,
    busy: false,
    recording: false,
    messages: [],
    provider: null,
    treatments: [],
    treatmentChosen: false,
    speech: { queue: [], playing: null, gen: 0 },
    recorder: null,
    recognizer: null,
    audioCtx: null,
  };

  /* ---------------------------------------------------------------- helpers */

  function setStatus(text, tone) {
    el.status.textContent = text || '';
    if (tone) el.status.dataset.tone = tone;
    else delete el.status.dataset.tone;
  }

  /** Only clear neutral status lines — errors stay until the next action. */
  function clearStatus() {
    if (!el.status.dataset.tone) setStatus('');
  }

  function scrollDown() {
    el.stream.scrollTop = el.stream.scrollHeight;
  }

  const CHAT_KEY = 'tkdent_chat_v1';
  const CHAT_TTL = 12 * 60 * 60 * 1000; // hours, so tomorrow starts fresh

  function saveChat() {
    try {
      localStorage.setItem(
        CHAT_KEY,
        JSON.stringify({
          messages: state.messages.slice(-20),
          lang: state.lang,
          treatmentChosen: state.treatmentChosen,
          at: Date.now(),
        }),
      );
    } catch {}
  }

  function loadChat() {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (!saved?.messages?.length) return null;
      if (Date.now() - Number(saved.at ?? 0) > CHAT_TTL) return null;
      return saved;
    } catch {
      return null;
    }
  }

  function clearChat() {
    try {
      localStorage.removeItem(CHAT_KEY);
    } catch {}
  }

  function isRtl(text) {
    return /[\u0600-\u06FF\u0750-\u077F]/.test(text);
  }

  function addBubble(role, text, { typing = false } = {}) {
    const bubble = document.createElement('div');
    bubble.className = `msg ${role}`;
    bubble.textContent = text;
    if (isRtl(text)) bubble.dir = 'rtl';
    if (typing) {
      const t = document.createElement('span');
      t.className = 'typing';
      t.innerHTML = '<i></i><i></i><i></i>';
      bubble.textContent = '';
      bubble.append(t);
    }
    el.stream.append(bubble);
    scrollDown();
    return bubble;
  }

  function setBubbleText(bubble, text) {
    bubble.textContent = text;
    if (isRtl(text)) bubble.dir = 'rtl';
    else bubble.removeAttribute('dir');
    scrollDown();
  }

  function addCard(card) {
    if (!card) return;
    const box = document.createElement('div');
    box.className = 'card';

    if (card.type === 'booking') {
      box.innerHTML = `
        <h4>Appointment confirmed</h4>
        <dl>
          <dt>Name</dt><dd></dd>
          <dt>When</dt><dd></dd>
          <dt>Treatment</dt><dd></dd>
          <dt>Ref</dt><dd></dd>
        </dl>
        <a href="#" target="_blank" rel="noopener">${ICON.wa} Confirm on WhatsApp</a>
        <p>No advance payment. The clinic confirms personally on WhatsApp.</p>`;
      const dd = box.querySelectorAll('dd');
      dd[0].textContent = card.name ?? '';
      dd[1].textContent = card.when ?? '';
      dd[2].textContent = card.treatment ?? '';
      dd[3].textContent = card.ref ?? '';
      box.querySelector('a').href = card.waLink ?? '#';
    } else if (card.type === 'slots') {
      box.classList.add('slots');
      const title = document.createElement('h4');
      title.textContent = 'Pick a time';
      box.append(title);

      const days = document.createElement('div');
      days.className = 'days';

      for (const day of card.days ?? []) {
        const row = document.createElement('div');
        row.className = 'day';

        const label = document.createElement('b');
        label.textContent = day.label;
        row.append(label);

        const times = document.createElement('div');
        times.className = 'times';

        for (const slot of day.times ?? []) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = slot.label;
          btn.dataset.slot = slot.id;
          btn.addEventListener('click', () => {
            if (box.dataset.done === 'true') return;
            box.dataset.done = 'true';
            const chosen = document.createElement('div');
            chosen.className = 'chosen';
            chosen.textContent = `Selected · ${day.label}, ${slot.label}`;
            box.append(chosen);
            send(`${day.label}, ${slot.label}`, { slotId: slot.id });
          });
          times.append(btn);
        }

        row.append(times);
        days.append(row);
      }

      box.append(days);

    } else if (card.type === 'treatments') {
      box.classList.add('treatments');
      const title = document.createElement('h4');
      title.textContent = 'Choose a treatment';
      box.append(title);

      const chips = document.createElement('div');
      chips.className = 'chips';

      for (const item of card.items ?? []) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = item.label;
        btn.addEventListener('click', () => {
          if (box.dataset.done === 'true') return;
          box.dataset.done = 'true';
          state.treatmentChosen = true;
          const chosen = document.createElement('div');
          chosen.className = 'chosen';
          chosen.textContent = `Selected · ${item.label}`;
          box.append(chosen);
          send(item.label);
        });
        chips.append(btn);
      }

      box.append(chips);

    } else if (card.type === 'handoff') {
      box.innerHTML = `
        <h4>${card.urgency === 'emergency' ? 'Call the clinic now' : 'Team will call you'}</h4>
        <p></p>
        <a class="call" href="#">${ICON.phone} Call the clinic</a>
        <a href="#" target="_blank" rel="noopener">${ICON.wa} WhatsApp</a>`;
      box.querySelector('p').textContent = card.reason || 'A team member will pick this up during clinic hours.';
      box.querySelector('a.call').href = card.tel ?? '#';
      box.querySelectorAll('a')[1].href = card.waLink ?? '#';
    } else {
      return;
    }

    el.stream.append(box);
    scrollDown();
  }

  /* ------------------------------------------------------------------ speech */

  function stopSpeech() {
    state.speech.gen += 1;
    for (const item of state.speech.queue) {
      if (item.audio) {
        try {
          item.audio.pause();
          item.audio.removeAttribute('src');
        } catch {}
      }
      if (!item.remote && item.url) URL.revokeObjectURL(item.url);
    }
    state.speech.queue = [];
    if (state.speech.playing) {
      try {
        state.speech.playing.pause();
        state.speech.playing.removeAttribute('src');
      } catch {}
      state.speech.playing = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (state.recording) setStatus('Listening…');
    else clearStatus();
  }

  function browserSpeak(text, lang) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG_TAG[lang || state.lang] || 'ur-PK';
    u.rate = 1.02;
    u.pitch = 1.03;
    const voices = synth.getVoices();
    const match =
      voices.find((v) => v.lang === u.lang) ||
      voices.find((v) => v.lang?.startsWith(u.lang.slice(0, 2)));
    if (match) u.voice = match;
    synth.speak(u);
  }

  /**
   * The free voice plan allows only two concurrent streams, so we load the item
   * that is about to play plus exactly one ahead — enough to remove the gap
   * between sentences without tripping the limit.
   */
  function ensureLoaded(item) {
    if (item.audio) return item.audio;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = item.url;
    try {
      audio.load();
    } catch {}
    item.audio = audio;
    return audio;
  }

  function queueAudio(url, { remote = false, text = '', lang = 'ur' } = {}) {
    const item = { audio: null, url, remote, text, lang };
    state.speech.queue.push(item);
    // Prime the queue: the first item loads now, the rest when their turn nears.
    if (state.speech.queue.length === 1 && !state.speech.playing) ensureLoaded(item);
  }

  function playNext(gen) {
    if (gen !== state.speech.gen) return;
    const next = state.speech.queue.shift();
    if (!next) {
      state.speech.playing = null;
      if (!state.busy) clearStatus();
      return;
    }

    const audio = ensureLoaded(next);
    state.speech.playing = audio;
    if (state.speech.queue[0]) ensureLoaded(state.speech.queue[0]);

    audio.onended = () => {
      if (!next.remote) URL.revokeObjectURL(next.url);
      playNext(gen);
    };
    audio.onerror = () => {
      if (!next.remote) URL.revokeObjectURL(next.url);
      // Never swap to a different voice mid-conversation; report it instead.
      setStatus('Voice is busy — tap PLAY AGAIN', 'warn');
      playNext(gen);
    };

    audio.play().catch((err) => {
      if (err?.name === 'NotAllowedError') {
        state.speech.playing = null;
        state.speech.queue.unshift(next);
        setStatus('Tap anywhere for sound', 'warn');
        document.addEventListener(
          'click',
          () => {
            setStatus('');
            playNext(gen);
          },
          { once: true },
        );
        return;
      }
      if (!next.remote) URL.revokeObjectURL(next.url);
      playNext(gen);
    });
  }

  /** Which voice should read this reply? Script detection beats a sticky hint. */
  function ttsLangFor(text) {
    if (state.lang !== 'auto') return state.lang;
    if (/[\u06AB\u0689\u0693\u0696\u069A\u067C\u0699\u0681\u0685]/.test(text)) return 'ps';
    if (/[\u0600-\u06FF]/.test(text)) return 'ur';
    return 'en';
  }

  function speak(text) {
    const clean = String(text || '').trim();
    if (!clean || state.muted) return Promise.resolve();

    state.speech.chain = (state.speech.chain || Promise.resolve())
      .then(() => speakOne(clean))
      .catch(() => {});
    return state.speech.chain;
  }

  async function speakOne(clean) {
    if (state.muted) return;
    const gen = state.speech.gen;
    const lang = ttsLangFor(clean);

    if (!state.provider?.providers?.tts) {
      browserSpeak(clean, lang);
      return;
    }

    if (state.provider.providers.tts === 'elevenlabs') {
      const url = `${API}/api/tts?t=${encodeURIComponent(clean)}&l=${lang}&stream=1`;
      queueAudio(url, { remote: true, text: clean, lang });
      if (!state.speech.playing) playNext(gen);
      return;
    }

    try {
      const res = await fetch(`${API}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, lang }),
      });
      if (gen !== state.speech.gen) return;
      if (!res.ok) throw new Error(`tts ${res.status}`);
      const blobUrl = URL.createObjectURL(await res.blob());
      if (gen !== state.speech.gen) {
        URL.revokeObjectURL(blobUrl);
        return;
      }
      queueAudio(blobUrl, { text: clean, lang });
      if (!state.speech.playing) playNext(gen);
    } catch {
      // Stay silent rather than change voice.
      setStatus('Voice is busy — tap PLAY AGAIN', 'warn');
    }
  }

  /** Split a growing stream into speakable sentences. */
  function sentenceSplitter() {
    let buffer = '';
    return {
      push(text, flush = false) {
        buffer += text;
        const out = [];

        // Start speaking on the first clause instead of waiting for a full stop.
        if (!flush && buffer.length >= 26) {
          const comma = Math.max(buffer.lastIndexOf('،', 60), buffer.lastIndexOf(',', 60));
          if (comma >= 20) {
            out.push(buffer.slice(0, comma + 1).trim());
            buffer = buffer.slice(comma + 1);
          }
        }

        const re = /[^.!?۔؟\n]+[.!?۔؟\n]+/g;
        let match;
        let last = 0;
        while ((match = re.exec(buffer))) {
          const s = match[0].trim();
          if (s.length < 12 && !flush) break;
          out.push(s);
          last = re.lastIndex;
        }
        buffer = buffer.slice(last);
        if (flush && buffer.trim()) {
          out.push(buffer.trim());
          buffer = '';
        }
        return out;
      },
      get empty() {
        return buffer.trim().length === 0;
      },
    };
  }

  /* -------------------------------------------------------------------- chat */

  async function send(text, { slotId } = {}) {
    const clean = String(text || '').trim();
    if (!clean || state.busy) return;

    stopSpeech();
    state.busy = true;
    el.send.disabled = true;
    el.field.value = '';

    addBubble('user', clean);
    state.messages.push({ role: 'user', content: clean });
    saveChat();

    const bubble = addBubble('assistant', '', { typing: true });
    let assistantText = '';
    let failed = false;
    let pendingSlots = null;
    let splitter = sentenceSplitter();
    setStatus('Thinking…');

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: state.messages.slice(-20),
          lang: state.lang,
          ...(slotId ? { selectedSlot: slotId } : {}),
        }),
      });

      if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;

          let event;
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }

          if (event.type === 'delta') {
            assistantText += event.text;
            setBubbleText(bubble, assistantText);
            bubble.classList.remove('typing');
            for (const s of splitter.push(event.text)) speak(s);
          } else if (event.type === 'tool') {
            setStatus(event.name === 'book_appointment' ? 'Booking…' : 'Checking…');
          } else if (event.type === 'card') {
            // Show the pickers only when the bot is actually asking about a time
            // or a treatment — not while it is still collecting name and phone.
            if (event.card.type === 'slots' || event.card.type === 'treatments') {
              pendingSlots = event.card;
            } else {
              addCard(event.card);
            }
          } else if (event.type === 'reset') {
            assistantText = '';
            setBubbleText(bubble, '');
            splitter = sentenceSplitter();
            stopSpeech();
          } else if (event.type === 'done') {
            if (event.error) failed = true;
            for (const s of splitter.push('', true)) speak(s);
            if (pendingSlots && !/name|نام|phone|فون|نمبر|number/i.test(assistantText)) {
              addCard(pendingSlots);
            }
            pendingSlots = null;
          }
        }
      }

      if (!assistantText.trim()) {
        setBubbleText(bubble, 'Sorry — I could not answer that. Please try again.');
      } else if (!failed) {
        state.messages.push({ role: 'assistant', content: assistantText });
        addReplay(bubble, assistantText);
        saveChat();

        // The bot just asked which treatment — put the list in front of the
        // patient instead of making them type it.
        if (
          !state.treatmentChosen &&
          state.treatments?.length &&
          /treatment|علاج|درملن/i.test(assistantText) &&
          /[?؟]/.test(assistantText) &&
          !el.stream.querySelector('.card.treatments:not([data-done="true"])')
        ) {
          addCard({ type: 'treatments', items: state.treatments });
        }
      }
    } catch (err) {
      console.error('[tkdent-widget]', err);
      setBubbleText(bubble, 'Connection problem. Please check your internet, or call the clinic on 0312 3329479.');
      setStatus('Offline', 'err');
    } finally {
      state.busy = false;
      el.send.disabled = false;
      if (el.status.textContent === 'Thinking…' || el.status.textContent === 'Checking…' || el.status.textContent === 'Booking…') {
        clearStatus();
      }
      el.field.focus({ preventScroll: true });
    }
  }

  function showQuickReplies() {
    if (el.stream.querySelector('.quick')) return;
    const row = document.createElement('div');
    row.className = 'quick';
    const options =
      state.lang === 'ur'
        ? ['اپائنٹمنٹ بک کریں', 'اوقات', 'قیمتیں', 'ڈاکٹر سے بات']
        : ['Book an appointment', 'Timings', 'Treatments & prices', 'Talk to a person'];

    for (const label of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        row.remove();
        send(label);
      });
      row.append(btn);
    }
    el.stream.append(row);
    scrollDown();
  }

  function addReplay(bubble, text) {
    if (bubble.querySelector('.tail')) return;
    const tail = document.createElement('div');
    tail.className = 'tail';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'replay';
    btn.innerHTML = `${ICON.sound} Play again`;
    btn.addEventListener('click', () => {
      stopSpeech();
      speak(text);
    });
    tail.append(btn);
    bubble.append(tail);
  }

  /* ------------------------------------------------------------------ speech */

  async function rms(analyser, data) {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  }

  async function ensureAudioCtx() {
    if (!state.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      state.audioCtx = new Ctx();
    }
    if (state.audioCtx.state === 'suspended') await state.audioCtx.resume();
    return state.audioCtx;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function pickMime() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return candidates.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
  }

  /** Can this browser record or recognise speech at all? */
  function voiceCapability() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (state.provider?.providers?.stt) {
      return navigator.mediaDevices?.getUserMedia ? 'server' : 'insecure';
    }
    return SR ? 'browser' : 'none';
  }

  function voiceUnavailable(kind) {
    el.mic.dataset.missing = 'true';
    if (kind === 'insecure') {
      setStatus('Mic needs https or localhost', 'err');
      return;
    }
    setStatus('Voice needs Chrome — or a free Groq key', 'err');
    if (!state.warnedVoice) {
      state.warnedVoice = true;
      addBubble(
        'assistant',
        'Is browser mein voice input support nahi hai. Chrome/Edge kholo, ya free Groq key daal do — phir mic har browser mein chalega. Abhi ke liye type kar ke baat kar sakte ho.',
      );
    }
  }

  async function startRecording() {
    if (state.recording || state.busy) return;

    // Check the voice path *before* stopping playback, otherwise a failed mic
    // tap looks like the audio "disappeared".
    const capability = voiceCapability();
    if (capability !== 'server' && capability !== 'browser') {
      voiceUnavailable(capability);
      return;
    }

    stopSpeech();
    delete el.mic.dataset.missing;

    if (capability === 'browser') {
      return startBrowserRecognition();
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setStatus('Mic permission denied', 'err');
      return;
    }

    state.recording = true;
    el.mic.dataset.rec = 'true';
    setStatus('Listening…');

    const mime = pickMime();
    const chunks = [];
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    state.recorder = recorder;
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start(120);

    const ctx = await ensureAudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    const startedAt = Date.now();
    let quietSince = 0;
    let spoke = false;

    const tick = setInterval(async () => {
      const level = await rms(analyser, data);
      if (level > 0.03) {
        spoke = true;
        quietSince = 0;
      } else if (spoke) {
        quietSince ||= Date.now();
      }
      const elapsed = Date.now() - startedAt;
      // Stop ~900 ms after speech ends; give up after 9 s of total silence, and
      // never record more than 20 s.
      if ((spoke && quietSince && Date.now() - quietSince > 900) || elapsed > 20_000) {
        stopRecording();
      } else if (!spoke && elapsed > 9_000) {
        stopRecording();
      }
    }, 100);

    function stopRecording() {
      clearInterval(tick);
      if (!state.recording) return;
      state.recording = false;
      el.mic.dataset.rec = 'false';
      try {
        recorder.stop();
      } catch {}
      stream.getTracks().forEach((t) => t.stop());
      source.disconnect();
      setStatus('Transcribing…');
    }

    recorder.onstop = async () => {
      // Nothing was said at all — do not ship a silent clip to Whisper.
      if (!spoke) {
        setStatus('Did not hear anything — try again', 'warn');
        return;
      }
      const blob = new Blob(chunks, { type: mime || 'audio/webm' });
      if (blob.size < 1500) {
        setStatus('Did not catch that — try again', 'warn');
        return;
      }
      try {
        const text = await transcribeBlob(blob);
        if (text) send(text);
        else setStatus('Did not catch that — try again', 'warn');
      } catch {
        setStatus('Transcription failed', 'err');
      }
    };
  }

  async function transcribeBlob(blob) {
    const audio = await blobToBase64(blob);
    const res = await fetch(`${API}/api/stt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio, mime: blob.type, lang: state.lang }),
    });
    if (!res.ok) throw new Error(`stt ${res.status}`);
    const { text } = await res.json();
    return String(text || '').trim();
  }

  /** Chrome/Edge fallback: no key, no upload, needs HTTPS + internet. */
  function startBrowserRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setStatus('Voice needs Chrome or a configured key', 'err');
      return;
    }

    const rec = new SR();
    state.recognizer = rec;
    state.recording = true;
    el.mic.dataset.rec = 'true';
    setStatus('Listening…');

    rec.lang = LANG_TAG[state.lang];
    rec.interimResults = true;
    // Continuous keeps Chrome from hanging up the moment the patient pauses;
    // we close it ourselves after a short silence.
    rec.continuous = true;
    rec.maxAlternatives = 1;

    let finalText = '';
    let silenceTimer = null;
    let sawSpeech = false;

    const armSilenceTimer = () => {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        try {
          rec.stop();
        } catch {}
      }, sawSpeech ? 1600 : 6000);
    };

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      sawSpeech = true;
      el.field.value = (finalText + interim).trim();
      armSilenceTimer();
    };

    rec.onerror = (e) => {
      const messages = {
        'not-allowed': 'Mic permission denied — allow it in the browser',
        'service-not-allowed': 'Mic blocked by the browser',
        'no-speech': 'Did not hear anything — try again',
        network: 'Speech service needs internet',
        'audio-capture': 'No microphone found',
        'language-not-supported': 'This language needs the Groq key',
      };
      setStatus(messages[e.error] ?? 'Microphone error', 'err');
    };

    rec.onend = () => {
      clearTimeout(silenceTimer);
      state.recording = false;
      el.mic.dataset.rec = 'false';
      const text = (finalText || el.field.value).trim();
      if (text) send(text);
      else if (!el.status.dataset.tone) setStatus('Did not catch that — try again', 'warn');
    };

    try {
      rec.start();
      armSilenceTimer();
    } catch {
      state.recording = false;
      el.mic.dataset.rec = 'false';
      setStatus('Could not start the microphone', 'err');
    }
  }

  function toggleMic() {
    if (state.recording) {
      if (state.recorder?.state === 'recording') state.recorder.stop();
      else state.recognizer?.stop?.();
      return;
    }
    if (state.speech.playing || window.speechSynthesis?.speaking) {
      stopSpeech();
    }
    startRecording();
  }

  /* ---------------------------------------------------------------- lifecycle */

  async function loadProvider() {
    if (state.provider) return state.provider;
    try {
      state.provider = await (await fetch(`${API}/api/health`)).json();
    } catch {
      state.provider = { providers: {} };
    }
    state.treatments = Array.isArray(state.provider?.treatments) ? state.provider.treatments : state.treatments;

    const badge = wrap.querySelector('.badge');
    if (badge && state.provider?.providers?.tts === 'demo') {
      badge.textContent = 'demo voice';
      badge.hidden = false;
    }
    return state.provider;
  }

  async function open() {
    if (state.open) return;
    state.open = true;
    el.panel.dataset.open = 'true';
    el.launcher.setAttribute('aria-expanded', 'true');
    el.launcher.style.display = 'none';
    el.field.focus({ preventScroll: true });

    await loadProvider();

    if (!state.messages.length) {
      const saved = loadChat();
      if (saved) {
        state.messages = saved.messages;
        state.treatmentChosen = Boolean(saved.treatmentChosen);
        if (saved.lang && saved.lang !== state.lang) {
          state.lang = saved.lang;
          const btn = el.langs.find((b) => b.dataset.lang === saved.lang);
          if (btn) el.langs.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        }

        const divider = document.createElement('div');
        divider.className = 'divider';
        divider.textContent = 'Earlier conversation';
        el.stream.append(divider);

        for (const message of state.messages) {
          const bubble = addBubble(message.role, message.content);
          if (message.role === 'assistant') addReplay(bubble, message.content);
        }
        setStatus('Continuing your earlier conversation');
      } else {
        const greet = greetingFor(state.lang);
        const bubble = addBubble('assistant', greet);
        addReplay(bubble, greet);
        state.messages.push({ role: 'assistant', content: greet });
        showQuickReplies();
        // No auto-speak: the patient reads it and hears a reply only after they
        // send something (or tap "Play again").
        setStatus('Type or tap the mic to start');
      }
    }
  }

  function close() {
    state.open = false;
    el.panel.dataset.open = 'false';
    el.launcher.setAttribute('aria-expanded', 'false');
    el.launcher.style.display = '';
    stopSpeech();
    state.recognizer?.stop?.();
    state.recorder?.stop?.();
  }

  el.launcher.addEventListener('click', open);
  setTimeout(loadProvider, 0);
  el.close.addEventListener('click', close);
  el.newchat.addEventListener('click', () => {
    clearChat();
    stopSpeech();
    state.messages = [];
    state.treatmentChosen = false;
    el.stream.innerHTML = '';
    const greet = greetingFor(state.lang);
    const bubble = addBubble('assistant', greet);
    addReplay(bubble, greet);
    state.messages.push({ role: 'assistant', content: greet });
    showQuickReplies();
    setStatus('New conversation');
    el.field.focus({ preventScroll: true });
  });
  el.send.addEventListener('click', () => send(el.field.value));
  el.field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(el.field.value);
    }
  });
  el.mic.addEventListener('click', toggleMic);

  el.mute.addEventListener('click', () => {
    state.muted = !state.muted;
    el.mute.setAttribute('aria-pressed', String(state.muted));
    el.mute.innerHTML = state.muted ? ICON.mute : ICON.sound;
    el.mute.setAttribute('aria-label', state.muted ? 'Unmute the assistant' : 'Mute the assistant');
    if (state.muted) {
      stopSpeech();
      setStatus('Sound off — tap the speaker to unmute', 'warn');
    } else {
      clearStatus();
      const last = [...state.messages].reverse().find((m) => m.role === 'assistant');
      if (last) speak(last.content);
    }
  });

  // Hide languages that are not enabled — the code keeps working if re-enabled.
  el.langs.forEach((btn) => {
    if (btn.dataset.lang !== 'auto' && !LANGS.includes(btn.dataset.lang)) btn.hidden = true;
  });

  const LANG_LABEL = { en: 'English', ur: 'اردو', ps: 'پښتو', auto: 'Auto' };
  const LANG_PLACEHOLDER = {
    en: 'Type, or tap the mic…',
    ur: 'لکھیں، یا مائیک دبائیں…',
    ps: 'ولیکل یا مایک کېکاږئ…',
    auto: 'Type, or tap the mic…',
  };

  el.langs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.lang;
      if (state.lang === next) return;
      state.lang = next;

      el.langs.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      el.field.placeholder = LANG_PLACEHOLDER[next];
      setStatus(`Reply language: ${LANG_LABEL[next]}`);
      saveChat();

      // Nothing said yet? Swap the greeting so the change is immediately audible.
      if (state.open && state.messages.length <= 1) {
        const greet = greetingFor(next);
        stopSpeech();
        state.messages = [];
        el.stream.innerHTML = '';
        const bubble = addBubble('assistant', greet);
        addReplay(bubble, greet);
        state.messages.push({ role: 'assistant', content: greet });
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.open) close();
  });

  // Expose a tiny API so the host page can drive it (e.g. a "Book" button).
  window.TKDentVoice = {
    open,
    close,
    ask: (text) => {
      if (!state.open) open();
      send(text);
    },
    language: (lang) => {
      const btn = el.langs.find((b) => b.dataset.lang === lang);
      if (btn) btn.click();
    },
  };
})();
