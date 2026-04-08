# CLAUDE.md — Контекст проєкту koleso.live

## Проєкт
**koleso.live** — AI-інструмент для оцінки балансу 12 сфер життя (Колесо Життя).
Метод ICF-коучингу. AI аналізує сфери і дає персональний план на 7 днів.

## Стек
- **Backend:** Node.js + Express → `server.js` в корені
- **Frontend:** Vanilla JS HTML файли в `public/`
- **DB:** Supabase (PostgreSQL)
- **AI:** Groq API (llama-3.1-8b-instant)
- **Email:** Resend
- **Оплата:** WayForPay (UAH)
- **Deploy:** Vercel Hobby (max 10 сек на функцію!)
- **PDF:** pdfkit

## Структура файлів
```
/
├── server.js              # Головний сервер
├── CLAUDE.md              # Цей файл
└── public/
    ├── index.html         # Головна — тест 12 сфер
    ├── result.html        # Результат + AI план
    ├── pricing.html       # Тарифи + промокод
    ├── account.html       # Особистий кабінет
    ├── admin.html         # Адмін панель
    └── thank-you.html     # Після оплати
```

## Supabase таблиці
- `results` — результати тестів (slug, scores, analysis)
- `settings` — налаштування сайту (key: 'site_config', value: JSON)
- `subscriptions` — підписки користувачів
- `subscribers` — email підписники
- `email_queue` — черга email розсилки
- `reviews` — відгуки

## Важливі константи
- `settings.value.promo_codes` — промокоди зберігаються в Supabase
- `settings` таблиця — RLS вимкнено (`ALTER TABLE public.settings DISABLE ROW LEVEL SECURITY`)
- CRON_SECRET: `koleso2026secret`
- WayForPay returnUrl: `/result/${slug}?paid=1`
- Groq model: `llama-3.1-8b-instant`

## Поточний флоу аналізу
1. Користувач заповнює 12 сфер на `index.html`
2. `runAnalysis()` → зберігає бали в Supabase → редіректить на `result.html?analyzing=1`
3. `result.html` завантажує бали → показує колесо і бали одразу
4. `startStreamingAnalysis(slug)` запускає аналіз по одній сфері
5. Кожна сфера → POST `/api/analyze` → Groq AI → рендерить в `sphList`
6. Пауза 2 сек між запитами (rate limit захист)
7. Після всіх сфер → `/api/results/update-advice` → зберігає в Supabase

## Монетизація
- **Безкоштовно:** 1 аналіз (1 найгірша сфера)
- **PRO Report (99₴):** повний звіт разово
- **PRO Monthly (249₴/міс):** необмежені аналізи + трекінг
- **PRO Yearly (1990₴/рік):** все включено
- **Промокоди:** зберігаються в Supabase, читаються через `/api/promo`
- **100% промокод:** запитує email → створює підписку в `subscriptions`

## PRO статус (localStorage)
```javascript
localStorage.setItem('lw_premium', '1')
localStorage.setItem('lw_premium_email', email)
localStorage.setItem('lw_premium_expires', expires_at)
```
Перевірка терміну при кожному завантаженні.

## API endpoints (server.js)
```
POST /api/results/save          — зберегти результат
GET  /api/results/:slug         — отримати результат
POST /api/results/update-advice — оновити advice після аналізу
POST /api/analyze               — Groq AI proxy (max 10 сек Vercel!)
POST /api/promo                 — валідація промокоду (читає Supabase)
POST /api/promo/use             — збільшити лічильник використань
POST /api/promo/activate        — активувати 100% промокод (з email)
POST /api/subscription/check    — перевірити підписку по email
POST /api/liqpay/checkout       — WayForPay форма оплати
POST /api/liqpay/callback       — WayForPay webhook
POST /api/thank-you             — після оплати (POST redirect)
GET  /api/config                — конфіг сайту з Supabase
GET  /api/admin/stats           — статистика (читає settings з Supabase)
POST /api/admin/settings        — зберегти налаштування в Supabase
POST /api/email-sequence/process— обробка email черги (cron)
```

## Відомі проблеми та рішення
1. **Vercel 10 сек ліміт** — Groq запити можуть падати. Є fallback на прямий Groq з браузера
2. **Groq rate limit** — безкоштовний план. Пауза 2 сек між запитами в startStreamingAnalysis
3. **RLS Supabase** — settings таблиця має RLS вимкнено. Інші таблиці — перевіряй перед записом
4. **Git LF/CRLF** — Windows конвертує закінчення рядків. Інколи git не бачить змін

## Маркетинг
- Telegram канал: @koleso_live
- Instagram: контент-план на 12 постів готовий
- Email sequence: 7 листів (cron-job.org кожні 12 год)
- Launch промокод: `LAUNCH50` (-50%, 50 використань)

## Команди для деплою
```cmd
git add -A
git commit -m "опис змін"
git push
```
Vercel автоматично деплоїть після push в main.
