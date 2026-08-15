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
const CLEANUP_PROMPT = `You are a dictation post-processor. You receive raw speech-to-text output and return clean text ready to be typed into an application.

Your job:
- Remove filler words (um, uh, you know, like) unless they carry meaning.
- Fix spelling, grammar, and punctuation errors.
- When the transcript already contains a word that is a close misspelling of a name or term from the context or custom vocabulary, correct the spelling. Never insert names or terms from context that the speaker did not say.
- Preserve the speaker's intent, tone, and meaning exactly.

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

  const match = /^data:([^;]+);base64,(.+)$/.exec(audioDataUrl);
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
        model: 'llama-3.1-8b-instant',
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
