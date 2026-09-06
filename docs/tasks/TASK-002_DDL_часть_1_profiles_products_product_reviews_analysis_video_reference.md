# TASK-002 — DDL, часть 1: profiles, products, product_reviews_analysis, video_references, projects, generation_segments

| | |
|---|---|
| Этап | 0. Инфраструктура |
| Тип | backend |
| Приоритет | MVP |
| Оценка | M · 6–8 ч |
| Зависимости | TASK-001 |
| Ссылки | ТЗ §3.1; FR-101, FR-201 |

## Цель

Версионированные миграции с базовыми таблицами и CHECK-ограничениями точно по ТЗ §3.1.

## Что сделать

- `profiles` (role user/admin, credits_balance ≥ 0, region, language).
- `products`, `product_reviews_analysis`, `video_references` (duration_ms, mode semantic/inpainting).
- `projects`: статусы draft/queued/script_ready/generating/audio_sync/assembling/done/failed/canceled; cost_credits NOT NULL; refunded; v2v_legal_accepted; резервные поля platforms/fidelity_score/continuity_score (не заполняются в MVP, ТЗ §3.1 примечание).
- `generation_segments`.
- Индексы по ТЗ §3.1.

## Критерии приёмки (DoD)

- [ ] Миграции накатываются на чистую БД и откатываются без ошибок.
- [ ] CHECK-ограничения не дают создать проект с невалидным статусом/длительностью.
- [ ] `projects.duration_sec` 1..60.
