# TASK-010 — create-project: Ветка А + draft Ветки Б + лимиты

| | |
|---|---|
| Этап | 1. API |
| Тип | backend |
| Приоритет | MVP |
| Оценка | M · 8 ч |
| Зависимости | TASK-006, TASK-011 |
| Ссылки | ТЗ §4.2, §4.4.1, §6.1; FR-501…FR-504, FR-602; US-601, US-702 |

## Цель

Создание проекта: Ветка А — списание и queued; Ветка Б (Фаза 2, в MVP отключена серверным флагом) — draft с cost_credits=0; проверка лимитов и параметров; audio_mode original_donor только при reference.mode='inpainting'.

## Что сделать

- Параметры: duration 30/60, tier, language, ugc_type, outro_mode, audio_mode; цена считается сервером из §7.2.
- check_rate_limit (10/час) + count_active_user_projects ≤2 (429 ACTIVE_PROJECT_LIMIT) + глобально 20 генераций → в queued без старта.
- Ветка Б в MVP: 503/501 FEATURE_DISABLED, кроме флага админа.
- Ответ по контракту §4.2 (cost_credits, eta_minutes).

## Критерии приёмки (DoD)

- [ ] Клиент не может передать стоимость.
- [ ] original_donor без inpainting-референса → 400 VALIDATION_ERROR.
- [ ] Лимиты срабатывают при параллельных запросах.
