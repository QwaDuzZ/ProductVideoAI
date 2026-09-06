// Edge Function: start-upscale
// ТЗ §6.5 — Апскейл финала до 1080p через Replicate
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const internalToken = req.headers.get("X-Internal-Token");
    const expectedToken = Deno.env.get("INTERNAL_EDGE_TOKEN");

    if (!internalToken || internalToken !== expectedToken) {
      return new Response(JSON.stringify({ error: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const { project_id, video_url } = body;

    if (!project_id || !video_url) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", project_id)
      .single();

    if (!project) {
      return new Response(JSON.stringify({ error_code: "PROJECT_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const idempotencyKey = `${project_id}_upscale_${Date.now()}`;

    const { data: gpuJob, error: gpuError } = await supabase
      .from("gpu_jobs")
      .insert({
        project_id,
        user_id: project.user_id,
        job_type: "upscale",
        provider: "replicate",
        idempotency_key: idempotencyKey,
        async_mode: "webhook",
        webhook_token: crypto.randomUUID(),
        status: "pending",
        input_payload: {
          model: "xinntao/real-esrgan",
          video_url,
          target_width: 1080,
          target_height: 1920,
        },
      })
      .select("id")
      .single();

    if (gpuError) throw gpuError;

    return new Response(JSON.stringify({
      project_id,
      gpu_job_id: gpuJob.id,
      status: "upscale_queued",
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
