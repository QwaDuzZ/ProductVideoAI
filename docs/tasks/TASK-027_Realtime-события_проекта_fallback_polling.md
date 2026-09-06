# TASK-027 — Realtime-события проекта + fallback polling

| | |
|---|---|
| Этап | 4. Realtime |
| Тип | backend |
| Приоритет | MVP |
| Оценка | S · 4 ч |
| Зависимости | TASK-013 |
| Ссылки | ТЗ §8.6, §8.6.1; FR-1001…FR-1006; US-801…US-806 |

## Цель

Публикация событий project_status_changed / project_done / project_failed по каналу project:{id} с обязательным payload; идемпотентность на клиенте; fallback — опрос status раз в 10 с.

## Что сделать

- Payload: project_id, status, progress, error_code, user_message, updated_at.
- Событие только после зафиксированного перехода в БД.
- RLS на канал: только владелец проекта.

## Критерии приёмки (DoD)

- [ ] Клиент получает событие ≤5 с после смены статуса.
- [ ] Дубль события не меняет UI повторно.
