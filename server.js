const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiting ──
const rateMap = new Map();
function rateLimit(ip, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count <= max;
}

// ── Groq API proxy ──
app.post('/api/analyze', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  if (!rateLimit(ip)) {
    return res.status(429).json({ error: 'Забагато запитів. Спробуйте за хвилину.' });
  }

  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Відсутній prompt' });
  }
  if (prompt.length > 4000) {
    return res.status(400).json({ error: 'Запит надто довгий' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY не налаштовано на сервері' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a JSON API. Always respond with valid JSON only. No markdown, no explanation, no text before or after JSON.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Groq error:', JSON.stringify(data));
      const msg = data?.error?.message || 'Помилка Groq API';
      return res.status(response.status).json({ error: msg });
    }

    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) {
      return res.status(500).json({ error: 'Порожня відповідь від Groq' });
    }

    res.json({ text });

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Помилка сервера: ' + err.message });
  }
});

// ── SPA fallback ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Колесо Життя (Groq) запущено на http://localhost:${PORT}`);
});
