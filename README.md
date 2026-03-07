# 🌀 Колесо Життя — AI-коуч

Веб-застосунок для оцінки балансу 12 сфер життя з AI-аналізом від Claude.

---

## 🚀 Швидкий старт локально

```bash
# 1. Встанови залежності
npm install

# 2. Створи .env файл
cp .env.example .env
# Відкрий .env і встав свій Anthropic API ключ

# 3. Запусти сервер
npm start
# або для розробки з автоперезавантаженням:
npm run dev

# 4. Відкрий у браузері
# http://localhost:3000
```

---

## ☁️ Деплой на Vercel (безкоштовно, 5 хвилин)

### Крок 1 — GitHub
```bash
git init
git add .
git commit -m "init"
# Створи репозиторій на github.com і запушь:
git remote add origin https://github.com/ТВІЙ_ЛОГІН/life-wheel.git
git push -u origin main
```

### Крок 2 — Vercel
1. Зайди на [vercel.com](https://vercel.com) → Sign up з GitHub
2. **New Project** → обери свій репозиторій `life-wheel`
3. **Environment Variables** → додай:
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-api03-...` (твій ключ)
4. Натисни **Deploy**
5. За 2 хвилини отримаєш посилання типу `life-wheel.vercel.app`

### Крок 3 — Свій домен (опційно)
У Vercel: Settings → Domains → Add → введи свій домен → налаштуй DNS згідно інструкції.

---

## 🚂 Деплой на Railway

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Variables → додай `ANTHROPIC_API_KEY`
3. Готово — Railway автоматично запустить `npm start`

---

## 🛡️ Безпека

- API ключ зберігається тільки на сервері у змінній середовища
- Користувачі **ніколи не бачать** ключ
- Вбудований rate limit: 20 запитів/хвилину з одного IP
- `.env` файл захищений `.gitignore` — не потрапить у git

---

## 💰 Вартість API

| Дія | Токени | Вартість |
|-----|--------|----------|
| 1 аналіз (1 сфера) | ~2000 | ~$0.006 |
| 1 аналіз (3 сфери) | ~6000 | ~$0.018 |
| 100 аналізів/день | ~600K | ~$1.80 |

Моніторинг витрат: [console.anthropic.com](https://console.anthropic.com)

---

## 📁 Структура проекту

```
life-wheel/
├── public/
│   └── index.html      # Весь фронтенд (одна сторінка)
├── server.js           # Express сервер + проксі до Anthropic
├── package.json
├── vercel.json         # Конфіг для Vercel
├── .env.example        # Шаблон змінних середовища
├── .env                # Твій ключ (не в git!)
└── .gitignore
```
