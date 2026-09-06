-- =====================================================
-- TASK-002: DDL, часть 1
-- profiles, products, product_reviews_analysis,
-- video_references, projects, generation_segments
-- ТЗ §3.1
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. ПОЛЬЗОВАТЕЛИ И ПРОФИЛИ
-- =====================================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  credits_balance INTEGER NOT NULL DEFAULT 0 CHECK (credits_balance >= 0),
  region TEXT DEFAULT 'ru' CHECK (region IN ('ru', 'us', 'eu', 'la')),
  language TEXT DEFAULT 'ru' CHECK (language IN ('ru', 'en', 'de', 'es')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Автоматическое создание профиля после регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    credits_balance,
    region,
    language
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    'user',
    0,
    'ru',
    'ru'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 2. ТОВАРЫ
-- =====================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  source_url TEXT,
  marketplace TEXT,
  input_method TEXT DEFAULT 'manual' CHECK (input_method IN ('manual', 'firecrawl')),
  title TEXT NOT NULL,
  brand TEXT,
  price INTEGER,
  old_price INTEGER,
  description TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  attributes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. АНАЛИЗ ОТЗЫВОВ
-- =====================================================
CREATE TABLE product_reviews_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  pains JSONB DEFAULT '[]'::jsonb,
  joys JSONB DEFAULT '[]'::jsonb,
  raw_reviews_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. ВИДЕО-РЕФЕРЕНСЫ
-- =====================================================
CREATE TABLE video_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  source_video_url TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms <= 60000),
  size_bytes INTEGER CHECK (size_bytes <= 157286400),
  mode TEXT NOT NULL CHECK (mode IN ('semantic', 'inpainting', 'prompt_only', 'classic')),
  motion_skeleton_json JSONB DEFAULT '{}'::jsonb,
  mask_storage_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 5. ПРОЕКТЫ ГЕНЕРАЦИИ
-- =====================================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  reference_id UUID REFERENCES video_references(id) ON DELETE SET NULL,
  prompt TEXT,
  prompt_video_ref_url TEXT,
  user_adjustments TEXT,
  duration_sec INTEGER NOT NULL CHECK (duration_sec >= 1 AND duration_sec <= 60),
  platforms TEXT[] DEFAULT ARRAY['reels']::TEXT[],
  tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'premium')),
  model_id TEXT NOT NULL,
  status TEXT DEFAULT 'queued' CHECK (status IN (
    'draft',
    'queued',
    'script_ready',
    'generating',
    'audio_sync',
    'assembling',
    'done',
    'failed',
    'canceled'
  )),
  error_code TEXT,
  fidelity_score INTEGER,
  continuity_score INTEGER,
  cost_credits INTEGER NOT NULL,
  refunded BOOLEAN DEFAULT FALSE,
  is_free BOOLEAN DEFAULT FALSE,
  result_video_url TEXT,
  language TEXT DEFAULT 'ru' CHECK (language IN ('ru','en','de','es')),
  use_sentiment_triggers BOOLEAN DEFAULT FALSE,
  ugc_type TEXT DEFAULT 'clean' CHECK (ugc_type IN ('clean','avatar','hands','3d_orbit')),
  audio_mode TEXT DEFAULT 'ai_full' CHECK (audio_mode IN ('ai_full','original_donor')),
  outro_mode TEXT DEFAULT 'fade' CHECK (outro_mode IN ('fade','loop')),
  v2v_legal_accepted BOOLEAN DEFAULT FALSE,
  master_audio_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 6. СЕГМЕНТЫ ГЕНЕРАЦИИ
-- =====================================================
CREATE TABLE generation_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  segment_index INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  seed BIGINT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  target_duration_ms INTEGER,
  fidelity_score INTEGER,
  video_url TEXT,
  retry_count INTEGER DEFAULT 0 CHECK (retry_count <= 3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, segment_index)
);

-- =====================================================
-- ИНДЕКСЫ
-- =====================================================
CREATE INDEX idx_products_user_id ON products(user_id);
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_generation_segments_project ON generation_segments(project_id);

-- =====================================================
-- АВТООБНОВЛЕНИЕ updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_set_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
