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
          responseMimeType: 'application/json',
          maxOutputTokens: 8192
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'Gemini request failed.' });
    }

    const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    if (!text) return res.status(502).json({ error: 'Gemini returned no text.' });
    return res.status(200).json({ text });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected generation error.' });
  }
}
