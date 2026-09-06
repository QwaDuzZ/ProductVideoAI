# TASK-006 — Биллинг-функции: charge_credits, refund_project_credits, автовозврат, права EXECUTE

| | |
|---|---|
| Этап | 0. Инфраструктура |
| Тип | backend |
| Приоритет | MVP |
| Оценка | M · 6 ч |
| Зависимости | TASK-004 |
| Ссылки | ТЗ §3.3; FR-802, FR-803, NFR-401, NFR-402; US-1012… |

## Цель

Атомарное списание/возврат кредитов с идемпотентностью и отзывом прав у пользовательских ролей.

## Что сделать

- `charge_credits`: атомарный UPDATE с проверкой баланса; `p_cost <= 0` → INVALID_COST; запись в credit_transactions.
- `refund_project_credits`: идемпотентно по `refunded`; при cost_credits <= 0 — no-op; FOR UPDATE помечен комментарием как осознанное исключение.
- `trg_refund_on_failed` на переходе в failed/canceled.
- REVOKE EXECUTE у PUBLIC/anon/authenticated для charge/refund/check_rate_limit/cleanup/is_asset_protected/handle_new_user/prevent_*; GRANT service_role (ТЗ §3.3).

## Критерии приёмки (DoD)

- [ ] 10 параллельных списаний не уводят баланс в минус.
- [ ] RPC-вызов charge_credits из anon/authenticated отклоняется.
- [ ] Двойной возврат невозможен.
