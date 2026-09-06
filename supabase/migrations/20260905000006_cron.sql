-- =====================================================
-- TASK-007: Планировщики pg_cron
-- Очистка хранилища, счётчиков, зависших проектов, polling
-- ТЗ §3.4, §4.4.1, §4.5
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =====================================================
-- 1. CHECK RATE LIMIT
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_endpoint TEXT,
  p_limit INTEGER
)
RETURNS TABLE (allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := date_trunc('hour', NOW());
  v_counter INTEGER;
BEGIN
  INSERT INTO rate_limit_counters (key, window_start, counter)
  VALUES (p_user_id || ':' || p_endpoint, v_window_start, 1)
  ON CONFLICT (key) DO UPDATE
    SET window_start = v_window_start,
        counter = CASE
          WHEN rate_limit_counters.window_start < v_window_start THEN 1
          ELSE rate_limit_counters.counter + 1
        END
  RETURNING rate_limit_counters.counter INTO v_counter;

  IF v_counter > p_limit THEN
    RETURN QUERY
    SELECT FALSE,
           GREATEST(EXTRACT(EPOCH FROM (v_window_start + INTERVAL '1 hour' - NOW()))::INTEGER, 1);
  ELSE
    RETURN QUERY SELECT TRUE, 0;
  END IF;
END;
$$;

-- =====================================================
-- 2. COUNT ACTIVE USER PROJECTS (max 2)
-- =====================================================
CREATE OR REPLACE FUNCTION public.count_active_user_projects(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM projects
  WHERE user_id = p_user_id
    AND status IN ('draft','queued','script_ready','generating','audio_sync','assembling');
$$;

-- =====================================================
-- 3. COUNT ACTIVE GENERATIONS (max 20)
-- =====================================================
CREATE OR REPLACE FUNCTION public.count_active_generations()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM projects
  WHERE status IN ('queued','script_ready','generating','audio_sync','assembling');
$$;

-- =====================================================
-- 4. COUNT ACTIVE V2V JOBS (max 2)
-- =====================================================
CREATE OR REPLACE FUNCTION public.count_active_v2v_jobs()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM gpu_jobs
  WHERE job_type IN ('v2v_inpaint','video_base','video_extend','video_one_take')
    AND status IN ('pending','processing');
$$;

-- =====================================================
-- 5. FAIL STUCK PROJECTS (6 hours timeout)
-- =====================================================
CREATE OR REPLACE FUNCTION public.fail_stuck_projects()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE projects
  SET status = 'failed',
      error_code = 'WORKER_TIMEOUT',
      updated_at = NOW()
  WHERE status IN ('draft','queued','script_ready','generating','audio_sync','assembling')
    AND updated_at < NOW() - INTERVAL '6 hours';
END;
$$;

-- =====================================================
-- CRON SCHEDULES
-- =====================================================

-- Очистка хранилища каждые 15 минут
SELECT cron.schedule(
  'cleanup-temp-storage',
  '*/15 * * * *',
  $$SELECT cleanup_temp_storage();$$
);

-- Очистка счётчиков лимитов ежечасно
SELECT cron.schedule(
  'cleanup-rate-limit-counters',
  '0 * * * *',
  $$DELETE FROM rate_limit_counters WHERE window_start < NOW() - INTERVAL '24 hours';$$
);

-- Отказ зависших проектов каждые 15 минут
SELECT cron.schedule(
  'fail-stuck-projects',
  '*/15 * * * *',
  $$SELECT fail_stuck_projects();$$
);

-- =====================================================
-- REVOKE/GRANT для cron-функций (перенесено из migration 5)
-- =====================================================
REVOKE EXECUTE ON FUNCTION public.check_rate_limit FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_active_user_projects FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_active_generations FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_active_v2v_jobs FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_rate_limit TO service_role;
GRANT EXECUTE ON FUNCTION public.count_active_user_projects TO service_role;
GRANT EXECUTE ON FUNCTION public.count_active_generations TO service_role;
GRANT EXECUTE ON FUNCTION public.count_active_v2v_jobs TO service_role;
