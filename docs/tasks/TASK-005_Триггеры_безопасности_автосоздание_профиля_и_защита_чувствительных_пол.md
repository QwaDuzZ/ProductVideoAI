# TASK-005 — Триггеры безопасности: автосоздание профиля и защита чувствительных полей

| | |
|---|---|
| Этап | 0. Инфраструктура |
| Тип | backend |
| Приоритет | MVP |
| Оценка | S · 4 ч |
| Зависимости | TASK-004 |
| Ссылки | ТЗ §3.2; FR-101, FR-104, FR-1203; US-101, US-104, US-204 |

## Цель

Реализовать триггеры: `handle_new_user`, `prevent_profile_sensitive_update`, `prevent_project_sensitive_update`, `prevent_product_delete_with_active_projects` — все SECURITY DEFINER + SET search_path = public.

## Что сделать

- `on_auth_user_created` → профиль role=user, credits=0, region/language ru.
- Пользовательский UPDATE role/credits_balance → FORBIDDEN_ROLE_UPDATE / FORBIDDEN_CREDITS_UPDATE.
- Пользовательский UPDATE projects.status/cost_credits/refunded/result_video_url/error_code → FORBIDDEN_PROJECT_UPDATE; сервер (auth.uid() IS NULL) проходит.
- DELETE товара при активных проектах → ACTIVE_PROJECT_EXISTS.

## Критерии приёмки (DoD)

- [ ] Клиентский SQL-апдейт роли/баланса/статуса проекта отклоняется.
- [ ] Серверные переходы статусов работают.
- [ ] Удаление товара с активным проектом отклоняется; без активных — удаляет и файлы product_image по реестру (см. TASK-008).
