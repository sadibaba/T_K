/**
 * The agent loop: model -> tool -> model, streamed as events so the widget can
 * speak the first sentence while the rest is still being generated.
 *
 * Events:
 *   { type: 'delta', text }        partial assistant text
 *   { type: 'tool', name }         a tool is running (UI hint)
 *   { type: 'card', card }         booking / handoff card for the UI
 *   { type: 'done', text }         final assistant text
 *   { type: 'error', message }     something failed; `text` is the spoken apology
 */
import { buildSystemPrompt } from './clinic.mjs';
import { mergeToolCalls, streamChat } from './llm.mjs';
import { prettyNow } from './schedule.mjs';
import { TOOL_SCHEMAS, runTool } from './tools.mjs';
import { createVoiceFilter } from './voicefilter.mjs';

/**
 * Keep up to fifty messages, but never more than ~3,000 characters, so a long
 * conversation cannot blow the free token budget.
 */
function recentTurns(history, maxMessages = 20, maxChars = 3000) {
  const out = [];
  let chars = 0;

  for (let i = history.length - 1; i >= 0 && out.length < maxMessages; i -= 1) {
    const message = history[i];
    const content = String(message.content ?? '').slice(0, 200);
    if (chars + content.length > maxChars && out.length >= 8) break;
    out.unshift({ role: message.role, content });
    chars += content.length;
  }
  return out;
}

export async function* runAgent({ history = [], lang = 'auto', replyScript = '', selectedSlot = '', maxSteps = 3 }) {
  const messages = [
    { role: 'system', content: buildSystemPrompt({ lang, nowLocal: prettyNow(), replyScript }) },
    // Ten turns keeps a whole booking in context (name, phone, treatment, the
    // slot that was offered) while staying inside the free tier's token budget.
    ...recentTurns(history, 20, 3000),
  ];

  // The slot the patient tapped in the picker — no guessing needed.
  if (selectedSlot) {
    messages.push({
      role: 'system',
      content: `The patient just tapped slot_id ${selectedSlot} in the picker. Use exactly this slot_id for book_appointment once you have name, phone and treatment.`,
    });
  }

  // Details the patient already gave should never be asked for twice.
  const said = history.map((m) => String(m.content ?? '')).join(' \n ');
  const phone = said.match(/(?:\+92|0)\d{9,10}/);
  if (phone) {
    messages.push({
      role: 'system',
      content: `The patient already gave the phone number ${phone[0]}. Do not ask for it again.`,
    });
  }

  let spoken = '';

  for (let step = 0; step < maxSteps; step += 1) {
    let text = '';
    let emitted = '';
    let toolCalls = [];
    let finishReason;
    // Small models sometimes ask the same question five times in a row. The
    // filter keeps the first two sentences and drops repeats.
    const filter = createVoiceFilter();

    // Last attempt runs without tools, so the model must speak instead of
    // calling tools forever. Booking tools stay hidden until a phone number
    // exists, which stops it jumping to the diary mid-collection.
    const tools =
      step === maxSteps - 1
        ? undefined
        : TOOL_SCHEMAS.filter(
            (tool) =>
              Boolean(phone) ||
              !['get_availability', 'book_appointment'].includes(tool.function.name),
          );

    for await (const chunk of streamChat(messages, {
      tools,
      maxTokens: 350,
      temperature: 0.35,
    })) {
      if (chunk.content) {
        text += chunk.content;
        const piece = filter.push(chunk.content);
        if (piece) {
          emitted += (emitted ? ' ' : '') + piece;
          yield { type: 'delta', text: piece };
        }
      }
      if (chunk.toolCallDeltas) toolCalls = mergeToolCalls(toolCalls, chunk.toolCallDeltas);
      if (chunk.finishReason) finishReason = chunk.finishReason;
    }

    const tail = filter.flush();
    if (tail) {
      emitted += (emitted ? ' ' : '') + tail;
      yield { type: 'delta', text: tail };
    }

    toolCalls = toolCalls.filter(Boolean);

    // If the model spoke and then decided to call a tool, that speech was a
    // preamble. Tell the widget to clear it so the answer is not said twice.
    if (toolCalls.length && emitted) {
      emitted = '';
      yield { type: 'reset' };
    }

    if (spoken) break; // a tool produced the final line — nothing left to ask

    // Only the last step is spoken as the answer; a preamble before a tool call
    // would otherwise be read out twice.
    if (!toolCalls.length) {
      spoken = emitted || text;
      break;
    }

    messages.push({
      role: 'assistant',
      content: text || null,
      tool_calls: toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.function.name, arguments: c.function.arguments || '{}' },
      })),
    });

    for (const call of toolCalls) {
      const name = call.function.name;
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }

      yield { type: 'tool', name };

      let result;
      try {
        result = await runTool(name, args, { lang });
      } catch (err) {
        console.error('[tool]', name, err?.message);
        result = {
          ok: false,
          speak: 'I could not complete that just now. I am noting your number so the team can call you back.',
        };
      }

      if (result.card) yield { type: 'card', card: result.card };

      // Tools may return a fixed, safety-critical line (emergencies). Speak it
      // verbatim instead of asking the model to paraphrase.
      if (result.final && result.speak) {
        spoken = result.speak;
        yield { type: 'delta', text: result.speak };
        break;
      }

      // Only structured data goes to the model. The human-readable `speak`
      // string made gpt-oss echo it back three or four times.
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify({
          ok: result.ok,
          ...(result.reason ? { reason: result.reason } : {}),
          data: result.booking
            ? {
                id: result.booking.id,
                when: result.booking.when,
                name: result.booking.name,
                treatment: result.booking.treatmentLabel,
              }
            : (result.days ?? null),
        }),
      });
    }

    // Tool round produced no user-facing text yet — the next loop iteration
    // streams the model's spoken confirmation.
    if (step === maxSteps - 1 && finishReason) break;
  }

  const finalText = spoken.trim();
  if (!finalText) {
    yield {
      type: 'delta',
      text: 'Sorry, I did not catch that. Could you say it again?',
    };
    spoken = 'Sorry, I did not catch that. Could you say it again?';
  }

  yield { type: 'done', text: spoken.trim() };
}
