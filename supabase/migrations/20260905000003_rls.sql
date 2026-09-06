-- =====================================================
-- TASK-004: Row Level Security (RLS)
-- ТЗ §3.2
-- =====================================================

-- =====================================================
-- ФУНКЦИЯ ПРОВЕРКИ АДМИНИСТРАТОРА
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

-- =====================================================
-- ВКЛЮЧЕНИЕ RLS НА ВСЕ ТАБЛИЦЫ
-- =====================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpu_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tts_voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_events ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- ПОЛЬЗОВАТЕЛЬСКИЕ ПОЛИТИКИ
-- =====================================================

-- profiles
CREATE POLICY "profiles_select_own"
ON profiles FOR SELECT
USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_update_own_safe"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- products
CREATE POLICY "products_own"
ON products FOR ALL
USING (auth.uid() = user_id);

-- video_references
CREATE POLICY "video_references_own"
ON video_references FOR ALL
USING (auth.uid() = user_id);

-- projects
CREATE POLICY "projects_own"
ON projects FOR ALL
USING (auth.uid() = user_id);

-- payments (только SELECT)
CREATE POLICY "payments_select_own"
ON payments FOR SELECT
USING (auth.uid() = user_id);

-- subscriptions (только SELECT)
CREATE POLICY "subscriptions_select_own"
ON subscriptions FOR SELECT
USING (auth.uid() = user_id);

-- credit_transactions (только SELECT)
CREATE POLICY "credit_tx_select_own"
ON credit_transactions FOR SELECT
USING (auth.uid() = user_id);

-- generation_segments (через проект)
CREATE POLICY "segments_via_project"
ON generation_segments FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = project_id
      AND p.user_id = auth.uid()
  )
);

-- product_reviews_analysis (через товар)
CREATE POLICY "reviews_via_product"
ON product_reviews_analysis FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM products pr
    WHERE pr.id = product_id
      AND pr.user_id = auth.uid()
  )
);

-- media_tasks (только SELECT через проект)
CREATE POLICY "media_tasks_select_own"
ON media_tasks FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = project_id
      AND p.user_id = auth.uid()
  )
);

-- gpu_jobs (только SELECT)
CREATE POLICY "gpu_jobs_select_own"
ON gpu_jobs FOR SELECT
USING (auth.uid() = user_id);

-- subscription_events (только SELECT через подписку)
CREATE POLICY "subscription_events_select_own"
ON subscription_events FOR SELECT
USING (auth.uid() = user_id);

-- storage_assets (только SELECT через проект/товар/референс)
CREATE POLICY "storage_assets_select_own"
ON storage_assets FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM products pr WHERE pr.id = product_id AND pr.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM video_references vr WHERE vr.id = reference_id AND vr.user_id = auth.uid()
  )
);

-- video_models (все authenticated могут читать)
CREATE POLICY "video_models_select_authenticated"
ON video_models FOR SELECT
USING (auth.role() = 'authenticated');

-- tts_voices (все authenticated могут читать)
CREATE POLICY "tts_voices_select_authenticated"
ON tts_voices FOR SELECT
USING (auth.role() = 'authenticated');

-- providers (только admin/service)
CREATE POLICY "providers_admin_only"
ON providers FOR SELECT
USING (is_admin());

-- rate_limit_counters (только service)
CREATE POLICY "rate_limit_service_only"
ON rate_limit_counters FOR ALL
USING (false);

-- =====================================================
-- АДМИН-ПОЛИТИКИ
-- =====================================================
CREATE POLICY "admin_all_profiles"
ON profiles FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_products"
ON products FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_projects"
ON projects FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_media_tasks"
ON media_tasks FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_gpu_jobs"
ON gpu_jobs FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_credit_transactions"
ON credit_transactions FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_payments"
ON payments FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_subscriptions"
ON subscriptions FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_subscription_events"
ON subscription_events FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_admin_actions"
ON admin_actions FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_moderation_events"
ON moderation_events FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_storage_assets"
ON storage_assets FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_video_models"
ON video_models FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_tts_voices"
ON tts_voices FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "admin_all_providers"
ON providers FOR ALL
USING (is_admin())
WITH CHECK (is_admin());
