# Setup Guide: Google OAuth, Better Stack, Sentry

## 1. Google OAuth (Вход через Google)

### Шаг 1: Google Cloud Console

1. Открой [Google Cloud Console](https://console.cloud.google.com/home/dashboard)
2. Создай новый проект (или выбери существующий):
   - Название: `ProductVideoAI`
   - Нажми **Create**
3. Перейди в [OAuth consent screen](https://console.cloud.google.com/auth/overview):
   - Выбери **External** → нажми **Create**
   - App name: `ProductVideoAI`
   - User support email: `qwadu01@gmail.com`
   - Developer contact: `qwadu01@gmail.com`
   - Нажми **Save and Continue**
4. На странице **Scopes** нажми **Add or Remove Scopes**:
   - Добавь: `openid`, `email`, `profile`
   - Нажми **Update** → **Save and Continue**
5. На странице **Test users**:
   - Добавь свой email: `qwadu01@gmail.com`
   - Нажми **Save and Continue**
6. Перейди в [Clients](https://console.cloud.google.com/auth/clients):
   - Нажми **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `ProductVideoAI Web`
   - **Authorized JavaScript origins**:
     - `https://product-video-ai-frontend.vercel.app`
     - `http://localhost:3000` (для разработки)
   - **Authorized redirect URIs**:
     - `https://ymudwflztglwbrfxjaxt.supabase.co/auth/v1/callback`
   - Нажми **Create**
   - **Скопируй Client ID и Client Secret** — они понадобятся далее

### Шаг 2: Supabase Dashboard

1. Открой [Supabase Dashboard → Auth → Providers](https://supabase.com/dashboard/project/ymudwflztglwbrfxjaxt/auth/providers)
2. Найди **Google** и нажми **Enable**
3. Вставь:
   - **Client ID**: (из Google Cloud Console)
   - **Client Secret**: (из Google Cloud Console)
4. Нажми **Save**

### Шаг 3: Supabase Redirect URLs

1. Перейди в [Auth → URL Configuration](https://supabase.com/dashboard/project/ymudwflztglwbrfxjaxt/auth/url-configuration)
2. В **Redirect URLs** добавь:
   - `https://product-video-ai-frontend.vercel.app`
   - `http://localhost:3000` (для разработки)
3. Нажми **Save**

### Шаг 4: Тест

1. Открой сайт: https://product-video-ai-frontend.vercel.app
2. Нажми **"Войти через Google"**
3. Должен открыться Google consent screen
4. После авторизации — редирект обратно на сайт

---

## 2. Better Stack (Мониторинг инцидентов)

**Что даёт (бесплатно):**
- 10 мониторингов (Uptime checks)
- 100,000 ошибок/мес
- 5,000 session replay
- 3 GB логов (3 дня)
- Slack & Email алерты
- Status page

### Шаг 1: Регистрация

1. Открой [betterstack.com](https://betterstack.com/)
2. Нажми **Get Started — It's Free**
3. Зарегистрируйся через Google или email

### Шаг 2: Создай Uptime Monitor

1. В Dashboard нажми **Uptime** → **Create Monitor**
2. Monitor type: **HTTP(S)**
3. URL: `https://product-video-ai-frontend.vercel.app`
4. Check interval: **30 seconds**
5. Locations: **Europe** (ближе к серверам Supabase)
6. Нажми **Create Monitor**

### Шаг 3: Настрой алерты

1. Перейди в **Settings** → **Alerts**
2. Добавь email: `qwadu01@gmail.com`
3. (Опционально) Подключи Telegram:
   - Создай бота через [@BotFather](https://t.me/BotFather)
   - Скопируй токен
   - В Better Stack: **Settings** → **Integrations** → **Telegram**
   - Вставь токен и Chat ID

### Шаг 4: Мониторинг Edge Functions

Создай дополнительные мониторы для критических Edge Functions:
- `https://ymudwflztglwbrfxjaxt.supabase.co/functions/v1/health`
- (Добавь health check endpoint в Edge Functions при необходимости)

---

## 3. Sentry (Отслеживание ошибок клиент/сервер)

**Что даёт (бесплатно):**
- 5,000 ошибок/мес
- Performance monitoring
- Session replay
- Source maps (для React)
- Alerting

### Шаг 1: Регистрация

1. Открой [sentry.io](https://sentry.io/welcome/)
2. Нажми **Get Started**
3. Выбери **React** как.platform
4. Зарегистрируйся

### Шаг 2: Создай проект

1. В Sentry Dashboard: **Projects** → **Create Project**
2. Platform: **React**
3. Project name: `productvideoai-frontend`
4. Нажми **Create Project**
5. Sentry покажи инструкцию установки — тебе нужен **DSN**

### Шаг 3: Установка в frontend

```bash
cd frontend
npm install @sentry/react
```

Добавь в `frontend/src/main.tsx` (в начало файла, до `ReactDOM.createRoot`):

```tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN", // Вставь свой DSN из Sentry Dashboard
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

### Шаг 4: Sentry для Backend (Edge Functions + Worker)

1. В Sentry: **Projects** → **Create Project** → **Node.js**
2. Project name: `productvideoai-backend`
3. Установи в worker:
```bash
cd worker
npm install @sentry/node
```

4. В `worker/src/index.ts` (в начало):
```tsx
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "YOUR_BACKEND_SENTRY_DSN",
  tracesSampleRate: 1.0,
});
```

### Шаг 5: Настрой алерты

1. В Sentry: **Settings** → **Notifications**
2. Добавь email: `qwadu01@gmail.com`
3. Настрой правила:
   - **New Issue** → Email (сразу)
   - **Regression** → Email
   - **Rate Spike** → Email

---

## Итого: что настроить

| Сервис | Что делаешь | Где |
|--------|-------------|-----|
| Google OAuth | Создаёшь Client ID + Secret | Google Cloud Console |
| Google OAuth | Вставляешь в Supabase | Supabase Dashboard → Auth → Providers |
| Better Stack | Регистрируешься + мониторишь сайт | betterstack.com |
| Sentry | Регистрируешься + ставишь DSN | sentry.io |

### env vars для Vercel (не нужно — код использует Supabase auth напрямую)

Google OAuth работает через Supabase SDK, поэтому клиент ID не нужен в env vars — Supabase хранит его на сервере.

---

## Админ-аккаунт

Email: `qwadu01@gmail.com`
Роль: `admin` (назначается в базе после регистрации)

После регистрации через Google или email+пароль, роль `admin` прописывается запросом:
```sql
UPDATE profiles SET role = 'admin' WHERE id = (SELECT id FROM auth.users WHERE email = 'qwadu01@gmail.com');
```
