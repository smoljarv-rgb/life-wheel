const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ── LiqPay ──
const LIQPAY_PUBLIC  = process.env.LIQPAY_PUBLIC_KEY  || 'sandbox_i49225421155';
const LIQPAY_PRIVATE = process.env.LIQPAY_PRIVATE_KEY || 'sandbox_cPnao1O7fZrKyRPxEplDjdFTOWD2uO6hr43y7ECZ';

function liqpaySign(data){
  return crypto.createHash('sha1')
    .update(LIQPAY_PRIVATE + data + LIQPAY_PRIVATE)
    .digest('base64');
}
function liqpayEncode(obj){
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}
function liqpayDecode(str){
  try{ return JSON.parse(Buffer.from(str,'base64').toString('utf8')); }catch(e){ return null; }
}

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2025';
const DB_FILE = process.env.DB_FILE || path.join('/tmp', 'lifewheel_db.json');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/favicon.svg', function(req, res) {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" rx="18" fill="#0e0e1a"/><ellipse cx="40" cy="14" rx="7" ry="12" fill="#c4a882" opacity=".4" transform="rotate(0 40 40)"/><ellipse cx="40" cy="14" rx="7" ry="12" fill="#c4a882" opacity=".4" transform="rotate(60 40 40)"/><ellipse cx="40" cy="14" rx="7" ry="12" fill="#c4a882" opacity=".4" transform="rotate(120 40 40)"/><circle cx="40" cy="40" r="6" fill="#c4a882"/><circle cx="40" cy="40" r="2.5" fill="#0e0e1a"/></svg>');
});

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
      waitlist_enabled: true,
      counter_enabled: true,
      scale_visible: false,
      social_proof_enabled: false,
      liqpay_enabled: false,
      promo_codes: [],
    },
    reviews: [
      { text: "Підняв кар'єру з 4 до 8 за 2 місяці. AI-план реально допоміг зрозуміти що змінити.", author: "Олексій, 32", location: "Київ", active: true },
      { text: "Нарешті побачила де реально проблема. Здоров'я 2/10 — і я навіть не помічала.", author: "Наталія, 28", location: "Львів", active: true },
      { text: "Використовую з клієнтами як коуч. Дуже зручно — одразу видно де фокусуватись.", author: "Марина, 35", location: "Коуч ICF", active: true },
    ],
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

// ══════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════
app.post('/api/results/save', async (req, res) => {
  const { scores, analysis } = req.body;
  if (!scores) return res.status(400).json({ error: 'Missing scores' });

  // Генеруємо унікальний slug (6 символів)
  const slug = Math.random().toString(36).substring(2, 8);

  const { error } = await supabase
    .from('results')
    .insert([{ slug, scores, analysis }]);

  if (error) {
    console.error('Supabase error:', error);
    return res.status(500).json({ error: 'DB error' });
  }

  res.json({ ok: true, slug, url: `https://koleso.live/result/${slug}` });
});

// Stats маршрут МАЄ бути перед :slug щоб Express не плутав 'stats' як slug
app.get('/api/results/stats', async (req, res) => {
  const { data, error } = await supabase
    .from('results')
    .select('scores');
  if (error) return res.status(500).json({ error: 'DB error' });
  res.json({ total: data.length });
});

app.get('/api/results/:slug', async (req, res) => {
  const { slug } = req.params;

  const { data, error } = await supabase
    .from('results')
    .select('*')
    .eq('slug', slug)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) return res.status(404).json({ error: 'Not found' });

  res.json(data);
});

app.post('/api/subscribe', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const { email } = req.body;
  if (!email || !email.includes('@'))
    return res.status(400).json({ error: 'Invalid email' });

  const { error } = await supabase
    .from('subscribers')
    .insert([{ email }]);

  if (error && error.code !== '23505') {
    console.error('Supabase error:', error);
    return res.status(500).json({ error: 'DB error' });
  }

  // Відправляємо підтвердження на email
  try {
   await resend.emails.send({
  from: 'Володимир з Колеса Життя <noreply@koleso.live>',
  to: email,
  subject: 'Ти в списку очікування Колеса Життя',
  html: `
<!DOCTYPE html>
<html lang="uk">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
<tr><td>
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
  <tr><td style="padding:40px 40px 24px">
    <p style="margin:0 0 24px;font-size:15px;color:#333;line-height:1.7">Привіт!</p>
    <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.7">
      Мене звати Володимир, я розробляю Колесо Життя — інструмент для оцінки балансу 12 сфер з AI-аналізом.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.7">
      Ти залишив email і тепер у списку очікування. Я особисто напишу тобі коли відкриється повний доступ.
    </p>
    <p style="margin:0 0 32px;font-size:15px;color:#333;line-height:1.7">
      Поки що можеш безкоштовно оцінити своє колесо на сайті — просто натисни кнопку:
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 32px">
      <tr><td style="background:#22d3a0;border-radius:8px;padding:14px 28px">
        <a href="https://koleso.live" style="color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none">Відкрити Колесо Життя</a>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:15px;color:#333;line-height:1.7">З повагою,</p>
    <p style="margin:0 0 32px;font-size:15px;color:#333;font-weight:bold;line-height:1.7">Володимир</p>
    <hr style="border:none;border-top:1px solid #eeeeee;margin:0 0 20px">
    <p style="margin:0;font-size:12px;color:#999;line-height:1.6">
      Ти отримав цей лист тому що залишив email на <a href="https://koleso.live" style="color:#22d3a0">koleso.live</a>.<br>
      Якщо це була помилка — просто ігноруй цей лист.<br>
      <a href="https://koleso.live/unsubscribe?email=${email}" style="color:#999">Відписатись</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>
  `
});
  } catch(emailErr) {
    console.error('Resend error:', emailErr);
    // Не повертаємо помилку користувачу — email не критичний
  }

  // Зберігаємо локально для статистики
  const db = loadDB();
  if (!db.emails.find(e => e.email === email)) {
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
  const s = db.settings;
  res.json({
    price: s.price,
    paywall_enabled: s.paywall_enabled !== false,
    waitlist_enabled: s.waitlist_enabled !== false,
    counter_enabled: s.counter_enabled !== false,
    scale_visible: s.scale_visible === true,
    social_proof_enabled: s.social_proof_enabled === true,
    liqpay_enabled: s.liqpay_enabled === true,
    reviews: (db.reviews || []).filter(function(r){ return r.active !== false; }),
    ads: db.ads,
  });
});

// ══════════════════════════════════════════
//  SOCIAL PROOF (public)
// ══════════════════════════════════════════
app.get('/api/reviews', function(req, res) {
  const db = loadDB();
  const reviews = (db.reviews || []).filter(function(r){ return r.active !== false; });
  res.json({ reviews });
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

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'You are a JSON API. Respond ONLY with valid complete JSON. Never truncate. Never add comments or markdown.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 4000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: (data.error && data.error.message) || 'Groq error ' + response.status });

    const text = (data.choices?.[0]?.message?.content) || '';
    if (!text) return res.status(500).json({ error: 'Порожня відповідь від Groq' });

    try {
      const db = loadDB();
      db.events.push({ ts: Date.now(), type: 'analysis_completed', ip, data: {} });
      if (db.events.length > 10000) db.events = db.events.slice(-5000);
      saveDB(db);
    } catch(e) {}

    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: 'Помилка: ' + (err.message || String(err)) });
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

  const totalAssessments = countEvents('analysis_completed', 0);
  res.json({
    visitors: { today: uniqueIPs(now-day), week: uniqueIPs(now-7*day), total: uniqueIPs(0) },
    analyses: { today: countEvents('analysis_completed', now-day), total: totalAssessments },
    payments: { today: db.payments.filter(function(p){ return p.ts>=now-day; }).length, total: db.payments.length },
    revenue:  { today: revenueToday, month: revenueMonth, total: revenueTotal },
    emails: db.emails.length,
    totalAssessments,
    chart,
    settings: db.settings,
    ads: db.ads,
  });
});
app.post('/api/admin/broadcast', adminAuth, async function(req, res) {
  const { subject, html } = req.body;
  if (!subject || !html) return res.status(400).json({ error: 'Missing subject or html' });

  const { data: subscribers, error } = await supabase
    .from('subscribers')
    .select('email');

  if (error) return res.status(500).json({ error: 'DB error' });
  if (!subscribers.length) return res.json({ ok: true, sent: 0 });

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    try {
      await resend.emails.send({
        from: 'Колесо Життя <noreply@koleso.live>',
        to: sub.email,
        subject,
        html
      });
      sent++;
      // Затримка щоб не перевищити ліміт Resend
      await new Promise(r => setTimeout(r, 100));
    } catch(e) {
      failed++;
      console.error('Broadcast error for', sub.email, e);
    }
  }

  res.json({ ok: true, sent, failed });
});
app.get('/api/admin/emails', adminAuth, function(req, res) {
  const db = loadDB();
  res.json(db.emails.sort(function(a,b){ return b.ts-a.ts; }));
});

app.post('/api/admin/settings', adminAuth, function(req, res) {
  const db = loadDB();
  const { price, paywall_enabled, waitlist_enabled, counter_enabled,
          scale_visible, social_proof_enabled, liqpay_enabled, promo_codes } = req.body;
  if (price !== undefined) db.settings.price = parseFloat(price);
  if (paywall_enabled !== undefined) db.settings.paywall_enabled = !!paywall_enabled;
  if (waitlist_enabled !== undefined) db.settings.waitlist_enabled = !!waitlist_enabled;
  if (counter_enabled !== undefined) db.settings.counter_enabled = !!counter_enabled;
  if (scale_visible !== undefined) db.settings.scale_visible = !!scale_visible;
  if (social_proof_enabled !== undefined) db.settings.social_proof_enabled = !!social_proof_enabled;
  if (liqpay_enabled !== undefined) db.settings.liqpay_enabled = !!liqpay_enabled;
  if (promo_codes !== undefined) db.settings.promo_codes = promo_codes;
  saveDB(db);
  res.json({ ok: true });
});

app.get('/api/admin/social-proof', adminAuth, function(req, res) {
  const db = loadDB();
  res.json({ reviews: db.reviews || [] });
});

app.post('/api/admin/social-proof', adminAuth, function(req, res) {
  const db = loadDB();
  const { reviews } = req.body;
  if (!Array.isArray(reviews)) return res.status(400).json({ error: 'Invalid reviews' });
  db.reviews = reviews.map(function(r){
    return {
      text: String(r.text || '').slice(0, 500),
      author: String(r.author || '').slice(0, 100),
      location: String(r.location || '').slice(0, 100),
      active: r.active !== false,
    };
  });
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

app.post('/api/results/email', async (req, res) => {
  const { email, slug, url } = req.body;
  if (!email || !slug) return res.status(400).json({ error: 'Missing data' });

  try {
    await resend.emails.send({
      from: 'Володимир з Колеса Життя <noreply@koleso.live>',
      to: email,
      subject: 'Твій результат Колеса Життя',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0a0a0f;color:#f0f0f8;border-radius:16px">
          <h2 style="font-size:20px;margin-bottom:16px">🌀 Твій результат збережено!</h2>
          <p style="color:#8888a8;line-height:1.7;margin-bottom:24px">
            Ось твоє персональне посилання на результат Колеса Життя. Зберігається 30 днів.
          </p>
          <div style="margin:24px 0;padding:16px;background:#16161f;border-radius:12px;border-left:3px solid #22d3a0">
            <a href="${url}" style="color:#22d3a0;font-size:14px;word-break:break-all">${url}</a>
          </div>
          <a href="${url}" style="display:inline-block;padding:14px 28px;background:#22d3a0;color:#080810;font-weight:700;border-radius:10px;text-decoration:none;font-size:14px">Переглянути результат</a>
          <p style="color:#555570;font-size:12px;margin-top:32px">
            Колесо Життя · <a href="https://koleso.live" style="color:#22d3a0">koleso.live</a>
          </p>
        </div>
      `
    });
    res.json({ ok: true });
  } catch(e) {
    console.error('Email error:', e);
    res.status(500).json({ error: 'Email error' });
  }
});
// ── LiqPay: генерація форми оплати ──
const PLANS = {
  report:  { name: 'Одноразовий звіт Koleso.live', amount_uah: 99,   amount_usd: 2.49  },
  monthly: { name: 'PRO Місячний Koleso.live',      amount_uah: 249,  amount_usd: 5.99  },
  yearly:  { name: 'PRO Річний Koleso.live',         amount_uah: 1990, amount_usd: 49.99 },
};

app.post('/api/liqpay/checkout', (req, res) => {
  const { plan, currency, email } = req.body;
  const planData = PLANS[plan];
  if(!planData) return res.status(400).json({ error: 'Invalid plan' });

  const cur = (currency === 'usd') ? 'USD' : 'UAH';
  const amount = (currency === 'usd') ? planData.amount_usd : planData.amount_uah;
  const orderId = `kl_${plan}_${Date.now()}`;

  const params = {
    version:     '3',
    public_key:  LIQPAY_PUBLIC,
    action:      'pay',
    amount:      amount,
    currency:    cur,
    description: planData.name,
    order_id:    orderId,
    server_url:  'https://koleso.live/api/liqpay/callback',
    result_url:  'https://koleso.live/thank-you',
    language:    'uk',
  };
  if(email) params.customer = email;

  const data      = liqpayEncode(params);
  const signature = liqpaySign(data);

  res.json({ data, signature, action: 'https://www.liqpay.ua/api/3/checkout' });
});

// ── LiqPay: webhook після оплати ──
app.post('/api/liqpay/callback', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { data, signature } = req.body;
    if(!data || !signature) return res.sendStatus(400);

    // Перевірка підпису
    const expectedSig = liqpaySign(data);
    if(expectedSig !== signature){
      console.error('LiqPay: invalid signature');
      return res.sendStatus(403);
    }

    const payment = liqpayDecode(data);
    if(!payment) return res.sendStatus(400);

    console.log('LiqPay payment:', payment.status, payment.order_id, payment.amount, payment.currency);

    // Тільки успішні платежі
    if(payment.status !== 'success' && payment.status !== 'sandbox') {
      return res.sendStatus(200);
    }

    // Зберігаємо в db
    const planKey = payment.order_id.split('_')[1] || 'unknown';
    db.payments.push({
      ts:        Date.now(),
      order_id:  payment.order_id,
      plan:      planKey,
      amount:    payment.amount,
      currency:  payment.currency,
      email:     payment.sender_phone || payment.customer || '',
      status:    payment.status,
    });
    saveDb();

    // Надсилаємо лист з підтвердженням
    const email = payment.customer || payment.sender_phone;
    if(email && email.includes('@')){
      const planName = (PLANS[planKey] || {}).name || 'PRO доступ';
      try {
        await resend.emails.send({
          from: 'Колесо Життя <noreply@koleso.live>',
          to: email,
          subject: '✅ Оплата підтверджена — Koleso.live',
          html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0a0a0f;color:#f0f0f8;border-radius:16px">
            <h2 style="font-size:20px;margin-bottom:12px">✅ Оплату підтверджено!</h2>
            <p style="color:#8888a8;line-height:1.7;margin-bottom:16px">Дякуємо за покупку <strong style="color:#22d3a0">\${planName}</strong>.</p>
            <p style="color:#8888a8;line-height:1.7;margin-bottom:24px">Твій доступ активовано. Поверніться на сайт та пройди повний аналіз!</p>
            <a href="https://koleso.live" style="display:inline-block;padding:14px 28px;background:#22d3a0;color:#080810;font-weight:700;border-radius:10px;text-decoration:none;font-size:14px">Відкрити Колесо Життя →</a>
            <p style="color:#555570;font-size:12px;margin-top:32px">Koleso.live · <a href="https://koleso.live" style="color:#22d3a0">koleso.live</a></p>
          </div>`
        });
      } catch(e){ console.error('Email after payment error:', e); }
    }

    res.sendStatus(200);
  } catch(e){
    console.error('LiqPay callback error:', e);
    res.sendStatus(500);
  }
});

// ── /pricing сторінка ──
app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get('/pricing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pricing.html'));
});

// ── /thank-you сторінка ──
app.get('/thank-you', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'thank-you.html'));
});

app.get('/result/:slug', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'result.html'));
});

app.get('*', function(req, res) {
  res.send(fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'));
});

app.listen(PORT, function() {
  console.log('Колесо Життя на http://localhost:' + PORT);
  console.log('Адмін: http://localhost:' + PORT + '/admin');
});
