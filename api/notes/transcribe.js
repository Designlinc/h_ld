// api/notes/transcribe.js — speech-to-text for the Notes editor.
//
// Two-step pipeline, matching FreeFlow's own approach (github.com/
// zachlatta/freeflow) — Groq for fast/cheap Whisper transcription, then a
// second Groq call to clean up the raw transcript (filler words, spelling,
// punctuation) using their published cleanup prompt. FreeFlow itself is a
// native Mac app, not something embeddable — this reimplements the same
// technique as a real in-app feature instead.
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { SPEECH_VOCABULARY } from '../../lib/speechVocabulary.js';

// Recorded voice notes are short (seconds to a couple of minutes) — this
// comfortably covers that with room to spare, matching the pattern already
// used for base64 file uploads elsewhere in this app.
export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
};

// FreeFlow's own published "simple cleanup" system prompt (MIT licensed,
// from their README) — used as-is rather than reinvented, since it's
// already a well-tested prompt for exactly this job.
const CLEANUP_PROMPT = `You are a dictation post-processor. You receive raw speech-to-text output and return clean, well-structured text ready to be typed into a clinical note.

Your job:
- Remove filler words (um, uh, you know, like) unless they carry meaning.
- Fix spelling, grammar, and punctuation errors.
- When the transcript already contains a word that is a close misspelling of a name or term from the context or custom vocabulary, correct the spelling. Never insert names or terms from context that the speaker did not say.
- Preserve the speaker's intent, tone, and meaning exactly.
- Above all: never drop or omit anything the speaker actually said. This includes references, names, numbers, and page numbers mentioned right before a quote — those stay in the output as ordinary text, on their own line if that helps separate them from the quote itself, but they must never be silently removed. Structure detection below is about how to lay content out, never a reason to leave content out.

Structure detection — this is important:
- If the speaker explicitly says something like "bullet point", "add a bullet list", "new bullet", or similar, format what follows as a bullet list item. Remove the spoken instruction phrase itself from the output — it's a command, not content.
- If the speaker explicitly says "new paragraph" or "new line", start a new paragraph at that point. Remove the instruction phrase itself.
- If the speaker says "quote" before a passage and "close quote" (or "end quote") after it — for example reading a line from a book or something someone else said — put the quoted passage on its own line(s), separate from any surrounding context, starting each of those lines with "> " (greater-than, space). Any lead-in the speaker said before "quote" (like a book title or page number) stays as normal text on its own separate line, not merged onto the same line as the quote marker. Remove the spoken "quote" / "close quote" instruction words themselves, they are not part of what's being quoted.
- Even WITHOUT an explicit command, if the speaker is clearly listing discrete items — for example "first... second... third...", or a run of short distinct items said in sequence (symptoms, medications, exercises, action items) — format that as a bullet list rather than one long run-on sentence, since that's what the structure actually is.
- Use your judgement on paragraph breaks for natural shifts in topic within longer dictation, the same way a person writing the note themselves would break it up.
- Ordinary continuous dictation with no list-like structure should stay as normal prose — do not force structure that isn't there.

Output format — use this simple convention, which gets converted to real formatting afterward:
- A bullet list item is its own line starting with "- " (dash, space).
- A quoted passage is its own line(s) starting with "> " (greater-than, space).
- A paragraph break is a single blank line between blocks of text.
- Do not use any other markdown (no headers, no bold, no numbered lists).

Also remove any trailing "stop recording" / "end recording" / "stop the recording" type phrase if the speaker said it to end their dictation — that's a command to the app, not part of the note.

Output rules:
- Return ONLY the cleaned transcript text, nothing else. So NEVER output words like "Here is the cleaned transcript text:"
- If the transcription is empty, return exactly: EMPTY
- Do not add words, names, or content that are not in the transcription. The context is only for correcting spelling of words already spoken.
- Do not change the meaning of what was said.`;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'Speech-to-text is not configured on this server — add GROQ_API_KEY to Vercel environment variables (free from groq.com)' });
  }

  const { audioDataUrl, category } = req.body || {};
  if (!audioDataUrl) return res.status(400).json({ error: 'Missing audioDataUrl' });

  const match = /^data:(.+?);base64,(.+)$/.exec(audioDataUrl);
  if (!match) return res.status(400).json({ error: 'audioDataUrl must be a base64 data URL' });
  const [, mimeType, base64] = match;

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return res.status(400).json({ error: 'Could not decode audio data' });
  }

  try {
    // ── Step 1: transcribe ──
    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : mimeType.includes('wav') ? 'wav' : 'webm';
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), `note.${ext}`);
    form.append('model', 'whisper-large-v3-turbo');

    const transcribeRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: form,
    });
    const transcribeData = await transcribeRes.json();
    if (!transcribeRes.ok) {
      throw new Error(transcribeData.error?.message || 'Transcription failed');
    }
    const rawText = (transcribeData.text || '').trim();
    if (!rawText) {
      return res.json({ ok: true, text: '' });
    }

    // ── Step 2: clean up, with discipline-specific vocabulary as context ──
    const vocabulary = SPEECH_VOCABULARY[category] || [];
    const userMessage = vocabulary.length
      ? `CUSTOM VOCABULARY (correct spelling toward these terms if the transcript contains a close match — never insert a term the speaker didn't say):\n${vocabulary.join(', ')}\n\nRAW_TRANSCRIPTION: "${rawText}"`
      : `RAW_TRANSCRIPTION: "${rawText}"`;

    const cleanupRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', // llama-3.1-8b-instant was deprecated by Groq (June 2026); using the larger/more capable current model here specifically for better instruction-following reliability — content dropped from a clinical note is a real problem, not just a formatting nuisance, and the cost difference for a short note is negligible either way
        messages: [
          { role: 'system', content: CLEANUP_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.2,
      }),
    });
    const cleanupData = await cleanupRes.json();
    if (!cleanupRes.ok) {
      throw new Error(cleanupData.error?.message || 'Cleanup failed');
    }
    let cleanText = (cleanupData.choices?.[0]?.message?.content || '').trim();
    if (cleanText === 'EMPTY') cleanText = '';

    return res.json({ ok: true, text: cleanText, raw: rawText });
  } catch (err) {
    console.error('Speech-to-text error:', err);
    return res.status(500).json({ error: err.message });
  }
}
