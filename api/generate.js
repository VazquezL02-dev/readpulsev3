const readingSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    readingTimeMinutes: { type: 'integer', minimum: 1, maximum: 30 },
    sections: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['heading', 'content']
      }
    },
    vocabularyList: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: { type: 'string' },
          definition: { type: 'string' }
        },
        required: ['word', 'definition']
      }
    },
    comprehensionQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['literal', 'inferential', 'vocabulary', 'author purpose', 'evaluative', 'summarising']
          },
          question: { type: 'string' }
        },
        required: ['type', 'question']
      }
    }
  },
  required: ['title', 'readingTimeMinutes', 'sections', 'vocabularyList', 'comprehensionQuestions']
};

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function validateReading(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Gemini returned an invalid reading object.');
  if (typeof value.title !== 'string' || !value.title.trim()) throw new Error('Gemini did not return a title.');
  if (!Array.isArray(value.sections) || value.sections.length === 0) throw new Error('Gemini did not return reading sections.');
  if (!Array.isArray(value.vocabularyList)) throw new Error('Gemini did not return a vocabulary list.');
  if (!Array.isArray(value.comprehensionQuestions)) throw new Error('Gemini did not return comprehension questions.');
  return value;
}

async function requestGemini(apiKey, model, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema: readingSchema
        }
      })
    }
  );

  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error(`Gemini returned a non-JSON server response (${response.status}).`), { status: response.status });
  }

  if (!response.ok) {
    throw Object.assign(
      new Error(payload?.error?.message || `Gemini request failed (${response.status}).`),
      { status: response.status }
    );
  }
  return payload;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const prompt = req.body?.prompt;

  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is missing in Vercel.' });
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'A prompt is required.' });

  try {
    let payload;
    let lastError;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        payload = await requestGemini(apiKey, model, prompt);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const retryable = error.status === 429 || error.status === 503 || error.status === 500;
        if (!retryable || attempt === 2) break;
        await wait(1000 * (2 ** attempt));
      }
    }

    if (lastError) throw lastError;

    const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    if (!text) return res.status(502).json({ error: 'Gemini returned no reading content.' });

    let reading;
    try {
      reading = validateReading(JSON.parse(text));
    } catch (error) {
      console.error('Gemini JSON parse error:', error.message, text.slice(0, 1000));
      return res.status(502).json({ error: 'The generated reading was incomplete. Please press Generate again.' });
    }

    return res.status(200).json({ data: reading });
  } catch (error) {
    console.error('Generation error:', error);
    const status = error.status === 429 || error.status === 503 ? 503 : 500;
    return res.status(status).json({
      error: status === 503
        ? 'The reading generator is busy right now. Please wait a few seconds and try again.'
        : (error.message || 'Unexpected generation error.')
    });
  }
}
