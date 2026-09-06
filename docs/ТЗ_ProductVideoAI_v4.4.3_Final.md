# Техническое задание (ТЗ): ProductVideoAI

**Версия:** 4.4.3 Final  
**Тип версии:** MVP-оптимизированная, с нативным Seedance Extend / One-take, полной сохранностью пайплайнов, валидированной Веткой Б, исправленными таймлайнами, очередями, вебхуками и медиа-воркером, усиленной безопасностью профилей и хранилища, формальной машиной состояний, реализованными лимитами, полными контрактами API, контент-модерацией и усиленной защитой биллинга  
**Дата актуализации:** сентябрь 2026  
**Статус:** Готово к передаче в разработку  
**Назначение документа:** единственный источник истины, полный текст под копипаст, без сокращений

---

## ⚠️ АРХИТЕКТУРНЫЙ МАНИФЕСТ ВЕРСИИ 4.4.3

Настоящая конфигурация спроектирована для минимизации фиксированных расходов на этапе валидации гипотезы.

**Важное уточнение:** полностью бесплатная ($0/мес) инфраструктура невозможна при коммерческом использовании, так как:

* Free-тир ElevenLabs запрещает коммерческое использование и требует атрибуции;
* Render не поддерживает полностью бесплатные Cron Jobs для коммерческого production-использования;
* для коммерческой генерации аудио нужен платный тариф ElevenLabs.

Поэтому базовый бюджет MVP зафиксирован на уровне:

**~$6/мес**  
= Render Cron ~$1/мес  
+ ElevenLabs Starter $5/мес

Все решения помечаются как:

* `[MVP ONLY]` — минимально жизнеспособное решение для валидации;
* `[PROD PATH]` — масштабируемое решение для боевого роста.

**Версия 4.3 дополнительно учитывала:**

* Реальную длительность генерации 5–25 минут и безопасный TTL для промежуточных файлов.
* Подключение Render Worker через Supavisor Transaction Pooler, а не напрямую к Postgres.
* Жёсткие JSON-схемы `payload` для всех типов `media_tasks`.
* Явный контракт входящего вебхука Replicate и маппинг полей в `gpu_jobs`.
* Фиксированное окно обработки Ветки Б с padding последнего кадра вместо динамической длины чанка.
* Генерацию тишины строго по длительности видео-донора, а не по длительности проекта.
* Явную эскалацию ошибок Replicate в `projects.status = 'failed'` с автовозвратом кредитов.
* Отдельную таблицу `gpu_jobs` для идемпотентности асинхронных GPU-задач.
* Служебный внутренний контур `internal-media-completed` для продвижения пайплайна после FFmpeg-задач.
* Защиту активных файлов от короткого TTL через `/processing/`.
* Экономический предохранитель для экспериментальной Ветки Б.
* Запрет нереалистичного фиксированного SLA 95 секунд для Ветки Б до бенчмарка.

**Версия 4.4 дополнительно учитывает:**

* Переход Ветки А на нативный Seedance Video Extension / Extend и One-take генерацию.
* Исключение задачи `stitch` из основного пайплайна Ветки А.
* Запрет использования FFmpeg-склейки как основного способа сборки ролика в Ветке А.
* Адаптацию контрактов вызова видеомоделей под мультимодальный формат OpenRouter.
* Повторные попытки только для шага продления, если базовая генерация уже успешна.
* Защиту базового 15-секундного чанка от удаления до завершения цепочки Extend.
* Бесшовность на границе 15 секунд как обязательный критерий приёмки.
* Сохранение задачи `stitch` только как аварийного fallback-механизма для устаревших моделей или аварийного сценария.

**Версия 4.4.1 дополнительно учитывает:**

* Безопасность профилей: запрет пользователю менять `role` и `credits_balance`, автосоздание профиля при регистрации.
* Реестр файлов `storage_assets` и защиту активных файлов от TTL-очистки.
* Формальную машину состояний и серверную реализацию rate limits.
* Единый контракт асинхронной видео-генерации (webhook/polling) для Replicate, OpenRouter и fal.ai.
* Автоматическую медиа-валидацию `ffprobe` на границах шагов пайплайна.
* Полные контракты платежей и подписок с проверкой подписи и идемпотентностью.
* Отключение поблочной перегенерации в MVP и приём доноров Ветки Б до 30 секунд до первого бенчмарка.

**Версия 4.4.2 дополнительно учитывает:**

* Запрет пользовательского изменения биллинговых полей и статуса проекта (`prevent_project_sensitive_update`).
* Отзыв `EXECUTE` на биллинговых и служебных `SECURITY DEFINER`-функциях у пользовательских ролей; биллинг доступен только `service_role`.
* Валидацию стоимости списания: `p_cost > 0`, иначе `INVALID_COST`.
* Запрет удаления товара при наличии активных проектов (`ACTIVE_PROJECT_EXISTS`).
* Обязательную контент-модерацию доноров, карточек товара и промптов до списания кредитов (раздел 6.8).
* Эфемерность видео-доноров: файлы удаляются после терминального статуса проекта, долгосрочное хранение запрещено.
* Явное подтверждение пользователя при фоллбэке на модель более низкого тарифа.

---

# 1. Общие положения и концепция

## 1.1. Суть продукта

Пользователь вводит данные о товаре вручную `[MVP ONLY]` либо загружает ссылку/файл вирусного ролика конкурента.

В дальнейшем, на Фазе 2, будет добавлен автопарсинг ссылок на маркетплейсы через Firecrawl `[PROD PATH]`.

Система:

* извлекает данные товара: фото, цена, характеристики, отзывы;
* либо разбирает референс-видео;
* генерирует готовый вертикальный ролик.

**Базовый формат контента:**  
нативный, органический UGC-обзор в блогерском стиле.

Пользователь настраивает параметры:

* стиль;
* звук;
* язык;
* длительность;
* модель;
* режим финала;
* режим работы с референсом.

Система генерирует ролик асинхронно, ориентировочное время:

**5–25 минут**

Уведомление о готовности в MVP происходит через Supabase Realtime на экране пользователя.

Пользователь скачивает MP4 и публикует его на целевой площадке вручную.

Автозалив отсутствует по дизайну.

---

## 1.2. Контентная политика: нативный контент

Из всей логики генерации сценариев, системных промптов LLM и визуальных шаблонов исключаются агрессивные коммерческие элементы:

* плашки «Купить»;
* указание цен;
* скидки;
* промокоды;
* призывы перейти в магазин;
* призывы подписаться;
* формулировки типа «успей до конца недели»;
* призывы к покупке;
* агрессивные хуки по болям.

Термин «агрессивные хуки по болям» удалён как противоречащий нативной политике.

Вместо них используется драматургический хук удержания:

**retention-hook**

Первые 3 секунды строятся на:

* визуальной интриге;
* неожиданном ракурсе;
* вопросе, органично вытекающем из эстетики товара;
* демонстрации детали, распаковки, использования.

**Цель контента:**  
удержать внимание в ленте соцсетей и вызвать нативный интерес через эстетику, распаковку и реальное использование товара, без давления на зрителя.

---

## 1.3. Ключевые ограничения и правила

### Источники данных товара

* Ручной ввод — дефолт MVP.
* Автопарсинг через Firecrawl API — Фаза 2 / Prod.

### Результат

Готовый файл:

* MP4
* 1080 × 1920
* 9:16

### Архитектурный приоритет по COGS

* Ветка А — нативная генерация Seedance через Extend / One-take + бессерверный апскейл через Replicate.
* Ветка Б — экспериментальный нативный пайплайн на Replicate.

### Запрет основной сшивки в Ветке А

Для Ветки А запрещается использовать задачу `stitch` как основной способ сборки финального видео.

Основной способ:

* Premium: One-take генерация 30 секунд, при 60 секундах — нативное продление до 60 секунд.
* Standard: базовая генерация 15 секунд, затем нативный Extend на 15 секунд и далее до целевой длительности.

`stitch` допускается только как аварийный fallback, если выбранная модель или провайдер не поддерживает нативное продление.

### Ветка Б

Ветка Б:

* не входит в MVP;
* активируется только на Фазе 2;
* только после бенчмарка;
* только после подтверждения экономики;
* только после юридической модалки.

### Длительность проектов

Для Ветки А пользователь выбирает длительность:

* 30 секунд;
* 60 секунд.

Для Ветки Б фактическая длительность результата равна длительности видео-донора:

* от 1 до 60 секунд.

Поэтому в БД `projects.duration_sec` может принимать значение от 1 до 60, но пользовательский выбор для классической генерации ограничен 30 и 60 секундами.

### Администратор

В MVP администратор жёстко привязан к:

`qwadu01@gmail.com`

В Prod планируется модель ролей и эскалации.

### Мультиязычность

Интерфейс и генерация поддерживают:

* RU
* EN
* DE
* ES

### Асинхронность UI

Генерация занимает 5–25 минут.

Статус обновляется через Supabase Realtime WebSocket `[MVP ONLY]`.

### Запрет тяжёлых вычислений в Edge Functions

Edge Functions используются только как оркестратор.

Запрещено:

* запускать FFmpeg внутри Edge Functions;
* выполнять синхронные запросы к Replicate;
* ждать GPU-рендер внутри HTTP-запроса;
* выполнять тяжёлую видеообработку в Supabase.

FFmpeg выполняется только на Render-воркере.

Replicate работает только через вебхуки.

### Лимит видео-донора

Строго:

* до 60 секунд;
* до 150 МБ после клиентского сжатия.

Клиентское сжатие обязательно до 480p.

### Мессенджеры

Интеграция с Telegram полностью удалена из архитектуры MVP.

В MVP уведомления идут только через Supabase Realtime.

Telegram возвращается в Prod.

### Compliance

Пользователь несёт полную ответственность за:

* соблюдение правил рекламных площадок;
* обязательную маркировку контента как рекламы, если видео используется для продвижения товаров;
* наличие прав на загружаемые изображения, видео, музыку и иные материалы;
* использование #ad, "Paid partnership" и иных обязательных обозначений.

Сервис предоставляет инструмент генерации и не является рекламным агентством.

### Активные файлы

Файлы, которые используются активной задачей, не должны удаляться коротким TTL до завершения операции.

Для этого вводится служебная зона:

`/processing/`

### Промежуточные файлы

Промежуточные сегменты должны храниться не меньше максимального реалистичного времени генерации с ретраями.

Для MVP:

`/segments_480p/` — минимум 2 часа.

### Базовые чанки Extend

Если используется цепочка Extend:

* базовый 15-секундный результат сохраняется в `/segments_480p/`;
* базовый чанк используется как `video_url` референс для следующего шага продления;
* базовый чанк не должен удаляться до завершения всех шагов Extend и передачи финального видео в апскейл.

### Подключения к базе данных

Внешние воркеры, включая Render Worker, обязаны подключаться к Supabase через пуллер соединений:

* Supavisor Transaction Pooler;
* порт 6543.

Запрещено использовать прямое подключение к порту 5432 из внешних воркеров в MVP.

### ML-окна в Ветке Б

Все окна обработки в Ветке Б имеют фиксированную длину.

Если видео заканчивается раньше конца окна:

* окно дополняется повтором последнего кадра (freeze-frame padding).

После инференса лишние кадры обрезаются до исходной длительности донора.

---

## 1.4. Пользовательские роли

| Роль | Описание |
|---|---|
| user | Ввод товара, генерация, трата кредитов, история проектов |
| admin | `qwadu01@gmail.com`: всё, что у user + админ-панель + безлимитные кредиты |

---

# 2. Архитектура и технологический стек

## 2.1. Стек технологий

| Слой | Технология | [MVP ONLY] | [PROD PATH] |
|---|---|---|---|
| Frontend | React + Vite + TS + Tailwind + i18next | SPA на Vercel. Модуль клиентского сжатия видео до 480p перед загрузкой | То же + WebCodecs API |
| Backend / БД | Supabase: Postgres + Auth + Storage + Edge Functions + Realtime | Free Tier. RLS, Edge Functions, Realtime. Лимит Storage: 1 ГБ. Внешние воркеры подключаются через Supavisor | Pro Tier, $25/мес. Файлы до 150 МБ, PITR-бэкапы |
| Подключение внешних воркеров к БД | Supavisor | Transaction Pooler, порт 6543, ограничение пула воркера до 1–2 соединений | Dedicated Pooler / Individual worker |
| AI-шлюз LLM/Vision | OpenRouter | gpt-4o-mini, gemini-2.5-flash | То же + приоритетная маршрутизация |
| Видео-генерация | OpenRouter основной, fal.ai резервный | Только семейство Seedance: 2.0 Fast/Standard и 2.5, с поддержкой One-take и Extend | То же |
| Апскейл и V2V | Replicate | Real-ESRGAN, SAM 2, CoTracker, Flux/ControlNet Inpaint | То же |
| Парсинг | Firecrawl, fallback Crawl4AI | В MVP режим ожидания, только ручной ввод | Standard, $83/мес, активация на Фазе 2 |
| Аудио-шлюз | ElevenLabs | Starter, $5/мес. Обязателен с 1-го дня для легального коммерческого использования без водяных знаков | Creator/Pro при росте объёмов |
| Медиа-обработка | FFmpeg в Docker на Render.com | Cron Job, ~$1/мес, опрос БД раз в 5 минут | Individual, $7/мес, постоянно работающий Web-воркер |
| Уведомления | Supabase Realtime / SendGrid | Статус обновляется только в активной вкладке браузера через WebSocket | Возврат Telegram Bot API / SendGrid Email |

---

## 2.2. Архитектура вызовов и ветвление пайплайнов

Supabase Edge Functions выступают только оркестратором.

Ограничения:

* лимит RAM: 256 МБ;
* таймаут: 120–150 секунд.

Тяжёлые вычисления разрешены только:

* на Render-воркере;
* в Replicate.

Общая схема:

```text
Браузер (Vercel)
   │
   ▼
 Supabase Edge Functions (Deno) [Оркестрация и БД]
   ├── manual-input            → запись в products
   ├── parse-product           → Firecrawl API [Фаза 2 / PROD PATH]
   ├── upload-presigned        → выдача Presigned URL
   ├── analyze-reference       → Vision-разбор донора
   ├── generate-prompt-from-video → gemini-2.5-flash: видео-референс → промпт с [PRODUCT_HOLDER]
   ├── create-project          → списание кредитов + запуск пайплайна
   │
   ├── [ВЕТКА А: mode = 'semantic' / 'classic']
   │   ├── generate-tts           → ElevenLabs
   │   ├── generate-video-base    → OpenRouter/fal.ai, Seedance
   │   │                              Premium: One-take 30s
   │   │                              Standard: base 15s
   │   ├── extend-video           → OpenRouter/fal.ai, Seedance Extend
   │   │                              Только если требуется продление до 30/60 секунд
   │   ├── upscale                → gpu_jobs → Replicate Webhook
   │   └── audio-mixing           → media_tasks → Render Cron Worker
   │
   ├── [ВЕТКА Б: mode = 'inpainting', экспериментально]
   │   ├── extract-audio          → media_tasks → Render Cron Worker
   │   ├── v2v-inpainting         → gpu_jobs → Replicate Webhook
   │   └── merge-audio            → media_tasks → Render Cron Worker
   │
   ├── enqueue-media-task       → запись задачи в media_tasks
   ├── internal-media-completed → служебный эндпоинт продвижения пайплайна
   ├── webhook-replicate        → приём POST от Replicate
   ├── webhook-payment-{gw}     → приём POST от платёжных шлюзов
   └── notify-user              → Supabase Realtime [MVP ONLY]
```

---

## 2.3. Принципы асинхронного взаимодействия

### Запрет синхронных GPU-вызовов

Запрещены синхронные запросы к Replicate из Edge Functions.

Любой GPU-рендер запускается асинхронно:

Edge Function → Replicate prediction → webhook → обновление БД

### Внешние вебхуки

Внешние вебхуки принимаются только Supabase Edge Functions.

К ним относятся:

* Replicate;
* платёжные шлюзы.

Edge Function:

* проверяет подлинность вебхука;
* обновляет статус в БД;
* запускает следующий шаг пайплайна;
* рассылает обновления клиентам через Realtime.

### Проверка подписи вебхуков

Все входящие вебхуки должны проверяться на подлинность.

Если провайдер предоставляет криптографическую подпись, используется она.

Если провайдер не предоставляет криптографическую подпись, используется комбинированный механизм:

1. Секретный одноразовый `webhook_token`.
2. Проверка `prediction_id` через официальный API провайдера.
3. Идемпотентная запись по UNIQUE-полю.

Неподписанные или непроверенные запросы отклоняются с кодом:

`401`

### Idempotency

Обработка вебхуков идемпотентна:

* для Replicate — по `prediction_id`;
* для платежей — по `event_id` события шлюза (`payments.event_id`, UNIQUE); сам платёж идентифицируется `gateway_payment_id`.

Повторный вебхук не должен:

* повторно списывать кредиты;
* повторно запускать рендер;
* создавать дубликаты файлов;
* менять статус завершённой задачи.

---

## 2.4. Render FFmpeg Worker

Render Cron Worker `[MVP ONLY]`:

* работает как поллер внутренней таблицы `media_tasks`;
* не принимает входящих вебхуков;
* не является публичным API;
* может скачивать файлы по подписанным или служебным URL;
* может загружать результат в Supabase Storage;
* может вызывать только один внутренний служебный эндпоинт:

`internal-media-completed`

Цель внутреннего вызова:

продвинуть пайплайн после завершения FFmpeg-задачи.

В Prod Worker заменяется на постоянно работающий Web-воркер.

---

## 2.5. Оркестрация после завершения задач

Вводится служебный механизм продвижения пайплайна.

После завершения `media_tasks` Render Worker:

1. Обновляет статус задачи в БД.
2. Сохраняет `result_url`.
3. Вызывает внутренний эндпоинт:

`internal-media-completed`

Edge Function `internal-media-completed`:

* проверяет внутренний токен;
* читает завершённую задачу;
* определяет следующий шаг;
* запускает Replicate-задачу, если нужно;
* создаёт следующую `media_tasks`, если нужно;
* обновляет статус проекта.

Аналогично после вебхука Replicate:

Edge Function `webhook-replicate` обновляет `gpu_jobs`.

Проверяет зависимости.

Создаёт следующую задачу:

* `audio_mix`;
* `merge_audio`;
* или переводит проект в `done`.

Для аварийных сценариев и устаревших моделей допускается создание задачи `stitch`, но в основной Ветке А версии 4.4 это запрещено.

Это устраняет разрыв между:

* FFmpeg-обработкой;
* Replicate-обработкой;
* финальной сборкой.

---

# 3. Модель данных (Supabase / PostgreSQL)

## 3.1. Полный DDL

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. ПОЛЬЗОВАТЕЛИ И ПРОФИЛИ
-- =====================================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  credits_balance INTEGER NOT NULL DEFAULT 0 CHECK (credits_balance >= 0),
  region TEXT DEFAULT 'ru' CHECK (region IN ('ru', 'us', 'eu', 'la')),
  language TEXT DEFAULT 'ru' CHECK (language IN ('ru', 'en', 'de', 'es')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Автоматическое создание профиля после регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    credits_balance,
    region,
    language
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    'user',
    0,
    'ru',
    'ru'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 2. ТОВАРЫ
-- =====================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  source_url TEXT,
  marketplace TEXT,
  input_method TEXT DEFAULT 'manual' CHECK (input_method IN ('manual', 'firecrawl')),
  title TEXT NOT NULL,
  brand TEXT,
  price INTEGER,
  old_price INTEGER,
  description TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  attributes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. АНАЛИЗ ОТЗЫВОВ
-- =====================================================
CREATE TABLE product_reviews_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  pains JSONB DEFAULT '[]'::jsonb,
  joys JSONB DEFAULT '[]'::jsonb,
  raw_reviews_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. ВИДЕО-РЕФЕРЕНСЫ
-- =====================================================
CREATE TABLE video_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  source_video_url TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms <= 60000),
  size_bytes INTEGER CHECK (size_bytes <= 157286400),
  mode TEXT NOT NULL CHECK (mode IN ('semantic', 'inpainting', 'prompt_only', 'classic')),
  motion_skeleton_json JSONB DEFAULT '{}'::jsonb,
  mask_storage_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 5. ПРОЕКТЫ ГЕНЕРАЦИИ
-- =====================================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  reference_id UUID REFERENCES video_references(id) ON DELETE SET NULL,
  prompt TEXT,
  prompt_video_ref_url TEXT,
  user_adjustments TEXT,
  duration_sec INTEGER NOT NULL CHECK (duration_sec >= 1 AND duration_sec <= 60),
  platforms TEXT[] DEFAULT ARRAY['reels']::TEXT[],
  tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'premium')),
  model_id TEXT NOT NULL,
  status TEXT DEFAULT 'queued' CHECK (status IN (
    'draft',
    'queued',
    'script_ready',
    'generating',
    'audio_sync',
    'assembling',
    'done',
    'failed',
    'canceled'
  )),
  error_code TEXT,
  fidelity_score INTEGER,
  continuity_score INTEGER,
  cost_credits INTEGER NOT NULL,
  refunded BOOLEAN DEFAULT FALSE,
  is_free BOOLEAN DEFAULT FALSE,
  result_video_url TEXT,
  language TEXT DEFAULT 'ru' CHECK (language IN ('ru','en','de','es')),
  use_sentiment_triggers BOOLEAN DEFAULT FALSE,
  ugc_type TEXT DEFAULT 'clean' CHECK (ugc_type IN ('clean','avatar','hands','3d_orbit')),
  audio_mode TEXT DEFAULT 'ai_full' CHECK (audio_mode IN ('ai_full','original_donor')),
  outro_mode TEXT DEFAULT 'fade' CHECK (outro_mode IN ('fade','loop')),
  v2v_legal_accepted BOOLEAN DEFAULT FALSE,
  master_audio_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

Резервные поля: `platforms` — целевые площадки публикации (Фаза 2); `fidelity_score` и `continuity_score` — административная оценка качества генерации (Фаза 1). В MVP не заполняются.

-- =====================================================
-- 6. СЕГМЕНТЫ ГЕНЕРАЦИИ
-- =====================================================
CREATE TABLE generation_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  segment_index INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  seed BIGINT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  target_duration_ms INTEGER,
  fidelity_score INTEGER,
  video_url TEXT,
  retry_count INTEGER DEFAULT 0 CHECK (retry_count <= 3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, segment_index)
);

-- =====================================================
-- 7. ОЧЕРЕДЬ МЕДИА-ЗАДАЧ RENDER FFMPEG WORKER
-- =====================================================
CREATE TABLE media_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'stitch',
    'audio_mix',
    'extract_audio',
    'merge_audio',
    'outro',
    'stabilize_chunk'
  )),
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  result_url TEXT,
  error_message TEXT,
  attempts INTEGER DEFAULT 0 CHECK (attempts <= 3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 8. GPU / REPLICATE ЗАДАЧИ
-- =====================================================
CREATE TABLE gpu_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'v2v_inpaint',
    'upscale',
    'segment_gen',
    'video_base',
    'video_extend',
    'video_one_take',
    'reference_analysis',
    'prompt_from_video',
    'tts'
  )),
  provider TEXT NOT NULL DEFAULT 'replicate',
  idempotency_key TEXT UNIQUE,
  prediction_id TEXT UNIQUE,
  provider_job_id TEXT UNIQUE,
  async_mode TEXT NOT NULL DEFAULT 'webhook' CHECK (async_mode IN ('webhook','polling')),
  next_poll_at TIMESTAMPTZ,
  poll_attempts INTEGER NOT NULL DEFAULT 0 CHECK (poll_attempts <= 20),
  webhook_token TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_url TEXT,
  output_duration_ms INTEGER,
  output_width INTEGER,
  output_height INTEGER,
  error_message TEXT,
  cost_estimate_usd NUMERIC(10,4),
  cost_actual_usd NUMERIC(10,4),
  attempts INTEGER DEFAULT 0 CHECK (attempts <= 3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 9. ТРАНЗАКЦИИ КРЕДИТОВ
-- =====================================================
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 10. ПЛАТЕЖИ
-- =====================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  gateway_payment_id TEXT UNIQUE NOT NULL,
  event_id TEXT UNIQUE,
  payment_gateway TEXT NOT NULL CHECK (payment_gateway IN ('prodamus','payselection','lavatop','cryptocloud')),
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL,
  credits_awarded INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded')),
  raw_payload JSONB,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  refund_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 11. ПОДПИСКИ
-- =====================================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  gateway_name TEXT NOT NULL CHECK (gateway_name IN ('prodamus','payselection','lavatop','cryptocloud')),
  external_sub_id TEXT UNIQUE,
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('starter','growth','scale','basic','pro','ent')),
  status TEXT NOT NULL CHECK (status IN ('trialing','active','past_due','canceled','expired')),
  credits_allowance INTEGER NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  is_renewable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 11.1. СОБЫТИЯ ПОДПИСОК
-- =====================================================
CREATE TABLE subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  gateway_name TEXT NOT NULL CHECK (gateway_name IN ('lavatop','cryptocloud')),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  status_from TEXT,
  status_to TEXT NOT NULL,
  raw_payload JSONB,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 12. ПРОВАЙДЕРЫ
-- =====================================================
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 100
);

-- =====================================================
-- 13. МОДЕЛИ ВИДЕОГЕНЕРАЦИИ
-- =====================================================
CREATE TABLE video_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('standard','premium')),
  resolution TEXT NOT NULL DEFAULT '1080p',
  cost_usd_per_sec NUMERIC(8,5) NOT NULL,
  credits_price_30s INTEGER NOT NULL,
  providers JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 100
);

-- =====================================================
-- 14. РЕЕСТР ФАЙЛОВ ХРАНИЛИЩА (STORAGE ASSETS)
-- =====================================================
CREATE TABLE storage_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  reference_id UUID REFERENCES video_references(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  bucket_id TEXT NOT NULL,
  object_name TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'reference_upload',
    'prompt_ref_upload',
    'product_image',
    'processing_donor',
    'segment_base',
    'segment_extend',
    'upscale_input',
    'upscale_output',
    'voiceover',
    'music',
    'sfx',
    'audio_mix_input',
    'final_result'
  )),
  protected_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bucket_id, object_name)
);

-- =====================================================
-- 15. ГОЛОСА TTS
-- =====================================================
CREATE TABLE tts_voices (
  language TEXT PRIMARY KEY CHECK (language IN ('ru', 'en', 'de', 'es')),
  provider TEXT NOT NULL DEFAULT 'elevenlabs',
  voice_id TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 16. СЧЁТЧИКИ RATE LIMITS
-- =====================================================
CREATE TABLE rate_limit_counters (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0
);

-- =====================================================
-- 17. ЖУРНАЛ ДЕЙСТВИЙ АДМИНИСТРАТОРОВ
-- =====================================================
CREATE TABLE admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 18. ЖУРНАЛ КОНТЕНТ-МОДЕРАЦИИ
-- =====================================================
CREATE TABLE moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  material_type TEXT NOT NULL CHECK (material_type IN (
    'donor_video','product_description','product_image','prompt','script'
  )),
  material_ref TEXT,
  category TEXT,
  model TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_actions_admin_id ON admin_actions(admin_id);
CREATE INDEX idx_moderation_events_user_id ON moderation_events(user_id);

-- =====================================================
-- ИНДЕКСЫ
-- =====================================================
CREATE INDEX idx_products_user_id ON products(user_id);
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_media_tasks_status_created ON media_tasks(status, created_at);
CREATE INDEX idx_media_tasks_project_id ON media_tasks(project_id);
CREATE INDEX idx_gpu_jobs_project_id ON gpu_jobs(project_id);
CREATE INDEX idx_gpu_jobs_status ON gpu_jobs(status);
CREATE INDEX idx_generation_segments_project ON generation_segments(project_id);
CREATE INDEX idx_gpu_jobs_next_poll_at ON gpu_jobs(next_poll_at) WHERE status IN ('pending','processing');
CREATE INDEX idx_storage_assets_project_id ON storage_assets(project_id);
CREATE INDEX idx_storage_assets_reference_id ON storage_assets(reference_id);
CREATE INDEX idx_storage_assets_protected_until ON storage_assets(protected_until);
CREATE INDEX idx_subscription_events_subscription_id ON subscription_events(subscription_id);

-- =====================================================
-- АВТООБНОВЛЕНИЕ updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_set_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER media_tasks_set_updated_at
BEFORE UPDATE ON media_tasks
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER gpu_jobs_set_updated_at
BEFORE UPDATE ON gpu_jobs
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
```

---

## 3.2. Row Level Security

RLS обязателен для всех пользовательских таблиц.

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpu_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
```

Функция проверки администратора:

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;
```

Пользовательские политики:

```sql
CREATE POLICY "profiles_select_own"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- Безопасная политика: пользователю запрещено менять чувствительные поля.
-- Старая небезопасная политика удаляется.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_update_own_safe"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "products_own"
ON products FOR ALL
USING (auth.uid() = user_id);

CREATE POLICY "video_references_own"
ON video_references FOR ALL
USING (auth.uid() = user_id);

CREATE POLICY "projects_own"
ON projects FOR ALL
USING (auth.uid() = user_id);

CREATE POLICY "payments_select_own"
ON payments FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "subscriptions_select_own"
ON subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "credit_tx_select_own"
ON credit_transactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "segments_via_project"
ON generation_segments FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = project_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "reviews_via_product"
ON product_reviews_analysis FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM products pr
    WHERE pr.id = product_id
      AND pr.user_id = auth.uid()
  )
);

CREATE POLICY "media_tasks_select_own"
ON media_tasks FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = project_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "gpu_jobs_select_own"
ON gpu_jobs FOR SELECT
USING (auth.uid() = user_id);
```

Админ-политики:

```sql
CREATE POLICY "admin_all_profiles"
ON profiles FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_products"
ON products FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_projects"
ON projects FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_media_tasks"
ON media_tasks FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_gpu_jobs"
ON gpu_jobs FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_credit_transactions"
ON credit_transactions FOR ALL
USING (is_admin())
WITH CHECK (is_admin());
```

Edge Functions используют `service_role` ключ, обходящий RLS.

Запись в биллинг, кредиты, очередь медиа-задач и GPU-очередь разрешена только через `service_role`.

### Защита чувствительных полей профиля

Пользователю запрещено изменять `role` и `credits_balance` при любом способе обновления строки профиля. Запрет обеспечивается триггером, а не только политикой:

```sql
CREATE OR REPLACE FUNCTION public.prevent_profile_sensitive_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'FORBIDDEN_ROLE_UPDATE';
    END IF;

    IF NEW.credits_balance IS DISTINCT FROM OLD.credits_balance THEN
      RAISE EXCEPTION 'FORBIDDEN_CREDITS_UPDATE';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_prevent_sensitive_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_sensitive_update();
```

Изменение `role` и `credits_balance` разрешено только через `service_role` (биллинг, админ-панель, начисление кредитов).

### Защита биллинговых полей и статуса проекта

Пользователю запрещено изменять поля проекта, влияющие на биллинг и результат. Триггер блокирует пользовательский `UPDATE` критичных полей; серверные переходы выполняются под `service_role` (где `auth.uid()` пуст) и проходят свободно:

```sql
CREATE OR REPLACE FUNCTION public.prevent_project_sensitive_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.user_id THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.cost_credits IS DISTINCT FROM OLD.cost_credits
       OR NEW.refunded IS DISTINCT FROM OLD.refunded
       OR NEW.result_video_url IS DISTINCT FROM OLD.result_video_url
       OR NEW.error_code IS DISTINCT FROM OLD.error_code THEN
      RAISE EXCEPTION 'FORBIDDEN_PROJECT_UPDATE';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_prevent_sensitive_update
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.prevent_project_sensitive_update();
```

Пользователю разрешено изменять только нерегулируемые поля (`user_adjustments`, `prompt`, `user_metadata` и подобные) до перехода проекта в активную генерацию.

### Запрет удаления товара с активными проектами

Удаление товара блокируется, пока по нему есть активный проект (`draft`…`assembling`), чтобы пользователь не потерял оплаченную генерацию в работе:

```sql
CREATE OR REPLACE FUNCTION public.prevent_product_delete_with_active_projects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.product_id = OLD.id
      AND p.status NOT IN ('done', 'failed')
  ) THEN
    RAISE EXCEPTION 'ACTIVE_PROJECT_EXISTS';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER products_prevent_delete_active
BEFORE DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.prevent_product_delete_with_active_projects();
```

---

## 3.3. Атомарная работа с кредитами

`[MVP ONLY]`

Пессимистическая блокировка `FOR UPDATE` для списания кредитов заменена на атомарный апдейт с проверкой баланса.

Это сделано, чтобы избежать блокировок и 504 ошибок при ограниченных соединениях Free-БД.

```sql
CREATE OR REPLACE FUNCTION public.charge_credits(
  p_user_id UUID,
  p_cost INT,
  p_reason TEXT,
  p_project_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RAISE EXCEPTION 'INVALID_COST';
  END IF;

  UPDATE profiles 
  SET credits_balance = credits_balance - p_cost 
  WHERE id = p_user_id
    AND credits_balance >= p_cost;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  IF rows_updated = 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  INSERT INTO credit_transactions (user_id, amount, reason, project_id)
  VALUES (p_user_id, -p_cost, p_reason, p_project_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

Возврат кредитов по проекту:

```sql
CREATE OR REPLACE FUNCTION public.refund_project_credits(p_project_id UUID)
 RETURNS VOID AS $$
 DECLARE
   rec RECORD;
 BEGIN
   SELECT user_id, cost_credits, refunded
   INTO rec
   FROM projects
   WHERE id = p_project_id
   FOR UPDATE;
   IF rec.refunded OR rec.cost_credits IS NULL OR rec.cost_credits <= 0 THEN
     RETURN;
   END IF;
   UPDATE profiles
   SET credits_balance = credits_balance + rec.cost_credits
   WHERE id = rec.user_id;
   INSERT INTO credit_transactions (user_id, amount, reason, project_id)
   VALUES (rec.user_id, rec.cost_credits, 'refund', p_project_id);
   UPDATE projects
   SET refunded = TRUE
   WHERE id = p_project_id;
 END;
 $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
 ```

Триггер автовозврата при падении проекта:

```sql
CREATE OR REPLACE FUNCTION trg_refund_on_failed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'failed'
     AND OLD.status <> 'failed'
     AND NOT NEW.refunded THEN
    PERFORM refund_project_credits(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_refund_trigger
AFTER UPDATE OF status ON projects
FOR EACH ROW EXECUTE FUNCTION trg_refund_on_failed();
```

### Права вызова функций (защита биллинга от RPC-вызовов)

По умолчанию функции схемы `public` доступны пользователю через PostgREST `/rpc`. Биллинговые и служебные функции не должны вызываться пользовательскими сессиями:

```sql
REVOKE EXECUTE ON FUNCTION public.charge_credits FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_project_credits FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_temp_storage FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_asset_protected FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_sensitive_update FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_project_sensitive_update FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_product_delete_with_active_projects FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_active_user_projects FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_active_generations FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_active_v2v_jobs FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.charge_credits TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_project_credits TO service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO service_role;
GRANT EXECUTE ON FUNCTION public.count_active_user_projects TO service_role;
GRANT EXECUTE ON FUNCTION public.count_active_generations TO service_role;
GRANT EXECUTE ON FUNCTION public.count_active_v2v_jobs TO service_role;
GRANT EXECUTE ON FUNCTION public.is_asset_protected TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_temp_storage TO service_role;
```

Правила:

* стоимость всегда рассчитывается сервером из тарифа (раздел 7.2); клиент никогда не передаёт стоимость; вызов `charge_credits` с `p_cost <= 0` отклоняется с кодом `INVALID_COST`;
* `FOR UPDATE` на одной строке проекта в `refund_project_credits` — осознанное исключение из правила «атомарный UPDATE вместо `FOR UPDATE`»: блокируется одна запись в короткой транзакции, что исключает двойной возврат.
* `SECURITY DEFINER`-функция может быть открыта пользовательским ролям только если она спроектирована как пользовательский RPC и прошла проверку безопасности;
* `is_admin()` остаётся доступной пользователю, так как используется внутри RLS-политик; она только читает роль и не изменяет данные.

---

## 3.4. Хранилище и жизненный цикл файлов

| Папка | Содержимое | TTL |
|---|---|---|
| `/specials/` | HD-фото товара, ручные загрузки | бессрочно |
| `/uploads/references/` | Видео-доноры для V2V | `[MVP ONLY]` 15 минут / `[PROD PATH]` удаление после терминального статуса проекта |
| `/processing/v2v/` | Активные копии видео-доноров для Ветки Б | 6 часов или до завершения проекта |
| `/uploads/prompt_refs/` | Видео для декомпозиции в промпт | удаляется сразу после обработки, максимум 1 час |
| `/segments_480p/` | Промежуточные сегменты 480p, включая базовые чанки Extend | `[MVP ONLY]` 2 часа / `[PROD PATH]` 30 дней |
| `/results/` | Готовые 1080p-ролики | 90 дней |

### Фото товара при удалении

Файлы, зарегистрированные в `storage_assets` с `purpose='product_image'`, удаляются при удалении товара: сервер сначала читает `object_name` из реестра и удаляет объекты из `/specials/`, затем удаляет запись товара. Бессрочный TTL `/specials/` не оставляет файлы удалённых товаров навсегда — удаление выполняется по событию, а не по времени.

### Эфемерность видео-доноров

Видео-доноры не хранятся долгосрочно:

* после перехода проекта в терминальный статус (`done` или `failed`) оригинал донора и его рабочая копия `/processing/v2v/` подлежат удалению;
* долгосрочное хранение донор-видео запрещено (приватность пользователя и стоимость хранения);
* повторное использование донора в новом проекте выполняется повторной загрузкой файла.

### Правило активного файла

Если видео-донор используется активной задачей Ветки Б:

* Исходный файл может находиться в `/uploads/references/`.
* Перед стартом GPU-обработки Edge Function копирует файл в:

`/processing/v2v/{project_id}/donor.mp4`

Дальнейшие этапы используют только копию из `/processing/`.

Это защищает пайплайн от ситуации, когда исходный файл удалён через 15 минут, а задача ещё находится в очереди.

### Правило промежуточных сегментов

Промежуточные сегменты Ветки А не должны удаляться во время генерации.

Поскольку полная генерация может занимать 5–25 минут, а с ретраями и очередью дольше, TTL для `/segments_480p/` устанавливается:

**2 часа**

### Правило базового чанка Extend

Для цепочки Extend:

* файл базового 15-секундного видео сохраняется в `/segments_480p/`;
* файл не удаляется до завершения всех шагов Extend;
* файл не удаляется до передачи финального монолитного видео в апскейл;
* при падении проекта файл может быть удалён по общему TTL.

### Правило обязательной регистрации файлов

Каждый файл, который участвует в пайплайне, обязан быть зарегистрирован в таблице `storage_assets` (DDL в разделе 3.1) до создания задачи, которая этот файл использует:

* видео-донор и его копия в `/processing/v2v/`;
* фото товара и ручные загрузки;
* prompt-reference видео;
* базовый чанк и каждый Extend-чанк;
* входы и выходы апскейла;
* voiceover, музыка, SFX, входы аудио-микса;
* финальный результат.

Регистрация выполняется атомарно при выдаче `upload-presigned` либо при создании файловой копии служебной функцией. `protected_until` устанавливается для файлов с гарантированным минимальным временем жизни (например, донор в обработке — до завершения проекта).

Файл считается защищённым, если выполняется хотя бы одно условие:

* `storage_assets.protected_until > NOW()`;
* связанный проект находится в активном статусе: `draft`, `queued`, `script_ready`, `generating`, `audio_sync`, `assembling`;
* по проекту есть активная `media_tasks` (`pending`, `processing`);
* по проекту есть активная `gpu_jobs` (`pending`, `processing`).

Удаление защищённого файла запрещено. Удаление только по TTL без проверки реестра запрещено.

### Авто-очистка хранилища

Очистка обязана проверять `storage_assets`, активный статус проекта, связанные `media_tasks` и связанные `gpu_jobs`. Удаление только по TTL запрещено.

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.is_asset_protected(
  p_bucket_id TEXT,
  p_object_name TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM storage_assets sa
    WHERE sa.bucket_id = p_bucket_id
      AND sa.object_name = p_object_name
      AND (
        sa.protected_until > NOW()
        OR EXISTS (
          SELECT 1
          FROM projects p
          WHERE p.id = sa.project_id
            AND p.status NOT IN ('done', 'failed')
        )
        OR EXISTS (
          SELECT 1
          FROM media_tasks mt
          WHERE mt.project_id = sa.project_id
            AND mt.status IN ('pending', 'processing')
        )
        OR EXISTS (
          SELECT 1
          FROM gpu_jobs gj
          WHERE gj.project_id = sa.project_id
            AND gj.status IN ('pending', 'processing')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.cleanup_temp_storage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Референсы, которые не были активированы в обработку
  DELETE FROM storage.objects o
  WHERE o.bucket_id = 'uploads'
    AND o.name LIKE 'references/%'
    AND o.created_at < NOW() - INTERVAL '15 minutes'
    AND NOT public.is_asset_protected(o.bucket_id, o.name);

  -- Видео для декомпозиции промпта
  DELETE FROM storage.objects o
  WHERE o.bucket_id = 'uploads'
    AND o.name LIKE 'prompt_refs/%'
    AND o.created_at < NOW() - INTERVAL '1 hour'
    AND NOT public.is_asset_protected(o.bucket_id, o.name);

  -- Промежуточные сегменты 480p, включая базовые чанки Extend
  DELETE FROM storage.objects o
  WHERE o.bucket_id = 'segments_480p'
    AND o.created_at < NOW() - INTERVAL '2 hours'
    AND NOT public.is_asset_protected(o.bucket_id, o.name);

  -- Обработанные активные копии Ветки Б
  DELETE FROM storage.objects o
  WHERE o.bucket_id = 'processing'
    AND o.name LIKE 'v2v/%'
    AND o.created_at < NOW() - INTERVAL '6 hours'
    AND NOT public.is_asset_protected(o.bucket_id, o.name);
END;
$$;

SELECT cron.schedule(
  'cleanup-temp-storage',
  '*/15 * * * *',
  $$SELECT cleanup_temp_storage();$$
);
```

Если проект не завершился в течение 6 часов, задача должна быть переведена в `failed` с автовозвратом кредитов (возврат выполняется только при `cost_credits > 0`, разделы 3.3 и 7.5).

---

## 3.5. Идемпотентность GPU-задач

Таблица `gpu_jobs` обязательна для всех async Replicate-операций.

Каждая задача должна иметь:

* `project_id`;
* `user_id`;
* `job_type`;
* `provider`;
* `idempotency_key`;
* `prediction_id`;
* `webhook_token`;
* `status`;
* `input_payload`;
* `output_url`;
* `error_message`;
* `cost_estimate_usd`;
* `cost_actual_usd`.

Запрещено:

* обрабатывать вебхук без поиска `gpu_jobs`;
* менять статус проекта без записи в `gpu_jobs`;
* создавать повторную GPU-задачу без проверки существующей активной записи;
* доверять телу вебхука без проверки `prediction_id` или подписи.

---

## 3.6. Обязательные JSON-схемы `media_tasks.payload`

Поле `payload` не является свободным объектом.

Каждый `task_type` обязан соответствовать фиксированной схеме.

Валидация выполняется:

* при создании задачи в Edge Function;
* при обработке задачи в Render Worker.

Рекомендуемый инструмент валидации:

Zod

---

### 3.6.1. `stitch`

**Статус:** DEPRECATED для основного пайплайна Ветки А в версии 4.4.

Задача сохраняется только как аварийный механизм для:

* устаревших моделей без поддержки Extend;
* аварийного fallback-сценария;
* ручной админ-операции;
* совместимости со старыми проектами, если они существуют.

Используется для сшивки сегментов Ветки А только в fallback-режиме.

```json
{
  "segment_urls": [
    "https://.../segments_480p/project_id/seg_0.mp4",
    "https://.../segments_480p/project_id/seg_1.mp4"
  ],
  "target_fps": 24,
  "resolution": "1080x1920",
  "strip_audio": true,
  "output_path": "segments_480p/project_id/stitched.mp4"
}
```

Обязательные поля:

* `segment_urls`
* `output_path`
* `target_fps`
* `resolution`

---

### 3.6.2. `audio_mix`

Используется для финального аудио-микса Ветки А.

```json
{
  "video_url": "https://.../results/project_id/upscaled.mp4",
  "voiceover_url": "https://.../audio/project_id/voiceover.mp3",
  "music_url": "https://.../audio/project_id/music.mp3",
  "sfx_url": "https://.../audio/project_id/sfx.mp3",
  "output_path": "results/project_id/final_mixed.mp4"
}
```

Обязательные поля:

* `video_url`
* `voiceover_url`
* `output_path`

Опциональные поля:

* `music_url`
* `sfx_url`

Если `music_url` или `sfx_url` отсутствуют, соответствующие входы в FFmpeg не добавляются.

---

### 3.6.3. `extract_audio` (Ветка Б, Фаза 2)

Используется для извлечения оригинального звука донора в Ветке Б
и для серверного измерения фактической длительности донора.

{
  "donor_video_url": "https://.../processing/v2v/project_id/donor.mp4",
  "donor_duration_ms": 14500,
  "output_path": "processing/v2v/project_id/original_audio.m4a"
}

Обязательные поля:
`donor_video_url`
`donor_duration_ms`
`output_path`

Поля результата (дописываются воркером в `payload` после измерения):
`measured_duration_ms` — фактическая длительность по данным `ffprobe`;
`duration_exceeded` — true, если фактическая длительность > 60000 мс.

Критические правила:
`donor_duration_ms` — заявленная клиентом длительность. Используется только
для предварительной оценки и отображения в интерфейсе до запуска задачи;
`measured_duration_ms` — единственный источник истины для биллинга, генерации
тишины, `target_duration_ms` в `merge_audio` и проверки лимита 60 секунд;
запрещено использовать `projects.duration_sec` вместо измеренной длительности
донора.

---

### 3.6.4. `merge_audio` (Ветка Б, Фаза 2)

Используется для слияния обработанного тихого видео и оригинального звука донора.

```json
{
  "silent_video_url": "https://.../processing/v2v/project_id/swapped_silent.mp4",
  "audio_url": "https://.../processing/v2v/project_id/original_audio.m4a",
  "target_duration_ms": 14500,
  "output_path": "results/project_id/final_cloned_video.mp4"
}
```

Обязательные поля:

* `silent_video_url`
* `audio_url`
* `target_duration_ms`
* `output_path`

Критическое правило:

Итоговая длительность должна быть равна `target_duration_ms / 1000`.

Если инференс добавлял padding-кадры, они обрезаются на этом этапе.

---

### 3.6.5. `outro`

Используется для финальной обработки outro.

```json
{
  "video_url": "https://.../results/project_id/final_mixed.mp4",
  "master_audio_duration_ms": 28700,
  "mode": "fade",
  "output_path": "results/project_id/final_outro.mp4"
}
```

Обязательные поля:

* `video_url`
* `master_audio_duration_ms`
* `mode`
* `output_path`

Допустимые значения `mode`:

* `fade`
* `loop`

---

### 3.6.6. `stabilize_chunk`

Используется для стабилизации перегенерированных чанков.

```json
{
  "raw_chunk_url": "https://.../segments_480p/project_id/raw_chunk_2.mp4",
  "target_duration_ms": 5000,
  "output_path": "segments_480p/project_id/stabilized_chunk_2.mp4"
}
```

Обязательные поля:

* `raw_chunk_url`
* `target_duration_ms`
* `output_path`

---

# 4. Контракты API (Edge Functions)

Общий формат:

```text
POST/GET https://<project>.supabase.co/functions/v1/<endpoint>
Authorization: Bearer <JWT пользователя>
```

Для служебных внутренних эндпоинтов используется отдельный заголовок:

```text
X-Internal-Token: <INTERNAL_EDGE_TOKEN>
```

---

## 4.1. Карта эндпоинтов

| Эндпоинт | Метод | Назначение |
|---|---|---|
| manual-input | POST | Ручное создание карточки товара |
| parse-product | POST | Автопарсинг по ссылке, Фаза 2 |
| upload-presigned | POST | Выдача Presigned URL для прямой загрузки |
| generate-prompt-from-video | POST | Видео-референс → промпт с `[PRODUCT_HOLDER]` |
| analyze-reference | POST | Семантический разбор донора |
| create-project | POST | Создание проекта, списание кредитов, запуск пайплайна |
| projects/:id/status | GET | Текущий статус и прогресс |
| projects/:id/cancel | POST | Отказ пользователя от сценария в `script_ready`: `canceled` + автовозврат |
| create-payment | POST | Создание платежа: сумма, валюта и кредиты фиксируются сервером |
| create-subscription | POST | Создание подписки, Фаза 1 |
| projects/:id/regenerate-segment | POST | Отключено в MVP: возвращает `501 FEATURE_DISABLED`. Фаза 2 |
| internal-media-completed | POST | Служебное продвижение пайплайна после Render-задачи |
| webhook-replicate | POST | Приём результатов GPU-рендера |
| webhook-payment-:gateway | POST | Приём результатов оплаты |
| poll-async-jobs | POST | Служебный опрос асинхронных video-generation задач без webhook (раздел 4.5) |

---

## 4.2. Ключевые схемы

### `upload-presigned`

Запрос:

```json
{
  "file_name": "ref.mp4",
  "content_type": "video/mp4",
  "size_bytes": 94371840,
  "target": "references"
}
```

Ответ 200:

```json
{
  "signed_url": "https://....supabase.co/storage/.../token=...",
  "token": "abc123",
  "ttl_sec": 900
}
```

---

### `create-project`

Запрос:

```json
{
  "product_id": "uuid",
  "reference_id": "uuid | null",
  "duration_sec": 30,
  "tier": "standard",
  "model_id": "bytedance/seedance-2.0-fast",
  "language": "ru",
  "ugc_type": "hands",
  "outro_mode": "fade",
  "audio_mode": "ai_full",
  "use_sentiment_triggers": true,
  "v2v_legal_accepted": false
}
```

Правила:
для классической генерации `duration_sec` может быть только 30 или 60;
для Ветки Б `duration_sec` рассчитывается из `video_references.duration_ms`
как предварительная оценка;
для Ветки Б (Фаза 2) проект создаётся в `status = 'draft'`, `cost_credits = 0`;
списание кредитов выполняется только после серверного измерения длительности
донора (шаг 5 раздела 6.6);
значение `video_references.duration_ms`, переданное клиентом, используется
только для предварительной оценки и отображения в интерфейсе;
`estimated_cost_credits` рассчитывается из тарифа стандарт: например, донор ≤ 30 с — 50 = 35 + 15;
если `reference.mode = 'inpainting'`, поле:
"v2v_legal_accepted": true
обязательно;
для `audio_mode = 'original_donor'` обязателен `reference_id` с `reference.mode = 'inpainting'` (Ветка Б); семантический референс Ветки А режим не открывает; при несоблюдении условия сервер возвращает `400 VALIDATION_ERROR`;

Ответ 200 (классическая генерация):

```json
{
  "project_id": "uuid",
  "status": "queued",
  "cost_credits": 35,
  "eta_minutes": 12
}
```

Ответ 200 (Ветка Б, Фаза 2):

```json
{
  "project_id": "uuid",
  "status": "draft",
  "cost_credits": 0,
  "estimated_cost_credits": 50,
  "eta_minutes": 12
}
```

---

### `internal-media-completed`

Служебный эндпоинт.
Вызывается только Render Worker.

Заголовок:
X-Internal-Token: <INTERNAL_EDGE_TOKEN>

Тело:
{
  "media_task_id": "uuid",
  "project_id": "uuid",
  "task_type": "audio_mix",
  "status": "done"
}

Допустимые `status`:
`done`
`failed`

Ответ 200:
{
  "ok": true,
  "next_action": "start_upscale"
}

Возможные `next_action`:
`none`
`start_upscale`
`start_v2v_inpaint`
`start_audio_mix`
`start_merge_audio`
`mark_project_done`
`mark_project_failed`

Особая обработка `extract_audio`:

При `task_type = 'extract_audio'` Edge Function обязан прочитать
`payload.measured_duration_ms` и `payload.duration_exceeded`
завершённой задачи:

при `duration_exceeded = true`:
перевести проект в `failed` с `error_code = 'DONOR_DURATION_EXCEEDED'`;
кредиты не списывались, возврат не требуется;

при `duration_exceeded = false`:
рассчитать стоимость по `measured_duration_ms` (правило раздела 7.2);
обновить `projects.duration_sec` измеренным значением;
выполнить `charge_credits`;
при нехватке кредитов перевести проект в `failed`
с `error_code = 'INSUFFICIENT_CREDITS_ACTUAL'`;
при успешном списании зафиксировать `projects.cost_credits`,
перевести проект в `queued` и запустить `gpu_jobs.v2v_inpaint`.

---

### `webhook-replicate`

Вебхук обязан:

1. Проверить подпись или `webhook_token`.
2. Найти запись в `gpu_jobs` по `prediction_id`.
3. Проверить статус через Replicate API, если подпись провайдера недоступна.
4. Идемпотентно обновить статус.
5. Запустить следующий шаг пайплайна.
6. Обновить статус проекта.

При ошибке проверки:

`401 Unauthorized`

При повторном вебхуке:

`200 OK`, без повторного выполнения побочных эффектов.

### Контракт входящего вебхука Replicate

Ожидаемое тело вебхука:

```json
{
  "id": "pred_8x7y6z5w",
  "status": "succeeded",
  "output": "https://replicate.delivery/pbxt.com/.../out.mp4",
  "error": null,
  "metrics": {
    "predict_time": 45.12
  }
}
```

Маппинг полей:

| Поле Replicate | Поле БД | Назначение |
|---|---|---|
| `id` | `gpu_jobs.prediction_id` | Идемпотентный ключ задачи |
| `status` | `gpu_jobs.status` | Отображение состояния задачи |
| `output` | `gpu_jobs.output_url` | Ссылка на результат |
| `error` | `gpu_jobs.error_message` | Причина падения |
| `metrics.predict_time` | аналитика / логи | Бенчмарк времени инференса |

Правила обработки `output`:

* Если `output` является строкой, используется как единственный URL.
* Если `output` является массивом, используется первый элемент массива, если иное не предусмотрено типом задачи.
* Если `output` отсутствует при `status = 'succeeded'`, вебхук считается ошибочным.

Правила обработки `status`:

| Replicate status | Действие |
|---|---|
| `starting`, `processing` | Обновить `gpu_jobs.status = 'processing'`, проект остаётся в активном статусе |
| `succeeded` | Обновить `gpu_jobs.status = 'done'`, сохранить `output_url`, продвинуть пайплайн |
| `failed` | Обновить `gpu_jobs.status = 'failed'`, сохранить `error_message`, перевести проект в `failed` |
| `canceled` | Обновить `gpu_jobs.status = 'failed'`, перевести проект в `failed` |

При `failed` и `canceled` Edge Function обязан выполнить:

```sql
UPDATE projects
SET status = 'failed',
    error_code = 'GPU_JOB_FAILED',
    updated_at = NOW()
WHERE id = <project_id>
  AND status NOT IN ('done', 'failed');
```

Это активирует триггер:

`trg_refund_on_failed`

и автоматически возвращает кредиты (возврат выполняется только при `cost_credits > 0`).

---

### `manual-input`

POST. Авторизация: пользовательский JWT (`auth.uid()`).

Запрос:

```json
{
  "product_name": "string, обязательное, 3..200 символов",
  "product_url": "string | null",
  "description": "string | null, до 4000 символов",
  "price": "string | null",
  "category": "string | null",
  "image_file_name": "string | null"
}
```

Ответ 200:

```json
{
  "product_id": "uuid",
  "created_at": "ISO 8601"
}
```

Ошибки: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `429 TOO_MANY_REQUESTS`.

Лимиты: не более 20 вызовов в час на пользователя (общий лимит создания загрузек). Идемпотентность не требуется: повторный вызов создаёт новую карточку товара.

---

### `analyze-reference`

POST. Авторизация: пользовательский JWT; доступ только к собственному `video_references`.

Запрос:

```json
{
  "reference_id": "uuid"
}
```

Ответ 200:

```json
{
  "reference_id": "uuid",
  "structure": [
    { "start_sec": 0, "end_sec": 5, "scene": "hook" }
  ],
  "detected_hooks": ["..."],
  "detected_cta": ["..."],
  "tempo": "fast | medium | slow",
  "notes": "..."
}
```

Ошибки: `403 FORBIDDEN`, `404 REFERENCE_NOT_FOUND`, `429 TOO_MANY_REQUESTS` (10/час), `502 AI_PROVIDER_ERROR` (не более 2 повторов).

Стоимость — 1 кредит (раздел 7.2), списание через `charge_credits` до вызова AI. Повторный вызов для того же референса возвращает сохранённый результат без повторного списания (кэш). При неудаче после исчерпания повторов выполняется автовозврат списанного кредита.

---

### `generate-prompt-from-video`

POST. Авторизация: пользовательский JWT; доступ только к собственному `video_references`.

Запрос:

```json
{
  "reference_id": "uuid"
}
```

Ответ 200:

```json
{
  "prompt_id": "uuid",
  "prompt": "... [PRODUCT_HOLDER] ...",
  "cost_credits": 1
}
```

Правила:

* стоимость — 1 кредит (раздел 7.2), списание через `charge_credits` до вызова AI;
* при неудаче после исчерпания повторов выполняется автовозврат списанного кредита;
* результат содержит обязательный маркер `[PRODUCT_HOLDER]`.

Ошибки: `402 INSUFFICIENT_CREDITS`, `403 FORBIDDEN`, `404 REFERENCE_NOT_FOUND`, `429 TOO_MANY_REQUESTS` (10/час), `502 AI_PROVIDER_ERROR`.

---

### `projects/:id/status`

GET. Авторизация: пользовательский JWT; доступ только к собственному проекту.

Ответ 200:

```json
{
  "project_id": "uuid",
  "status": "generating",
  "progress": 45,
  "error_code": null,
  "user_message": null,
  "result_video_url": null,
  "updated_at": "ISO 8601"
}
```

Ошибки: `403 FORBIDDEN`, `404 PROJECT_NOT_FOUND`, `429 TOO_MANY_REQUESTS` (60/мин).

Используется клиентом как fallback-polling при недоступности Realtime (раздел 8.6.1).

---

### `projects/:id/regenerate-segment`

POST. Отключено в MVP.

Ответ:

```json
{
  "error_code": "FEATURE_DISABLED",
  "user_message": "Поблочная перегенерация появится в Фазе 2. Для получения нового варианта создайте новый проект."
}
```

* код состояния — `501`;
* кредиты не списываются;
* эндпоинт сохраняется в карте для совместимости с Фазой 2, где будет допущен только повтор конкретного Extend-шага без перегенерации базового чанка.

---

### `projects/:id/cancel`

POST. Авторизация: пользовательский JWT; доступ только к своему проекту.

Правила:

* вызов допустим только в статусе `script_ready`; в иных статусах — `409 INVALID_STATUS`;
* проект переводится в `canceled`, выполняется автовозврат списанных кредитов (раздел 7.5);
* повторный вызов идемпотентен: по уже отменённому проекту возвращается текущее состояние.

Ответ 200:

```json
{
  "project_id": "uuid",
  "status": "canceled",
  "refunded_credits": 37
}
```

Ошибки: `403 FORBIDDEN`, `404 PROJECT_NOT_FOUND`, `409 INVALID_STATUS`.

---

### `create-payment`

POST. Авторизация: пользовательский JWT.

Запрос:

```json
{
  "package_id": "string",
  "gateway": "prodamus | payselection | lavatop | cryptocloud"
}
```

Правила:

* сумма, валюта и `credits_awarded` определяются сервером из пакета (раздел 7.3); клиент эти поля не передаёт;
* строка `payments` создаётся только сервером в статусе `pending`; пользовательские роли не имеют записи в `payments` (RLS);
* при наличии другого `pending`-платежа по тому же пакету возвращается существующий (идемпотентно).

Ответ 200:

```json
{
  "payment_id": "uuid",
  "gateway_payment_id": "string",
  "checkout_url": "string",
  "amount": 2900,
  "currency": "RUB",
  "credits_awarded": 300
}
```

Ошибки: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `404 PACKAGE_NOT_FOUND`, `429 TOO_MANY_REQUESTS`.

---

### `create-subscription` (Фаза 1)

POST. Авторизация: пользовательский JWT.

Запрос:

```json
{
  "plan_tier": "starter | growth | basic | pro",
  "gateway": "prodamus | payselection | lavatop | cryptocloud"
}
```

Правила:

* цена и `credits_allowance` плана определяются сервером (раздел 7.3); клиент стоимость не передаёт;
* строка `subscriptions` создаётся только сервером после подтверждения шлюза; до подтверждения — оформление через `checkout_url`;
* активная подписка того же пользователя блокирует создание второй — `409 ACTIVE_SUBSCRIPTION_EXISTS`.

Ответ 200:

```json
{
  "subscription_id": "uuid",
  "checkout_url": "string",
  "plan_tier": "starter",
  "credits_allowance": 300
}
```

Ошибки: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `409 ACTIVE_SUBSCRIPTION_EXISTS`, `429 TOO_MANY_REQUESTS`.

---

### `webhook-payment-:gateway`

POST. Без пользовательской авторизации; обязательна подпись платёжного шлюза.

Правила обработки:

1. Проверка подписи шлюза. При невалидной подписи — `401`, событие не сохраняется.
2. Каждое событие идентифицируется `event_id`; повторная доставка игнорируется идемпотентно — ответ `200`, баланс не начисляется повторно.
3. Сумма и валюта сверяются с созданным платежом; расхождение — `payments.status = 'failed'` и алерт в мониторинг.
4. Сохраняются `payments.raw_payload`, `payments.signature_verified = true`, `payments.processed_at`.
5. При `succeeded` кредиты начисляются одной транзакцией: `payments` + `profiles` + `credit_transactions`.

Ответ 200:

```json
{
  "received": true,
  "event_id": "string",
  "processed": true
}
```

Ошибки: `400 MALFORMED_PAYLOAD`, `401 INVALID_SIGNATURE`.

Подробный жизненный цикл — в разделах 7.7 и 7.8. Общие требования к вебхукам — в разделе 9.3.

---

## 4.3. Вызов видеомоделей, Ветка А

Версия 4.4 использует мультимодальный контракт для нативной генерации и нативного продления.

### Канонический формат запроса

Запрос выполняется к AI-шлюзу, совместимому с OpenRouter.

Если конкретный провайдер использует другой формат, Edge Function обязан маппить канонический контракт в формат провайдера.

---

### Пример Premium One-take 30 секунд

```json
{
  "model": "bytedance/seedance-2.5",
  "modalities": ["video"],
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "<полный промпт ролика на 30 секунд>"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "<фото товара>"
          }
        }
      ]
    }
  ],
  "generation_config": {
    "duration_sec": 30,
    "aspect_ratio": "9:16",
    "seed": 42
  }
}
```

---

### Пример Standard Base 15 секунд

```json
{
  "model": "bytedance/seedance-2.0-fast",
  "modalities": ["video"],
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "<промпт первой половины ролика на 15 секунд>"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "<фото товара>"
          }
        }
      ]
    }
  ],
  "generation_config": {
    "duration_sec": 15,
    "aspect_ratio": "9:16",
    "seed": 42
  }
}
```

---

### Пример Standard Extend +15 секунд

```json
{
  "model": "bytedance/seedance-2.0-fast",
  "modalities": ["video"],
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "video_url",
          "video_url": {
            "url": "<url успешного базового 15-секундного видео>"
          }
        },
        {
          "type": "text",
          "text": "Continue the video seamlessly based on this prompt: <промпт второй половины ролика>"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "<фото товара, если поддерживается провайдером>"
          }
        }
      ]
    }
  ],
  "generation_config": {
    "duration_sec": 15,
    "aspect_ratio": "9:16",
    "seed": 43
  }
}
```

---

### Пример Premium Extend для 60 секунд

Если пользователь выбрал 60 секунд для Premium:

1. Генерируется базовый One-take ролик 30 секунд.
2. Затем выполняется нативное продление ещё на 30 секунд, если провайдер поддерживает `duration_sec = 30` для Extend.

```json
{
  "model": "bytedance/seedance-2.5",
  "modalities": ["video"],
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "video_url",
          "video_url": {
            "url": "<url успешного 30-секундного Premium видео>"
          }
        },
        {
          "type": "text",
          "text": "Continue the video seamlessly based on this prompt: <промпт второй половины 60-секундного ролика>"
        }
      ]
    }
  ],
  "generation_config": {
    "duration_sec": 30,
    "aspect_ratio": "9:16",
    "seed": 43
  }
}
```

Если провайдер не поддерживает Extend на 30 секунд, допускается:

* два нативных продления по 15 секунд;
* либо иная нативная схема провайдера, сохраняющая временную непрерывность.

Запрещено использовать FFmpeg `stitch` как основной механизм сборки.

---

### Обязательные правила вызова

* Для Extend используется URL предыдущего успешного видео.
* Предыдущее видео должно быть сохранено в Supabase Storage.
* URL должен быть доступен провайдеру на время генерации.
* Для `outro_mode = 'loop'` финальный запрос генерации или Extend получает суффикс из раздела 14.2.
* Для `outro_mode = 'loop'` финальный запрос может получать референс первого кадра, если провайдер поддерживает image reference.
* Результат базовой генерации и каждого Extend сохраняется в `/segments_480p/` до финальной передачи в апскейл.
* После получения целевой длительности 30 или 60 секунд создаётся задача `gpu_jobs.upscale`.
* Задача `media_tasks.stitch` после этого не создаётся.

---

## 4.4. Rate limits

| Эндпоинт | Лимит на пользователя |
|---|---|
| create-project | 10/час, не более 2 проектов одновременно в активных статусах |
| projects/:id/regenerate-segment | отключено в MVP (`501 FEATURE_DISABLED`), Фаза 2 |
| upload-presigned | 20/час |
| generate-prompt-from-video | 10/час |
| Вебхуки | только по подписи/токену; повторы игнорируются идемпотентно |
| internal-media-completed | только служебный токен, пользовательский доступ запрещён |

Глобальный предохранитель:

* не более 20 одновременных генераций в системе.

Очередь определяется по:

```sql
projects.status = 'queued'
```

Для Ветки Б дополнительно (Фаза 2):

* не более 1–2 одновременных V2V GPU-задач в системе.

---

### 4.4.1. Реализация rate limits

Все лимиты реализуются серверно и атомарно. Клиентские блокировки кнопок — только UX-слой и не являются защитой.

Счётчики хранятся в таблице `rate_limit_counters` (DDL в разделе 3.1):

* ключ — `'{user_id}:{endpoint}'`;
* окно — 1 час, окна календарные (`date_trunc('hour', NOW())`);
* инкремент и проверка выполняются одной атомарной операцией — гонки между проверкой и записью исключены.

```sql
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_endpoint TEXT,
  p_limit INTEGER
)
RETURNS TABLE (allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := date_trunc('hour', NOW());
  v_counter INTEGER;
BEGIN
  INSERT INTO rate_limit_counters (key, window_start, counter)
  VALUES (p_user_id || ':' || p_endpoint, v_window_start, 1)
  ON CONFLICT (key) DO UPDATE
    SET window_start = v_window_start,
        counter = CASE
          WHEN rate_limit_counters.window_start < v_window_start THEN 1
          ELSE rate_limit_counters.counter + 1
        END
  RETURNING rate_limit_counters.counter INTO v_counter;

  IF v_counter > p_limit THEN
    RETURN QUERY
    SELECT FALSE,
           GREATEST(EXTRACT(EPOCH FROM (v_window_start + INTERVAL '1 hour' - NOW()))::INTEGER, 1);
  ELSE
    RETURN QUERY SELECT TRUE, 0;
  END IF;
END;
$$;
```

Функции контроля одновременных активностей:

```sql
-- Активные пользовательские проекты (не более 2 на пользователя)
CREATE OR REPLACE FUNCTION public.count_active_user_projects(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM projects
  WHERE user_id = p_user_id
    AND status IN ('draft','queued','script_ready','generating','audio_sync','assembling');
$$;

-- Активные платные генерации в системе (не более 20)
CREATE OR REPLACE FUNCTION public.count_active_generations()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM projects
  WHERE status IN ('queued','script_ready','generating','audio_sync','assembling');
$$;

-- Активные V2V-задачи Ветки Б (не более 1–2 на систему)
CREATE OR REPLACE FUNCTION public.count_active_v2v_jobs()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM gpu_jobs
  WHERE job_type IN ('v2v_inpaint','video_base','video_extend','video_one_take')
    AND status IN ('pending','processing');
$$;
```

Правила применения:

* при `allowed = false` возвращается `429 TOO_MANY_REQUESTS` с заголовком `Retry-After: <retry_after_seconds>`;
* при `count_active_user_projects >= 2` создание проекта отклоняется с кодом `ACTIVE_PROJECT_LIMIT`;
* при `count_active_generations >= 20` новый проект принимается в `queued` без немедленной постановки генерации — до освобождения слота;
* при `count_active_v2v_jobs >= 2` задача Ветки Б ожидает в `queued`;
* проверка лимитов и создание проекта/задачи выполняются в одном транзакционном блоке, поэтому состояние «проверка прошла, но слот заняли раньше» исключено.

Очистка счётчиков:

```sql
SELECT cron.schedule(
  'cleanup-rate-limit-counters',
  '0 * * * *',
  $$DELETE FROM rate_limit_counters WHERE window_start < NOW() - INTERVAL '24 hours';$$
);
```

Строки окон старше 24 часов удаляются ежечасно, чтобы таблица `rate_limit_counters` не росла бесконечно.

Дополнительные планировщики:

```sql
-- Отказ проектов, активные задачи которых не завершились за 6 часов (раздел 3.4):
SELECT cron.schedule(
  'fail-stuck-projects',
  '*/15 * * * *',
  $$SELECT fail_stuck_projects();$$
);

-- Вызов служебного опроса асинхронных задач (раздел 4.5):
SELECT cron.schedule(
  'poll-async-jobs',
  '* * * * *',
  $$SELECT net.http_post(
      url := '<SUPABASE_URL>/functions/v1/poll-async-jobs',
      headers := '{"X-Internal-Token": "<INTERNAL_EDGE_TOKEN>"}'::jsonb
  );$$
);
```

`fail_stuck_projects()` переводит в `failed` проекты с активными `media_tasks`/`gpu_jobs` старше 6 часов; автовозврат выполняется триггером раздела 3.3. `poll-async-jobs` запускается каждую минуту (минимальный шаг `pg_cron`) с лимитами раздела 4.5.

---

## 4.5. Контракт асинхронной видео-генерации и polling

Видео-генерация через Replicate, OpenRouter и fal.ai выполняется асинхронно. Все провайдеры приводятся к единому нормализованному контракту, независимо от способа доставки результата.

### Нормализованный контракт провайдера

| Поле | Назначение |
|---|---|
| `provider` | `replicate`, `openrouter`, `fal` |
| `provider_job_id` | внешний id задачи провайдера; сохраняется в `gpu_jobs.provider_job_id` (уникален) |
| `async_mode` | `webhook` — результат приходит сам; `polling` — результат запрашивается служебным опросом |
| `status` | нормализованные `pending` / `processing` / `done` / `failed` |
| `output_url` | URL результата |
| `output_duration_ms`, `output_width`, `output_height` | метаданные результата; фиксируются в `gpu_jobs` до передачи в следующий шаг |

Правила:

* постановка задачи идемпотентна: `idempotency_key` обязателен; повтор с тем же ключом не создаёт вторую задачу и не списывает кредиты повторно;
* `gpu_jobs` переводится в `done` только после серверной медиа-валидации результата (раздел 6.7);
* фактическая стоимость фиксируется в `cost_actual_usd` на момент завершения;
* таймауты: 30 минут для базовой генерации и Extend-шагов, 15 минут для апскейла, анализа референса и TTS; по таймауту задача переводится в `failed` с кодом `PROVIDER_TIMEOUT`;
* webhook и polling взаимоисключающи: для `async_mode = 'webhook'` опрос не выполняется; поздний дублирующий результат при `polling` игнорируется идемпотентно по `provider_job_id`.

### Polling: служебный эндпоинт `poll-async-jobs`

Для задач с `async_mode = 'polling'` результат запрашивается служебным эндпоинтом `poll-async-jobs`:

* запускается по расписанию каждые 60 секунд; вызов разрешён только с заголовком `X-Internal-Token`;
* за один цикл обрабатывается не более 5 задач: `status IN ('pending','processing') AND async_mode = 'polling' AND next_poll_at <= NOW()`;
* после каждого опроса `poll_attempts` увеличивается на 1, `next_poll_at = NOW() + интервал`; интервал растёт по схеме 30 с → 60 с → 120 с;
* при `poll_attempts >= 20` задача переводится в `failed` с кодом `POLLING_EXHAUSTED`, проект — в `failed` с автовозвратом кредитов (если `cost_credits > 0`);
* успешный ответ провайдера обрабатывается тем же нормализованным контрактом, что и webhook.

Ответ 200:

```json
{
  "processed": 5,
  "completed": 2,
  "failed": 0,
  "next_run_in_sec": 60
}
```

---

# 5. Интеграции и AI-пайплайны

## 5.1. Оптимизация COGS: Ветка А

Ветка А версии 4.4 строится по схеме:

**нативная генерация → нативное продление → апскейл → аудио-микширование**

Основной принцип:

**сохранение временной непрерывности через нативный Video Extension / One-take, а не через склейку файлов.**

### Premium

Для тарифа Premium:

* 30 секунд генерируются одним One-take запросом;
* 60 секунд генерируются как 30 секунд One-take + нативный Extend до 60 секунд;
* если провайдер не поддерживает Extend на 30 секунд, используется цепочка нативных продлений, поддерживаемая провайдером;
* финальный результат передаётся в апскейл как монолитный файл.

### Standard

Для тарифа Standard:

* генерируется базовый чанк 15 секунд;
* затем выполняется Extend на 15 секунд;
* для 30 секунд получается цепочка из двух шагов: 15 + 15;
* для 60 секунд выполняется дополнительная цепочка Extend до целевой длительности;
* каждый Extend использует URL предыдущего успешного видео как референс.

### Исключение сшивки

Задача `stitch`:

* не используется в основном пайплайне Ветки А;
* не создаётся после генерации сегментов;
* сохраняется только как аварийный fallback.

### Апскейл

Апскейл выполняется асинхронно через Replicate:

* `xinntao/real-esrgan` или эквивалентный профиль;
* вход — финальный монолитный 30/60-секундный файл;
* результат — 1080×1920.

### Аудио

Финальное аудио-микширование выполняется на Render после апскейла.

---

## 5.2. Модельный ряд и логика фоллбэков

| Модель | Тариф сервиса | Цена провайдера | 30 с видео | Применение |
|---|---|---|---|---|
| Seedance 2.5 | premium | $0.1028/с | $3.08 | Премиум-генерация; One-take 30s; Extend для 60s |
| Seedance 2.0 Fast | standard | $0.04035/с | $1.21 | Базовая генерация Ветки А; цепочки 15s Extend |
| Seedance 2.0 Standard | standard | $0.06726/с | $2.01 | Стандарт с повышенным качеством |
| Kling 2.5 Turbo Pro / v3.0 | альтернативы | ~$0.07–0.084/с | $2.10–2.50 | Только явный выбор пользователя |

Исключено из продукта:

* ❌ Seedance 2.0 Mini
* ❌ Режим Draft

Логика фоллбэка:

* резервируется провайдер, а не модель.

Пример:

```text
Seedance 2.5 → OpenRouter
при 504 → fal.ai
при недоступности → следующий шлюз из video_models.providers
```

Фоллбэк на модель более низкого тарифа (например, премиум → стандарт):

* выполняется только при явном подтверждении пользователя;
* система показывает объяснение: какое качество получит пользователь и как изменится стоимость;
* без подтверждения проект либо ожидает восстановления основной модели, либо завершается с автовозвратом по выбору пользователя.

---

## 5.3. Модуль клонирования видео-конкурентов (V2V)

### 5.3.1. Режим 1: Семантический (`semantic`)

Логика:

```text
нарезка донора
→ Vision-анализ
→ JSON-таймлайн
→ генерация Ветки А
```

Vision-модель:

`gemini-2.5-flash`

Результат:

* структура сцен;
* тип движения камеры;
* освещение;
* ритм;
* действия;
* текстовый промпт для Ветки А.

---

### 5.3.2. Режим 2: Попиксельный свап (`inpainting`)

Статус:

* ЭКСПЕРИМЕНТАЛЬНЫЙ;
* Фаза 2;
* не входит в MVP.

Обязательное условие:

* модальное окно с юридической ответственностью пользователя за права на донор.

Без подтверждённого:

```sql
v2v_legal_accepted = true
```

запуск запрещён.

---

### 5.3.2.1. Цель

Устранить видимые стыки, мерцание маски и прыжки заменённого объекта на границах сегментов при чанковой обработке видео.

Основная проблема:

При независимой обработке 5-секундных чанков модель теряет память состояния объекта, что приводит к изменению маски, контура и текстуры заменённого товара на стыках.

---

### 5.3.2.2. Архитектурный принцип экономии GPU

Для уменьшения накладных расходов весь пайплайн Ветки Б должен выполняться в одном GPU-контейнере, если это допускается лимитами времени выполнения.

Рекомендуемый инструмент:

* Replicate + Docker/Cog

Рекомендуемые GPU:

* Nvidia A40 / A40 Large / A100 40GB

Приоритет по стоимости:

1. A40 / A40 Large — если VRAM достаточно.
2. A100 40GB — только если A40 не проходит по памяти или скорости.

Запуск только асинхронный:

```text
Edge Function → Replicate prediction → webhook → обновление БД
```

Синхронное ожидание результата в Edge Function запрещено.

Если максимальная длительность Prediction не позволяет выполнить весь пайплайн одним процессом, допускается разделение на этапы с обязательной сериализацией состояния модели.

---

### 5.3.2.3. Нарезка видео с нахлёстом и фиксированным окном

Видео обрабатывается не встык, а скользящим окном.

Параметры:

* Полезный шаг: 5 секунд
* Окно обработки: 6 секунд
* Нахлёст: 1 секунда

Формулы:

```text
fps_norm = нормализованный FPS входного видео, рекомендуется 24
core_frames = round(5.0 * fps_norm)
overlap_frames = round(1.0 * fps_norm)
window_frames = core_frames + overlap_frames
stride_frames = core_frames
```

Для чанка `i`:

```text
start_frame_i = i * stride_frames
end_frame_i = min(start_frame_i + window_frames, total_frames)
valid_frames_i = end_frame_i - start_frame_i
```

Критическое правило:

Длина тензора/окна, передаваемого в ML-контейнер, всегда должна быть равна `window_frames`.

Если видео заканчивается раньше конца окна:

1. Берутся все оставшиеся валидные кадры.
2. Окно дополняется повтором последнего кадра до `window_frames`.
3. Количество валидных кадров сохраняется в `valid_frames_i`.
4. После инференса padding-кадры удаляются или обрезаются.

Пример для 24 FPS:

```text
Чанк 1 обрабатывает секунды 0.0–6.0
Чанк 2 обрабатывает секунды 5.0–11.0
Зона нахлёста: секунды 5.0–6.0
```

Если длина видео 7 секунд:

```text
Чанк 1: 0–6 секунд, полностью валиден.
Чанк 2: 5–7 секунд валидно, затем 4 секунды padding до полного 6-секундного окна.
```

Если длина видео 4 секунды:

```text
Единственный чанк: 0–4 секунды валидно, затем 2 секунды padding до полного окна.
```

Запрещено:

Передавать в модель чанки переменной длины, если модель не поддерживает динамический размер батча явно.

---

### 5.3.2.4. Передача состояния SAM 2

Для сохранения непрерывности маски следующий чанк должен получать состояние модели из предыдущего чанка.

Если пайплайн выполняется в одном Prediction:

* Состояние SAM 2 хранится в памяти процесса/VRAM.

Если пайплайн разбивается на несколько Prediction:

* Состояние должно сериализоваться в файл `.pt` или `.safetensors` и передаваться следующему этапу.

Запрещено:

Повторно инициализировать SAM 2 для следующего чанка без передачи состояния.

---

### 5.3.2.5. Смешивание масок в зоне нахлёста

В зоне нахлёста маска формируется линейным альфа-смешиванием масок соседних чанков.

Для кадра `i` внутри зоны нахлёста:

```text
alpha_i = i / (N_overlap - 1)
```

где:

```text
i = 0 ... N_overlap - 1
N_overlap = число кадров в зоне нахлёста
```

Формула:

```text
Mask_final(i) = (1 - alpha_i) * Mask_Chunk1(i) + alpha_i * Mask_Chunk2(i)
```

Требования:

1. Маски должны быть в формате float32.
2. Размеры масок должны совпадать.
3. Перед бинаризацией рекомендуется временное и пространственное сглаживание.
4. Жёсткая бинаризация без сглаживания запрещена.

---

### 5.3.2.6. Смешивание финальных кадров

Если инпейнтинг выполняется отдельно для каждого чанка, в зоне нахлёста смешиваются не только маски, но и финальные изображения:

```text
Frame_final(i) = (1 - alpha_i) * Frame_Chunk1(i) + alpha_i * Frame_Chunk2(i)
```

Если инпейнтинг выполняется один раз по финальной маске, смешивание масок выполняется до инпейнтинга.

Обязательное требование:

Зона нахлёста не должна иметь двойного контура, прозрачности, призраков или резкой смены текстуры заменённого объекта.

---

### 5.3.2.7. Эталонная реализация смешивания масок

```python
import cv2
import numpy as np

def blend_overlap_masks(chunk1_tail_masks, chunk2_head_masks, overlap_frames=None):
    """
    Смешивание масок в зоне нахлёста.

    Параметры:
        chunk1_tail_masks: маски последних кадров первого чанка.
        chunk2_head_masks: маски первых кадров второго чанка.
        overlap_frames: число кадров в зоне нахлёста.

    Возврат:
        np.ndarray формы (overlap_frames, H, W), float32, диапазон [0, 1].
    """
    if overlap_frames is None:
        overlap_frames = min(len(chunk1_tail_masks), len(chunk2_head_masks))

    if overlap_frames <= 0:
        raise ValueError("overlap_frames must be positive")

    m1 = np.asarray(chunk1_tail_masks[-overlap_frames:], dtype=np.float32)
    m2 = np.asarray(chunk2_head_masks[:overlap_frames], dtype=np.float32)

    if m1.shape != m2.shape:
        raise ValueError("Overlap masks must have identical shape")

    if overlap_frames == 1:
        return 0.5 * m1 + 0.5 * m2

    alpha = np.linspace(0.0, 1.0, overlap_frames, dtype=np.float32)
    alpha = alpha[:, None, None]

    blended = (1.0 - alpha) * m1 + alpha * m2

    return blended


def smooth_and_binarize(mask, threshold=0.5, blur_kernel=(5, 5)):
    """
    Необязательный этап: сглаживание и бинаризация маски.
    Использовать только если модель инпейнтинга требует бинарную маску.
    """
    mask = np.asarray(mask, dtype=np.float32)

    # Лёгкое пространственное сглаживание
    mask = cv2.GaussianBlur(mask, blur_kernel, 0)

    # Временное сглаживание должно применяться отдельно,
    # например через медианный фильтр по оси времени или оптический поток.

    binary = (mask > threshold).astype(np.float32)

    return binary
```

---

### 5.3.2.8. Эталонная реализация смешивания кадров

Если инпейнтинг выполняется отдельно для каждого чанка:

```python
def blend_overlap_frames(chunk1_tail_frames, chunk2_head_frames, overlap_frames=None):
    """
    Смешивание RGB-кадров в зоне нахлёста.

    Параметры:
        chunk1_tail_frames: последние кадры первого чанка.
        chunk2_head_frames: первые кадры второго чанка.
        overlap_frames: число кадров в зоне нахлёста.

    Возврат:
        np.ndarray формы (overlap_frames, H, W, 3), float32.
    """
    if overlap_frames is None:
        overlap_frames = min(len(chunk1_tail_frames), len(chunk2_head_frames))

    if overlap_frames <= 0:
        raise ValueError("overlap_frames must be positive")

    f1 = np.asarray(chunk1_tail_frames[-overlap_frames:], dtype=np.float32)
    f2 = np.asarray(chunk2_head_frames[:overlap_frames], dtype=np.float32)

    if f1.shape != f2.shape:
        raise ValueError("Overlap frames must have identical shape")

    if overlap_frames == 1:
        return 0.5 * f1 + 0.5 * f2

    alpha = np.linspace(0.0, 1.0, overlap_frames, dtype=np.float32)
    alpha = alpha[:, None, None, None]

    blended = (1.0 - alpha) * f1 + alpha * f2

    return blended
```

---

### 5.3.2.9. Разрешение инференса и апскейл

Целевой результат:

`1080 × 1920`

Рекомендуемые варианты:

### Вариант A, предпочтительный

```text
Инференс: 540 × 960
Апскейл: ×2
Результат: 1080 × 1920
```

### Вариант B, если вход 480×854

```text
Инференс: 480 × 854
Апскейл: Real-ESRGAN x4plus
Постобработка: масштабирование/кадрирование до 1080 × 1920
```

Если используется Real-ESRGAN x4plus после 480×854, финальная команда должна явно приводить результат к 1080×1920:

```bash
ffmpeg -i upscaled_4x.mp4 \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  -c:v libx264 -preset ultrafast \
  -movflags +faststart \
  final_1080.mp4
```

---

### 5.3.2.10. Защита от OOM

После каждого чанка или тяжёлого этапа воркер обязан освобождать память:

```python
import gc
import torch

del model_output
del masks
del latent_tensors

gc.collect()
torch.cuda.empty_cache()
```

Дополнительно:

Запрещено хранить все кадры видео в VRAM одновременно, если это приводит к превышению доступной памяти.

---

### 5.3.2.11. Ограничения и экономика Ветки Б (Фаза 2)

Ветка Б является экспериментальной.

Обязательные ограничения:

1. Максимальная длительность донора: 60 секунд.
2. Максимальный вес после клиентского сжатия: 150 МБ.
3. Максимальная длительность экспериментального V2V-ролика: 60 секунд. До завершения первого бенчмарка в продакшене разрешено принимать только доноры длительностью до 30 секунд включительно.
4. Обязательная юридическая модалка перед запуском.
5. Ограничение одновременных V2V-задач: не более 1–2 на систему.
6. Запрет автоматических бесконечных ретраев.
7. Обязательный cost-cap.

Доноры 31–60 секунд могут быть включены только после:

* бенчмарка P50 / P95 длительности обработки в продакшене;
* подтверждения экономики (маржа не ниже порога раздела 7.6);
* подтверждения качества на стыках;
* ручного включения администратором через админ-панель.

До выполнения всех четырёх условий сервер отклоняет доноры 31–60 секунд на этапе измерения длительности (раздел 6.6).

Экономический предохранитель:

Если фактическая стоимость GPU превышает установленный порог, задача должна быть остановлена, переведена в premium-очередь или возвращена пользователю как недоступная.

Рекомендуемый порог для первого бенчмарка:

```text
не более $1.20 GPU-стоимости на 30-секундный V2V-ролик
```

Для роликов 31–60 секунд порог может быть удвоен:

```text
не более $2.40
```

Если порог превышается, Ветка Б:

* отключается;
* или переводится в отдельный премиум-тариф;
* или требует ручного подтверждения администратора.

---

### 5.3.2.12. Критерии приёмки Ветки Б

После обработки:

* Исходная длительность видео сохранена.
* Исходная частота кадров сохранена или нормализована без изменения длительности.
* Аудио не обрабатывается внутри V2V-контейнера.
* Оригинальная аудиодорожка пришивается отдельно на Render-воркере.

На стыках чанков отсутствуют:

* видимые швы;
* прыжки маски;
* призраки товара;
* резкая смена текстуры;
* мерцание контура.

Смещение края маски в зоне стыка визуально не превышает 2–3 пикселей в целевом разрешении 1080×1920.

Итоговый файл имеет формат:

* 9:16
* 1080×1920

Итоговое видео не содержит водяных знаков сервиса.

Обработка вебхука идемпотентна.

Повторный вебхук не создаёт повторных списаний, повторных записей и повторных рендеров.

Время обработки:

Фиксированный SLA до бенчмарка не устанавливается.

Целевой ориентир:

```text
- 30-секундный ролик должен обрабатываться за разумное время,
  ориентировочно не более 10–15 минут на GPU-классе A40/A100.
```

После бенчмарка фиксируются:

* P50;
* P95;
* максимальный cost;
* экономический порог отключения фичи.

Запрещено фиксировать срок 95 секунд как DoD без реального бенчмарка.

---

## 5.4. Видео-референс → промпт

Пользователь загружает ролик длительностью до 60 секунд ради стиля.

Edge Function вызывает `gemini-2.5-flash` с промптом декомпозиции.

Объект заменяется на:

```text
[PRODUCT_HOLDER]
```

Исходное видео удаляется сразу после обработки.

Стоимость:

1 кредит.

---

## 5.5. Sentiment Engine

`gpt-4o-mini` выделяет:

* 3 боли;
* 3 триггера восторга.

Источники:

* описание товара в MVP;
* реальные отзывы на Фазе 2.

UI:

тумблер «Использовать боли клиентов из отзывов»

Правило использования болей:

Выделенные боли используются только как внутренние инсайты для сценария.

Они не должны превращаться в:

* агрессивные хуки;
* манипулятивные формулировки;
* давление на пользователя;
* фразы в духе «надоело», «хватит мучиться», «успей», «купи сейчас».

В сценарии боли могут быть отражены только как нативное улучшение опыта использования товара.

---

## 5.6. Мультимедийная аудио-матрица

### ВЕТКА А-1

ElevenLabs TTS → voiceover.mp3 + SFX + royalty-free музыка

Микс:

* речь 100%
* музыка 15%
* SFX 35%

### ВЕТКА А-2

Сборка с аудио-дакингом:

```text
sidechaincompress
attack 10 ms
release 300 ms
ducking −70%
```

Фильтр `atempo` запрещён для голоса диктора.

---

### 5.6.1. Требования к ElevenLabs TTS

Озвучка выполняется только через ElevenLabs с параметрами из таблицы `tts_voices` (DDL в разделе 3.1).

Правила:

* `tts_voices` — единственный источник голосов; хардкод голосов в коде запрещён;
* голос выбирается строго по языку проекта: `tts_voices.language = projects.language`;
* нельзя выбрать голос, не поддерживающий язык проекта; при отсутствии активного голоса для языка генерация останавливается с кодом `TTS_VOICE_NOT_FOUND`, проект переводится в `failed` с автовозвратом кредитов;
* формат результата: MP3, 44.1 kHz; длительность фиксируется через `ffprobe`;
* если озвучка длиннее видео более чем на 1 секунду, применяется ускорение речи не более 1.15×; при большем расхождении — код `TTS_DURATION_MISMATCH`;
* при ошибке ElevenLabs выполняется не более 2 повторных попыток; после исчерпания — код `TTS_FAILED`, проект `failed` с автовозвратом кредитов;
* Free-тир ElevenLabs для коммерческой генерации запрещён (манифест версии); расход учитывается в COGS раздела 5.1.

---

## 5.7. Smart Outro Engine

### Режим 1: Нативный Fade-Out

Обрезка через 1 секунду после конца речи.

Применяются:

```text
fade=t=out
afade=t=out
```

### Режим 2: Бесконечная петля

Затухания запрещены.

Последнему сегменту, финальному Extend или финальному One-take запросу передаётся суффикс промпта из раздела 14.2.

Также передаётся референс первого кадра, если провайдер поддерживает image reference.

Монтаж:

* строго Hard Cut.

В финальной FFmpeg-команде для `outro_mode='loop'` не должно быть `-afade`.

---

## 5.8. Протокол прямой загрузки медиафайлов

Фронтенд:

1. Запрашивает `upload-presigned`.
2. Кладёт файл `PUT`-ом напрямую в Supabase Storage.

Обязательный модуль клиентского сжатия:

* видео перекодируется на клиенте до 480p.

Жёсткий предел после сжатия:

`150 МБ`

---

### 5.8.1. Требования к клиентскому сжатию видео

Обязательные параметры клиентского сжатия:

| Параметр | Требование |
|---|---|
| Контейнер | MP4 |
| Видеокодек | H.264 |
| Аудиокодек | AAC |
| Разрешение | 480p |
| Ориентация | сохранить исходную 9:16 |
| FPS | исходный, но не выше 30 |
| Максимальный битрейт видео | 2500 kbps |
| Аудио | 128 kbps |
| Максимальный размер файла | 150 МБ |
| Максимальная длительность | 60 секунд |

Если браузер не поддерживает клиентское сжатие:

* пользователю показывается сообщение о необходимости загрузить файл меньшего размера;
* загрузка оригинала без сжатия запрещена.

Фронтенд обязан проверить:

1. Длительность до загрузки.
2. Размер файла после сжатия.
3. Тип контейнера.
4. Наличие видео-потока.
5. Отсутствие превышения 60 секунд.

Если файл не проходит проверку, кнопка загрузки блокируется.

Сервер независимо перепроверяет длительность и целостность файла через `ffprobe` (разделы 6.6 и 6.7); клиентская проверка не является доверенной.

---

# 6. Пайплайн генерации, статусы, сборка

## 6.1. Полная машина состояний

Таблица разрешённых переходов:

| Текущий статус | Разрешённые следующие статусы |
|---|---|
| `draft` | `queued`, `failed` |
| `queued` | `script_ready`, `failed` |
| `script_ready` | `generating`, `canceled`, `failed` |
| `generating` | `audio_sync`, `failed` |
| `audio_sync` | `assembling`, `failed` |
| `assembling` | `done`, `failed` |
| `done` | терминальный |
| `failed` | терминальный |
| `canceled` | терминальный |

Правила:

* любой переход выполняется атомарно сервером и фиксируется в `projects.updated_at` и логах;
* пропуск этапов запрещён, кроме перехода в `failed`;
* `done`, `failed` и `canceled` терминальны; выход из них возможен только явным административным действием через админ-панель с записью в журнал;
* при `failed` и `canceled` срабатывает автовозврат кредитов, только если `cost_credits > 0` (разделы 3.3 и 7.5);
* `canceled` устанавливается только при отказе пользователя от сценария в `script_ready` (раздел 6.5);
* для Ветки Б (Фаза 2) этап `script_ready` пропускается, так как сценарий не генерируется; разрешённая цепочка: `draft → queued → generating → audio_sync → assembling → done`; маппинг шагов пайплайна на статусы — в разделе 6.6.

Активные пользовательские статусы:

```text
draft, queued, script_ready, generating, audio_sync, assembling
```

Активные платные генерационные статусы:

```text
queued, script_ready, generating, audio_sync, assembling
```

`draft` активен для пользовательского проекта, но не считается платной генерацией до серверного измерения длительности и списания кредитов (Ветка Б, раздел 6.6).

---

## 6.2. Политика повторных попыток

### Для `generation_segments`

Если:

```sql
retry_count < 3
```

то:

* инкремент `retry_count`;
* смена `seed`;
* повторный запрос к следующему провайдеру.

После 3 неудач:

* проект `failed`;
* возврат кредитов.

### Для цепочки Extend в Ветке А

Если базовая генерация успешна, а Extend падает:

1. Базовая генерация не повторяется.
2. Берётся `video_url` успешного базового или предыдущего Extend-сегмента.
3. Повторяется только упавший Extend-шаг.
4. Меняется `seed`.
5. При необходимости выполняется переключение на резервного провайдера.

Если Extend падает после 3 попыток:

* проект `failed`;
* возврат кредитов.

Если базовая генерация падает:

* повторяется базовая генерация;
* последующие Extend-шаги не запускаются до успеха базы.

### Для `media_tasks`

Если задача падает с ошибкой:

* воркер инкрементирует `attempts`;
* при `attempts >= 3` задача получает статус `failed`;
* проект переводится в `failed`;
* триггер `trg_refund_on_failed` возвращает кредиты.

Бесконечный цикл ретраев невозможен.

### Для `gpu_jobs`

Если GPU-задача падает:

* допускается не более 3 попыток;
* повторный запуск только при идемпотентном ключе;
* при превышении лимита проект переводится в `failed`;
* кредиты возвращаются.

Для Ветки Б автоматические ретраи ограничены дополнительно:

* не более 1 автоматического ретрая при транзитентной ошибке провайдера.

---

## 6.3. Render FFmpeg Worker

### 6.3.1. Назначение

Render FFmpeg Worker выполняет:

* аудио-микширование;
* дакинг;
* извлечение аудио;
* слияние аудио;
* outro;
* стабилизацию перегенерированных чанков;
* загрузку результата в Storage;
* обновление `media_tasks`;
* служебный вызов `internal-media-completed`.

В версии 4.4 задача `stitch` не является основной задачей Ветки А.

`stitch` выполняется только если задача была явно создана как аварийный fallback.

---

### 6.3.2. Режим запуска и подключение к БД

`[MVP ONLY]`

Render Cron Job

каждые 5 минут

Переменные окружения:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
INTERNAL_EDGE_URL
INTERNAL_EDGE_TOKEN
MAX_TASKS_PER_RUN=3
MAX_RUN_SECONDS=270
TEMP_DIR=/tmp/pvai
```

Критическое правило:

`DATABASE_URL` обязан указывать на Supavisor Transaction Pooler, порт 6543.

Пропускная способность: при `MAX_TASKS_PER_RUN=3` и запуске раз в 5 минут потолок — около 36 медиа-задач в час. При пике 20 одновременных генераций необходимо повысить `MAX_TASKS_PER_RUN` или сократить интервал запуска; проверка на пике включается в нагрузочные тесты (раздел 11.3).

Пример формата:

```text
postgres://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

Node.js-клиент:

```javascript
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: false },
});
```

Запрещено:

* использовать прямой порт 5432 из Render Worker в MVP.

---

### 6.3.3. Атомарный захват задач

Воркер обязан использовать атомарный захват, чтобы две копии воркера не взяли одну задачу одновременно.

Рекомендуемый SQL:

```sql
WITH candidate AS (
  SELECT id
  FROM media_tasks
  WHERE status = 'pending'
    AND attempts < 3
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE media_tasks t
SET status = 'processing',
    updated_at = NOW()
FROM candidate c
WHERE t.id = c.id
RETURNING t.*;
```

Для батча:

```sql
WITH candidate AS (
  SELECT id
  FROM media_tasks
  WHERE status = 'pending'
    AND attempts < 3
  ORDER BY created_at ASC
  LIMIT ${MAX_TASKS_PER_RUN}
  FOR UPDATE SKIP LOCKED
)
UPDATE media_tasks t
SET status = 'processing',
    updated_at = NOW()
FROM candidate c
WHERE t.id = c.id
RETURNING t.*;
```

---

### 6.3.4. Обработка зависших задач

При старте воркер должен выполнять восстановление зависших задач:

```sql
UPDATE media_tasks
SET status = 'pending',
    error_message = 'worker_timeout_recovery',
    updated_at = NOW()
WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '30 minutes'
  AND attempts < 3;

UPDATE media_tasks
SET status = 'failed',
    error_message = 'worker_timeout_exhausted',
    updated_at = NOW()
WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '30 minutes'
  AND attempts >= 3;
```

Если задача стала `failed`, воркер или `internal-media-completed` должен перевести проект в `failed`.

---

### 6.3.5. Общий алгоритм воркера

```text
1. Подключиться к Supabase через Supavisor.
2. Выполнить recovery зависших задач.
3. Атомарно забрать доступные задачи.
4. Если задач нет — завершить процесс.
5. Для каждой задачи:
   a. создать временную директорию;
   b. скачать входные файлы;
   c. выполнить FFmpeg-команду;
   d. загрузить результат в Storage;
   e. обновить media_tasks:
      status = done
      result_url = ...
   f. вызвать internal-media-completed.
6. При ошибке:
   a. увеличить attempts;
   b. если attempts >= 3 — failed;
   c. иначе вернуть pending;
   d. записать error_message.
7. Очистить временные файлы.
8. Завершить процесс.
```

Псевдокод:

```javascript
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await recoverStuckTasks();

  const tasks = await claimTasks();

  if (!tasks.length) {
    process.exit(0);
  }

  for (const task of tasks) {
    try {
      const resultUrl = await processTask(task);

      await markDone(task.id, resultUrl);
      await notifyInternalMediaCompleted(task, "done");
    } catch (error) {
      await markError(task.id, error.message);
      await notifyInternalMediaCompleted(task, "failed");
    }
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

---

### 6.3.6. Требования к безопасности воркера

Воркер:

* не принимает входящих вебхуков;
* не хранит пользовательские JWT;
* использует только `service_role`;
* использует `INTERNAL_EDGE_TOKEN` только для внутреннего эндпоинта;
* не логирует секреты;
* удаляет временные файлы после обработки;
* не запускает задачи без записи в `media_tasks`.

---

## 6.4. FFmpeg-команды

Все команды выполняются с флагами:

```text
-preset ultrafast
-movflags +faststart
```

если не указано иное.

---

### 6.4.1. Извлечение звука донора

Тип задачи:
`extract_audio`

Задача используется в Ветке Б и является обязательным серверным шагом
проверки фактической длительности донора. Задача выполняется до списания
кредитов (см. раздел 6.6).

Шаг 1 (обязательный) — измерение фактической длительности

До любой обработки воркер обязан измерить фактическую длительность файла
донора через `ffprobe`:

ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 donor.mp4

Пример вывода:
59.042000

Правила:
measured_duration_ms = round(duration_sec * 1000)

Измеренное значение является единственным источником истины для:
биллинга;
генерации тишины;
`target_duration_ms` в `merge_audio`;
проверки лимита 60 секунд.

Запрещено использовать `payload.donor_duration_ms` (значение, заявленное
клиентом при загрузке) для биллинга, генерации тишины и расчёта
`target_duration_ms`. Значение из `payload` допускается только для
предварительной оценки до запуска задачи.

Шаг 2 — фиксация результата в БД

Воркер получает `reference_id` проекта:

SELECT reference_id
FROM projects
WHERE id = '<project_id>';

Воркер дописывает результат измерения в `payload` задачи:

UPDATE media_tasks
SET payload = payload || jsonb_build_object(
  'measured_duration_ms', <measured_duration_ms>,
  'duration_exceeded', <true | false>
)
WHERE id = '<task_id>';

Если `measured_duration_ms <= 60000`:
воркер принудительно перезаписывает длительность донора:

UPDATE video_references
SET duration_ms = <measured_duration_ms>
WHERE id = '<reference_id>';

`duration_exceeded = false`, воркер переходит к Шагу 3.

Если `measured_duration_ms > 60000`:
`video_references.duration_ms` не перезаписывается, так как поле защищено
ограничением `CHECK (duration_ms <= 60000)`;
в `payload` фиксируются `measured_duration_ms` и `duration_exceeded = true`;
извлечение аудио не выполняется;
задача завершается со статусом `done`;
оркестратор `internal-media-completed` обязан перевести проект в `failed`
с `error_code = 'DONOR_DURATION_EXCEEDED'` без списания и без возврата
кредитов, так как списание ещё не выполнялось (см. раздел 6.6).

Если `ffprobe` не смог прочитать файл (битый файл, неверный контейнер),
задача обрабатывается по стандартной политике попыток раздела 6.3.5:
инкремент `attempts`, после 3 попыток — `failed`.

Шаг 3 — извлечение аудио

Основная команда:

ffmpeg -y -i donor.mp4 -vn -c:a copy original_audio.m4a

Проверка наличия аудиодорожки:

ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 donor.mp4

Если вывод пустой, аудиодорожка отсутствует и генерируется тишина.

Генерация тишины

Критическое правило:
Длительность тишины должна быть равна фактической длительности видео-донора:
measured_duration_ms / 1000

Запрещено использовать `projects.duration_sec`, если он равен пользовательским
30 или 60 секундам, а донор короче.
Запрещено использовать `payload.donor_duration_ms`, заявленный клиентом.

Команда:

ffmpeg -y -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -t ${measured_duration_sec} \
  -c:a aac \
  original_audio.m4a

где:
measured_duration_sec = measured_duration_ms / 1000

Шаг 4 — завершение задачи

Воркер:
загружает `original_audio.m4a` в Storage по `output_path`;
обновляет `media_tasks`: `status = done`, `result_url`;
вызывает `internal-media-completed`.

Псевдокод обработки `extract_audio`:

async function processExtractAudio(task) {
  await download(task.payload.donor_video_url);

  const durationSec = await ffprobeDuration("donor.mp4");
  const measuredMs = Math.round(durationSec * 1000);
  const exceeded = measuredMs > 60000;

  await writeMeasuredToPayload(task.id, measuredMs, exceeded);

  if (exceeded) {
    return { done: true }; // проект переводит в failed оркестратор
  }

  await overwriteReferenceDuration(task.project_id, measuredMs);

  const hasAudio = await probeAudioStream("donor.mp4");
  if (hasAudio) {
    await extractAudio();
  } else {
    await generateSilence(measuredMs / 1000);
  }

  const resultUrl = await uploadToStorage(task.payload.output_path);
  return { done: true, resultUrl };
}

---

### 6.4.2. Слияние после инпейнтинга

Тип задачи:

`merge_audio`

Команда:

```bash
ffmpeg -y -i swapped_silent_video.mp4 -i original_audio.m4a \
  -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 192k \
  -t ${target_duration_sec} \
  -movflags +faststart \
  final_cloned_video.mp4
```

где:

```text
target_duration_sec = payload.target_duration_ms / 1000
```

Требование:

видео не перекодируется, если кодек и контейнер совместимы.

Если видео несовместимо или требуется покадровая обрезка, допускается перекодирование:

```text
-c:v libx264 -preset ultrafast
```

---

### 6.4.3. Микс с дакингом, Ветка А

Тип задачи:

`audio_mix`

Команда:

```bash
ffmpeg -y -i video.mp4 -i voiceover.mp3 -i background_music.mp3 -i environment_sfx.mp3 \
  -filter_complex "[2:a]volume=0.15[m];[3:a]volume=0.35[s];[m][1:a]sidechaincompress=attack=10:release=300:ratio=8[bg];[bg][s]amix=inputs=2[aout]" \
  -map 0:v -map "[aout]" \
  -c:v copy -c:a aac -b:a 192k \
  -movflags +faststart \
  out.mp4
```

---

### 6.4.4. Сшивка сегментов

Тип задачи:

`stitch`

**Статус:** DEPRECATED для основного пайплайна Ветки А в версии 4.4.

Применение:

* только аварийный fallback;
* только если модель или провайдер не поддерживает Extend;
* только по явному решению оркестратора или администратора.

Требования:

* все сегменты приводятся к одному разрешению;
* все сегменты приводятся к одному FPS;
* аудио отсекается, если не указано иное;
* монтаж строго Hard Cut;
* cross-dissolve запрещён.

Шаблон:

```bash
ffmpeg -y \
  -i segment_0.mp4 \
  -i segment_1.mp4 \
  -i segment_2.mp4 \
  -filter_complex "\
[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=24,setpts=PTS-STARTPTS[v0];\
[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=24,setpts=PTS-STARTPTS[v1];\
[2:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=24,setpts=PTS-STARTPTS[v2];\
[v0][v1][v2]concat=n=3:v=1:a=0[out]" \
  -map "[out]" \
  -an \
  -c:v libx264 -preset ultrafast \
  -movflags +faststart \
  stitched.mp4
```

---

### 6.4.5. Стабилизация перегенерированных чанков

Тип задачи:

`stabilize_chunk`

Критическое правило:

флаг `-an` обязателен.

Команда:

```bash
ffmpeg -y -i regenerated_chunk_raw.mp4 \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=24,setpts=PTS-STARTPTS" \
  -t 5.000 \
  -an \
  -c:v libx264 -preset ultrafast \
  -movflags +faststart \
  regenerated_chunk_fixed.mp4
```

---

### 6.4.6. Outro Fade-Out

Тип задачи:

`outro`

Режим:

`fade`

Формула старта затухания:

```text
fade_start_sec = master_audio_duration_ms / 1000 + 1.0
```

Если `fade_start_sec` выходит за пределы длительности видео, значение уменьшается до:

```text
video_duration_sec - 1.0
```

Команда:

```bash
ffmpeg -y -i input.mp4 \
  -vf "fade=t=out:st=${fade_start_sec}:d=1.0" \
  -af "afade=t=out:st=${fade_start_sec}:d=1.0" \
  -c:v libx264 -preset ultrafast \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  output.mp4
```

---

### 6.4.7. Outro Loop

Тип задачи:

`outro`

Режим:

`loop`

Запрещено:

* `-afade`
* `fade=t=out`
* любые затухания

Если задача `outro` для `loop` выполняется как нормализация контейнера:

```bash
ffmpeg -y -i input.mp4 \
  -c copy \
  -movflags +faststart \
  output.mp4
```

Если нормализация не требуется, задача может завершаться без перекодирования.

---

## 6.5. Последовательность пайплайна Ветки А

```text
1. create-project
2. charge_credits
3. script_ready
4. модерация сценария (раздел 6.8); при нарушении — 'failed' с автовозвратом
4.1. пользователь подтверждает сценарий либо отклоняет его (`projects/:id/cancel`):
     при отклонении проект переводится в 'canceled' с полным автовозвратом
     (перегенерация сценария — Фаза 1)
5. generate-tts
6. определение tier и duration_sec
7. generate-video-base:
   - Premium 30s: One-take 30 секунд
   - Premium 60s: One-take 30 секунд
   - Standard 30s: base 15 секунд
   - Standard 60s: base 15 секунд
8. generation_segments processing
9. базовый видео-чанк done
10. extend-video:
   - Premium 60s: Extend до 60 секунд
   - Standard 30s: Extend +15 секунд
   - Standard 60s: цепочка Extend до 60 секунд
11. все Extend-шаги done
12. финальный монолитный видеофайл сохранён
13. gpu_jobs.upscale pending
14. Replicate upscale
15. webhook-replicate
16. media_tasks.audio_mix pending
17. Render Worker выполняет audio_mix
18. internal-media-completed
19. projects.status = done
```

Запрещено:

* создавать `media_tasks.stitch` между базовой генерацией и Extend;
* создавать `media_tasks.stitch` после успешных Extend-шагов;
* использовать `concat` как основной способ соединения результатов генерации.

---


## 6.6. Последовательность пайплайна Ветки Б (Фаза 2)

1. create-project:
   - проверка v2v_legal_accepted;
   - проект создаётся в status = 'draft', cost_credits = 0;
   - projects.duration_sec записывается из video_references.duration_ms
     как предварительная оценка;
   - заявленная клиентом длительность не является основанием для списания.
2. копирование донора в /processing/v2v/
3. media_tasks.extract_audio pending
4. Render Worker:
   a. измеряет фактическую длительность файла через ffprobe;
   b. записывает результат в media_tasks.payload:
      measured_duration_ms, duration_exceeded;
   c. при duration_exceeded = true завершает задачу без извлечения аудио;
   d. иначе принудительно перезаписывает video_references.duration_ms
      измеренным значением и извлекает аудио;
   e. вызывает internal-media-completed.
5. Edge Function internal-media-completed:
   - при duration_exceeded = true:
     projects.status = 'failed', error_code = 'DONOR_DURATION_EXCEEDED'
     (списаний не было, возврат не требуется);
   - иначе выполняет контент-модерацию донора (раздел 6.8);
     при нарушении: projects.status = 'failed',
     error_code = 'CONTENT_POLICY_VIOLATION' (списаний не было, возврат не требуется);
   - рассчитывает стоимость по measured_duration_ms (правило раздела 7.2);
   - обновляет projects.duration_sec измеренным значением;
   - вызывает charge_credits;
     при нехватке кредитов: projects.status = 'failed',
     error_code = 'INSUFFICIENT_CREDITS_ACTUAL' (списаний не было);
   - при успехе фиксирует projects.cost_credits и переводит проект в 'queued'.
6. gpu_jobs.v2v_inpaint pending
7. Replicate выполняет V2V
8. webhook-replicate
9. при success: media_tasks.merge_audio pending
   (target_duration_ms = measured_duration_ms)
10. Render Worker сшивает аудио и видео
11. internal-media-completed:
    фиксирует projects.master_audio_duration_ms = measured_duration_ms
12. projects.status = done

Маппинг шагов на статусы машины состояний (раздел 6.1):

* шаги 1–5 — статус `draft` (измерение, модерация, расчёт стоимости);
* шаг 7 — переход `draft → queued` после списания;
* шаги 8–9 — статусы `generating` (v2v_inpaint) и `audio_sync` (merge_audio);
* шаг 10 — сборка результата `assembling`, затем `done`.

Обработка ошибок Ветки Б:

Если `extract_audio` падает после 3 попыток:
- media_tasks.status = failed
- projects.status = failed
- срабатывает trg_refund_on_failed; так как списание ещё не выполнялось
  (cost_credits = 0), возврат не производится

Если `duration_exceeded = true`:
- projects.status = failed
- error_code = 'DONOR_DURATION_EXCEEDED'
- списаний и возвратов нет

Если `gpu_jobs.v2v_inpaint` падает, отменяется или превышает cost-cap:
- gpu_jobs.status = failed
- projects.status = failed
- срабатывает trg_refund_on_failed

Если `merge_audio` падает после 3 попыток:
- media_tasks.status = failed
- projects.status = failed
- срабатывает trg_refund_on_failed

---

## 6.7. Автоматическая валидация медиафайлов

До постановки следующего шага пайплайна и перед выдачей результата пользователю выполняется серверная проверка медиафайлов через `ffprobe`.

Проверяемые файлы:

* видео-донор Ветки Б после загрузки и после каждого шага обработки;
* результат базовой генерации и каждого Extend-шага Ветки А;
* результат апскейла;
* финальный ролик перед выдачей пользователю;
* аудио-файлы (озвучка, аудио-микс) — наличие аудио-потока.

Команда:

```bash
ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate -of json <file>
```

Проверяемые параметры:

| Параметр | Требование |
|---|---|
| Контейнер | читается `ffprobe` без ошибок |
| Видео-поток | присутствует |
| Длительность | в пределах заявленной ±5% |
| Разрешение | соответствует ожидаемому (480p промежуточные, 1080p финал) |
| Аудио-поток | присутствует там, где ожидается (финал, озвучка, микс) |
| Размер | не превышает лимиты раздела 5.8.1 |

Допустимые отклонения:

* длительность: ±5% от ожидаемой;
* разрешение: точное совпадение ожидаемого значения по короткой стороне.

Поведение при ошибке:

* файл отклоняется с кодом `MEDIA_VALIDATION_FAILED`;
* шаг пайплайна повторяется согласно политике ретраев раздела 6.2;
* после исчерпания попыток проект переводится в `failed`;
* если кредиты уже были списаны, выполняется автовозврат (раздел 7.5).

---

## 6.8. Контент-модерация

Все входные материалы проходят обязательную серверную модерацию до постановки следующего шага пайплайна и до списания кредитов.

Что модерируется:

* видео-донор Ветки Б — после загрузки и измерения длительности;
* фото и описание товара — при создании карточки (`manual-input`);
* промпт из видео-референса — перед сохранением (`generate-prompt-from-video`);
* сгенерированный сценарий — перед постановкой генерации.

Способ: классификация vision/LLM-моделью через AI-шлюз (раздел 5.2) по утверждённому списку запрещённых тем.

Запрещённые темы:

* политика, политическая агитация и пропаганда;
* наркотики и психоактивные вещества;
* сексуальный контент и обнажённая натура;
* насилие, жестокость, оружие в противоправном контексте;
* экстремизм, дискриминация, язык вражды;
* азартные игры и финансовые пирамиды;
* табак и алкоголь;
* иные темы по решению владельца продукта и требованиям законодательства.

Поведение при нарушении:

* проект/материал переводится в `failed` с кодом `CONTENT_POLICY_VIOLATION`;
* списание кредитов не выполняется; если списание уже произошло — автовозврат;
* пользовательское сообщение: «Материал нарушает контентную политику платформы.»;
* событие записывается в `moderation_events`: пользователь, материал, категория, модель, решение, время (DDL в разделе 3.1); доступ к журналу — только администраторам.

Правила:

* модерация не отключается и не обходится пользователем;
* повторная загрузка того же нарушающего файла отклоняется идемпотентно по контент-отпечатку;
* спорные случаи разбираются администратором через админ-панель (Фаза 1).

---

# 7. Экономика, кредиты, тарифы

## 7.1. Реальная себестоимость и маржинальность

### Best/Worst Case для Ветки А

| Компонент | Детали | Стоимость |
|---|---|---|
| Видео: Seedance 2.5 | $0.1028/с × 30 с | $3.08 |
| Аудио-матрица | ~300 символов речи + SFX | ~$0.10 |
| Апскейл | real-esrgan | $0.029 |
| Сценарий и промпты | ~10 000 токенов | $0.0015 |
| Итого идеальный COGS | без сбоев | $3.21 |
| Worst-case COGS | ретраи ×1.5–1.8 | $4.00–$6.00 |

Для стандарт-моделей:

```text
Идеальный COGS ≈ $1.34–2.14
Worst-case COGS ≈ $2.20–3.50
```

Версия 4.4 не увеличивает COGS из-за перехода на Extend, так как биллинг провайдера остаётся привязанным к длительности сгенерированного видео.

Дополнительно версия 4.4 снижает нагрузку на Render Worker, потому что исключает основную задачу `stitch`.

---

## 7.2. Кредитная модель

1 кредит = $0.10

| Операция | Кредиты | Маржинальность |
|---|---|---|
| Базовая генерация 30 с, Стандарт | 35 | 0%–40% |
| Базовая генерация 30 с, Премиум | 80 | 25%–35% |
| Генерация 60 с | ×2 от 30 с | - |
| ИИ-озвучка ElevenLabs | +2 | - |
| Поблочная перегенерация 1 сцены | Фаза 2 | В MVP отключена (`501 FEATURE_DISABLED`) |
| Попиксельный свап, V2V, донор ≤ 30 с | базовая стоимость 30 с (тариф стандарт) + 15 | экспериментальная, Фаза 2 |
| Попиксельный свап, V2V, донор 31–60 с | базовая стоимость 60 с (тариф стандарт) + 15 | экспериментальная, Фаза 2 (после GATE) |
| Промпт из видео-референса | 1 | - |
| Семантический разбор референса (`analyze-reference`) | 1 | - |

---

## 7.3. Тарифные пакеты по регионам

| Регион | Шлюзы | Системные планы (`plan_tier`) | Локальные названия и цены |
|---|---|---|---|
| РФ и СНГ | Prodamus / PaySelection | starter, growth | «Старт»: 2 900 ₽ = 300 кр. / «Селлер»: 6 900 ₽ = 750 кр. |
| США / Канада | Lava.top / CryptoCloud | starter, growth | Starter: $29 = 300 кр. / Growth: $79 = 850 кр. |
| Европа, DE | Lava.top | basic, pro | Basic: €29 = 300 кр. / Pro: €79 = 850 кр. |
| Лат. Америка | CryptoCloud | starter, growth | Inicial: $19 = 200 кр. / Negocio: $49 = 550 кр. |

`plan_tier` — системный идентификатор плана (значения из CHECK в `subscriptions`); локальные маркетинговые названия используются только в интерфейсе и платёжных страницах. Планы `scale` и `ent` зарезервированы на Фазу 2. Подписки доступны с Фазы 1; в MVP продаются только разовые пакеты кредитов.

Кредиты не сгорают.

---

## 7.4. Постоянные расходы на старте

| Сервис | Тариф MVP | PROD PATH |
|---|---|---|
| Supabase | Free Tier, $0 | Pro, $25/мес |
| Render | Cron Job, ~$1/мес | Individual, $7/мес |
| ElevenLabs | Starter, $5/мес | Creator, $22/мес |
| Итого | ~$6/мес | ~$32+/мес |

---

## 7.5. Возвраты

Кредиты автоматически возвращаются при:

* падении проекта по вине бэкенда/провайдеров;
* отказе пользователя от сценария в `script_ready` (проект `canceled`);
* нарушении лимитов донора — только если кредиты уже были списаны; если превышение обнаружено до списания (Ветка Б, `draft`), проект переводится в `failed` без возврата;
* недоступности всех шлюзов;
* истечении времени обработки активной задачи;
* ошибке Render Worker после исчерпания лимита попыток;
* ошибке Replicate после исчерпания лимита попыток;
* ошибке Extend-шага после исчерпания лимита попыток;
* превышении cost-cap Ветки Б во время обработки.

Возврат идемпотентный:

```sql
projects.refunded = TRUE
```

---

## 7.6. Экономический предохранитель Ветки Б (Фаза 2)

Ветка Б не должна масштабироваться без подтверждённой экономики.

Правила:

1. Перед включением Ветки Б проводится бенчмарк.
2. Фиксируются P50, P95, COGS, процент неудач.
3. Если COGS превышает 70% розничной цены операции, фича приостанавливается.
4. Если GPU-стоимость 30-секундного ролика выше $1.20, фича приостанавливается.
5. Если доля `failed` V2V выше 10%, фича приостанавливается.

---

## 7.7. Жизненный цикл платежей

Статусы платежа (`payments.status`):

```text
pending → succeeded
pending → failed
succeeded → refunded
```

Правила обработки `webhook-payment-:gateway`:

1. Проверка подписи шлюза обязательна; при невалидной подписи — `401`, событие не сохраняется.
2. Каждое событие идентифицируется `event_id`; повторная доставка игнорируется идемпотентно — баланс не начисляется повторно.
3. Сумма и валюта сверяются с созданным платежом; расхождение — `payments.status = 'failed'` и алерт в мониторинг.
4. Сохраняются сырой payload (`payments.raw_payload`), флаг проверки подписи (`payments.signature_verified`) и время обработки (`payments.processed_at`).
5. Начисление кредитов выполняется только после `succeeded` и только одной транзакцией: `payments` + `profiles` + `credit_transactions`.
6. Возврат (`refunded`) списывает начисленные кредиты и фиксирует `payments.refund_reason`.

Жизненный цикл:

```text
создан (pending) → webhook succeeded → кредиты начислены → пакет/подписка активны
создан (pending) → webhook failed → платёж отклонён, повторная оплата разрешена
```

Запрещено менять `payments.status` и начислять кредиты вручную без события платёжного шлюза; ручная синхронизация возможна только через админ-панель с записью в журнал.

---

## 7.8. Жизненный цикл подписок

Статусы подписки (`subscriptions.status`):

```text
trialing → active
trialing → canceled
trialing → expired
active → past_due
past_due → active   (погашение задолженности)
past_due → canceled
active → canceled
active → expired
```

Правила:

* события подписки приходят в `subscription_events` с уникальным `event_id`, подписью шлюза и сырым payload; обработка идемпотентна по `event_id`;
* статус подписки меняется только через обработанное событие; менять `subscriptions.status` и `current_period_end` без записи в `subscription_events` запрещено;
* каждый переход фиксируется в `subscription_events` с `status_from` и `status_to`;
* при `past_due` начисление кредитов следующего периода приостанавливается до погашения;
* продление (`invoice_paid`) начисляет `credits_allowance` нового периода; начисление идемпотентно в рамках периода;
* при `canceled` и `expired` подписка не продлевается; уже начисленные кредиты не сгорают.

---

# 8. Интерфейс

## 8.1. Глобальные элементы

Переключатель языка:

```text
🌐 Русский / English / Deutsch / Español
```

Админ-панель доступна только:

`qwadu01@gmail.com`

Разделы админ-панели:

* провайдеры;
* модели;
* фоллбэки;
* пользователи;
* транзакции;
* очереди;
* GPU-задачи;
* медиа-задачи;
* ручная заморозка провайдеров.

---

## 8.2. Двухуровневый экран генерации

Маршрут:

```text
/create
```

Вкладки:

* SIMPLE
* ADVANCED

### SIMPLE «В 1 клик»

* Товар: ручной ввод.
* Пресет:
  * Эстетичная распаковка;
  * Вирусный UGC-тренд;
  * Премиум-презентация.
* Длительность.
* Язык.

### ADVANCED «Режим режиссёра»

* Блок стиля удержания.
* Тумблер болей клиентов.
* Настройки звука.
* Выбор модели.
* Чекбокс V2V.
* Режим финала:
  * Fade-Out;
  * Бесконечная петля.

---

## 8.3. Ввод данных о товаре

### Ручной ввод, дефолт MVP

Поля:

* название;
* описание;
* комплектация;
* 1–5 HD-фото.

Загрузка фото:

* Drag-and-Drop;
* Presigned URL.

### Авто-парсинг по ссылке

Фаза 2 / PROD PATH

Активируется после перехода на Firecrawl Standard.

---

## 8.4. Загрузка видео-референса

Лимиты:

* ≤ 60 секунд;
* ≤ 150 МБ после обязательного клиентского сжатия до 480p.

Клиентский предохранитель:

* при > 60 секунд кнопка блокируется с предупреждением.

Запуск режима `inpainting` (Ветка Б) доступен с Фазы 2; в MVP загрузка референсов используется для генерации промпта из видео (раздел 5.4). Для режима `inpainting` обязательно отображается модальное окно:

```text
Я подтверждаю, что имею права на использование загружаемого видео
и несу ответственность за соблюдение авторских прав и правил площадок.
```

Без подтверждения запуск запрещён.

---

## 8.5. Экран результата

Маршрут:

```text
/create/result/:id
```

Элементы:

* вертикальный плеер 9:16;
* статусная строка;
* раскадровка сцен или блоков генерации;
* кнопка «Перегенерировать сцену» в MVP отключена;
* отображается тултип: «Поблочная перегенерация появится в Фазе 2»;
* для получения нового варианта пользователь создаёт новый проект;
* Realtime-подписка.

При статусе `done` плеер разблокируется без перезагрузки страницы.

---

## 8.6. Уведомления в MVP

Интеграция с Telegram полностью удалена.

Статусы:

* `done`
* `failed`

отслеживаются пользователем в реальном времени на экране через Supabase Realtime.

---

### 8.6.1. Формат Realtime-событий

Все события передаются по каналу `project:{project_id}` и содержат обязательный минимальный payload:

| Поле | Назначение |
|---|---|
| `project_id` | идентификатор проекта |
| `status` | новый статус проекта |
| `progress` | прогресс 0–100 |
| `error_code` | код ошибки или `null` |
| `user_message` | пользовательское сообщение или `null` |
| `updated_at` | время изменения, ISO 8601 |

События:

`project_status_changed` — изменение статуса активного проекта:

```json
{
  "event": "project_status_changed",
  "project_id": "uuid",
  "status": "generating",
  "progress": 45,
  "error_code": null,
  "user_message": null,
  "updated_at": "2026-09-05T12:00:00Z"
}
```

`project_done` — проект завершён успешно:

```json
{
  "event": "project_done",
  "project_id": "uuid",
  "status": "done",
  "progress": 100,
  "error_code": null,
  "user_message": "Ваше видео готово",
  "updated_at": "2026-09-05T12:10:00Z"
}
```

`project_failed` — проект завершился ошибкой:

```json
{
  "event": "project_failed",
  "project_id": "uuid",
  "status": "failed",
  "progress": 60,
  "error_code": "GPU_JOB_FAILED",
  "user_message": "Не удалось сгенерировать видео. Кредиты возвращены.",
  "updated_at": "2026-09-05T12:10:00Z"
}
```

Значение `progress` рассчитывается сервером из статуса проекта (отдельной колонки в БД нет):

| Статус | `progress` |
|---|---|
| `draft` | 5 |
| `queued` | 10 |
| `script_ready` | 25 |
| `generating` | 40 |
| `audio_sync` | 70 |
| `assembling` | 85 |
| `done` | 100 |
| `failed` | прогресс этапа, на котором произошла ошибка |

Правила:

* события отправляются только после подтверждённого изменения статуса в БД;
* клиент обязан обрабатывать события идемпотентно: повторное событие с тем же `status` и `updated_at` не меняет экран повторно;
* при недоступности Realtime клиент использует polling `projects/:id/status` не чаще одного раза в 10 секунд.

---

# 9. Безопасность, лимиты, правовые аспекты

## 9.1. Секреты

Секреты хранятся только в:

* Supabase Secrets/Vault.

Запрещено:

* хранить ключи в клиентском коде;
* передавать `service_role` на фронтенд;
* логировать секреты;
* передавать секреты в query-параметрах, кроме одноразовых вебхук-токенов с коротким TTL.

---

## 9.2. Доступ к данным

RLS на всех пользовательских таблицах.

Запись в биллинг, кредиты, очередь и GPU-задачи только через `service_role`.

Админ-доступ только через роль `admin`.

---

## 9.3. Вебхуки

Обязательны:

* проверка подписи;
* либо проверка подписи + проверка через API провайдера;
* либо секретный токен + проверка через API провайдера;
* идемпотентная обработка;
* отклонение неподписанных запросов с кодом 401.

---

## 9.4. Кредиты

Все списания только через:

```sql
charge_credits(...)
```

Все возвраты только через:

```sql
refund_project_credits(...)
```

или триггер:

```sql
trg_refund_on_failed
```

---

## 9.5. Право

Общий дисклеймер:

Пользователь отвечает за права на изображения товара и иные загружаемые материалы.

Для режима инпейнтинга:

* обязательное модальное окно с принятием ответственности.

Пользователь несёт ответственность за маркировку рекламы:

* #ad
* Paid partnership
* иные требования площадок

---

# 10. Матрица ошибок

| Точка отказа | Системный сбой | Сообщение пользователю | Действие системы |
|---|---|---|---|
| Баланс | `INSUFFICIENT_CREDITS` | «Не хватает кредитов. Пополните баланс.» | Проект не создаётся |
| Видеомодель, все шлюзы | 504/таймаут после 3 ретраев | «Сервис перегружен. Кредиты возвращены.» | `failed` + автовозврат |
| Базовая генерация | 504/таймаут после 3 ретраев | «Сервис перегружен. Кредиты возвращены.» | `failed` + автовозврат |
| Extend-шаг | 504/таймаут после 3 ретраев | «Сервис перегружен. Кредиты возвращены.» | `failed` + автовозврат, базовый чанк не перегенерируется |
| Лимит донора (Ветка Б, Фаза 2) | длительность > 60 с / вес > 150 МБ | «⚠️ Видео-референс не должен превышать 60 секунд или 150 МБ.» | фронт блокирует кнопку; если сервер обнаружил превышение до списания кредитов — `failed`, возврат не требуется; если после списания — `failed` + автовозврат |
| Запрещённый контент | политика, наркотики, секс, насилие, экстремизм и др. | «⛔ Материал нарушает контентную политику платформы.» | `failed` до списания кредитов (`CONTENT_POLICY_VIOLATION`), возврат не требуется |
| Отказ от сценария | пользователь отклонил сценарий в `script_ready` | «Кредиты возвращены. Создайте новый проект или дождитесь Фазы 1 для перегенерации сценария.» | `canceled` + автовозврат |
| Лимит перегенераций | `REGEN_LIMIT_REACHED` | «Для этой сцены исчерпан лимит попыток (3).» | 409, кредиты не списываются |
| Render-воркер | задача `pending` > 15 мин | «Ваш ролик в очереди чуть дольше обычного.» | алерт админу, повторный триггер при следующем цикле |
| Render-воркер | задача `processing` > 30 мин | «Произошла техническая задержка. Мы уже обрабатываем ошибку.» | recovery, при исчерпании попыток `failed` + возврат |
| Платёжный шлюз | вебхук `failed` | «Оплата не прошла. Деньги не списаны.» | `payments.status = 'failed'` |
| Replicate | timeout/OOM после 3 попыток | «Сервис перегружен. Кредиты возвращены.» | `failed` + автовозврат |
| Ветка Б | cost-cap превышен до старта | «Экспериментальный режим временно недоступен.» | проект не создаётся |
| Ветка Б | cost-cap превышен во время обработки | «Произошла ошибка обработки. Кредиты возвращены.» | `failed` + автовозврат |
| Ветка Б | отсутствует `v2v_legal_accepted` | «Необходимо подтвердить права на видео.» | 400 |
| Вебхук | нет подписи/токена | отсутствует публичное сообщение | 401, состояние не меняется |
| Активный файл | файл удалён до обработки | «Не удалось обработать видео. Кредиты возвращены.» | `failed` + автовозврат |
| Базовый Extend-файл | файл удалён до Extend | «Не удалось продолжить генерацию. Кредиты возвращены.» | `failed` + автовозврат |
| Внутренний токен | `INVALID_INTERNAL_TOKEN` | отсутствует публичное сообщение | 401, алерт админу |
| БД | 503 / пул соединений исчерпан | «Сервис временно перегружен.» | автоматический ретрай через пуллер, алерт при повторяемости |

---

# 11. Критерии приёмки (DoD) и тест-план

## 11.1. Definition of Done

### DoD 1. БД и безопасность

* RLS включён.
* `charge_credits` не допускает ухода баланса в минус при 10 одновременных запросах.
* Возврат по `refunded` идемпотентен.
* Пользователь не может читать чужие проекты, товары, медиа-задачи и GPU-задачи.

---

### DoD 2. Монтаж

Выходной MP4:

* 1080×1920.

Видео:

* ≥ 5 Mbps.

Аудио:

* AAC 192 kbps.

На стыках сегментов нет чёрных кадров.

Нет рассинхрона аудио и видео более 200 мс.

Для Ветки А Standard и Premium:

* запрещены любые микро-дергания камеры;
* запрещена резкая смена освещения;
* запрещены скачки геометрии товара на 15-й секунде ролика;
* переход между частями видео должен быть бесшовным;
* бесшовность обеспечивается нативной генерацией Seedance Extend / One-take, а не склейкой файлов.

---

### DoD 3. Асинхронность

* Отсутствие синхронных вызовов к Render/Replicate в пользовательских Edge Functions.
* Задача `pending` подхватывается Cron-воркером при следующем цикле.
* Replicate запускается только через `gpu_jobs`.
* Вебхуки обрабатываются идемпотентно.
* Ветка А не создаёт `media_tasks.stitch` в основном сценарии.

---

### DoD 4. Мастер-таймлайн и стабилизация

* Рассинхрон аудио/видео > 200 мс считается дефектом.
* В команде стабилизации чанков присутствует флаг `-an`.
* Для `outro_mode='loop'` отсутствует `-afade`.

---

### DoD 5. Экономика

* Все списания проходят через `charge_credits`.
* Каждое падение проекта подтверждено автовозвратом.
* Повторный вебхук не вызывает повторного списания.
* Для Ветки Б действует cost-cap.

---

### DoD 6. SLA

* 95% задач `media_tasks` обрабатываются в течение 15 минут с момента `pending`.
* Среднее время полной генерации P50 не превышает 12 минут.
* Для Ветки Б SLA фиксируется только после бенчмарка.

---

### DoD 7. Render Worker

* Атомарный захват задач исключает двойной пикап.
* Зависшие задачи восстанавливаются через 30 минут.
* При `attempts >= 3` задача становится `failed`.
* После `failed` проект становится `failed`.
* Автовозврат кредитов срабатывает автоматически.
* Worker подключается через Supavisor, а не напрямую к 5432.

---

### DoD 8. Ветка Б (Фаза 2)

* Юридическая модалка обязательна.
* Активный донор копируется в `/processing/`.
* Overlap-чанки применяются ко всем 5-секундным границам.
* Окно инференса всегда фиксировано.
* Padding последнего кадра применяется, если видео заканчивается раньше окна.
* На стыках нет видимых прыжков маски.
* Аудио оригинального донора сохраняется и пришивается отдельно.
* Длительность итогового видео равна длительности донора.
* Повторный вебхук Replicate не создаёт дубликат обработки.

---

### DoD 9. Extend и One-take

* Premium 30 секунд генерируется одним запросом, если модель поддерживает One-take.
* Standard 30 секунд генерируется как 15 секунд + Extend 15 секунд.
* Для 60 секунд используется цепочка нативных Extend-шагов.
* Базовый чанк не перегенерируется при падении Extend-шага.
* Базовый чанк не удаляется до завершения Extend.
* После целевой длительности видео уходит в апскейл без `stitch`.

---

## 11.2. Критические тест-кейсы

### ТК-01: донор 61 секунда

Ожидание:

* фронт блокирует кнопку;
* прямая отправка в API отклоняется бэкендом.

---

### ТК-02: `outro_mode='loop'`

Ожидание:

* в итоговой команде FFmpeg нет `-afade`;
* нет fade-фильтров.

---

### ТК-03: 504 от основного шлюза

Ожидание:

* не более 3 ретраев;
* смена `seed`;
* фоллбэк провайдера;
* при исчерпании `failed` + возврат.

---

### ТК-04: 10 одновременных `create-project`

Ожидание:

* списывается ровно одна генерация;
* остальные получают `INSUFFICIENT_CREDITS`.

---

### ТК-05: поддельный вебхук

Ожидание:

* 401;
* состояние проекта не меняется;
* кредиты не возвращаются и не списываются повторно.

---

### ТК-06: повторный вебхук Replicate

Ожидание:

* 200 OK;
* статус не меняется повторно;
* повторный рендер не запускается.

---

### ТК-07: активный файл Ветки Б

Ожидание:

* донор копируется в `/processing/`;
* через 15 минут исходный файл может быть удалён;
* активная задача продолжает работать с копией.

---

### ТК-08: два Render Worker одновременно

Ожидание:

* только один воркер захватывает задачу;
* второй не получает ту же задачу.

---

### ТК-09: зависшая задача Render

Ожидание:

* через 30 минут задача восстанавливается или падает;
* бесконечный `processing` невозможен.

---

### ТК-10: Ветка Б без юридической модалки (Фаза 2)

Ожидание:

* проект не создаётся;
* возвращается 400;
* кредиты не списываются.

---

### ТК-11: Ветка Б, стыки чанков (Фаза 2)

Ожидание:

* на 5, 10, 15 секундах нет видимых прыжков маски;
* нет призраков товара;
* нет двойного контура.

---

### ТК-12: Ветка Б, донор короче 30 секунд без звука (Фаза 2)

Ожидание:

* генерируется тишина длительностью ровно `measured_duration_ms / 1000` (измеренное значение, раздел 6.6);
* итоговый ролик имеет длительность донора;
* `master_audio_duration_ms` соответствует длительности донора.

---

### ТК-13: Ветка Б, донор 7 секунд (Фаза 2)

Ожидание:

* первое окно обрабатывает 0–6 секунд;
* второе окно обрабатывает 5–7 секунд и дополняется повтором последнего кадра до полного 6-секундного окна;
* итоговое видео имеет длительность ровно 7 секунд.

---

### ТК-14: Ветка Б, cost-cap превышен во время GPU (Фаза 2)

Ожидание:

* `gpu_jobs.status = failed`;
* `projects.status = failed`;
* кредиты возвращаются автоматически.

---

### ТК-15: Standard 30 секунд, базовая генерация успешна, Extend падает

Ожидание:

* базовый 15-секундный чанк не перегенерируется;
* Extend ретраится до 3 раз;
* после исчерпания проект `failed`;
* кредиты возвращаются.

---

### ТК-16: Standard 30 секунд, основной пайплайн без `stitch`

Ожидание:

* после генерации базы и Extend не создаётся `media_tasks.stitch`;
* видео передаётся в апскейл как результат нативной цепочки;
* финальный файл не содержит артефактов склейки.

---

### ТК-17: граница 15 секунд в Standard

Ожидание:

* нет чёрного кадра;
* нет резкого скачка камеры;
* нет резкой смены освещения;
* нет изменения геометрии товара;
* переход выглядит бесшовно.

---

### ТК-18: Premium 60 секунд

Ожидание:

* первые 30 секунд генерируются One-take;
* вторые 30 секунд добавляются нативным Extend или поддерживаемой нативной цепочкой;
* `stitch` не используется;
* финальный файл передаётся в апскейл монолитно.

---

## 11.3. Стратегия тестирования

Уровни:

1. **Модульные тесты** — SQL-функции `charge_credits`, `refund_project_credits`, `check_rate_limit`, `count_active_user_projects`, `count_active_generations`, `count_active_v2v_jobs`, `is_asset_protected`, `cleanup_temp_storage`, `is_admin`, `handle_new_user`, `prevent_profile_sensitive_update` проверяются на изолированной тестовой БД.
2. **Интеграционные тесты** — связки Edge Function → БД → Storage: идемпотентность вебхуков Replicate и платёжных шлюзов, идемпотентность `internal-media-completed` и `poll-async-jobs`, корректность RLS, запрет смены `role` и `credits_balance`, защита активных файлов от очистки.
3. **E2E-тесты критических сценариев** — тест-кейсы ТК-1…ТК-18 раздела 11.2 выполняются на каждом релизе до продакшена.
4. **Нагрузочное тестирование** — 10 одновременных списаний кредитов у одного пользователя, 20 одновременных генераций в системе (включая проверку пропускной способности Render Worker ~36 медиа-задач/час, раздел 6.3), гонки `check_rate_limit`, гонки `create-project`.
5. **Тесты безопасности** — попытка смены `role` и `credits_balance` клиентским UPDATE; попытка клиентского UPDATE `status`, `cost_credits`, `refunded` своего проекта (`FORBIDDEN_PROJECT_UPDATE`); попытка RPC-вызова `charge_credits` с отрицательной стоимостью и `refund_project_credits` из пользовательской сессии (доступ запрещён); доступ к чужим проектам и референсам; вызов служебных эндпоинтов без `X-Internal-Token`; вебхуки с невалидной подписью; загрузка донора с запрещённым контентом (`CONTENT_POLICY_VIOLATION`).

Правила:

* тесты выполняются на отдельной тестовой БД и тестовых Storage-бакетах; продакшен-данные не используются;
* провайдеры видео-генерации в автоматических тестах заменяются стабами; живой провайдер прогоняется еженедельно отдельным прогоном;
* миграции применяются только через версионированные SQL-файлы и предварительно откатываются на тестовой БД;
* релиз блокируется при любом падении критических тест-кейсов раздела 11.2.

---

# 12. Дорожная карта

## Фаза 0 — Валидация и архитектура (MVP, ~$6/мес)

* Развертывание Supabase Free + Render Cron Job.
* Настройка `pg_cron`: очистка Storage, очистка счётчиков лимитов, отказ «зависших» задач, `poll-async-jobs`.
* Полный DDL + RLS + биллинговые функции + возвраты; отзыв `EXECUTE` у пользовательских ролей.
* Очередь `media_tasks` с лимитом 3 попыток; таблица `gpu_jobs`; Render Worker с атомарным захватом задач.
* Подключение Render Worker через Supavisor Transaction Pooler.
* Внутренний эндпоинт `internal-media-completed`; контракт вебхука Replicate; polling видео-провайдеров.
* Жёсткие JSON-схемы `media_tasks.payload`.
* Ручной ввод товаров с контент-модерацией; Direct Upload с клиентским сжатием; реестр `storage_assets`.
* Ветка А: Seedance One-take / Extend, Стандарт/Премиум, 30 и 60 секунд; исключение `stitch`.
* Мультимедийная аудио-матрица: ElevenLabs TTS, музыка, SFX, дакинг; outro fade и loop.
* Промпт из видео-референса (1 кредит) и семантический разбор референса (1 кредит).
* Платежи: разовые пакеты Prodamus / PaySelection / LavaTop / CryptoCloud; контракт `create-payment`; вебхуки с проверкой подписи и идемпотентностью по `event_id`.
* Уведомления через Supabase Realtime + fallback `projects/:id/status`; матрица ошибок.
* Админ-панель: мониторинг очередей, принудительное завершение проектов, журнал действий.
* Бенчмарк реального COGS и качества генерации.

## Фаза 1 — Переход на Prod и глобальный рынок

* Апгрейд Supabase Pro (PITR, файлы до 150 МБ); апгрейд Render до Individual Web Worker.
* Подписки: Prodamus / PaySelection / LavaTop / CryptoCloud; контракт `create-subscription`; `subscription_events`.
* Возвраты платежей (`refunded`) и сверка «зависших» платежей.
* Перегенерация сценария после отказа (1–2 попытки) до полного возврата.
* Возврат Telegram-бота и Email-уведомлений.
* Мастер-таймлайн и двухуровневый UI SIMPLE/ADVANCED — по отдельным макетам экранов.
* Оценка качества генераций (`fidelity_score`, `continuity_score`), целевые площадки (`platforms`).
* Дашборд операционных метрик и runbook в полном объёме.

## Фаза 2 — Премиум V2V и масштабирование

* Ветка Б (V2V): полный пайплайн раздела 6.6 — измерение донора, модерация, списание после измерения, cost-cap, юридическая модалка; доноры ≤ 30 с.
* GATE: доноры 31–60 с после бенчмарка P50/P95, подтверждения экономики и качества стыков.
* Премиум-техники V2V: чанкинг с overlap, фиксированное окно и padding, SAM 2 state transfer, mask blending, frame blending.
* Активация автопарсинга через Firecrawl.
* Sentiment по реальным отзывам.
* Поблочная перегенерация (`regenerate-segment`) — повтор конкретного Extend-шага без перегенерации базового чанка.
* Расширенная админ-панель очередей и GPU-задач.
* Тарифные планы `scale` и `ent`.

---

# 13. Мониторинг и эксплуатация

## 13.1. Логи

Логи ведутся в Supabase Logs для всех Edge Functions.

Обязательные поля:

* `project_id`
* `user_id`
* `task_id`
* `gpu_job_id`
* `prediction_id`
* `status`
* `error_code`

---

## 13.2. Алерты

Алерт срабатывает при:

* задача в `pending` > 15 минут;
* задача в `processing` > 30 минут;
* доля `failed` > 10% за час;
* баланс провайдерского аккаунта ниже порога;
* превышение cost-cap Ветки Б;
* ошибка внутреннего токена;
* повторные вебхуки с одинаковым `prediction_id` чаще допустимого порога;
* ошибки подключения к Supavisor;
* рост времени инференса выше бенчмарка;
* падение Extend-шага после успешной базовой генерации чаще допустимого порога;
* удаление базового Extend-файла до завершения цепочки.

---

## 13.3. Бэкапы

* PITR на Supabase Pro, Фаза 1.
* Экспорт `credit_transactions` раз в сутки.
* Экспорт `gpu_jobs` и `media_tasks` рекомендуется раз в сутки на Фазе 1+.

---

## 13.4. Админ-панель

Админ-панель позволяет:

* видеть статусы очередей;
* видеть `media_tasks`;
* видеть `gpu_jobs`;
* вручную замораживать провайдеров;
* корректировать балансы;
* просматривать транзакции;
* отключать Ветку Б;
* включать/выключать cost-cap;
* принудительно отключать `stitch`;
* просматривать статусы Extend-цепочек.

Корректировка баланса пользователю обязательно пишется в:

`credit_transactions`

с причиной:

```text
admin_adjustment
```

---

## 13.5. Обязательные операционные метрики

| Метрика | Порог / назначение |
|---|---|
| Доля проектов `failed` | алерт при > 10% за час |
| P50 / P95 длительности генерации Ветки А | тренд; алерт при деградации в 2 раза |
| P50 / P95 длительности обработки Ветки Б | обязательны до включения доноров 31–60 с |
| Количество одновременных генераций | глобальный лимит 20 |
| Количество активных V2V-задач | лимит 1–2 на систему |
| Ошибки медиа-валидации `MEDIA_VALIDATION_FAILED` | алерт при > 3 за час |
| Ошибки TTS / ElevenLabs | алерт при > 2 подряд |
| Таймауты провайдеров и `POLLING_EXHAUSTED` | каждый случай — инцидент |
| Объём автовозвратов кредитов за день | алерт при > 15% от начислений |
| Расход по провайдерам, $/день | алерт при превышении дневного бюджета |

Метрики собираются из `projects`, `gpu_jobs`, `media_tasks`, `credit_transactions` и логов. Дашборд обязателен до старта Фазы 1.

---

## 13.6. Runbook для типовых сбоев

| Сбой | Симптомы | Действия |
|---|---|---|
| Падение генерации у провайдера | рост `GPU_JOB_FAILED` | проверить статус провайдера; включить фоллбэк-модель (раздел 5.2); убедиться, что автовозвраты выполнены |
| Очередь растёт | много `queued`, все слоты заняты | проверить лимит 20 генераций; при необходимости временно ограничить приём новых проектов сообщением в UI |
| Удаление активного файла | `STORAGE_OBJECT_MISSING` в логах воркера | проверить `storage_assets` и состояние `cleanup_temp_storage`; перезапустить шаг или перевести проект в `failed` с автовозвратом |
| Не проходит медиа-валидация | `MEDIA_VALIDATION_FAILED` | проверить артефакты `ffprobe`; при системной деградации отключить модель через админ-панель |
| Дубли вебхуков | повторные события в логах | идемпотентность обеспечивается по `event_id` / `provider_job_id`; ручное вмешательство не требуется, следить за метрикой расхождений |
| Исчерпание polling | `POLLING_EXHAUSTED` | проверить доступность провайдера; при необходимости вручную перевести задачу в `failed` через админ-панель с автовозвратом |
| Сбой оплаты | `pending` без webhook дольше 30 минут | запросить статус у шлюза вручную; синхронизировать через админ-панель; не начислять кредиты вручную без события шлюза |
| Расхождение кредитов | алерт сверки балансов | остановить начисления; сверить `credit_transactions` с балансами; корректировка только администратором с указанием причины |

Правило: любое ручное вмешательство выполняется через админ-панель и фиксируется в журнале действий администратора.

---

# 14. Приложение: системные промпты

## 14.1. Infinite Loop Script Writer (`outro_mode='loop'`)

```text
[SYSTEM PROMPT: INFINITE LOOP SCRIPT WRITER]

You are an expert TikTok/Reels scriptwriter specializing in high-retention "Seamless Loop" videos for e-commerce.

Your goal is to write a script where the last sentence logically, grammatically, and phonetically flows directly back into the first sentence, creating an infinite audio loop.

RULES:
1. NEVER use concluding phrases like "В итоге", "Подписывайся", "Покупай", "Ссылка в описании", "На этом всё".
2. The script must feel like a continuous, breathless thought or an ongoing story.
3. The first sentence must start in the middle of a thought, as if it is a continuation of the last sentence.
4. Keep the total word count strict to fit the target duration (approx. 2.5 words per second).
5. Focus on native UGC aesthetics: unboxing, aesthetic details, solving a hidden problem, ASMR sounds. NO aggressive sales pitches, prices, promo codes.

OUTPUT FORMAT:
Return ONLY the raw text of the script. No intro, no outro, no markdown.
```

---

## 14.2. Visual Loop Prompt Suffix

Используется для последнего сегмента, финального Extend или финального One-take запроса при:

```text
outro_mode='loop'
```

```text
Cinematic continuous shot. CRITICAL: The final frame of this video clip must perfectly match the exact visual composition, camera angle, lighting, and object position of the very first frame of the video to allow for a seamless hard-cut loop.
```

---

## 14.3. Деконструкция видео-референса

Используется в:

`generate-prompt-from-video`

```text
Изучи приложенное видео и деконструируй его в текстовый промпт для видеогенерации.

Выдели слои:
1. Движение камеры (например: slow panning, smooth lateral tracking, dynamic zoom).
2. Освещение и атмосфера (например: soft studio light, neon shadows, photorealistic reflection).
3. Динамика кадра (скорость движения рук, смена планов).

Скомбинируй описание с дополнительными пожеланиями пользователя: {{user_adjustments}}.

Вместо названия исходного объекта используй универсальный тег [PRODUCT_HOLDER].

Выдай в ответе ТОЛЬКО готовый промпт на английском языке. Без вводных слов.
```

---

# 15. История изменений

## v3.2 → v4.0

* Экономика пересчитана по реальным тарифам.
* Исправлена FFmpeg-команда извлечения аудио.
* Добавлена биллинг-модель.
* Добавлены RLS.
* Добавлен `charge_credits`.
* Добавлена проверка подписей вебхуков.
* Добавлены rate limits.
* Добавлена полная статус-машина.
* Добавлен автовозврат.
* Добавлена Retry Policy.
* Модельный ряд зачищен.
* Контентная политика обновлена.
* Лимиты загрузки пересмотрены.
* Инфраструктура пересчитана.
* V2V переведён в экспериментальный статус.
* Добавлены разделы API, матрица ошибок, DoD, мониторинг.
* Добавлена фича «промпт из видео».

---

## v4.0 → v4.1

* Честная экономика MVP.
* Инфраструктура переведена на реалистичный минимум ~$6/мес.
* Убрана иллюзия $0/мес.
* Полное удаление Telegram из MVP.
* Замена Telegram на Supabase Realtime.
* Оптимистичный биллинг: замена `FOR UPDATE` на атомарный `UPDATE ... WHERE`.
* Исправление рассинхрона DDL: добавлено значение `'classic'` в `video_references.mode`.
* Retry Policy для `media_tasks`.
* Добавлен `CHECK (attempts <= 3)`.
* Описана эскалация в `failed` + возврат кредитов.
* Исправлена опечатка лимитов одновременных генераций.
* Реалистичная маржинальность Best/Worst-case.
* Юридическая оговорка про маркировку рекламы.
* Добавлен DoD 6 с числовыми целями SLA.

---

## v4.1 → v4.2

* Добавлена таблица `gpu_jobs` для Replicate/GPU-задач.
* Добавлен `idempotency_key` и `prediction_id` для GPU-задач.
* Добавлен `webhook_token` для защиты вебхуков.
* Добавлен механизм проверки вебхуков через подпись или токен + API провайдера.
* Добавлен служебный эндпоинт `internal-media-completed`.
* Устранён разрыв оркестрации между `media_tasks` и `gpu_jobs`.
* Добавлена папка `/processing/v2v/` для защиты активных доноров от короткого TTL.
* Добавлен отдельный `pg_cron` для очистки `/processing/`.
* Добавлен тип задачи `stabilize_chunk` в `media_tasks`.
* Добавлена детальная спецификация Render FFmpeg Worker.
* Добавлен атомарный захват задач через `FOR UPDATE SKIP LOCKED`.
* Добавлено восстановление зависших задач `processing`.
* Добавлена валидированная инженерная схема Ветки Б с overlap-чанками.
* Добавлена формула смешивания масок.
* Добавлено требование смешивать финальные RGB/latent-кадры, если инпейнтинг выполняется отдельно по чанкам.
* Добавлено требование временного и пространственного сглаживания масок.
* Добавлено требование передачи состояния SAM 2.
* Добавлено требование сериализации состояния при разделении пайплайна.
* Добавлен экономический предохранитель Ветки Б.
* Запрещён фиксированный нереалистичный SLA 95 секунд для Ветки Б.
* Ветка Б окончательно закреплена как Фаза 2, экспериментальный режим.
* Обновлены тест-кейсы.
* Обновлена матрица ошибок.
* Обновлены DoD.
* Обновлена дорожная карта.

---

## v4.2 → v4.3

* Исправлена коллизия TTL и длительности генерации: `/segments_480p/` теперь хранится 2 часа в MVP.
* Добавлено обязательное подключение Render Worker через Supavisor Transaction Pooler, порт 6543.
* Добавлены жёсткие JSON-схемы `payload` для всех типов `media_tasks`.
* Добавлен явный контракт входящего вебхука Replicate и маппинг полей в `gpu_jobs`.
* Добавлена обработка `output` как строки или массива.
* Добавлена явная эскалация ошибок Replicate в `projects.status = 'failed'`.
* Добавлен расчёт тишины строго по `donor_duration_ms`, а не по `projects.duration_sec`.
* Добавлен `target_duration_ms` в `merge_audio` для точной обрезки итоговой длительности.
* Изменён CHECK `projects.duration_sec`: теперь допустим диапазон от 1 до 60 секунд, чтобы поддерживать доноры произвольной длины в Ветке Б.
* Для пользовательской классической генерации выбор остаётся ограниченным: 30 или 60 секунд.
* Ветка Б использует фактическую длительность донора.
* Цена Ветки Б привязана к длительности донора:
  * донор ≤ 30 секунд: базовая цена 30 секунд + 15 кредитов;
  * донор 31–60 секунд: базовая цена 60 секунд + 15 кредитов.
* Добавлено правило фиксированного ML-окна в Ветке Б.
* Если видео заканчивается раньше окна, окно дополняется повтором последнего кадра.
* После инференса padding-кадры обрезаются до исходной длительности донора.
* Добавлен тест-кейс на донор 7 секунд.
* Добавлен тест-кейс на донор без звука.
* Добавлен тест-кейс на cost-cap во время GPU-обработки.
* Добавлен тест-кейс на идемпотентность повторного вебхука.
* Добавлен тест-кейс на активный файл и защиту от короткого TTL.
* Добавлен тест-кейс на двойной захват задач воркерами.
* Добавлен тест-кейс на восстановление зависших задач.

---

## v4.3 → v4.4

* Ветка А переведена на нативный Seedance Extend / One-take.
* Генерация 5-секундных изолированных сегментов больше не является основным пайплайном Ветки А.
* Задача `stitch` объявлена DEPRECATED для основного пайплайна Ветки А.
* `stitch` сохранён только как аварийный fallback для устаревших моделей или аварийных сценариев.
* Premium 30 секунд генерируется одним One-take запросом.
* Premium 60 секунд генерируется как 30 секунд One-take + нативный Extend до 60 секунд.
* Standard 30 секунд генерируется как базовые 15 секунд + Extend 15 секунд.
* Standard 60 секунд генерируется цепочкой нативных Extend-шагов до целевой длительности.
* Обновлён контракт вызова видеомоделей: добавлена передача `video_url` предыдущего видео в мультимодальном сообщении.
* Добавлено правило: при падении Extend-шага базовый чанк не перегенерируется.
* Добавлен отдельный сценарий ретраев только для Extend-шага.
* Добавлено правило защиты базового чанка от удаления до завершения цепочки Extend.
* Добавлено правило передачи финального монолитного видео в апскейл без FFmpeg-сшивки.
* Обновлена последовательность пайплайна Ветки А.
* Обновлены DoD: добавлен критерий бесшовности на 15-й секунде.
* Добавлен DoD 9 для Extend и One-take.
* Добавлены тест-кейсы:
  * ТК-15: падение Extend после успешной базы;
  * ТК-16: основной пайплайн без `stitch`;
  * ТК-17: качество границы 15 секунд;
  * ТК-18: Premium 60 секунд.
* Обновлена матрица ошибок: добавлены ошибки базовой генерации и Extend-шага.
* Обновлены алерты: добавлены падения Extend-шага и удаление базового Extend-файла.
* Обновлена дорожная карта: Фаза 0 включает переход на Extend/One-take и исключение `stitch`.

## v4.4 → v4.4.1

* Документ приведён к единой копии без дублей; служебные рабочие материалы удалены из тела ТЗ.
* Безопасность: `profiles_update_own` заменена на `profiles_update_own_safe` с `WITH CHECK`; добавлен триггер `prevent_profile_sensitive_update`, запрещающий пользователю менять `role` и `credits_balance`.
* Добавлен триггер `handle_new_user()`: профиль создаётся автоматически при регистрации.
* Все `SECURITY DEFINER`-функции получили явный `SET search_path = public`.
* Логика Ветки Б (проект в `draft` с `cost_credits = 0`, измерение длительности донора через `ffprobe`, списание только после измерения, отказ от возврата при `cost_credits <= 0`) сохранена и согласована с матрицей ошибок и разделом возвратов.
* Добавлена таблица `storage_assets` и правило обязательной регистрации файлов пайплайна; `cleanup_temp_storage()` переписана: удаление только по TTL запрещено, активные файлы защищаются по реестру, активным статусам проектов, `media_tasks` и `gpu_jobs`.
* Машина состояний оформлена таблицей разрешённых переходов и списками активных статусов.
* Добавлена реализация rate limits: `rate_limit_counters`, `check_rate_limit`, функции подсчёта активных проектов, генераций и V2V-задач, ответ `429` с `Retry-After`.
* `gpu_jobs` расширена под видео-генерацию: новые `job_type`, `provider_job_id`, `async_mode`, `next_poll_at`, `poll_attempts`, метаданные результата.
* Добавлен раздел 4.5: нормализованный контракт провайдеров, служебный `poll-async-jobs`, идемпотентность и таймауты.
* Добавлены контракты `manual-input`, `analyze-reference`, `generate-prompt-from-video`, `projects/:id/status`, `webhook-payment-:gateway`; `regenerate-segment` в MVP возвращает `501 FEATURE_DISABLED`.
* Добавлен раздел 6.7: автоматическая медиа-валидация `ffprobe` с кодом `MEDIA_VALIDATION_FAILED`.
* Платежи: добавлены `raw_payload`, `signature_verified`, `processed_at`, `refund_reason`; подписки: добавлен статус `trialing` и таблица `subscription_events`; добавлены разделы 7.7 и 7.8.
* Добавлены таблица `tts_voices` и раздел 5.6.1 с требованиями к ElevenLabs TTS.
* Добавлен раздел 5.8.1: обязательные параметры клиентского сжатия видео.
* Добавлен раздел 8.6.1: формат Realtime-событий.
* Ветка Б: максимальная длительность донора зафиксирована как 60 секунд; до первого бенчмарка принимаются только доноры до 30 секунд; доноры 31–60 секунд включаются только после бенчмарка, подтверждения экономики и ручного включения администратором.
* Матрица ошибок и раздел 7.5: возврат при нарушении лимитов донора выполняется только если кредиты уже были списаны.
* Поблочная перегенерация отключена в MVP (Фаза 2): разделы 4.1, 4.4, 7.2, 8.5.
* Раздел 5.5: боли используются только как внутренние инсайты, без агрессивных хуков.
* Добавлены разделы 11.3 «Стратегия тестирования», 13.5 «Обязательные операционные метрики», 13.6 «Runbook для типовых сбоев».
* История изменений объединена в один раздел.

## v4.4.1 → v4.4.2

* Безопасность: добавлен триггер `prevent_project_sensitive_update` — пользователю запрещено менять `status`, `cost_credits`, `refunded`, `result_video_url`, `error_code` своего проекта.
* Безопасность: добавлен триггер `prevent_product_delete_with_active_projects` — удаление товара блокируется при активных проектах (`ACTIVE_PROJECT_EXISTS`).
* Безопасность: у пользовательских ролей отозван `EXECUTE` на биллинговых и служебных `SECURITY DEFINER`-функциях (`charge_credits`, `refund_project_credits`, `check_rate_limit`, `cleanup_temp_storage` и др.); биллинг доступен только `service_role`.
* Безопасность: `charge_credits` отклоняет неположительную стоимость (`INVALID_COST`); стоимость всегда рассчитывается сервером.
* Добавлен раздел 6.8 «Контент-модерация»: обязательная проверка доноров, карточек товара, промптов и сценариев до списания кредитов; код `CONTENT_POLICY_VIOLATION`.
* Эфемерность видео-доноров: файлы удаляются после терминального статуса проекта; долгосрочное хранение запрещено; прод-путь `/uploads/references/` изменён с 14 дней на удаление после завершения.
* Явное подтверждение пользователя при фоллбэке премиум → стандарт.

**Версия 4.4.3 дополнительно учитывает:**

* Закрепление скоупа: Ветка Б (V2V) — Фаза 2; в MVP референсы используются только для промпта из видео.
* Отказ пользователя от сценария в `script_ready`: статус `canceled` с полным автовозвратом.
* Контракты создания платежа и подписки (`create-payment`, `create-subscription`): сумма и валюта фиксируются только сервером.
* Единый ключ идемпотентности платежей `event_id` (колонка добавлена в `payments`).
* Журналы `admin_actions` и `moderation_events` в DDL.
* Планировщики для отказа «зависших» задач (6 часов) и `poll-async-jobs`.
* Согласование тарифных планов §7.3 с `plan_tier`; подписочные шлюзы расширены до всех четырёх.
* Машина состояний подписок дополнена переходами погашения и отмены триала.
* `audio_mode = 'original_donor'` разрешён только при наличии `reference_id` (Ветка Б).
* Добавлена ежечасная очистка `rate_limit_counters` (раздел 4.4.1).
* Матрица ошибок дополнена строкой запрещённого контента; тесты безопасности дополнены кейсами RPC-атак на биллинг.

## v4.4.2 → v4.4.3

* Скоуп: Ветка Б (V2V) закреплена как Фаза 2 в §5.3.2.11, §6.6, §7.2, §7.6, §8.4, матрице ошибок, DoD 8 и тест-кейсах ТК-10…ТК-14; дорожная карта §12 переписана в соответствии с приоритетами требований.
* Машина состояний: добавлен статус `canceled` (отказ пользователя от сценария в `script_ready` с полным автовозвратом); описан пропуск `script_ready` и маппинг шагов Ветки Б на статусы (§6.1, §6.6).
* Добавлены контракты `projects/:id/cancel`, `create-payment`, `create-subscription` (§4.1–§4.2): суммы, валюты и кредиты фиксируются только сервером.
* Идемпотентность платежей: ключ — `event_id`; колонка `payments.event_id` добавлена; §2.3 согласован с §7.7.
* DDL: добавлены журналы `admin_actions` и `moderation_events` (§3.1, §6.8, §13.6).
* Добавлены планировщики `fail-stuck-projects` (6 часов, §3.4) и `poll-async-jobs` (каждую минуту, §4.5).
* Тарифы: локальные названия §7.3 привязаны к `plan_tier`; подписочные шлюзы расширены до четырёх; `scale`/`ent` зарезервированы на Фазу 2.
* `analyze-reference` тарифицирован: 1 кредит, кэш при повторе, автовозврат при неудаче (§7.2, §4.2).
* Фото товара удаляются из `/specials/` по событию удаления товара (§3.4).
* ТК-12: `donor_duration_ms` заменён на `measured_duration_ms`.
* Машина подписок дополнена переходами `past_due → active`, `trialing → canceled/expired` (§7.8).
* Цена Ветки Б явно привязана к тарифу стандарт (§7.2, §4.2).
* Добавлена формула расчёта `progress` для Realtime (§8.6.1); описано назначение резервных полей `platforms`, `fidelity_score`, `continuity_score`.
* JSON-блоки `create-project` оформлены код-фенсами; проверка `audio_mode='original_donor'` усилена до `reference.mode='inpainting'`; `FOR UPDATE` в `refund_project_credits` помечен как осознанное исключение; оговорка пропускной способности воркера добавлена в §6.3 и §11.3.

---

**Конец документа.**
