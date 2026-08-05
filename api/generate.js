const readingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    readingTimeMinutes: { type: 'integer', minimum: 1, maximum: 30 },
    sections: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
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
        additionalProperties: false,
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
        additionalProperties: false,
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

function stripCodeFences(value) {
  return String(value || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function validateReading(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Gemini returned an invalid reading object.');
  if (typeof value.title !== 'string' || !value.title.trim()) throw new Error('Gemini did not return a title.');
  if (!Array.isArray(value.sections) || value.sections.length === 0) throw new Error('Gemini did not return reading sections.');
  if (!Array.isArray(value.vocabularyList)) throw new Error('Gemini did not return a vocabulary list.');
  if (!Array.isArray(value.comprehensionQuestions)) throw new Error('Gemini did not return comprehension questions.');
  return value;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const prompt = req.body?.prompt;

  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is missing in Vercel.' });
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'A prompt is required.' });

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 8192,
          responseFormat: {
            text: {
              mimeType: 'APPLICATION_JSON',
              schema: readingSchema
            }
          }
        }
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: payload?.error?.message || 'Gemini request failed.' });
    }

    const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    if (!text) return res.status(502).json({ error: 'Gemini returned no text.' });

    let reading;
    try {
      reading = validateReading(JSON.parse(stripCodeFences(text)));
    } catch (parseError) {
      console.error('Gemini JSON parse error:', parseError.message, text.slice(0, 1000));
      return res.status(502).json({
        error: 'Gemini returned a malformed reading. Please press Generate again.',
        details: parseError.message
      });
    }

    return res.status(200).json({ data: reading });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected generation error.' });
  }
}
