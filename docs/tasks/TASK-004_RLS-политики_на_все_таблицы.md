# TASK-004 — RLS-политики на все таблицы

| | |
|---|---|
| Этап | 0. Инфраструктура |
| Тип | backend |
| Приоритет | MVP |
| Оценка | M · 6 ч |
| Зависимости | TASK-003 |
| Ссылки | ТЗ §3.2; NFR-501, NFR-507 |

## Цель

Включить RLS и создать политики доступа точно по ТЗ §3.2: владелец + админ; платежи/подписки/транзакции — только SELECT для владельца; журналы — только админ.

## Что сделать

- `profiles_select_own`, `profiles_update_own_safe` (USING + WITH CHECK).
- `products_own`, `video_references_own`, `projects_own`, `segments_via_project`, `reviews_via_project`, `media_tasks_select_own` и др. по §3.2.
- `payments_select_own`, `subscriptions_select_own`, `credit_tx_select_own` — без INSERT/UPDATE для пользователя.
- Админ-политики `admin_all_*` через `is_admin()`; `admin_actions`/`moderation_events` — только админ/сервис.

## Критерии приёмки (DoD)

- [ ] Пользователь не читает чужие строки ни в одной таблице (авто-тест).
- [ ] Пользователь не может INSERT/UPDATE в payments/subscriptions/credit_transactions.
- [ ] service_role обходит RLS для служебных операций.
