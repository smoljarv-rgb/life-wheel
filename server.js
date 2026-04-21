const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
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

// ── Lemon Squeezy ──
const LS_API_KEY    = process.env.LEMONSQUEEZY_API_KEY || '';
const LS_STORE_ID   = process.env.LEMONSQUEEZY_STORE_ID || '329907';
const LS_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '';

// ID продуктів Lemon Squeezy (варіанти/variants)
const LS_VARIANTS = {
  report:  process.env.LS_VARIANT_REPORT  || '929741',
  monthly: process.env.LS_VARIANT_MONTHLY || '929746',
  yearly:  process.env.LS_VARIANT_YEARLY  || '929749',
};

function wfpSign(params){
  const str = params.join(';');
  return crypto.createHmac('md5', WFP_SECRET).update(str).digest('hex');
}


// ── Генерація PDF звіту з кирилицею ──
async function generateResultPDF(resultData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Шрифти з підтримкою кирилиці
      // Vercel: шукаємо шрифти відносно process.cwd() і __dirname
      const possibleDirs = [
        path.join(__dirname, 'public', 'fonts'),
        path.join(process.cwd(), 'public', 'fonts'),
        path.join(__dirname, '..', 'public', 'fonts'),
      ];
      const fontsDir = possibleDirs.find(d => fs.existsSync(path.join(d, 'Roboto-Regular.ttf'))) || possibleDirs[0];
      const regularFont = path.join(fontsDir, 'Roboto-Regular.ttf');
      const boldFont = path.join(fontsDir, 'Roboto-Bold.ttf');
      const hasFont = fs.existsSync(regularFont) && fs.existsSync(boldFont);
      console.log('PDF fonts dir:', fontsDir, 'hasFont:', hasFont);

      if (hasFont) {
        doc.registerFont('Regular', regularFont);
        doc.registerFont('Bold', boldFont);
      }

      const F = (bold) => hasFont ? (bold ? 'Bold' : 'Regular') : (bold ? 'Helvetica-Bold' : 'Helvetica');

      const scores = resultData.scores || {};
      const analysis = resultData.analysis || {};

      const SPHERES = [
        { key: 'love',    name: 'Любов' },
        { key: 'family',  name: "Сім'я" },
        { key: 'friends', name: 'Друзі' },
        { key: 'career',  name: "Кар'єра" },
        { key: 'finance', name: 'Фінанси' },
        { key: 'health',  name: "Здоров'я" },
        { key: 'selfdev', name: 'Саморозвиток' },
        { key: 'spirit',  name: 'Духовність' },
        { key: 'rest',    name: 'Відпочинок' },
        { key: 'env',     name: 'Середовище' },
        { key: 'comm',    name: 'Комунікація' },
        { key: 'appear',  name: 'Зовнішність' },
      ];

      const ACTIONS = {
        love:    { action: 'Вимкни телефон на 30 хв і поговори без відволікань' },
        family:  { action: 'Заплануй один спільний обід цього тижня' },
        friends: { action: "Напиши одному другу прямо зараз — «привіт, як ти?»" },
        career:  { action: 'Запиши 3 свої досягнення за останній місяць' },
        finance: { action: 'Запиши всі витрати за вчора і сьогодні' },
        health:  { action: 'Пройдись 20 хвилин сьогодні ввечері без телефону' },
        selfdev: { action: 'Прочитай 10 сторінок книги або 1 відео-урок сьогодні' },
        spirit:  { action: '5 хвилин тиші вранці — сиди і дихай' },
        rest:    { action: 'Сьогодні ввечері — 1 година тільки для себе' },
        env:     { action: 'Прибери один ящик або полицю — 15 хвилин' },
        comm:    { action: 'Скажи одній людині щось конкретне і приємне сьогодні' },
        appear:  { action: 'Один маленький крок для свого зовнішнього вигляду сьогодні' },
      };

      const vals = SPHERES.map(s => parseFloat(scores[s.key]) || 5);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const avgR = Math.round(avg * 10) / 10;
      const sorted = SPHERES.map(s => ({ ...s, score: parseFloat(scores[s.key]) || 5 }))
        .sort((a, b) => b.score - a.score);
      const topS = sorted[0];
      const botS = sorted[sorted.length - 1];
      const criticals = sorted.filter(s => s.score < 4);
      const date = new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });

      // ══ СТОРІНКА 1: Огляд ══

      // Шапка
      doc.rect(0, 0, 595, 110).fill('#0f1a10');
      doc.fillColor('#20d8a0').font(F(true)).fontSize(26).text('Колесо Життя', 50, 30);
      doc.fillColor('#cccccc').font(F(false)).fontSize(12).text('Персональний AI-звіт · ' + date, 50, 65);
      doc.fillColor('#888888').font(F(false)).fontSize(10).text('koleso.live', 50, 85);

      // Загальний бал
      doc.rect(50, 130, 495, 90).fill('#f0fff8');
      doc.fillColor('#0f1a10').font(F(true)).fontSize(13).text('ЗАГАЛЬНИЙ БАЛАНС', 70, 147);
      doc.fillColor('#20d8a0').font(F(true)).fontSize(48).text(String(avgR), 70, 158);
      doc.fillColor('#666666').font(F(false)).fontSize(16).text('/10', 70 + (avgR >= 10 ? 60 : 48), 178);
      doc.fillColor('#444444').font(F(false)).fontSize(11)
        .text('Топ сфера: ' + topS.name + ' (' + topS.score + ')', 200, 155)
        .text('Критична: ' + botS.name + ' (' + botS.score + ')', 200, 175)
        .text('Дата: ' + date, 200, 195);

      // Заголовок таблиці балів
      doc.fillColor('#1a1a2e').font(F(true)).fontSize(15).text('Оцінки по всіх 12 сферах', 50, 242);

      // Бали по сферах
      let y = 268;
      sorted.forEach((s) => {
        const barW = Math.round(s.score * 33);
        const color = s.score >= 7 ? '#20d8a0' : s.score >= 4 ? '#e8c060' : '#e05050';

        doc.fillColor('#222222').font(F(true)).fontSize(10).text(s.name, 50, y);
        doc.fillColor(color).font(F(true)).fontSize(10).text(String(s.score), 155, y);
        doc.fillColor('#e0e0e0').rect(180, y + 2, 280, 9).fill();
        doc.fillColor(color).rect(180, y + 2, barW, 9).fill();
        doc.fillColor('#888888').font(F(false)).fontSize(8).text('/10', 466, y + 1);
        y += 26;
      });

      // ══ СТОРІНКА 2: AI Аналіз та план дій ══
      doc.addPage();

      // Шапка
      doc.rect(0, 0, 595, 70).fill('#0f1a10');
      doc.fillColor('#20d8a0').font(F(true)).fontSize(18).text('AI Аналіз та План дій', 50, 25);

      // AI Аналіз
      const summaryText = analysis.summary || analysis.text || '';
      if (summaryText) {
        doc.fillColor('#1a1a2e').font(F(true)).fontSize(13).text('AI Аналіз', 50, 90);
        doc.fillColor('#333333').font(F(false)).fontSize(10)
          .text(summaryText.slice(0, 800), 50, 112, { width: 495, lineGap: 3 });
      }

      // План дій для критичних сфер
      let planY = summaryText ? 260 : 90;
      doc.fillColor('#1a1a2e').font(F(true)).fontSize(13).text('План дій на цей тиждень', 50, planY);
      planY += 22;

      const planSpheres = criticals.length > 0 ? criticals.slice(0, 5) : sorted.slice(-5).reverse();
      planSpheres.forEach((s, i) => {
        const action = ACTIONS[s.key] ? ACTIONS[s.key].action : 'Приділи увагу цій сфері сьогодні';
        const color = s.score >= 7 ? '#20d8a0' : s.score >= 4 ? '#e8a000' : '#e05050';

        // Фон картки
        doc.rect(50, planY, 495, 52).fill(i % 2 === 0 ? '#f8f8f8' : '#ffffff');
        doc.rect(50, planY, 4, 52).fill(color);

        // Назва сфери і бал
        doc.fillColor(color).font(F(true)).fontSize(11)
          .text(s.name + ' · ' + s.score + '/10', 62, planY + 8);

        // Дія
        doc.fillColor('#333333').font(F(false)).fontSize(10)
          .text('→ ' + action, 62, planY + 26, { width: 470 });

        planY += 58;
      });

      // Заклик до дії
      doc.rect(50, planY + 10, 495, 60).fill('#e8f5f0');
      doc.fillColor('#0f6a40').font(F(true)).fontSize(12)
        .text('Хочеш покращити результат?', 70, planY + 22);
      doc.fillColor('#1a5a38').font(F(false)).fontSize(10)
        .text('Активуй PRO підписку на koleso.live — необмежені аналізи,\nтрекінг прогресу та персональний план на кожну сферу.', 70, planY + 40);

      // Футер на всіх сторінках
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.fillColor('#aaaaaa').font(F(false)).fontSize(8)
          .text('Koleso.live · AI-коуч для балансу 12 сфер · ' + date,
            50, 820, { align: 'center', width: 495 });
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}


const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2025';
const DB_FILE = process.env.DB_FILE || path.join('/tmp', 'lifewheel_db.json');

app.use(express.json({ limit: '1mb' }));

// Cache-Control middleware (CSP is set in vercel.json headers for reliability)
app.use(function(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/blog', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'blog.html'));
});

app.get('/blog/:slug', function(req, res) {
  const slug = req.params.slug.replace(/[^a-z0-9-]/g, '');
  const filePath = path.join(__dirname, 'public', 'blog', slug + '.html');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.redirect('/blog');
  }
});

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
app.post('/api/track', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const { type, data } = req.body;
  if (!type) return res.json({ ok: true });
  try {
    await supabase.from('pageviews').insert({ ts: Date.now(), type, ip, data: data || {} });
  } catch(e) {
    console.error('Track error:', e);
  }
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
  const { email, source, slug } = req.body;
  if (!email || !email.includes('@'))
    return res.status(400).json({ error: 'Invalid email' });

  const { error } = await supabase
    .from('subscribers')
    .insert([{ email, source: source || 'site' }])
    .select();

  if (error && error.code !== '23505') {
    console.error('Supabase error:', error);
    return res.status(500).json({ error: 'DB error' });
  }

  // Зберігаємо в db.emails як backup
  const db = loadDB();
  if (!db.emails.find(e => e.email === email)) {
    db.emails.push({ ts: Date.now(), email, ip, source: source || 'site' });
    saveDB(db);
  }

  // Додаємо в чергу email-послідовності (тільки нові підписники)
  if (error?.code === '23505') {
    // Вже існує — не додаємо в чергу
  } else {
    addToEmailQueue(email).catch(e => console.error('Queue error:', e));
  }

  // Відправляємо лист залежно від джерела
  try {
    const isResultCapture = source === 'result_capture';
    let pdfAttachment = null;

    // Якщо є slug — генеруємо PDF
    if (isResultCapture && slug) {
      try {
        // Завантажуємо дані результату з Supabase
        const { data: resultRow } = await supabase
          .from('results')
          .select('scores, analysis')
          .eq('slug', slug)
          .single();

        if (resultRow) {
          const pdfBuffer = await generateResultPDF(resultRow);
          pdfAttachment = [{
            filename: 'koleso-life-report.pdf',
            content: pdfBuffer.toString('base64'),
            type: 'application/pdf',
            disposition: 'attachment'
          }];
        }
      } catch (pdfErr) {
        console.error('PDF generation error:', pdfErr);
        // Продовжуємо без PDF якщо помилка
      }
    }

    const resultUrl = slug ? `https://koleso.live/result/${slug}` : 'https://koleso.live';

    const emailPayload = {
      from: 'Володимир з Колеса Життя <noreply@koleso.live>',
      to: email,
      subject: isResultCapture
        ? '📊 Твій звіт Колеса Життя збережено'
        : 'Ти в списку очікування Колеса Життя',
      html: isResultCapture ? `
<!DOCTYPE html>
<html lang="uk">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
<tr><td>
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#0f1a10;padding:32px 40px">
    <h1 style="margin:0;font-size:24px;color:#20d8a0;font-family:Arial,sans-serif">Колесо Життя</h1>
    <p style="margin:8px 0 0;font-size:14px;color:#aaaaaa">Твій персональний AI-звіт</p>
  </td></tr>
  <tr><td style="padding:36px 40px">
    <p style="margin:0 0 16px;font-size:16px;color:#333;line-height:1.7">Привіт!</p>
    <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.7">
      Твій звіт Колеса Життя збережено і прикріплено до цього листа у форматі PDF.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#333;line-height:1.7">
      Також ти можеш переглянути повний інтерактивний звіт онлайн:
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 32px">
      <tr><td style="background:#20d8a0;border-radius:8px;padding:14px 28px">
        <a href="${resultUrl}" style="color:#0f1a10;font-size:15px;font-weight:bold;text-decoration:none">
          Переглянути мій звіт →
        </a>
      </td></tr>
    </table>
    <div style="background:#f8f8f8;border-radius:8px;padding:20px;margin:0 0 24px">
      <p style="margin:0 0 8px;font-size:13px;color:#666;font-weight:bold">💡 Порада</p>
      <p style="margin:0;font-size:13px;color:#666;line-height:1.6">
        Через 30 днів пройди тест повторно — ти побачиш як змінився твій баланс.
        Нагадуємо автоматично.
      </p>
    </div>
    <p style="margin:0 0 8px;font-size:15px;color:#333">З повагою,</p>
    <p style="margin:0 0 32px;font-size:15px;color:#333;font-weight:bold">Володимир</p>
    <hr style="border:none;border-top:1px solid #eeeeee;margin:0 0 16px">
    <p style="margin:0;font-size:12px;color:#999;line-height:1.6">
      Ти отримав цей лист тому що залишив email на <a href="https://koleso.live" style="color:#20d8a0">koleso.live</a>.<br>
      <a href="https://koleso.live/unsubscribe?email=${email}" style="color:#999">Відписатись</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>` : `
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
    <p style="margin:0 0 32px;font-size:15px;color:#333;line-height:1.7">
      Ти у списку очікування. Напишу особисто коли відкриється повний доступ.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 32px">
      <tr><td style="background:#22d3a0;border-radius:8px;padding:14px 28px">
        <a href="https://koleso.live" style="color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none">Відкрити Колесо Життя</a>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:15px;color:#333">З повагою,</p>
    <p style="margin:0 0 32px;font-size:15px;color:#333;font-weight:bold">Володимир</p>
    <hr style="border:none;border-top:1px solid #eeeeee;margin:0 0 20px">
    <p style="margin:0;font-size:12px;color:#999;line-height:1.6">
      <a href="https://koleso.live/unsubscribe?email=${email}" style="color:#999">Відписатись</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
    };

    // Додаємо PDF якщо є
    if (pdfAttachment) {
      emailPayload.attachments = pdfAttachment;
    }

    await resend.emails.send(emailPayload);
  } catch(emailErr) {
    console.error('Resend error:', emailErr);
    // Не повертаємо помилку — email не критичний
  }

  // Зберігаємо локально для статистики
  const dbLocal = loadDB();
  if (!dbLocal.emails.find(e => e.email === email)) {
    dbLocal.emails.push({ ts: Date.now(), email, ip });
    saveDB(dbLocal);
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

app.post('/api/promo', async (req, res) => {
  const { code } = req.body;
  try {
    // Читаємо промокоди з Supabase
    const { data } = await supabase.from('settings').select('value').eq('key','site_config').single();
    const promoCodes = (data && data.value && data.value.promo_codes) || [];
    const promo = promoCodes.find(function(p){
      return p.code && p.code.toLowerCase() === (code || '').toLowerCase() && p.enabled !== false;
    });
    if (!promo) return res.json({ valid: false });
    if (promo.max_uses && promo.uses >= promo.max_uses) return res.json({ valid: false, reason: 'expired' });
    res.json({ valid: true, discount: promo.discount, free: promo.discount >= 100 });
  } catch(e) {
    // Fallback до локальної БД
    const db = loadDB();
    const promo = (db.settings.promo_codes || []).find(function(p){
      return p.code && p.code.toLowerCase() === (code || '').toLowerCase() && p.enabled !== false;
    });
    if (!promo) return res.json({ valid: false });
    if (promo.max_uses && promo.uses >= promo.max_uses) return res.json({ valid: false, reason: 'expired' });
    res.json({ valid: true, discount: promo.discount, free: promo.discount >= 100 });
  }
});

app.post('/api/promo/use', async (req, res) => {
  const { code } = req.body;
  try {
    // Читаємо і оновлюємо в Supabase
    const { data } = await supabase.from('settings').select('value').eq('key','site_config').single();
    const config = (data && data.value) || {};
    const codes = config.promo_codes || [];
    const promo = codes.find(function(p){
      return p.code && p.code.toLowerCase() === (code || '').toLowerCase();
    });
    if (promo) {
      promo.uses = (promo.uses || 0) + 1;
      await supabase.from('settings').upsert({ key: 'site_config', value: config, updated_at: new Date().toISOString() });
    }
  } catch(e) {
    // Fallback до локальної БД
    const db = loadDB();
    const promo = (db.settings.promo_codes || []).find(function(p){
      return p.code && p.code.toLowerCase() === (code || '').toLowerCase();
    });
    if (promo) { promo.uses = (promo.uses || 0) + 1; saveDB(db); }
  }
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
    // Vercel Hobby ліміт — 10 сек. Встановлюємо 8 сек, щоб встигнути відповісти
    const timeoutId = setTimeout(() => controller.abort(), 8000);

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
    // Vercel тайм-аут (AbortError) — повертаємо статус 408 замість 500
    if (err.name === 'AbortError') {
      return res.status(408).json({ error: 'Запит до AI занадто довгий. Спробуйте ще раз.' });
    }
    res.status(500).json({ error: 'Помилка: ' + (err.message || String(err)) });
  }
});

// Публічний лічильник аналізів
app.get('/api/stats', function(req, res) {
  const db = loadDB();
  const total = db.events.filter(function(e){ return e.type === 'analysis_completed'; }).length;
  res.json({ totalAssessments: total });
});

// ══════════════════════════════════════════
//  ADMIN API
// ══════════════════════════════════════════
app.get('/api/admin/stats', adminAuth, async function(req, res) {
  const now = Date.now();
  const day = 86400000;

  // Отримуємо дані з Supabase паралельно
  const [
    { data: recentViews = [] },
    { data: allViews = [] },
    { data: recentResults = [] },
    { count: totalResultsCount },
    { data: recentSubs = [] },
    { data: allSubs = [] },
    { count: emailCount },
  ] = await Promise.all([
    supabase.from('pageviews').select('ts,ip').gte('ts', now - 14*day),
    supabase.from('pageviews').select('ip').gte('ts', now - 90*day),
    supabase.from('results').select('created_at').gte('created_at', new Date(now - 14*day).toISOString()),
    supabase.from('results').select('*', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('created_at,amount').gt('amount', 0).gte('created_at', new Date(now - 30*day).toISOString()),
    supabase.from('subscriptions').select('amount').gt('amount', 0),
    supabase.from('subscribers').select('*', { count: 'exact', head: true }),
  ]);

  // Відвідувачі
  const visitors = {
    today: new Set((recentViews||[]).filter(function(e){ return e.ts >= now-day; }).map(function(e){ return e.ip; })).size,
    week:  new Set((recentViews||[]).filter(function(e){ return e.ts >= now-7*day; }).map(function(e){ return e.ip; })).size,
    total: new Set((allViews||[]).map(function(e){ return e.ip; })).size,
  };

  // Аналізи
  const todayIso = new Date(now-day).toISOString();
  const analyses = {
    today: (recentResults||[]).filter(function(r){ return r.created_at >= todayIso; }).length,
    total: totalResultsCount || 0,
  };

  // Оплати та дохід
  const todaySubs = (recentSubs||[]).filter(function(p){ return new Date(p.created_at).getTime() >= now-day; });
  const monthSubs = recentSubs||[];
  const payments = { today: todaySubs.length, total: (allSubs||[]).length };
  const revenue = {
    today: todaySubs.reduce(function(s,p){ return s+(p.amount||0); }, 0),
    month: monthSubs.reduce(function(s,p){ return s+(p.amount||0); }, 0),
    total: (allSubs||[]).reduce(function(s,p){ return s+(p.amount||0); }, 0),
  };

  // Графік за 14 днів
  const chart = [];
  for (var i = 13; i >= 0; i--) {
    var from = now - (i+1)*day;
    var to = now - i*day;
    var fromIso = new Date(from).toISOString();
    var toIso = new Date(to).toISOString();
    var date = new Date(to).toLocaleDateString('uk-UA', { day:'2-digit', month:'2-digit' });
    chart.push({
      date,
      visitors: new Set((recentViews||[]).filter(function(e){ return e.ts>=from && e.ts<to; }).map(function(e){ return e.ip; })).size,
      analyses: (recentResults||[]).filter(function(r){ return r.created_at>=fromIso && r.created_at<toIso; }).length,
      payments: (recentSubs||[]).filter(function(p){ return p.created_at>=fromIso && p.created_at<toIso; }).length,
    });
  }

  // Settings з Supabase
  let settings = {};
  try {
    const { data } = await supabase.from('settings').select('value').eq('key','site_config').single();
    if (data && data.value) settings = data.value;
  } catch(e) {}

  const db = loadDB();
  res.json({
    visitors,
    analyses,
    payments,
    revenue,
    emails: emailCount || 0,
    totalAssessments: analyses.total,
    chart,
    settings,
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

// ── Підписники з Supabase ──
app.get('/api/admin/subscribers', adminAuth, async function(req, res) {
  try {
    const { data, error } = await supabase
      .from('subscribers')
      .select('*')
      .order('created_at', { ascending: false });
    if(error) throw error;
    res.json(data || []);
  } catch(e) {
    console.error('Subscribers error:', e);
    res.json([]);
  }
});

app.delete('/api/admin/subscribers/:email', adminAuth, async function(req, res) {
  try {
    const email = decodeURIComponent(req.params.email);
    await supabase.from('subscribers').delete().eq('email', email);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
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



// ── Оновлення advice після аналізу ──
app.post('/api/results/update-advice', async (req, res) => {
  const { slug, advice } = req.body;
  if(!slug || !advice) return res.status(400).json({ error: 'Missing data' });
  try{
    const { data } = await supabase.from('results').select('analysis').eq('slug',slug).single();
    const current = (data && data.analysis) || {};
    await supabase.from('results').update({
      analysis: Object.assign({}, current, { advice })
    }).eq('slug', slug);
    res.json({ ok: true });
  }catch(e){
    res.status(500).json({ error: e.message });
  }
});

// ── Безкоштовна активація через 100% промокод ──
app.post('/api/promo/activate', async (req, res) => {
  const { code, email, plan } = req.body;
  if (!code || !email || !email.includes('@')) {
    return res.status(400).json({ error: 'Потрібен код і email' });
  }
  try {
    // Перевіряємо промокод в Supabase
    const { data } = await supabase.from('settings').select('value').eq('key','site_config').single();
    const codes = (data && data.value && data.value.promo_codes) || [];
    const promo = codes.find(p => p.code && p.code.toLowerCase() === code.toLowerCase() && p.enabled !== false);

    if (!promo) return res.json({ ok: false, error: 'Невірний промокод' });
    if (promo.max_uses && promo.uses >= promo.max_uses) return res.json({ ok: false, error: 'Промокод вичерпано' });
    if (promo.discount < 100) return res.json({ ok: false, error: 'Промокод не дає 100% знижки' });

    // Визначаємо термін підписки
    const planDurations = { report: 365, monthly: 30, yearly: 365 };
    const days = planDurations[plan] || 30;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    // Створюємо підписку
    await supabase.from('subscriptions').insert({
      email,
      plan: plan || 'monthly',
      status: 'active',
      amount: 0,
      currency: 'UAH',
      order_id: 'promo_' + code + '_' + Date.now(),
      expires_at: expiresAt,
    });

    // Збільшуємо лічильник використань
    promo.uses = (promo.uses || 0) + 1;
    await supabase.from('settings').upsert({ key: 'site_config', value: data.value, updated_at: new Date().toISOString() });

    // Додаємо в email чергу
    try { await addToEmailQueue(email); } catch(e) {}

    res.json({ ok: true, expires_at: expiresAt, days });
  } catch(e) {
    console.error('Promo activate error:', e);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// ── Перевірка активної підписки по email ──
app.post('/api/subscription/check', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.json({ active: false });
  try {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('email', email)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .single();
    if (data) {
      res.json({ active: true, plan: data.plan, expires_at: data.expires_at });
    } else {
      res.json({ active: false });
    }
  } catch(e) {
    res.json({ active: false });
  }
});

app.post('/api/liqpay/checkout', async (req, res) => {
  const { plan, currency, email, slug, promo } = req.body;
  const planData = PLANS[plan];
  if(!planData) return res.status(400).json({ error: 'Invalid plan' });

  const cur = (currency === 'usd') ? 'USD' : 'UAH';
  let amount = (currency === 'usd') ? planData.amount_usd : planData.amount_uah;

  // Застосовуємо знижку промокоду (читаємо з Supabase)
  if(promo) {
    try {
      const { data: cfgData } = await supabase.from('settings').select('value').eq('key','site_config').single();
      const promoCodes = (cfgData && cfgData.value && cfgData.value.promo_codes) || [];
      const promoData = promoCodes.find(function(p){
        return p.code && p.code.toLowerCase() === promo.toLowerCase() && p.enabled !== false;
      });
      if(promoData && !(promoData.max_uses && promoData.uses >= promoData.max_uses)){
        if(promoData.discount >= 100){
          amount = 0.01;
        } else {
          amount = Math.round(amount * (1 - promoData.discount / 100) * 100) / 100;
        }
      }
    } catch(e) { console.error('Promo lookup error:', e); }
  }
  const orderId = `kl_${plan}_${Date.now()}`;
  const orderDate = Math.floor(Date.now() / 1000);

  // Зберігаємо email в Supabase для callback (бо Pay може не повернути email)
  if (email && email.includes('@')) {
    try {
      const { data: poData } = await supabase.from('settings').select('value').eq('key','pending_orders').single();
      const orders = (poData && poData.value) || {};
      orders[orderId] = { email, plan, ts: Date.now() };
      // Чистимо старі (>24 год)
      const cutoff = Date.now() - 86400000;
      Object.keys(orders).forEach(k => { if (orders[k].ts < cutoff) delete orders[k]; });
      await supabase.from('settings').upsert({ key: 'pending_orders', value: orders, updated_at: new Date().toISOString() });
    } catch(e) { console.error('pendingOrders save error:', e); }
  }

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
    returnUrl:              slug ? `https://koleso.live/result/${slug}?paid=1` : 'https://koleso.live/thank-you',
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
    let pendingEmail = '';
    try {
      const { data: poData } = await supabase.from('settings').select('value').eq('key','pending_orders').single();
      pendingEmail = (poData && poData.value && poData.value[body.orderReference] && poData.value[body.orderReference].email) || '';
    } catch(e) {}
    const payEmail = body.email || body.clientEmail || pendingEmail || '';
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
// ── JS файли для сторінок (обходять Cloudflare) ──
app.get('/js/pricing-app.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(__dirname, 'public', 'pricing-app.js'));
});

app.get('/account', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'account.html'));
});

app.get('/pricing.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'pricing.js'));
});

// ── JS файли для сторінок (обходять Cloudflare) ──
app.get('/js/pricing-app.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(__dirname, 'public', 'pricing-app.js'));
});

app.get('/account', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'account.html'));
});

app.get('/pricing.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'pricing.js'));
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

// WayForPay робить POST redirect на /thank-you після оплати
app.post('/thank-you', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'thank-you.html'));
});


// ── Lemon Squeezy: створення checkout сесії ──
app.post('/api/lemonsqueezy/checkout', async (req, res) => {
  // Явні CORS заголовки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { plan, email } = req.body;
  const variantId = LS_VARIANTS[plan];
  if (!variantId) return res.status(400).json({ error: 'Невірний план' });

  if (!LS_API_KEY) return res.status(500).json({ error: 'Lemon Squeezy не налаштований' });

  try {
    // Формуємо checkout через Lemon Squeezy API
    const body = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_options: {
            embed: false,
            media: false,
            logo: true,
          },
          checkout_data: {
            email: email || '',
            custom: { plan: plan },
          },
          product_options: {
            redirect_url: 'https://koleso.live/thank-you',
          },
          expires_at: null,
        },
        relationships: {
          store: {
            data: { type: 'stores', id: String(LS_STORE_ID) }
          },
          variant: {
            data: { type: 'variants', id: String(variantId) }
          }
        }
      }
    };

    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        'Authorization': `Bearer ${LS_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('LS error:', JSON.stringify(data));
      return res.status(500).json({ error: 'Помилка створення checkout' });
    }

    const checkoutUrl = data?.data?.attributes?.url;
    if (!checkoutUrl) return res.status(500).json({ error: 'Немає URL checkout' });

    res.json({ url: checkoutUrl });
  } catch (e) {
    console.error('LS checkout error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Lemon Squeezy: webhook після успішної оплати ──
app.post('/api/lemonsqueezy/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Перевірка підпису webhook
  const secret = LS_WEBHOOK_SECRET;
  const signature = req.headers['x-signature'];

  if (secret && signature) {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(req.body).digest('hex');
    if (digest !== signature) {
      console.error('LS webhook: невірний підпис');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  const payload = JSON.parse(req.body.toString());
  const eventName = payload?.meta?.event_name;
  const attrs = payload?.data?.attributes;

  console.log('LS webhook event:', eventName);

  // Обробляємо успішну оплату
  if (eventName === 'order_created' && attrs?.status === 'paid') {
    const email = attrs?.user_email || attrs?.checkout_data?.email || '';
    const planKey = attrs?.first_order_item?.variant_name || 
                    payload?.meta?.custom_data?.plan || 'report';

    // Зберігаємо в Supabase
    if (email && email.includes('@')) {
      const planDurations = { report: 365, monthly: 30, yearly: 365 };
      const days = planDurations[planKey] || 30;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      try {
        await supabase.from('subscriptions').insert({
          email:      email,
          plan:       planKey,
          status:     'active',
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        });

        // Також зберігаємо в subscribers
        await supabase.from('subscribers').upsert(
          { email: email, source: 'lemonsqueezy' },
          { onConflict: 'email', ignoreDuplicates: true }
        );
      } catch (e) {
        console.error('LS webhook DB error:', e);
      }

      // Зберігаємо в db як backup
      const db = loadDB();
      db.payments.push({
        ts:       Date.now(),
        email:    email,
        plan:     planKey,
        amount:   attrs?.total ? attrs.total / 100 : 0,
        currency: attrs?.currency || 'UAH',
        status:   'paid',
        provider: 'lemonsqueezy',
      });
      saveDB(db);
    }
  }

  res.json({ ok: true });
});



// ══════════════════════════════════════════
// STREAMING ANALYSIS via SSE
// ══════════════════════════════════════════
app.get('/api/analyze/stream/:slug', async function(req, res) {
  const { slug } = req.params;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'No API key' }); return; }

  // Читаємо бали з Supabase
  const { data: result, error } = await supabase
    .from('results')
    .select('scores, analysis')
    .eq('slug', slug)
    .single();

  if (error || !result) { res.status(404).json({ error: 'Result not found' }); return; }

  // Якщо advice вже є — повертаємо одразу
  if (result.analysis && result.analysis.advice && result.analysis.advice.length > 0) {
    res.json({ done: true, advice: result.analysis.advice });
    return;
  }

  const scores = result.scores || {};

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const send = (data) => {
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  };

  // Список сфер з балами
  const sphereNames = {
    love: 'Любов', family: "Сім'я", friends: 'Друзі',
    career: "Кар'єра", finance: 'Фінанси', health: "Здоров'я",
    selfdev: 'Саморозвиток', spirit: 'Духовність', rest: 'Відпочинок',
    env: 'Середовище', comm: 'Комунікація', appear: 'Зовнішність'
  };

  const context = Object.entries(scores)
    .map(([k, v]) => `${sphereNames[k]||k}:${v}`)
    .join(', ');

  const spheres = Object.entries(scores).map(([k, v]) => ({
    key: k,
    name: sphereNames[k] || k,
    score: parseFloat(v) || 5
  }));

  const allAdvice = [];

  for (let i = 0; i < spheres.length; i++) {
    const s = spheres[i];
    send({ type: 'progress', current: i + 1, total: spheres.length, sphere: s.name });

    const prompt = `ICF coach. JSON only, no markdown.
Context: ${context}
Analyze: ${s.name}:${s.score}/10

Return JSON: {"sphere":"${s.name}","score":${s.score},"gap":${10-s.score},"priority_reason":"why important 2 sentences","root_cause":"root psychological cause","quick_win":"one action today","month_goal":"SMART 30-day goal","days":[{"day":"День 1","task":"specific action","technique":"technique name","psychologist":"Psychologist Name","book":"Book — Author"},{"day":"День 2","task":"action","technique":"technique","psychologist":"name","book":"title"},{"day":"День 3","task":"action","technique":"technique","psychologist":"name","book":"title"},{"day":"День 4","task":"action","technique":"technique","psychologist":"name","book":"title"},{"day":"День 5","task":"action","technique":"technique","psychologist":"name","book":"title"},{"day":"День 6","task":"action","technique":"technique","psychologist":"name","book":"title"},{"day":"День 7","task":"weekly reflection","technique":"Weekly Review","psychologist":"David Allen","book":"Getting Things Done"}]}`;

    let sphereAdvice = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 30000);
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              { role: 'system', content: 'You are a JSON API. Respond ONLY with valid JSON object. Never truncate.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 1500,
            temperature: 0.3,
            response_format: { type: 'json_object' },
          }),
        });
        clearTimeout(tid);
        const groqData = await groqRes.json();
        if (!groqRes.ok) throw new Error(groqData.error?.message || 'Groq error');
        const text = groqData.choices?.[0]?.message?.content || '';
        sphereAdvice = JSON.parse(text);
        if (!sphereAdvice.sphere) sphereAdvice.sphere = s.name;
        break;
      } catch(e) {
        if (attempt < 2) await new Promise(r => setTimeout(r, 4000 * (attempt + 1)));
      }
    }

    if (sphereAdvice) {
      allAdvice.push(sphereAdvice);
      send({ type: 'sphere', advice: sphereAdvice });
    }

    // Пауза між запитами
    if (i < spheres.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Зберігаємо в Supabase
  try {
    const current = result.analysis || {};
    await supabase.from('results').update({
      analysis: Object.assign({}, current, { advice: allAdvice })
    }).eq('slug', slug);
  } catch(e) { console.error('Save advice error:', e); }

  send({ type: 'done', advice: allAdvice });
  res.end();
});

// ══════════════════════════════════════════
//  EMAIL SEQUENCE — 7 листів
// ══════════════════════════════════════════

// Тексти листів
const EMAIL_LETTERS = {
  1: {
    subject: '📊 Твій звіт Колеса Життя збережено',
    // Лист 1 вже відправляється в /api/subscribe — пропускаємо
    skip: true
  },
  2: {
    subject: '3 речі, які твій результат означає насправді',
    html: (email, resultUrl) => `
<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#0f1a10;padding:28px 40px">
    <h1 style="margin:0;font-size:22px;color:#20d8a0">Колесо Життя</h1>
  </td></tr>
  <tr><td style="padding:32px 40px">
    <p style="font-size:15px;color:#333;line-height:1.7">Привіт!</p>
    <p style="font-size:15px;color:#333;line-height:1.7">Вчора ти пройшов тест Колеса Життя. Ось що твій результат означає насправді:</p>
    <div style="background:#f0fff8;border-left:4px solid #20d8a0;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">
      <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#0f6a40">💡 Факт 1: Твій мозок звикає до поточного рівня</p>
      <p style="margin:0;font-size:13px;color:#333;line-height:1.6">Навіть якщо якась сфера низька — мозок сприймає це як «норму». Перший крок до змін — усвідомлення.</p>
    </div>
    <div style="background:#f0fff8;border-left:4px solid #20d8a0;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">
      <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#0f6a40">💡 Факт 2: Одна сфера тягне за собою інші</p>
      <p style="margin:0;font-size:13px;color:#333;line-height:1.6">Дослідження показують: покращення у здоров'ї на 1 бал підвищує продуктивність на роботі на 23%. Сфери пов'язані.</p>
    </div>
    <div style="background:#f0fff8;border-left:4px solid #20d8a0;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">
      <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#0f6a40">💡 Факт 3: 15 хвилин на день = +1 бал за місяць</p>
      <p style="margin:0;font-size:13px;color:#333;line-height:1.6">Не потрібні радикальні зміни. Маленькі щоденні дії дають реальний результат через 30 днів.</p>
    </div>
    <p style="font-size:14px;color:#333;line-height:1.7">Переглянь свій звіт — там є конкретний план для твоєї ситуації:</p>
    <table cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr><td style="background:#20d8a0;border-radius:8px;padding:13px 26px">
        <a href="${resultUrl || 'https://koleso.live'}" style="color:#0f1a10;font-size:14px;font-weight:bold;text-decoration:none">Переглянути мій звіт →</a>
      </td></tr>
    </table>
    <p style="font-size:15px;color:#333">З повагою,<br><strong>Володимир</strong></p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:12px;color:#999"><a href="https://koleso.live/unsubscribe?email=${email}" style="color:#999">Відписатись</a></p>
  </td></tr>
</table></td></tr></table>
</body></html>`
  },
  3: {
    subject: 'Ось що роблять люди з балом 8+ у твоїй слабкій сфері',
    html: (email, resultUrl) => `
<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#0f1a10;padding:28px 40px">
    <h1 style="margin:0;font-size:22px;color:#20d8a0">Колесо Життя</h1>
  </td></tr>
  <tr><td style="padding:32px 40px">
    <p style="font-size:15px;color:#333;line-height:1.7">Привіт!</p>
    <p style="font-size:15px;color:#333;line-height:1.7">Я проаналізував дані тисяч людей які пройшли Колесо Життя. Ось що об'єднує тих, хто підняв свій бал до 8+:</p>
    <div style="background:#fff8e7;border-radius:10px;padding:20px;margin:20px 0">
      <p style="margin:0 0 12px;font-size:15px;font-weight:bold;color:#b8860b">🏆 Що роблять люди з балом 8+</p>
      <p style="margin:0 0 8px;font-size:13px;color:#333;line-height:1.6">✓ Вони не чекають «правильного моменту» — починають з мікродій сьогодні</p>
      <p style="margin:0 0 8px;font-size:13px;color:#333;line-height:1.6">✓ Перевіряють прогрес раз на місяць — не рідше</p>
      <p style="margin:0 0 8px;font-size:13px;color:#333;line-height:1.6">✓ Фокусуються на 1-2 сферах одночасно, а не на всіх</p>
      <p style="margin:0;font-size:13px;color:#333;line-height:1.6">✓ Ведуть короткий щоденник прогресу (5 хвилин на день)</p>
    </div>
    <p style="font-size:14px;color:#333;line-height:1.7">Твій звіт вже містить персональний план. Почни з однієї дії сьогодні:</p>
    <table cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr><td style="background:#20d8a0;border-radius:8px;padding:13px 26px">
        <a href="${resultUrl || 'https://koleso.live'}" style="color:#0f1a10;font-size:14px;font-weight:bold;text-decoration:none">Відкрити мій план →</a>
      </td></tr>
    </table>
    <p style="font-size:15px;color:#333">З повагою,<br><strong>Володимир</strong></p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:12px;color:#999"><a href="https://koleso.live/unsubscribe?email=${email}" style="color:#999">Відписатись</a></p>
  </td></tr>
</table></td></tr></table>
</body></html>`
  },
  4: {
    subject: 'Твій 7-денний план — частина 1 (безкоштовно)',
    html: (email, resultUrl) => `
<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#0f1a10;padding:28px 40px">
    <h1 style="margin:0;font-size:22px;color:#20d8a0">Колесо Життя</h1>
  </td></tr>
  <tr><td style="padding:32px 40px">
    <p style="font-size:15px;color:#333;line-height:1.7">Привіт!</p>
    <p style="font-size:15px;color:#333;line-height:1.7">Ось твій безкоштовний 7-денний старт для покращення балансу:</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${[
        ['День 1', 'Запиши 3 речі за які вдячний сьогодні', '5 хв'],
        ['День 2', 'Вийди на 20-хвилинну прогулянку без телефону', '20 хв'],
        ['День 3', 'Напиши одній людині яку давно не бачив', '5 хв'],
        ['День 4', 'Прочитай 10 сторінок книги що відклав', '20 хв'],
        ['День 5', 'Приготуй здорову їжу замість замовлення', '30 хв'],
        ['День 6', 'Запиши одну ціль на наступний місяць', '10 хв'],
        ['День 7', 'Повтори тест — побач перший прогрес', '5 хв'],
      ].map(([day, task, time]) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0">
          <div style="display:flex;align-items:center">
            <span style="font-size:12px;font-weight:bold;color:#20d8a0;min-width:60px">${day}</span>
            <span style="font-size:13px;color:#333;flex:1;padding:0 10px">${task}</span>
            <span style="font-size:11px;color:#999">${time}</span>
          </div>
        </td>
      </tr>`).join('')}
    </table>
    <p style="font-size:14px;color:#333;line-height:1.7;margin-top:20px">Хочеш персональний план саме для твоїх слабких сфер? Він вже є у твоєму звіті:</p>
    <table cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr><td style="background:#20d8a0;border-radius:8px;padding:13px 26px">
        <a href="${resultUrl || 'https://koleso.live'}" style="color:#0f1a10;font-size:14px;font-weight:bold;text-decoration:none">Мій персональний план →</a>
      </td></tr>
    </table>
    <p style="font-size:15px;color:#333">З повагою,<br><strong>Володимир</strong></p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:12px;color:#999"><a href="https://koleso.live/unsubscribe?email=${email}" style="color:#999">Відписатись</a></p>
  </td></tr>
</table></td></tr></table>
</body></html>`
  },
  5: {
    subject: 'Чи є в тебе 15 хвилин цього тижня?',
    html: (email, resultUrl) => `
<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#0f1a10;padding:28px 40px">
    <h1 style="margin:0;font-size:22px;color:#20d8a0">Колесо Життя</h1>
  </td></tr>
  <tr><td style="padding:32px 40px">
    <p style="font-size:15px;color:#333;line-height:1.7">Привіт!</p>
    <p style="font-size:15px;color:#333;line-height:1.7">Тиждень минув після твого тесту. Як справи?</p>
    <p style="font-size:15px;color:#333;line-height:1.7">Якщо хочеш піти глибше — PRO дає тобі:</p>
    <div style="background:#f8f8f8;border-radius:10px;padding:20px;margin:20px 0">
      <p style="margin:0 0 8px;font-size:13px;color:#333;line-height:1.7">✦ <strong>Повний аналіз всіх 12 сфер</strong> з AI-рекомендаціями</p>
      <p style="margin:0 0 8px;font-size:13px;color:#333;line-height:1.7">✦ <strong>Трекінг прогресу</strong> — бач як змінюється баланс</p>
      <p style="margin:0 0 8px;font-size:13px;color:#333;line-height:1.7">✦ <strong>PDF-звіти</strong> для кожного тесту</p>
      <p style="margin:0;font-size:13px;color:#333;line-height:1.7">✦ <strong>Психологічні техніки</strong> з посиланнями на книги</p>
    </div>
    <p style="font-size:14px;color:#333;line-height:1.7">Починається від <strong>99 ₴</strong> — менше ніж чашка кави в день:</p>
    <table cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr><td style="background:#e8c060;border-radius:8px;padding:13px 26px">
        <a href="https://koleso.live/pricing" style="color:#1a1a00;font-size:14px;font-weight:bold;text-decoration:none">Спробувати PRO →</a>
      </td></tr>
    </table>
    <p style="font-size:13px;color:#999;line-height:1.6">14 днів гарантія повернення. Без ризику.</p>
    <p style="font-size:15px;color:#333">З повагою,<br><strong>Володимир</strong></p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:12px;color:#999"><a href="https://koleso.live/unsubscribe?email=${email}" style="color:#999">Відписатись</a></p>
  </td></tr>
</table></td></tr></table>
</body></html>`
  },
  6: {
    subject: 'Хтось схожий на тебе підвищив бал на 2.3 за місяць',
    html: (email, resultUrl) => `
<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#0f1a10;padding:28px 40px">
    <h1 style="margin:0;font-size:22px;color:#20d8a0">Колесо Життя</h1>
  </td></tr>
  <tr><td style="padding:32px 40px">
    <p style="font-size:15px;color:#333;line-height:1.7">Привіт!</p>
    <div style="background:#f0fff8;border-radius:10px;padding:20px;margin:0 0 20px">
      <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#0f6a40">💬 Олена, 34 роки, Київ</p>
      <p style="margin:0;font-size:13px;color:#333;line-height:1.7;font-style:italic">«Прийшла з балом 4.8. Через місяць — 7.1. Найбільше зросла сфера Здоров'я — з 3 до 7. Просто почала ходити пішки на роботу і лягати раніше спати. Колесо показало що саме заважало всьому іншому.»</p>
    </div>
    <div style="background:#f0fff8;border-radius:10px;padding:20px;margin:0 0 20px">
      <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#0f6a40">💬 Максим, 28 років, Львів</p>
      <p style="margin:0;font-size:13px;color:#333;line-height:1.7;font-style:italic">«Думав що в мене проблема з кар'єрою. AI-аналіз показав що коренева причина — у сфері Відпочинку. Виправив це — і кар'єра сама пішла вгору.»</p>
    </div>
    <p style="font-size:14px;color:#333;line-height:1.7">Хочеш побачити що заважає саме тобі? PRO відкриє повний AI-аналіз:</p>
    <table cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr><td style="background:#e8c060;border-radius:8px;padding:13px 26px">
        <a href="https://koleso.live/pricing" style="color:#1a1a00;font-size:14px;font-weight:bold;text-decoration:none">Отримати PRO аналіз →</a>
      </td></tr>
    </table>
    <p style="font-size:15px;color:#333">З повагою,<br><strong>Володимир</strong></p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:12px;color:#999"><a href="https://koleso.live/unsubscribe?email=${email}" style="color:#999">Відписатись</a></p>
  </td></tr>
</table></td></tr></table>
</body></html>`
  },
  7: {
    subject: '30 днів минуло. Що змінилось? + знижка 20%',
    html: (email, resultUrl) => `
<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#0f1a10;padding:28px 40px">
    <h1 style="margin:0;font-size:22px;color:#20d8a0">Колесо Життя</h1>
  </td></tr>
  <tr><td style="padding:32px 40px">
    <p style="font-size:15px;color:#333;line-height:1.7">Привіт!</p>
    <p style="font-size:15px;color:#333;line-height:1.7">Місяць тому ти пройшов Колесо Життя. Саме час перевірити — що змінилось?</p>
    <div style="background:#f8f8f8;border-radius:10px;padding:20px;margin:20px 0;text-align:center">
      <p style="margin:0 0 12px;font-size:14px;color:#333">Пройди тест повторно — побач реальний прогрес</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 auto">
        <tr><td style="background:#20d8a0;border-radius:8px;padding:13px 26px">
          <a href="https://koleso.live" style="color:#0f1a10;font-size:14px;font-weight:bold;text-decoration:none">Пройти повторний тест →</a>
        </td></tr>
      </table>
    </div>
    <div style="background:#fff8e7;border:2px solid #e8c060;border-radius:10px;padding:20px;margin:20px 0">
      <p style="margin:0 0 8px;font-size:15px;font-weight:bold;color:#b8860b">🎁 Спеціальна пропозиція</p>
      <p style="margin:0 0 12px;font-size:13px;color:#333;line-height:1.7">Тільки для тебе — <strong>знижка 20%</strong> на PRO підписку. Дійсна 48 годин.</p>
      <table cellpadding="0" cellspacing="0">
        <tr><td style="background:#e8c060;border-radius:8px;padding:13px 26px">
          <a href="https://koleso.live/pricing" style="color:#1a1a00;font-size:14px;font-weight:bold;text-decoration:none">Активувати зі знижкою 20% →</a>
        </td></tr>
      </table>
    </div>
    <p style="font-size:15px;color:#333">З повагою,<br><strong>Володимир</strong></p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:12px;color:#999"><a href="https://koleso.live/unsubscribe?email=${email}" style="color:#999">Відписатись</a></p>
  </td></tr>
</table></td></tr></table>
</body></html>`
  }
};

// Дні відправки після реєстрації
const LETTER_SCHEDULE = { 2: 1, 3: 3, 4: 5, 5: 7, 6: 14, 7: 30 };

// Додати підписника в чергу листів
async function addToEmailQueue(email) {
  const now = new Date();
  const rows = Object.entries(LETTER_SCHEDULE).map(([letterNum, days]) => ({
    email,
    letter_number: parseInt(letterNum),
    send_at: new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
    sent: false
  }));

  const { error } = await supabase.from('email_queue').insert(rows);
  if (error) console.error('Email queue error:', error);
}

// Endpoint: обробка черги листів (викликається cron-job.org)
app.post('/api/email-sequence/process', async (req, res) => {
  // Простий захист від випадкових викликів
  const secret = req.headers['x-cron-secret'] || req.body?.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Отримуємо всі листи які потрібно відправити зараз
    const { data: pending, error } = await supabase
      .from('email_queue')
      .select('*')
      .eq('sent', false)
      .lte('send_at', new Date().toISOString())
      .limit(50);

    if (error) throw error;
    if (!pending || pending.length === 0) {
      return res.json({ ok: true, sent: 0, message: 'Немає листів для відправки' });
    }

    let sent = 0;
    let failed = 0;

    for (const item of pending) {
      const letter = EMAIL_LETTERS[item.letter_number];
      if (!letter || letter.skip) {
        // Помічаємо як відправлено (пропускаємо)
        await supabase.from('email_queue').update({ sent: true, sent_at: new Date().toISOString() }).eq('id', item.id);
        continue;
      }

      // Отримуємо останній slug результату для цього email
      let resultUrl = 'https://koleso.live';
      try {
        const { data: latestResult } = await supabase
          .from('results')
          .select('slug')
          .order('created_at', { ascending: false })
          .limit(1);
        if (latestResult && latestResult[0]) {
          resultUrl = 'https://koleso.live/result/' + latestResult[0].slug;
        }
      } catch(e) {}

      try {
        await resend.emails.send({
          from: 'Володимир з Колеса Життя <noreply@koleso.live>',
          to: item.email,
          subject: letter.subject,
          html: letter.html(item.email, resultUrl)
        });

        // Помічаємо як відправлено
        await supabase.from('email_queue')
          .update({ sent: true, sent_at: new Date().toISOString() })
          .eq('id', item.id);

        sent++;
      } catch (emailErr) {
        console.error('Email send error:', emailErr);
        failed++;
      }
    }

    res.json({ ok: true, sent, failed });
  } catch (e) {
    console.error('Process error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET endpoint для cron-job.org (підтримує GET запити)
app.get('/api/email-sequence/process', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Перенаправляємо на POST логіку
  req.body = { secret };
  req.headers['x-cron-secret'] = secret;

  try {
    const { data: pending, error } = await supabase
      .from('email_queue')
      .select('*')
      .eq('sent', false)
      .lte('send_at', new Date().toISOString())
      .limit(50);

    if (error) throw error;
    if (!pending || pending.length === 0) {
      return res.json({ ok: true, sent: 0 });
    }

    let sent = 0;
    for (const item of pending) {
      const letter = EMAIL_LETTERS[item.letter_number];
      if (!letter || letter.skip) {
        await supabase.from('email_queue').update({ sent: true, sent_at: new Date().toISOString() }).eq('id', item.id);
        continue;
      }
      try {
        await resend.emails.send({
          from: 'Володимир з Колеса Життя <noreply@koleso.live>',
          to: item.email,
          subject: letter.subject,
          html: letter.html(item.email, 'https://koleso.live')
        });
        await supabase.from('email_queue').update({ sent: true, sent_at: new Date().toISOString() }).eq('id', item.id);
        sent++;
      } catch(e) { console.error('Email error:', e); }
    }

    res.json({ ok: true, sent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/result/:slug', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'result.html'));
});

// WayForPay робить POST redirect на /result/:slug?paid=1 після оплати
app.post('/result/:slug', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'result.html'));
});

app.get('*', function(req, res) {
  res.send(fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'));
});

app.listen(PORT, function() {
  console.log('Колесо Життя на http://localhost:' + PORT);
  console.log('Адмін: http://localhost:' + PORT + '/admin');
});
