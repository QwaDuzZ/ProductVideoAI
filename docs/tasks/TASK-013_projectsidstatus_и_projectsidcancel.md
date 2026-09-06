# TASK-013 — projects/:id/status и projects/:id/cancel

| | |
|---|---|
| Этап | 1. API |
| Тип | backend |
| Приоритет | MVP |
| Оценка | S · 3 ч |
| Зависимости | TASK-010 |
| Ссылки | ТЗ §4.2, §6.1, §6.5, §7.5; FR-515, FR-1006; US-602, US-613, US-805 |

## Цель

Статус-эндпоинт с формулой progress и отмена проекта в script_ready с полным возвратом.

## Что сделать

- status: поля project_id, status, progress (таблица прогресса §8.6.1), error_code, user_message, result_video_url, updated_at; лимит 60/мин.
- cancel: только из script_ready; → canceled; автовозврат; повторный вызов идемпотентен; иначе 409 INVALID_STATUS.

## Критерии приёмки (DoD)

- [ ] progress совпадает с таблицей статусов.
- [ ] cancel возвращает кредиты ровно один раз.
