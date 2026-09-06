-- =====================================================
-- TASK-006: Биллинг-функции
-- charge_credits, refund_project_credits,
-- автовозврат, is_asset_protected, cleanup_temp_storage
-- ТЗ §3.3, §3.4
-- =====================================================

-- =====================================================
-- 1. АТОМАРНОЕ СПИСАНИЕ КРЕДИТОВ
-- =====================================================
CREATE OR REPLACE FUNCTION public.charge_credits(
  p_user_id UUID,
  p_cost INT,
  p_reason TEXT,
  p_project_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RAISE EXCEPTION 'INVALID_COST';
  END IF;

  UPDATE profiles
  SET credits_balance = credits_balance - p_cost
  WHERE id = p_user_id
    AND credits_balance >= p_cost;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  IF rows_updated = 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  INSERT INTO credit_transactions (user_id, amount, reason, project_id)
  VALUES (p_user_id, -p_cost, p_reason, p_project_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- 2. ВОЗВРАТ КРЕДИТОВ ПО ПРОЕКТУ
-- Идемпотентно: повторный вызов — no-op
-- =====================================================
CREATE OR REPLACE FUNCTION public.refund_project_credits(p_project_id UUID)
RETURNS VOID AS $$
DECLARE
  rec RECORD;
BEGIN
  SELECT user_id, cost_credits, refunded
  INTO rec
  FROM projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF rec.refunded OR rec.cost_credits IS NULL OR rec.cost_credits <= 0 THEN
    RETURN;
  END IF;

  UPDATE profiles
  SET credits_balance = credits_balance + rec.cost_credits
  WHERE id = rec.user_id;

  INSERT INTO credit_transactions (user_id, amount, reason, project_id)
  VALUES (rec.user_id, rec.cost_credits, 'refund', p_project_id);

  UPDATE projects
  SET refunded = TRUE
  WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- 3. АВТОВОЗВРАТ ПРИ ПАДЕНИИ ПРОЕКТА
-- =====================================================
CREATE OR REPLACE FUNCTION trg_refund_on_failed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'failed'
     AND OLD.status <> 'failed'
     AND NOT NEW.refunded THEN
    PERFORM refund_project_credits(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_refund_trigger
AFTER UPDATE OF status ON projects
FOR EACH ROW EXECUTE FUNCTION trg_refund_on_failed();

-- =====================================================
-- 4. ПРОВЕРКА ЗАЩИТЫ АКТИВА
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_asset_protected(
  p_bucket_id TEXT,
  p_object_name TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM storage_assets sa
    WHERE sa.bucket_id = p_bucket_id
      AND sa.object_name = p_object_name
      AND (
        sa.protected_until > NOW()
        OR EXISTS (
          SELECT 1
          FROM projects p
          WHERE p.id = sa.project_id
            AND p.status NOT IN ('done', 'failed')
        )
        OR EXISTS (
          SELECT 1
          FROM media_tasks mt
          WHERE mt.project_id = sa.project_id
            AND mt.status IN ('pending', 'processing')
        )
        OR EXISTS (
          SELECT 1
          FROM gpu_jobs gj
          WHERE gj.project_id = sa.project_id
            AND gj.status IN ('pending', 'processing')
        )
      )
  );
$$;

-- =====================================================
-- 5. ОЧИСТКА ВРЕМЕННОГО ХРАНИЛИЩА
-- =====================================================
CREATE OR REPLACE FUNCTION public.cleanup_temp_storage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM storage.objects o
  WHERE o.bucket_id = 'uploads'
    AND o.name LIKE 'references/%'
    AND o.created_at < NOW() - INTERVAL '15 minutes'
    AND NOT public.is_asset_protected(o.bucket_id, o.name);

  DELETE FROM storage.objects o
  WHERE o.bucket_id = 'uploads'
    AND o.name LIKE 'prompt_refs/%'
    AND o.created_at < NOW() - INTERVAL '1 hour'
    AND NOT public.is_asset_protected(o.bucket_id, o.name);

  DELETE FROM storage.objects o
  WHERE o.bucket_id = 'segments_480p'
    AND o.created_at < NOW() - INTERVAL '2 hours'
    AND NOT public.is_asset_protected(o.bucket_id, o.name);

  DELETE FROM storage.objects o
  WHERE o.bucket_id = 'processing'
    AND o.name LIKE 'v2v/%'
    AND o.created_at < NOW() - INTERVAL '6 hours'
    AND NOT public.is_asset_protected(o.bucket_id, o.name);
END;
$$;

-- =====================================================
-- 6. REVOKE EXECUTE — защита от RPC-вызовов
-- =====================================================
REVOKE EXECUTE ON FUNCTION public.charge_credits FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_project_credits FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_temp_storage FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_asset_protected FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_sensitive_update FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_project_sensitive_update FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_product_delete_with_active_projects FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.charge_credits TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_project_credits TO service_role;
GRANT EXECUTE ON FUNCTION public.is_asset_protected TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_temp_storage TO service_role;
