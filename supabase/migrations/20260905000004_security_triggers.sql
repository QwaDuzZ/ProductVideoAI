-- =====================================================
-- TASK-005: Триггеры безопасности
-- Защита чувствительных полей профиля, проекта, товара
-- ТЗ §3.2
-- =====================================================

-- =====================================================
-- 1. ЗАЩИТА ЧУВСТВИТЕЛЬНЫХ ПОЛЕЙ ПРОФИЛЯ
-- Запрет на изменение role и credits_balance пользователем
-- =====================================================
CREATE OR REPLACE FUNCTION public.prevent_profile_sensitive_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'FORBIDDEN_ROLE_UPDATE';
    END IF;

    IF NEW.credits_balance IS DISTINCT FROM OLD.credits_balance THEN
      RAISE EXCEPTION 'FORBIDDEN_CREDITS_UPDATE';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_prevent_sensitive_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_sensitive_update();

-- =====================================================
-- 2. ЗАЩИТА ЧУВСТВИТЕЛЬНЫХ ПОЛЕЙ ПРОЕКТА
-- Запрет на изменение status, cost_credits, refunded,
-- result_video_url, error_code пользователем
-- Серверные переходы (auth.uid() IS NULL) проходят
-- =====================================================
CREATE OR REPLACE FUNCTION public.prevent_project_sensitive_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.user_id THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.cost_credits IS DISTINCT FROM OLD.cost_credits
       OR NEW.refunded IS DISTINCT FROM OLD.refunded
       OR NEW.result_video_url IS DISTINCT FROM OLD.result_video_url
       OR NEW.error_code IS DISTINCT FROM OLD.error_code THEN
      RAISE EXCEPTION 'FORBIDDEN_PROJECT_UPDATE';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_prevent_sensitive_update
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.prevent_project_sensitive_update();

-- =====================================================
-- 3. ЗАПРЕТ УДАЛЕНИЯ ТОВАРА С АКТИВНЫМИ ПРОЕКТАМИ
-- Пока есть проект в статусе draft..assembling, товар нельзя удалить
-- =====================================================
CREATE OR REPLACE FUNCTION public.prevent_product_delete_with_active_projects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.product_id = OLD.id
      AND p.status NOT IN ('done', 'failed')
  ) THEN
    RAISE EXCEPTION 'ACTIVE_PROJECT_EXISTS';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER products_prevent_delete_active
BEFORE DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.prevent_product_delete_with_active_projects();
