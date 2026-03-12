const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2025';
const DB_FILE = process.env.DB_FILE || path.join('/tmp', 'lifewheel_db.json');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ══════════════════════════════════════════
//  DATABASE (JSON file)
// ══════════════════════════════════════════
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {}
  return {
    events: [],
    emails: [],
    payments: [],
    settings: {
      price: 2,
      paywall_enabled: true,
      promo_codes: [],
    },
    ads: {
      after_analysis: { enabled: false, type: 'banner', title: '', text: '', url: '', image: '', adsense_code: '' },
      sidebar:        { enabled: false, type: 'banner', title: '', text: '', url: '', image: '', adsense_code: '' },
      bottom_banner:  { enabled: false, type: 'banner', title: '', text: '', url: '', image: '', adsense_code: '' },
      native_reco:    { enabled: false, type: 'native',  title: '', text: '', url: '', image: '', adsense_code: '' },
    }
  };
}

function saveDB(db) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) {}
}

// ══════════════════════════════════════════
//  RATE LIMITING
// ══════════════════════════════════════════
const rateMap = new Map();
function rateLimit(ip, max, windowMs) {
  max = max || 20; windowMs = windowMs || 60000;
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count <= max;
}

// ══════════════════════════════════════════
//  ADMIN AUTH
// ══════════════════════════════════════════
function adminAuth(req, res, next) {
  const auth = req.headers['x-admin-password'] || req.query.p;
  if (auth === ADMIN_PASSWORD) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ══════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════
app.post('/api/track', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const { type, data } = req.body;
  if (!type) return res.json({ ok: true });
  const db = loadDB();
  db.events.push({ ts: Date.now(), type, ip, data: data || {} });
  if (db.events.length > 10000) db.events = db.events.slice(-5000);
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/subscribe', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });
  const db = loadDB();
  if (!db.emails.find(function(e){ return e.email === email; })) {
    db.emails.push({ ts: Date.now(), email, ip });
    saveDB(db);
  }
  res.json({ ok: true });
});

app.post('/api/payment', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const db = loadDB();
  const amount = db.settings.price || 2;
  db.payments.push({ ts: Date.now(), ip, amount });
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/promo', (req, res) => {
  const { code } = req.body;
  const db = loadDB();
  const promo = (db.settings.promo_codes || []).find(function(p){
    return p.code && p.code.toLowerCase() === (code || '').toLowerCase() && p.enabled !== false;
  });
  if (!promo) return res.json({ valid: false });
  if (promo.max_uses && promo.uses >= promo.max_uses) return res.json({ valid: false, reason: 'expired' });
  res.json({ valid: true, discount: promo.discount, free: promo.discount >= 100 });
});

app.post('/api/promo/use', (req, res) => {
  const { code } = req.body;
  const db = loadDB();
  const promo = (db.settings.promo_codes || []).find(function(p){
    return p.code && p.code.toLowerCase() === (code || '').toLowerCase();
  });
  if (promo) { promo.uses = (promo.uses || 0) + 1; saveDB(db); }
  res.json({ ok: true });
});

app.get('/api/config', (req, res) => {
  const db = loadDB();
  res.json({ price: db.settings.price, paywall_enabled: db.settings.paywall_enabled, ads: db.ads });
});

// ══════════════════════════════════════════
//  GROQ KEY (browser-side direct calls)
// ══════════════════════════════════════════
app.get('/api/groq-key', (req, res) => {
  const key = process.env.GROQ_API_KEY || '';
  if (!key) return res.status(500).json({ error: 'Key not set' });
  res.json({ key });
});

// ══════════════════════════════════════════
//  GROQ AI PROXY (fallback)
// ══════════════════════════════════════════
app.post('/api/analyze', async function(req, res) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (!rateLimit(ip)) return res.status(429).json({ error: 'Забагато запитів. Спробуйте за хвилину.' });

  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Відсутній prompt' });
  if (prompt.length > 8000) return res.status(400).json({ error: 'Запит надто довгий' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY не налаштовано' });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    // Use streaming to avoid Vercel 10s timeout on hobby plan
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a JSON API. Respond ONLY with valid complete JSON. Never truncate. Never add comments or markdown.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 4000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        stream: true,
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      res.write(`data: ${JSON.stringify({ error: (errData.error && errData.error.message) || 'Groq error ' + response.status })}\n\n`);
      return res.end();
    }

    let fullText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            // Send keepalive ping every ~500 chars to prevent timeout
            if (fullText.length % 500 < delta.length) {
              res.write(': ping\n\n');
            }
          }
        } catch (e) {}
      }
    }

    const db = loadDB();
    db.events.push({ ts: Date.now(), type: 'analysis_completed', ip, data: {} });
    if (db.events.length > 10000) db.events = db.events.slice(-5000);
    saveDB(db);

    res.write(`data: ${JSON.stringify({ text: fullText })}\n\n`);
    res.end();
  } catch (err) {
    try {
      res.write(`data: ${JSON.stringify({ error: 'Помилка сервера: ' + err.message })}\n\n`);
      res.end();
    } catch(e) {}
  }
});

// ══════════════════════════════════════════
//  ADMIN API
// ══════════════════════════════════════════
app.get('/api/admin/stats', adminAuth, function(req, res) {
  const db = loadDB();
  const now = Date.now();
  const day = 86400000;

  function countEvents(type, since) {
    return db.events.filter(function(e){ return e.type === type && e.ts >= since; }).length;
  }
  function uniqueIPs(since) {
    return new Set(db.events.filter(function(e){ return e.ts >= since; }).map(function(e){ return e.ip; })).size;
  }

  const revenueTotal = db.payments.reduce(function(s,p){ return s + (p.amount||0); }, 0);
  const revenueMonth = db.payments.filter(function(p){ return p.ts >= now - 30*day; }).reduce(function(s,p){ return s+(p.amount||0); }, 0);
  const revenueToday = db.payments.filter(function(p){ return p.ts >= now - day; }).reduce(function(s,p){ return s+(p.amount||0); }, 0);

  const chart = [];
  for (let i = 13; i >= 0; i--) {
    const from = now - (i+1)*day;
    const to = now - i*day;
    const date = new Date(to).toLocaleDateString('uk-UA', { day:'2-digit', month:'2-digit' });
    chart.push({
      date,
      visitors: new Set(db.events.filter(function(e){ return e.ts>=from && e.ts<to; }).map(function(e){ return e.ip; })).size,
      analyses: db.events.filter(function(e){ return e.ts>=from && e.ts<to && e.type==='analysis_completed'; }).length,
      payments: db.payments.filter(function(p){ return p.ts>=from && p.ts<to; }).length,
    });
  }

  res.json({
    visitors: { today: uniqueIPs(now-day), week: uniqueIPs(now-7*day), total: uniqueIPs(0) },
    analyses: { today: countEvents('analysis_completed', now-day), total: countEvents('analysis_completed', 0) },
    payments: { today: db.payments.filter(function(p){ return p.ts>=now-day; }).length, total: db.payments.length },
    revenue:  { today: revenueToday, month: revenueMonth, total: revenueTotal },
    emails: db.emails.length,
    chart,
    settings: db.settings,
    ads: db.ads,
  });
});

app.get('/api/admin/emails', adminAuth, function(req, res) {
  const db = loadDB();
  res.json(db.emails.sort(function(a,b){ return b.ts-a.ts; }));
});

app.post('/api/admin/settings', adminAuth, function(req, res) {
  const db = loadDB();
  const { price, paywall_enabled, promo_codes } = req.body;
  if (price !== undefined) db.settings.price = parseFloat(price);
  if (paywall_enabled !== undefined) db.settings.paywall_enabled = !!paywall_enabled;
  if (promo_codes !== undefined) db.settings.promo_codes = promo_codes;
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/admin/ads', adminAuth, function(req, res) {
  const db = loadDB();
  const { slot, ad } = req.body;
  if (!slot || !db.ads[slot]) return res.status(400).json({ error: 'Unknown slot' });
  db.ads[slot] = Object.assign({}, db.ads[slot], ad);
  saveDB(db);
  res.json({ ok: true });
});

app.get('/admin', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, function() {
  console.log('Колесо Життя на http://localhost:' + PORT);
  console.log('Адмін: http://localhost:' + PORT + '/admin');
});
