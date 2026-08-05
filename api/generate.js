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
            enum: [
              'literal',
              'inferential',
              'vocabulary',
              'author purpose',
              'evaluative',
              'summarising'
            ]
          },
          question: { type: 'string' }
        },
        required: ['type', 'question']
      }
    }
  },
  required: [
    'title',
    'readingTimeMinutes',
    'sections',
    'vocabularyList',
    'comprehensionQuestions'
  ]
};

function stripCodeFences(value) {
  return String(value || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function validateReading(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Gemini returned an invalid reading object.');
  }

  if (typeof value.title !== 'string' || !value.title.trim()) {
    throw new Error('Gemini did not return a title.');
  }

  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    throw new Error('Gemini did not return reading sections.');
  }

  if (!Array.isArray(value.vocabularyList)) {
    throw new Error('Gemini did not return a vocabulary list.');
  }

  if (!Array.isArray(value.comprehensionQuestions)) {
    throw new Error('Gemini did not return comprehension questions.');
  }

  return value;
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function callGemini({ apiKey, model, prompt }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema: readingSchema
        }
      })
    }
  );

  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  return {
    response,
    payload
  };
}

async function generateWithRetry({ apiKey, model, prompt }) {
  const maximumAttempts = 3;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const result = await callGemini({
      apiKey,
      model,
      prompt
    });

    if (result.response.ok) {
      return result.payload;
    }

    const message =
      result.payload?.error?.message ||
      `Gemini request failed with status ${result.response.status}.`;

    if (
      !isRetryableStatus(result.response.status) ||
      attempt === maximumAttempts
    ) {
      const error = new Error(message);
      error.status = result.response.status;
      throw error;
    }

    // 1.2 seconds, then roughly 2.4 seconds, with a little randomness.
    const delay =
      1200 * Math.pow(2, attempt - 1) +
      Math.floor(Math.random() * 500);

    await wait(delay);
  }

  throw new Error('Gemini generation failed.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed.'
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const preferredModel =
    process.env.GEMINI_MODEL || 'gemini-3.5-flash';

  const fallbackModel =
    process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

  const prompt = req.body?.prompt;

  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is missing in Vercel.'
    });
  }

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({
      error: 'A prompt is required.'
    });
  }

  try {
    let payload;

    try {
      payload = await generateWithRetry({
        apiKey,
        model: preferredModel,
        prompt
      });
    } catch (primaryError) {
      const shouldTryFallback =
        preferredModel !== fallbackModel &&
        isRetryableStatus(primaryError.status || 500);

      if (!shouldTryFallback) {
        throw primaryError;
      }

      console.warn(
        `Primary Gemini model failed. Trying ${fallbackModel}.`,
        primaryError.message
      );

      payload = await generateWithRetry({
        apiKey,
        model: fallbackModel,
        prompt
      });
    }

    const text =
      payload?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || '')
        .join('') || '';

    if (!text) {
      return res.status(502).json({
        error: 'Gemini returned no reading content.'
      });
    }

    let reading;

    try {
      reading = validateReading(
        JSON.parse(stripCodeFences(text))
      );
    } catch (parseError) {
      console.error(
        'Gemini JSON parse error:',
        parseError.message,
        text.slice(0, 1000)
      );

      return res.status(502).json({
        error:
          'The reading could not be prepared correctly. Please press Generate again.',
        details: parseError.message
      });
    }

    return res.status(200).json({
      data: reading
    });
  } catch (error) {
    console.error('Generation error:', error);

    const temporary =
      isRetryableStatus(error.status || 500) ||
      /high demand|overloaded|unavailable/i.test(error.message || '');

    return res.status(temporary ? 503 : 500).json({
      error: temporary
        ? 'The reading generator is busy at the moment. Please wait a few seconds and try again.'
        : error.message || 'Unexpected generation error.'
    });
  }
}
