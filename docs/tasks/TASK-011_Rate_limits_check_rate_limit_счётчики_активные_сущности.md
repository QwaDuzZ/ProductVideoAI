# TASK-011 — Rate limits: check_rate_limit + счётчики + активные сущности

| | |
|---|---|
| Этап | 1. API |
| Тип | backend |
| Приоритет | MVP |
| Оценка | S · 4 ч |
| Зависимости | TASK-006 |
| Ссылки | ТЗ §4.4, §4.4.1; NFR-201…NFR-207; US-607, US-608 |

## Цель

Серверные атомарные лимиты: функция check_rate_limit и count_* функции; 429 с Retry-After.

## Что сделать

- Реализовать функции по ТЗ §4.4.1; REVOKE у пользователей.
- Интеграция в эндпоинты: create-project 10/ч, upload-presigned 20/ч, generate-prompt 10/ч, analyze 10/ч, status 60/мин.
- Глобальные: count_active_generations, count_active_v2v_jobs.

## Критерии приёмки (DoD)

- [ ] Превышение → 429 + Retry-After; гонки не обходят лимит.
- [ ] Счётчики чистятся кроном (TASK-007).
