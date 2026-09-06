-- =====================================================
-- TASK-003: DDL, часть 2
-- media_tasks, gpu_jobs, credit_transactions, payments,
-- subscriptions, subscription_events, providers,
-- video_models, storage_assets, tts_voices,
-- rate_limit_counters, admin_actions, moderation_events
-- ТЗ §3.1
-- =====================================================

-- =====================================================
-- 7. ОЧЕРЕДЬ ВОРКЕРА (MEDIA TASKS)
-- =====================================================
CREATE TABLE IF NOT EXISTS media_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'stitch',
    'audio_mix',
    'extract_audio',
    'merge_audio',
    'outro',
    'stabilize_chunk'
  )),
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  result_url TEXT,
  error_message TEXT,
  attempts INTEGER DEFAULT 0 CHECK (attempts <= 3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 8. GPU / REPLICATE ЗАДАЧИ
-- =====================================================
CREATE TABLE IF NOT EXISTS gpu_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'v2v_inpaint',
    'upscale',
    'segment_gen',
    'video_base',
    'video_extend',
    'video_one_take',
    'reference_analysis',
    'prompt_from_video',
    'tts'
  )),
  provider TEXT NOT NULL DEFAULT 'replicate',
  idempotency_key TEXT UNIQUE,
  prediction_id TEXT UNIQUE,
  provider_job_id TEXT UNIQUE,
  async_mode TEXT NOT NULL DEFAULT 'webhook' CHECK (async_mode IN ('webhook','polling')),
  next_poll_at TIMESTAMPTZ,
  poll_attempts INTEGER NOT NULL DEFAULT 0 CHECK (poll_attempts <= 20),
  webhook_token TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_url TEXT,
  output_duration_ms INTEGER,
  output_width INTEGER,
  output_height INTEGER,
  error_message TEXT,
  cost_estimate_usd NUMERIC(10,4),
  cost_actual_usd NUMERIC(10,4),
  attempts INTEGER DEFAULT 0 CHECK (attempts <= 3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 9. ТРАНЗАКЦИИ КРЕДИТОВ
-- =====================================================
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 10. ПЛАТЕЖИ
-- =====================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  gateway_payment_id TEXT UNIQUE NOT NULL,
  event_id TEXT UNIQUE,
  payment_gateway TEXT NOT NULL CHECK (payment_gateway IN ('prodamus','payselection','lavatop','cryptocloud')),
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL,
  credits_awarded INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded')),
  raw_payload JSONB,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  refund_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 11. ПОДПИСКИ
-- =====================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  gateway_name TEXT NOT NULL CHECK (gateway_name IN ('prodamus','payselection','lavatop','cryptocloud')),
  external_sub_id TEXT UNIQUE,
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('starter','growth','scale','basic','pro','ent')),
  status TEXT NOT NULL CHECK (status IN ('trialing','active','past_due','canceled','expired')),
  credits_allowance INTEGER NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  is_renewable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 11.1. СОБЫТИЯ ПОДПИСОК
-- =====================================================
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  gateway_name TEXT NOT NULL CHECK (gateway_name IN ('prodamus','payselection','lavatop','cryptocloud')),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  status_from TEXT,
  status_to TEXT NOT NULL,
  raw_payload JSONB,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 12. ПРОВАЙДЕРЫ
-- =====================================================
CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 100
);

-- =====================================================
-- 13. МОДЕЛИ ВИДЕОГЕНЕРАЦИИ
-- =====================================================
CREATE TABLE IF NOT EXISTS video_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('standard','premium')),
  resolution TEXT NOT NULL DEFAULT '1080p',
  cost_usd_per_sec NUMERIC(8,5) NOT NULL,
  credits_price_30s INTEGER NOT NULL,
  providers JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 100
);

-- =====================================================
-- 14. РЕЕСТР ФАЙЛОВ ХРАНИЛИЩА
-- =====================================================
CREATE TABLE IF NOT EXISTS storage_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  reference_id UUID REFERENCES video_references(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  bucket_id TEXT NOT NULL,
  object_name TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'reference_upload',
    'prompt_ref_upload',
    'product_image',
    'processing_donor',
    'segment_base',
    'segment_extend',
    'upscale_input',
    'upscale_output',
    'voiceover',
    'music',
    'sfx',
    'audio_mix_input',
    'final_result'
  )),
  protected_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bucket_id, object_name)
);

-- =====================================================
-- 15. ГОЛОСА TTS
-- =====================================================
CREATE TABLE IF NOT EXISTS tts_voices (
  language TEXT PRIMARY KEY CHECK (language IN ('ru', 'en', 'de', 'es')),
  provider TEXT NOT NULL DEFAULT 'elevenlabs',
  voice_id TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 16. СЧЁТЧИКИ RATE LIMITS
-- =====================================================
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0
);

-- =====================================================
-- 17. ЖУРНАЛ ДЕЙСТВИЙ АДМИНИСТРАТОРОВ
-- =====================================================
CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 18. ЖУРНАЛ КОНТЕНТ-МОДЕРАЦИИ
-- =====================================================
CREATE TABLE IF NOT EXISTS moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  material_type TEXT NOT NULL CHECK (material_type IN (
    'donor_video','product_description','product_image','prompt','script'
  )),
  material_ref TEXT,
  category TEXT,
  model TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ИНДЕКСЫ
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_media_tasks_status_created ON media_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_media_tasks_project_id ON media_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_gpu_jobs_project_id ON gpu_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_gpu_jobs_status ON gpu_jobs(status);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_payment_id ON payments(gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_assets_project_id ON storage_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_moderation_events_user_id ON moderation_events(user_id);

-- =====================================================
-- ТРИГГЕРЫ updated_at
-- =====================================================
CREATE TRIGGER media_tasks_set_updated_at
BEFORE UPDATE ON media_tasks
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER gpu_jobs_set_updated_at
BEFORE UPDATE ON gpu_jobs
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
