// Edge Function: internal-media-completed
// ТЗ §4.2, §2.5, §6.1, §6.5, §6.6 — Служебное продвижение пайплайна
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["queued", "failed"],
  queued: ["script_ready", "failed"],
  script_ready: ["generating", "canceled", "failed"],
  generating: ["audio_sync", "failed"],
  audio_sync: ["assembling", "failed"],
  assembling: ["done", "failed"],
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
    const { media_task_id, project_id, task_type, status } = body;

    if (!media_task_id || !project_id || !task_type || !status) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["done", "failed"].includes(status)) {
      return new Response(JSON.stringify({ error_code: "INVALID_STATUS" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: task } = await supabase
      .from("media_tasks")
      .select("id, status, task_type")
      .eq("id", media_task_id)
      .single();

    if (!task) {
      return new Response(JSON.stringify({ error_code: "TASK_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (task.status !== "processing") {
      return new Response(JSON.stringify({
        ok: true,
        next_action: "none",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id, status, user_id, duration_sec, cost_credits")
      .eq("id", project_id)
      .single();

    if (!project) {
      return new Response(JSON.stringify({ error_code: "PROJECT_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (task_type === "extract_audio" && status === "done") {
      const { data: completedTask } = await supabase
        .from("media_tasks")
        .select("payload")
        .eq("id", media_task_id)
        .single();

      const payload = completedTask?.payload as Record<string, unknown> | undefined;
      const durationExceeded = payload?.duration_exceeded as boolean | undefined;
      const measuredDurationMs = payload?.measured_duration_ms as number | undefined;

      if (durationExceeded) {
        await supabase
          .from("projects")
          .update({
            status: "failed",
            error_code: "DONOR_DURATION_EXCEEDED",
          })
          .eq("id", project_id);

        return new Response(JSON.stringify({
          ok: true,
          next_action: "mark_project_failed",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (measuredDurationMs) {
        const measuredDurationSec = Math.ceil(measuredDurationMs / 1000);
        await supabase
          .from("projects")
          .update({ duration_sec: measuredDurationSec })
          .eq("id", project_id);
      }
    }

    if (status === "failed") {
      await supabase
        .from("projects")
        .update({
          status: "failed",
          error_code: "MEDIA_TASK_FAILED",
        })
        .eq("id", project_id);

      return new Response(JSON.stringify({
        ok: true,
        next_action: "mark_project_failed",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nextAction = determineNextAction(project.status, task_type);

    if (nextAction.newStatus) {
      const allowed = VALID_TRANSITIONS[project.status] ?? [];
      if (!allowed.includes(nextAction.newStatus)) {
        return new Response(JSON.stringify({ error_code: "INVALID_TRANSITION" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("projects")
        .update({ status: nextAction.newStatus })
        .eq("id", project_id);
    }

    return new Response(JSON.stringify({
      ok: true,
      next_action: nextAction.action,
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

function determineNextAction(
  currentStatus: string,
  taskType: string,
): { action: string; newStatus: string | null } {
  switch (currentStatus) {
    case "queued":
      return { action: "start_script_generation", newStatus: "script_ready" };
    case "script_ready":
      return { action: "start_video_generation", newStatus: "generating" };
    case "generating":
      if (taskType === "audio_mix") {
        return { action: "start_audio_sync", newStatus: "audio_sync" };
      }
      return { action: "start_upscale", newStatus: null };
    case "audio_sync":
      return { action: "start_assembling", newStatus: "assembling" };
    case "assembling":
      return { action: "mark_project_done", newStatus: "done" };
    default:
      return { action: "none", newStatus: null };
  }
}
