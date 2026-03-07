# Колесо Життя — AI-коуч (Google Gemini)

Веб-застосунок для оцінки балансу 12 сфер життя.
AI-аналіз через Google Gemini 2.0 Flash — безкоштовно до 1500 запитів/день.

## Швидкий старт локально

```bash
npm install
cp .env.example .env
# Відкрий .env і встав свій Gemini ключ (aistudio.google.com)
npm start
# Відкрий http://localhost:3000
```

## Деплой на Vercel

1. Завантаж на GitHub (git init → git add . → git commit → git push)
2. vercel.com → New Project → імпортуй репо
3. Environment Variables → додай:
   - Name:  GEMINI_API_KEY
   - Value: AIzaSy... (твій ключ)
4. Deploy → готово!

## Безкоштовні ліміти Gemini

- 1500 запитів/день — безкоштовно
- ~50 повних аналізів по 3 сфери на день
- При перевищенні: $0.10 за 1M токенів

## Структура проекту

```
life-wheel/
├── public/index.html   — фронтенд
├── server.js           — Express + Gemini проксі
├── package.json
├── vercel.json
├── .env.example
└── .gitignore
```
