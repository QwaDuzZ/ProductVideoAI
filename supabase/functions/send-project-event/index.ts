// Edge Function: send-project-event
// ТЗ §8.6, §8.6.1 — Публикация Realtime-событий проекта
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
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
    const { project_id, status, error_code, user_message } = body;

    if (!project_id || !status) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id, status, updated_at")
      .eq("id", project_id)
      .single();

    if (!project) {
      return new Response(JSON.stringify({ error_code: "PROJECT_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const progress = PROGRESS_MAP[project.status] ?? 0;

    let eventName = "project_status_changed";
    if (project.status === "done") eventName = "project_done";
    if (project.status === "failed") eventName = "project_failed";

    const eventPayload = {
      event: eventName,
      project_id: project.id,
      status: project.status,
      progress,
      error_code: error_code ?? null,
      user_message: user_message ?? null,
      updated_at: project.updated_at,
    };

    const channel = supabase.channel(`project:${project_id}`);

    await channel.send({
      type: "broadcast",
      event: eventName,
      payload: eventPayload,
    });

    return new Response(JSON.stringify({
      sent: true,
      event: eventName,
      channel: `project:${project_id}`,
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
