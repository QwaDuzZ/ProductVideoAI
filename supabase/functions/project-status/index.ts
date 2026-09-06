// Edge Function: project-status
// ТЗ §4.2, §8.6.1 — Текущий статус и прогресс проекта
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROGRESS_MAP: Record<string, number> = {
  draft: 5,
  queued: 10,
  script_ready: 25,
  generating: 40,
  audio_sync: 70,
  assembling: 85,
  done: 100,
  failed: 50,
  canceled: 0,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const projectId = pathParts[pathParts.length - 2];

    if (!projectId) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rateLimit } = await supabase.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_endpoint: "project-status",
      p_limit: 60,
    });

    if (rateLimit && !rateLimit.allowed) {
      return new Response(JSON.stringify({ error_code: "RATE_LIMITED" }), {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(rateLimit.retry_after_seconds),
        },
      });
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, status, error_code, result_video_url, updated_at, user_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error_code: "PROJECT_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (project.user_id !== user.id) {
      return new Response(JSON.stringify({ error_code: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const progress = PROGRESS_MAP[project.status] ?? 0;

    const userMessage = project.status === "done"
      ? "Ваше видео готово"
      : project.status === "failed"
        ? "Не удалось сгенерировать видео. Кредиты возвращены."
        : null;

    return new Response(JSON.stringify({
      project_id: project.id,
      status: project.status,
      progress,
      error_code: project.error_code ?? null,
      user_message: userMessage,
      result_video_url: project.result_video_url ?? null,
      updated_at: project.updated_at,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error_code: "INTERNAL_ERROR" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
