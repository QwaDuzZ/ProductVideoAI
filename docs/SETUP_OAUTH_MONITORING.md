# Настройка: Google OAuth + Мониторинг

---

## 1. Вход через Google

Google OAuth работает через Supabase — ты создаёшь Client ID в Google, вставляешь его в Supabase, и кнопка "Войти через Google" уже работает в коде.

### Что сделать (10 минут):

**A. Google Cloud Console**

1. Открой https://console.cloud.google.com/home/dashboard
2. Создай проект → название: `ProductVideoAI`
3. Перейди в **APIs & Services** → **OAuth consent screen**:
   - User type: **External**
   - App name: `ProductVideoAI`
   - Email: `qwadu01@gmail.com`
   - Scopes: добавь `openid`, `email`, `profile`
   - Test users: добавь `qwadu01@gmail.com`
4. Перейди в **Credentials** → **Create Credentials** → **OAuth client ID**:
   - Type: **Web application**
   - Name: `ProductVideoAI`
   - **Authorized JavaScript origins**:
     - `https://product-video-ai-frontend.vercel.app`
     - `http://localhost:3000`
   - **Authorized redirect URIs**:
     - `https://ymudwflztglwbrfxjaxt.supabase.co/auth/v1/callback`
5. Нажми **Create** → **скопируй Client ID и Client Secret**

**B. Supabase Dashboard**

1. Открой https://supabase.com/dashboard/project/ymudwflztglwbrfxjaxt/auth/providers
2. Найди **Google** → **Enable**
3. Вставь Client ID и Client Secret → **Save**
4. Перейди в https://supabase.com/dashboard/project/ymudwflztglwbrfxjaxt/auth/url-configuration
5. В **Redirect URLs** добавь: `https://product-video-ai-frontend.vercel.app`
6. **Save**

**C. Готово**

Кнопка "Войти через Google" уже есть на экране входа. Открой сайт → нажми → Google consent → редирект обратно.

---

## 2. Better Stack — мониторинг сайта

**Зачем:** если сайт ляжет или будет недоступен — ты получишь уведомление в Telegram. Бесплатно.

**Что входит (бесплатно):**
- Uptime мониторинг (каждые 30 сек проверяет доступность)
- 100,000 ошибок/мес
- 5,000 session replay
- Алерты в Telegram и Email

### Настройка:

1. Зарегистрируйся на https://betterstack.com (через Google)
2. Перейди в **Uptime** → **Create Monitor**
3. URL: `https://product-video-ai-frontend.vercel.app`
4. Интервал: **30 seconds** → **Create Monitor**

**Подключи Telegram:**
1. Создай бота через [@BotFather](https://t.me/BotFather) → получи токен
2. В Better Stack: **Settings** → **Integrations** → **Telegram**
3. Вставь токен и Chat ID
4. Теперь при任何 проблемах с сайтом — уведомление прилетает в Telegram

---

## 3. Sentry — отслеживание ошибок

**Зочем:** если у клиента что-то сломалось — ты увидишь ошибку сразу: строку кода, стек, контекст. Бесплатно до 5,000 ошибок/мес.

### Настройка:

1. Зарегистрируйся на https://sentry.io (через Google)
2. Создай проект: **Platform** → React, название: `productvideoai-frontend`
3. Скопируй **DSN** (после создания проекта)
4. Установи:
```bash
cd frontend
npm install @sentry/react
```

5. Добавь в `frontend/src/main.tsx` (в самое начало файла):
```tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "ВСТАВЬ_СВОЙ_DSN",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

6. В Sentry: **Settings** → **Notifications** → добавь email `qwadu01@gmail.com`

**Готово.** Теперь любая ошибка в браузере пользователя автоматически попадает в Sentry с точным местом в коде.

---

## Админ-аккаунт

- Email: `qwadu01@gmail.com`
- Роль: `admin`
- Пароль: задаётся при регистрации

После регистрации, роль `admin` назначается в Supabase Dashboard → SQL Editor:
```sql
UPDATE profiles SET role = 'admin' WHERE id = (SELECT id FROM auth.users WHERE email = 'qwadu01@gmail.com');
```

---

## Частые ошибки

| Ошибка | Решение |
|--------|---------|
| **429 Too Many Requests** | Supabase блокирует на 60 сек. Подожди и попробуй снова. |
| **Email confirmation** | Supabase отправляет письмо при регистрации. Чтобы отключить: Dashboard → Auth → Providers → Email → убери "Confirm email" |
| **Google "redirect_uri_mismatch"** | Проверь что Redirect URI в Google Cloud Console совпадает с `https://ymudwflztglwbrfxjaxt.supabase.co/auth/v1/callback` |
