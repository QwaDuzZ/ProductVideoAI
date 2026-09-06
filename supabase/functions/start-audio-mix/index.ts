// Edge Function: start-audio-mix
// ТЗ §5.6 — Аудио-матрица: музыка/SFX/дакинг
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
    const { project_id, video_url, voiceover_url, music_url, sfx_url } = body;

    if (!project_id || !video_url) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id, audio_mode")
      .eq("id", project_id)
      .single();

    if (!project) {
      return new Response(JSON.stringify({ error_code: "PROJECT_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const outputPath = `results/${project_id}/final.mp4`;

    const { data: mediaTask, error: taskError } = await supabase
      .from("media_tasks")
      .insert({
        project_id,
        task_type: "audio_mix",
        payload: {
          video_url,
          voiceover_url: voiceover_url ?? null,
          music_url: music_url ?? null,
          sfx_url: sfx_url ?? null,
          audio_mode: project.audio_mode,
          output_path: outputPath,
        },
        status: "pending",
      })
      .select("id")
      .single();

    if (taskError) throw taskError;

    await supabase.from("storage_assets").insert({
      project_id,
      bucket_id: "results",
      object_name: outputPath,
      purpose: "final_result",
    });

    return new Response(JSON.stringify({
      project_id,
      media_task_id: mediaTask.id,
      status: "audio_mix_queued",
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
