function stripCodeFences(value) {
  return String(value || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function validateResults(value, expectedLength) {
  if (!value || !Array.isArray(value.results)) {
    throw new Error('The marking service returned an invalid result.');
  }
  if (value.results.length !== expectedLength) {
    throw new Error('The marking service returned the wrong number of results.');
  }
  return value.results.map((result, index) => ({
    index,
    assessment: ['Secure', 'Developing', 'Needs support'].includes(result.assessment)
      ? result.assessment
      : 'Developing',
    feedback: String(result.feedback || '').trim().slice(0, 300),
    evidence: String(result.evidence || '').trim().slice(0, 300)
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MARKING_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const { title, sections, vocabularyList, answers } = req.body || {};

  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is missing in Vercel.' });
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'No student answers were provided.' });
  }

  const readingText = (Array.isArray(sections) ? sections : [])
    .map(section => `${section.heading || ''}\n${section.content || ''}`)
    .join('\n\n');
  const vocabulary = (Array.isArray(vocabularyList) ? vocabularyList : [])
    .map(item => `${item.word}: ${item.definition}`)
    .join('\n');

  const responseList = answers.map((item, index) => ({
    index,
    type: item.type || 'question',
    question: item.question || '',
    studentAnswer: item.answer || ''
  }));

  const prompt = `You are an experienced Australian primary-school teacher assessing Stage 2 or Stage 3 reading comprehension.

Reading title: ${title || 'Reading'}

READING TEXT:
${readingText}

VOCABULARY SUPPORT:
${vocabulary}

STUDENT RESPONSES:
${JSON.stringify(responseList, null, 2)}

Assess each response conservatively and fairly using exactly one label:
- Secure: accurate, relevant and sufficiently supported for the question.
- Developing: partly correct or relevant, but incomplete, vague, unsupported, or containing a minor misconception.
- Needs support: incorrect, irrelevant, blank, or showing substantial misunderstanding.

For inferential, evaluative, author-purpose and summarising questions, reward reasonable answers supported by the text. Do not penalise spelling or grammar unless meaning is unclear. Keep feedback brief, specific and suitable for a teacher dashboard. Do not invent details not present in the reading.

Return ONLY valid JSON in this exact shape:
{"results":[{"index":0,"assessment":"Secure","feedback":"Brief explanation for the teacher.","evidence":"Key evidence or expected idea."}]}

Return exactly ${answers.length} result objects, in the same order as the responses.`;

  try {
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
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const raw = await response.text();
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(502).json({ error: 'The marking service returned an unreadable response.' });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: payload?.error?.message || 'Gemini marking request failed.'
      });
    }

    const text = payload?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('') || '';

    if (!text) return res.status(502).json({ error: 'The marking service returned no assessment.' });

    let parsed;
    try {
      parsed = JSON.parse(stripCodeFences(text));
    } catch {
      return res.status(502).json({ error: 'The marking service returned malformed JSON. Please try again.' });
    }

    return res.status(200).json({ data: validateResults(parsed, answers.length) });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected marking error.' });
  }
}
