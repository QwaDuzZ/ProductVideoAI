# Задачи разработчика — ProductVideoAI (индекс-канбан)

**Источник:** ТЗ v4.4.3 · Требования v1.1 · User Stories v2.1 · Юзкейсы v1.2 · Дизайн v5.0
**Порядок работы:** этапы 0→7; внутри этапа — по ID. Каждая задача — отдельный файл.

| Этап | ID | Приоритет | Оценка | Задача | Файл |
|---|---|---|---|---|---|
| 0. Инфраструктура | TASK-001 | MVP | M · 6–8 ч | Инфраструктура: репозиторий, окружения, Supabase, Render, секреты | `TASK-001_Инфраструктура_репозиторий_окружения_Supabase_Render_секреты.md` |
| 0. Инфраструктура | TASK-002 | MVP | M · 6–8 ч | DDL, часть 1: profiles, products, product_reviews_analysis, video_references, projects, generation_segments | `TASK-002_DDL_часть_1_profiles_products_product_reviews_analysis_video_reference.md` |
| 0. Инфраструктура | TASK-003 | MVP | M · 8–10 ч | DDL, часть 2: media_tasks, gpu_jobs, кредиты, платежи, подписки, реестры, журналы | `TASK-003_DDL_часть_2_media_tasks_gpu_jobs_кредиты_платежи_подписки_реестры_журн.md` |
| 0. Инфраструктура | TASK-004 | MVP | M · 6 ч | RLS-политики на все таблицы | `TASK-004_RLS-политики_на_все_таблицы.md` |
| 0. Инфраструктура | TASK-005 | MVP | S · 4 ч | Триггеры безопасности: автосоздание профиля и защита чувствительных полей | `TASK-005_Триггеры_безопасности_автосоздание_профиля_и_защита_чувствительных_пол.md` |
| 0. Инфраструктура | TASK-006 | MVP | M · 6 ч | Биллинг-функции: charge_credits, refund_project_credits, автовозврат, права EXECUTE | `TASK-006_Биллинг-функции_charge_credits_refund_project_credits_автовозврат_прав.md` |
| 0. Инфраструктура | TASK-007 | MVP | S · 4 ч | Планировщики pg_cron: очистка хранилища, счётчиков, зависших проектов, polling | `TASK-007_Планировщики_pg_cron_очистка_хранилища_счётчиков_зависших_проектов_pol.md` |
| 1. API | TASK-008 | MVP | M · 6 ч | upload-presigned + реестр storage_assets + удаление фото товара | `TASK-008_upload-presigned_реестр_storage_assets_удаление_фото_товара.md` |
| 1. API | TASK-009 | MVP | S · 4 ч | manual-input + модерация карточки товара | `TASK-009_manual-input_модерация_карточки_товара.md` |
| 1. API | TASK-010 | MVP | M · 8 ч | create-project: Ветка А + draft Ветки Б + лимиты | `TASK-010_create-project_Ветка_А_draft_Ветки_Б_лимиты.md` |
| 1. API | TASK-011 | MVP | S · 4 ч | Rate limits: check_rate_limit + счётчики + активные сущности | `TASK-011_Rate_limits_check_rate_limit_счётчики_активные_сущности.md` |
| 1. API | TASK-012 | MVP | M · 8 ч | analyze-reference и generate-prompt-from-video с модерацией и биллингом | `TASK-012_analyze-reference_и_generate-prompt-from-video_с_модерацией_и_биллинго.md` |
| 1. API | TASK-013 | MVP | S · 3 ч | projects/:id/status и projects/:id/cancel | `TASK-013_projectsidstatus_и_projectsidcancel.md` |
| 1. API | TASK-014 | MVP (pay) / Ф1 (sub) | M · 8 ч | create-payment и create-subscription (серверная фиксация сумм) | `TASK-014_create-payment_и_create-subscription_серверная_фиксация_сумм.md` |
| 1. API | TASK-015 | MVP | M · 8 ч | webhook-payment-:gateway: подпись, event_id, идемпотентное начисление | `TASK-015_webhook-payment-gateway_подпись_event_id_идемпотентное_начисление.md` |
| 1. API | TASK-016 | MVP | M · 8 ч | internal-media-completed: служебное продвижение пайплайна | `TASK-016_internal-media-completed_служебное_продвижение_пайплайна.md` |
| 1. API | TASK-017 | MVP | M · 8 ч | poll-async-jobs + нормализованный контракт провайдеров | `TASK-017_poll-async-jobs_нормализованный_контракт_провайдеров.md` |
| 1. API | TASK-018 | MVP | S · 4 ч | webhook-replicate: идемпотентная обработка GPU-результатов | `TASK-018_webhook-replicate_идемпотентная_обработка_GPU-результатов.md` |
| 2. Пайплайн А | TASK-019 | MVP | M · 8 ч | Генерация сценария (LLM) + script_ready + модерация сценария | `TASK-019_Генерация_сценария_LLM_script_ready_модерация_сценария.md` |
| 2. Пайплайн А | TASK-020 | MVP | M · 6 ч | ElevenLabs TTS: голоса из tts_voices, лимиты длительности, ретраи | `TASK-020_ElevenLabs_TTS_голоса_из_tts_voices_лимиты_длительности_ретраи.md` |
| 2. Пайплайн А | TASK-021 | MVP | L · 16 ч | Видеогенерация Ветки А: One-take/Extend через провайдеров, защита базового чанка | `TASK-021_Видеогенерация_Ветки_А_One-takeExtend_через_провайдеров_защита_базовог.md` |
| 2. Пайплайн А | TASK-022 | MVP | S · 4 ч | Апскейл финала до 1080p без сшивки | `TASK-022_Апскейл_финала_до_1080p_без_сшивки.md` |
| 2. Пайплайн А | TASK-023 | MVP | M · 8 ч | Аудио-матрица: музыка/SFX/дакинг, audio_mix воркер-задача | `TASK-023_Аудио-матрица_музыкаSFXдакинг_audio_mix_воркер-задача.md` |
| 2. Пайплайн А | TASK-024 | MVP | M · 6 ч | Smart Outro: fade и loop (Infinite Loop Script Writer) | `TASK-024_Smart_Outro_fade_и_loop_Infinite_Loop_Script_Writer.md` |
| 3. Worker | TASK-025 | MVP | L · 20 ч | Render FFmpeg Worker: захват задач, все media_tasks, Supavisor | `TASK-025_Render_FFmpeg_Worker_захват_задач_все_media_tasks_Supavisor.md` |
| 3. Worker | TASK-026 | MVP | M · 6 ч | Медиа-валидация ffprobe на границах шагов | `TASK-026_Медиа-валидация_ffprobe_на_границах_шагов.md` |
| 4. Realtime | TASK-027 | MVP | S · 4 ч | Realtime-события проекта + fallback polling | `TASK-027_Realtime-события_проекта_fallback_polling.md` |
| 5. Frontend | TASK-028 | MVP | M · 12 ч | Дизайн-система «SUNSET OCEAN»: токены, компоненты, океан | `TASK-028_Дизайн-система_SUNSET_OCEAN_токены_компоненты_океан.md` |
| 5. Frontend | TASK-029 | MVP | M · 8 ч | Экраны входа/регистрации/восстановления (S02–S04) + онбординг (S05) | `TASK-029_Экраны_входарегистрациивосстановления_S02S04_онбординг_S05.md` |
| 5. Frontend | TASK-030 | MVP | M · 12 ч | Дашборд, список проектов, карточка проекта (S10–S12) | `TASK-030_Дашборд_список_проектов_карточка_проекта_S10S12.md` |
| 5. Frontend | TASK-031 | MVP | L · 16 ч | Мастер, шаги 1–3: товар, референс, настройки + клиентское сжатие (S20–S22) | `TASK-031_Мастер_шаги_13_товар_референс_настройки_клиентское_сжатие_S20S22.md` |
| 5. Frontend | TASK-032 | MVP | L · 16 ч | Мастер, шаги 4–6: сценарий, прогресс, результат + отказ и фоллбэк-подтверждение (S23–S25, S52) | `TASK-032_Мастер_шаги_46_сценарий_прогресс_результат_отказ_и_фоллбэк-подтвержден.md` |
| 5. Frontend | TASK-033 | MVP | M · 12 ч | Каталоги: товары, референсы, разбор, промпт (S30–S34) | `TASK-033_Каталоги_товары_референсы_разбор_промпт_S30S34.md` |
| 5. Frontend | TASK-034 | MVP | M · 12 ч | Деньги: тарифы, оплата, статус платежа, подписки, история, нехватка кредитов (S40–S44, S53) | `TASK-034_Деньги_тарифы_оплата_статус_платежа_подписки_история_нехватка_кредитов.md` |
| 5. Frontend | TASK-035 | MVP | S · 6 ч | Состояния ошибок и модерации (S50–S51) + юридическая модалка V2V (S54, Фаза 2) | `TASK-035_Состояния_ошибок_и_модерации_S50S51_юридическая_модалка_V2V_S54_Фаза_2.md` |
| 6. Admin | TASK-036 | MVP | L · 20 ч | Админ-панель: дашборд, проекты, платежи, настройки, журналы, модерация (S70–S75) | `TASK-036_Админ-панель_дашборд_проекты_платежи_настройки_журналы_модерация_S70S7.md` |
| 7. Наблюдаемость | TASK-037 | Ф1 | M · 10 ч | Метрики, алерты, runbook | `TASK-037_Метрики_алерты_runbook.md` |
| 7. QA | TASK-038 | MVP | L · 24 ч | Тестирование: unit/integration/e2e/load/security + ТК-1…ТК-18 | `TASK-038_Тестирование_unitintegratione2eloadsecurity_ТК-1ТК-18.md` |

## Суммарная оценка (MVP, этапы 0–6 без Ф1/Ф2)

Backend ≈ 120–150 ч · Worker ≈ 30 ч · Frontend ≈ 80–90 ч · Admin ≈ 20 ч · QA ≈ 24 ч · Инфра ≈ 10 ч.
Итого MVP ≈ 290–330 ч (~7–8 недель одним разработчиком full-stack или ~3–4 недели парой).

**Фазы 1/2** помечены в задачах (подписки-UI, разбор модерации админом, метрики частично, ТК Ветки Б).
