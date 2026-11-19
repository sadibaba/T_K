/**
 * Keeps spoken replies short and free of the repetition a small model falls
 * into ("Your phone number? (e.g. 0301xxxxxxx) Your phone number is? …").
 *
 * It buffers a stream, releases complete sentences, drops sentences it has
 * already said, and stops after a couple of them. Everything here is about the
 * *voice* output — the widget still gets text as it arrives.
 */

const SENTENCE_END = /[.!?۔؟\n]+/;

function normalise(sentence) {
  return sentence
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createVoiceFilter({ maxSentences = 2, maxChars = 280 } = {}) {
  let buffer = '';
  let asked = false;
  const said = [];
  let chars = 0;

  function accept(sentence) {
    // Once a question has been asked the turn is over — say nothing more.
    if (asked) return '';
    // Parenthetical asides are stage directions, not speech.
    const clean = sentence.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    // Fragments that start with punctuation or contain no letters are noise.
    if (!/^[\p{L}\p{N}]/u.test(clean)) return '';
    if (!/\p{L}/u.test(clean)) return '';

    const isQuestion = /[?؟]\s*$/.test(clean);
    // One question per turn: a second question would just repeat the first.
    if (isQuestion && asked) return '';

    const key = normalise(clean);
    if (key.length < 2) return '';
    if (said.includes(key)) return '';
    if (said.length >= maxSentences) return '';
    if (chars + clean.length > maxChars && said.length > 0) return '';

    said.push(key);
    chars += clean.length;
    if (isQuestion) asked = true;
    return clean;
  }

  function drain(final) {
    const out = [];
    let index = 0;

    while (index < buffer.length) {
      const rest = buffer.slice(index);
      const match = rest.match(SENTENCE_END);

      // Release a clause early so speech can start sooner: a comma after enough
      // text is a natural pause in both Urdu and English.
      if (!match) {
        if (rest.length >= 30) {
          const comma = Math.max(rest.lastIndexOf('،', 60), rest.lastIndexOf(',', 60));
          if (comma >= 22) {
            const candidate = rest.slice(0, comma + 1);
            index += comma + 1;
            const accepted = accept(candidate);
            if (accepted) out.push(accepted);
            continue;
          }
        }
        break;
      }

      const end = index + match.index + match[0].length;
      const candidate = buffer.slice(index, end);
      index = end;

      const accepted = accept(candidate);
      if (accepted) out.push(accepted);
      // Ask, then stop. A second sentence after a question is where small
      // models start repeating themselves.
      if (asked || said.length >= maxSentences) {
        buffer = '';
        return out.join(' ');
      }
    }

    buffer = buffer.slice(index);

    if (final && buffer.trim()) {
      const accepted = accept(buffer);
      buffer = '';
      if (accepted) out.push(accepted);
    }

    return out.join(' ');
  }

  return {
    push(text) {
      buffer += text;
      return drain(false);
    },
    flush() {
      return drain(true);
    },
    get count() {
      return said.length;
    },
    get full() {
      return said.length >= maxSentences;
    },
  };
}
