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

// ── WayForPay ──
const WFP_MERCHANT  = process.env.WAYFORPAY_MERCHANT || 'koleso_live';
const WFP_SECRET    = process.env.WAYFORPAY_SECRET   || '';
const WFP_PASSWORD  = process.env.WAYFORPAY_PASSWORD || '';

function wfpSign(params){
  const str = params.join(';');
  return crypto.createHmac('md5', WFP_SECRET).update(str).digest('hex');
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
const DEFAULT_REVIEWS = [
  { text: "Підняв кар'єру з 4 до 8 за 2 місяці. AI-план реально допоміг зрозуміти що змінити.", author: "Олексій, 32", location: "Київ", active: true },
  { text: "Нарешті побачила де реально проблема. Здоров'я 2/10 — і я навіть не помічала.", author: "Наталія, 28", location: "Львів", active: true },
  { text: "Використовую з клієнтами як коуч. Дуже зручно — одразу видно де фокусуватись.", author: "Марина, 35", location: "Коуч ICF", active: true },
];

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      // Якщо відгуків немає — додаємо дефолтні
      if (!db.reviews || db.reviews.length === 0) db.reviews = DEFAULT_REVIEWS;
      return db;
    }
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
      social_proof_enabled: true,
      liqpay_enabled: true,
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

app.get('/api/config', async (req, res) => {
  try {
    // Читаємо налаштування з Supabase
    const [cfgRes, revRes] = await Promise.all([
      supabase.from('settings').select('value').eq('key','site_config').single(),
      supabase.from('reviews').select('*').eq('active', true)
    ]);
    const s = (cfgRes.data && cfgRes.data.value) || {};
    const reviews = (revRes.data || []).map(r => ({
      text: r.text, author: r.author, location: r.location, active: r.active
    }));
    res.json({
      price: s.price || 2,
      paywall_enabled: s.paywall_enabled !== false,
      waitlist_enabled: s.waitlist_enabled !== false,
      counter_enabled: s.counter_enabled !== false,
      scale_visible: s.scale_visible === true,
      social_proof_enabled: s.social_proof_enabled !== false,
      liqpay_enabled: s.liqpay_enabled !== false,
      reviews: reviews,
      ads: s.ads || {},
    });
  } catch(e) {
    console.error('Config error:', e);
    // Fallback до /tmp якщо Supabase недоступний
    const db = loadDB();
    const s = db.settings;
    res.json({
      price: s.price,
      paywall_enabled: s.paywall_enabled !== false,
      waitlist_enabled: s.waitlist_enabled !== false,
      counter_enabled: s.counter_enabled !== false,
      scale_visible: s.scale_visible === true,
      social_proof_enabled: s.social_proof_enabled !== false,
      liqpay_enabled: s.liqpay_enabled !== false,
      reviews: (db.reviews || []).filter(r => r.active !== false),
      ads: db.ads || {},
    });
  }
});

// ══════════════════════════════════════════
//  SOCIAL PROOF (public)
// ══════════════════════════════════════════
app.get('/api/reviews', async (req, res) => {
  try {
    const { data } = await supabase.from('reviews').select('*').eq('active', true);
    res.json({ reviews: (data||[]).map(r => ({ text:r.text, author:r.author, location:r.location })) });
  } catch(e) {
    const db = loadDB();
    res.json({ reviews: (db.reviews||[]).filter(r => r.active !== false) });
  }
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

app.post('/api/admin/settings', adminAuth, async function(req, res) {
  const { price, paywall_enabled, waitlist_enabled, counter_enabled,
          scale_visible, social_proof_enabled, liqpay_enabled, promo_codes } = req.body;
  // Читаємо поточні налаштування
  const { data } = await supabase.from('settings').select('value').eq('key','site_config').single();
  const current = (data && data.value) || {};
  const updated = Object.assign({}, current);
  if (price !== undefined) updated.price = parseFloat(price);
  if (paywall_enabled !== undefined) updated.paywall_enabled = !!paywall_enabled;
  if (waitlist_enabled !== undefined) updated.waitlist_enabled = !!waitlist_enabled;
  if (counter_enabled !== undefined) updated.counter_enabled = !!counter_enabled;
  if (scale_visible !== undefined) updated.scale_visible = !!scale_visible;
  if (social_proof_enabled !== undefined) updated.social_proof_enabled = !!social_proof_enabled;
  if (liqpay_enabled !== undefined) updated.liqpay_enabled = !!liqpay_enabled;
  if (promo_codes !== undefined) updated.promo_codes = promo_codes;
  await supabase.from('settings').upsert({ key: 'site_config', value: updated, updated_at: new Date().toISOString() });
  // Також зберігаємо в /tmp як backup
  const db = loadDB();
  Object.assign(db.settings, updated);
  saveDB(db);
  res.json({ ok: true });
});

app.get('/api/admin/social-proof', adminAuth, async function(req, res) {
  try {
    const { data } = await supabase.from('reviews').select('*').order('id');
    res.json({ reviews: data || [] });
  } catch(e) {
    const db = loadDB();
    res.json({ reviews: db.reviews || [] });
  }
});

app.post('/api/admin/social-proof', adminAuth, async function(req, res) {
  const { reviews } = req.body;
  if (!Array.isArray(reviews)) return res.status(400).json({ error: 'Invalid reviews' });
  // Видаляємо всі і вставляємо нові
  await supabase.from('reviews').delete().neq('id', 0);
  const toInsert = reviews.map(function(r){
    return {
      text: String(r.text || '').slice(0, 500),
      author: String(r.author || '').slice(0, 100),
      location: String(r.location || '').slice(0, 100),
      active: r.active !== false,
    };
  });
  if (toInsert.length > 0) await supabase.from('reviews').insert(toInsert);
  // Backup в /tmp
  const db = loadDB();
  db.reviews = toInsert;
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
// ── WayForPay: тарифи та генерація форми оплати ──
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
  const orderDate = Math.floor(Date.now() / 1000);

  // WayForPay підпис: merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;productName;productCount;productPrice
  const signParams = [
    WFP_MERCHANT,
    'koleso.live',
    orderId,
    orderDate,
    amount,
    cur,
    planData.name,
    1,
    amount
  ];
  const merchantSignature = wfpSign(signParams.map(String));

  const formData = {
    merchantAccount:        WFP_MERCHANT,
    merchantDomainName:     'koleso.live',
    merchantTransactionSecureType: 'AUTO',
    orderReference:         orderId,
    orderDate:              orderDate,
    amount:                 amount,
    currency:               cur,
    orderTimeout:           49000,
    productName:            [planData.name],
    productCount:           [1],
    productPrice:           [amount],
    clientEmail:            email || '',
    language:               'UA',
    returnUrl:              'https://koleso.live/thank-you',
    serviceUrl:             'https://koleso.live/api/liqpay/callback',
    merchantSignature:      merchantSignature,
  };

  res.json({
    action: 'https://secure.wayforpay.com/pay',
    formData: formData
  });
});

// ── WayForPay: webhook після оплати ──
app.post('/api/liqpay/callback', express.json(), async (req, res) => {
  try {
    const body = req.body;
    if(!body || !body.merchantAccount) return res.sendStatus(400);

    // Перевірка підпису WayForPay
    const sigParams = [
      body.merchantAccount,
      body.orderReference,
      body.amount,
      body.currency,
      body.authCode||'',
      body.cardPan||'',
      body.transactionStatus||'',
      body.reasonCode||''
    ];
    const expectedSig = wfpSign(sigParams.map(String));
    if(expectedSig !== body.merchantSignature){
      console.error('WayForPay: invalid signature');
    }

    console.log('WayForPay payment:', body.transactionStatus, body.orderReference, body.amount, body.currency);

    // Тільки успішні платежі
    if(body.transactionStatus !== 'Approved') {
      // Відповідаємо WayForPay що отримали
      return res.json({
        orderReference: body.orderReference,
        status: 'accept',
        time: Math.floor(Date.now()/1000),
        signature: wfpSign([body.orderReference, 'accept', Math.floor(Date.now()/1000)].map(String))
      });
    }

    // Зберігаємо в db
    const planKey = (body.orderReference||'').split('_')[1] || 'unknown';
    const db = loadDB();
    db.payments.push({
      ts:        Date.now(),
      order_id:  body.orderReference,
      plan:      planKey,
      amount:    body.amount,
      currency:  body.currency,
      email:     body.email || body.clientEmail || '',
      status:    body.transactionStatus,
    });
    saveDB(db);

    // Зберігаємо підписку в Supabase
    const payEmail = body.email || body.clientEmail || '';
    if(payEmail && payEmail.includes('@')){
      const planDurations = { report: 365, monthly: 30, yearly: 365 };
      const days = planDurations[planKey] || 30;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      try {
        await supabase.from('subscriptions').insert({
          email:      payEmail,
          plan:       planKey,
          status:     'active',
          amount:     body.amount,
          currency:   body.currency,
          order_id:   body.orderReference,
          expires_at: expiresAt,
        });
        console.log('Subscription saved for:', payEmail);
      } catch(e){ console.error('Subscription save error:', e); }
    }

    // ── Welcome email після оплати ──
    const email = body.email || body.clientEmail || '';
    if(email && email.includes('@')){
      const plan = PLANS[planKey] || {};
      const planName = plan.name || 'PRO доступ';
      const isPro = planKey === 'monthly' || planKey === 'yearly';
      const planDetails = {
        report:  { label: 'Одноразовий звіт', emoji: '📄', what: 'Повний аналіз 12 сфер + PDF-звіт + тижневий план дій' },
        monthly: { label: 'Місячний PRO',      emoji: '🔥', what: 'Необмежені аналізи + трекінг прогресу + PDF-звіти' },
        yearly:  { label: 'Річний PRO',        emoji: '💎', what: 'Все з місячного + річна статистика + пріоритетна підтримка' },
      };
      const pd = planDetails[planKey] || planDetails.monthly;
      const amount = payment.amount + ' ' + (payment.currency === 'USD' ? '$' : '₴');
      try {
        await resend.emails.send({
          from: 'Володимир з Колеса Життя <noreply@koleso.live>',
          to: email,
          subject: `${pd.emoji} Доступ активовано — Koleso.live`,
          html: `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:Georgia,serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a3a6a,#2878c8);padding:32px 32px 28px;text-align:center">
      <div style="font-size:36px;margin-bottom:8px">${pd.emoji}</div>
      <div style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,.6);letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">Колесо Життя</div>
      <h1 style="margin:0;font-size:24px;color:#fff;font-weight:700">Доступ активовано!</h1>
      <div style="margin-top:10px;display:inline-block;background:rgba(255,255,255,.15);border-radius:100px;padding:6px 18px;font-size:13px;color:rgba(255,255,255,.9)">${pd.label} · ${amount}</div>
    </div>

    <!-- Body -->
    <div style="padding:32px">
      <p style="margin:0 0 20px;font-size:16px;color:#2c1810;line-height:1.7">
        Дякуємо за покупку! Твій <strong>${pd.label}</strong> активовано і вже готовий до роботи.
      </p>

      <!-- What you get -->
      <div style="background:#f5f4f0;border-radius:12px;padding:20px;margin-bottom:24px">
        <div style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#888;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px">Що входить у твій план</div>
        <div style="font-size:15px;color:#333;line-height:1.8">${pd.what}</div>
      </div>

      <!-- Steps -->
      <div style="margin-bottom:28px">
        <div style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#888;letter-spacing:.1em;text-transform:uppercase;margin-bottom:16px">З чого почати</div>
        ${['Відкрий Koleso.live і оціни всі 12 сфер від 1 до 10','Натисни «Отримати план» — AI проаналізує твій баланс','Отримай повний звіт з планом на 30 днів','Повертайся через тиждень і відстежуй прогрес'].map((s,i) =>
          `<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:12px">
            <div style="min-width:28px;height:28px;background:#2878c8;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;font-family:Arial,sans-serif">${i+1}</div>
            <div style="font-size:15px;color:#333;line-height:1.6;padding-top:4px">${s}</div>
          </div>`
        ).join('')}
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:28px">
        <a href="https://koleso.live" style="display:inline-block;padding:16px 36px;background:linear-gradient(135deg,#2878c8,#1a58a8);color:#fff;font-weight:700;border-radius:12px;text-decoration:none;font-size:16px;font-family:Arial,sans-serif">
          Відкрити Колесо Життя →
        </a>
      </div>

      <!-- Support -->
      <div style="border-top:1px solid #eee;padding-top:20px;font-size:13px;color:#888;line-height:1.7">
        Маєш питання? Пиши на
        <a href="mailto:support@koleso.live" style="color:#2878c8">support@koleso.live</a>
        або телефонуй <a href="tel:+380678366608" style="color:#2878c8">+38 067 836 66 08</a>.<br>
        Гарантія повернення коштів — <strong>14 днів</strong> без запитань.
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f5f4f0;padding:16px 32px;text-align:center;font-family:Arial,sans-serif;font-size:11px;color:#aaa">
      © 2026 ФОП Смоляр В.А. · Koleso.live ·
      <a href="https://koleso.live/terms" style="color:#aaa">Умови</a>
    </div>
  </div>
</body>
</html>`
        });
      } catch(e){ console.error('Welcome email error:', e); }
    }

    // Відповідаємо WayForPay
    res.json({
      orderReference: body.orderReference,
      status: 'accept',
      time: Math.floor(Date.now()/1000),
      signature: wfpSign([body.orderReference, 'accept', String(Math.floor(Date.now()/1000))])
    });
  } catch(e){
    console.error('WayForPay callback error:', e);
    res.sendStatus(500);
  }
});

// ── /pricing сторінка ──
app.get('/account', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'account.html'));
});

app.get('/pricing.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'pricing.js'));
});

app.get('/account', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'account.html'));
});

app.get('/pricing.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'pricing.js'));
});

app.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

app.get('/robots.txt', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'robots.txt'));
});

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
