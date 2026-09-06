# TASK-003 — DDL, часть 2: media_tasks, gpu_jobs, кредиты, платежи, подписки, реестры, журналы

| | |
|---|---|
| Этап | 0. Инфраструктура |
| Тип | backend |
| Приоритет | MVP |
| Оценка | M · 8–10 ч |
| Зависимости | TASK-002 |
| Ссылки | ТЗ §3.1; FR-811, FR-812, С2-аудит |

## Цель

Оставшиеся таблицы: очередь воркера, GPU-задачи, биллинг, реестр файлов, справочник голосов, счётчики лимитов, журналы админа и модерации.

## Что сделать

- `media_tasks` (task_type: stitch/audio_mix/extract_audio/merge_audio/outro/stabilize_chunk; payload JSONB по схемам §3.6).
- `gpu_jobs`: job_type включая video_base/video_extend/video_one_take/reference_analysis/prompt_from_video/tts; provider_job_id UNIQUE; async_mode webhook/polling; next_poll_at; poll_attempts ≤ 20; output_* метаданные.
- `credit_transactions`; `payments` (+event_id UNIQUE, raw_payload, signature_verified, processed_at, refund_reason); `subscriptions` (gateway 4 шт., статусы с trialing); `subscription_events`.
- `storage_assets` (purpose CHECK, UNIQUE(bucket_id, object_name)); `tts_voices`; `rate_limit_counters`.
- `admin_actions`, `moderation_events` + индексы.

## Критерии приёмки (DoD)

- [ ] Все таблицы и индексы созданы миграциями.
- [ ] JSON-схемы payload задокументированы и валидируются в коде воркера/эндпоинтов.
- [ ] Повторная миграция идемпотентна.
