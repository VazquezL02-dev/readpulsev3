const response = await fetch('/api/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ prompt })
});

// Read as text first, because Vercel may sometimes return a plain-text error.
const rawResponse = await response.text();

let result;

try {
  result = JSON.parse(rawResponse);
} catch (parseError) {
  console.error('Non-JSON API response:', rawResponse);

  throw new Error(
    response.ok
      ? 'The server returned an unreadable response.'
      : 'The reading server encountered an error. Please try again.'
  );
}

if (!response.ok) {
  throw new Error(
    result.error ||
    result.message ||
    'Generation failed.'
  );
}

// The API now returns the completed reading inside result.data.
const parsed = result.data;

if (
  !parsed ||
  typeof parsed !== 'object' ||
  !Array.isArray(parsed.sections)
) {
  throw new Error('The server did not return a complete reading.');
}
