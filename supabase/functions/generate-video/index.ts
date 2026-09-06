// Edge Function: generate-video
// ТЗ §4.3, §5.2, §6.5 — Видеогенерация Ветки А: One-take/Extend
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VIDEO_MODELS: Record<string, {
  provider: string;
  model: string;
  costPerSec: number;
}> = {
  "seedance-2.0-fast": {
    provider: "replicate",
    model: "bytedance/seedance-2.0-fast",
    costPerSec: 0.1028,
  },
  "seedance-2.0-quality": {
    provider: "replicate",
    model: "bytedance/seedance-2.0-quality",
    costPerSec: 0.15,
  },
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
    const isServiceRole = req.headers.get("x-supabase-service-role") === "true";

    if (!authHeader && !isServiceRole) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userId: string | null = null;
    if (!isServiceRole) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader!.replace("Bearer ", ""),
      );
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }

    const body = await req.json();
    const { project_id } = body;

    if (!project_id) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, user_id, status, tier, duration_sec, model_id, prompt, reference_id, language, outro_mode")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error_code: "PROJECT_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isServiceRole && project.user_id !== userId) {
      return new Response(JSON.stringify({ error_code: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (project.status !== "script_ready" && project.status !== "generating" && project.status !== "audio_sync") {
      return new Response(JSON.stringify({ error_code: "INVALID_STATUS" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const modelConfig = VIDEO_MODELS[project.model_id] ?? VIDEO_MODELS["seedance-2.0-fast"];

    const generationPlan = buildGenerationPlan(project.tier, project.duration_sec);

    const { data: existingSegments } = await supabase
      .from("generation_segments")
      .select("id, segment_index, status, video_url")
      .eq("project_id", project_id)
      .order("segment_index");

    if (existingSegments && existingSegments.length > 0) {
      const lastSegment = existingSegments[existingSegments.length - 1];
      if (lastSegment.status === "done" && lastSegment.video_url) {
        return await handleExtendOrComplete(
          supabase,
          project,
          existingSegments,
          lastSegment,
          generationPlan,
          modelConfig,
        );
      }
    }

    await supabase
      .from("projects")
      .update({ status: "generating" })
      .eq("id", project_id);

    const basePrompt = project.prompt ?? "";
    const durationMs = generationPlan.baseDurationSec * 1000;

    const { data: segment, error: segmentError } = await supabase
      .from("generation_segments")
      .insert({
        project_id,
        segment_index: 0,
        prompt: basePrompt,
        seed: Math.floor(Math.random() * 1000000),
        status: "pending",
        target_duration_ms: durationMs,
      })
      .select("id")
      .single();

    if (segmentError) throw segmentError;

    const idempotencyKey = `${project_id}_base_0_${Date.now()}`;

    const { data: gpuJob, error: gpuError } = await supabase
      .from("gpu_jobs")
      .insert({
        project_id,
        user_id: project.user_id,
        job_type: project.tier === "premium" ? "video_one_take" : "video_base",
        provider: modelConfig.provider,
        idempotency_key: idempotencyKey,
        async_mode: "webhook",
        webhook_token: crypto.randomUUID(),
        status: "pending",
        input_payload: {
          model: modelConfig.model,
          prompt: basePrompt,
          duration: generationPlan.baseDurationSec,
          reference_url: project.reference_id ? await getReferenceUrl(supabase, project.reference_id) : undefined,
        },
      })
      .select("id, webhook_token")
      .single();

    if (gpuError) throw gpuError;

    return new Response(JSON.stringify({
      project_id,
      status: "generating",
      segment_index: 0,
      gpu_job_id: gpuJob.id,
      generation_plan: generationPlan,
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

interface GenerationPlan {
  tier: string;
  totalDurationSec: number;
  baseDurationSec: number;
  extendSteps: number;
  extendDurationSec: number;
}

function buildGenerationPlan(tier: string, totalDurationSec: number): GenerationPlan {
  if (tier === "premium") {
    if (totalDurationSec <= 30) {
      return {
        tier,
        totalDurationSec: 30,
        baseDurationSec: 30,
        extendSteps: 0,
        extendDurationSec: 0,
      };
    }
    return {
      tier,
      totalDurationSec: 60,
      baseDurationSec: 30,
      extendSteps: 1,
      extendDurationSec: 30,
    };
  }

  if (totalDurationSec <= 30) {
    return {
      tier: "standard",
      totalDurationSec: 30,
      baseDurationSec: 15,
      extendSteps: 1,
      extendDurationSec: 15,
    };
  }

  return {
    tier: "standard",
    totalDurationSec: 60,
    baseDurationSec: 15,
    extendSteps: 3,
    extendDurationSec: 15,
  };
}

async function getReferenceUrl(
  supabase: ReturnType<typeof createClient>,
  referenceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("video_references")
    .select("source_video_url")
    .eq("id", referenceId)
    .single();

  return data?.source_video_url ?? null;
}

async function handleExtendOrComplete(
  supabase: ReturnType<typeof createClient>,
  project: { id: string; tier: string; duration_sec: number; user_id: string },
  segments: Array<{ id: string; segment_index: number; status: string; video_url: string | null }>,
  lastSegment: { video_url: string | null },
  plan: GenerationPlan,
  modelConfig: { provider: string; model: string },
): Promise<Response> {
  const completedCount = segments.filter((s) => s.status === "done").length;

  if (completedCount >= plan.extendSteps + 1) {
    const { data: existingTasks } = await supabase
      .from("media_tasks")
      .select("id")
      .eq("project_id", project.id)
      .limit(1);

    if (!existingTasks || existingTasks.length === 0) {
      const taskTypes = [
        { task_type: "extract_audio", payload: {} },
        { task_type: "audio_mix", payload: {} },
        { task_type: "stitch", payload: {} },
      ];
      if (plan.totalDurationSec > 30) {
        taskTypes.push({ task_type: "outro", payload: {} });
      }
      for (const task of taskTypes) {
        await supabase.from("media_tasks").insert({
          project_id: project.id,
          task_type: task.task_type,
          payload: task.payload,
          status: "pending",
        });
      }
    }

    return new Response(JSON.stringify({
      project_id: project.id,
      status: "generating",
      message: "All segments complete, ready for upscale",
      segment_count: completedCount,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const nextIndex = completedCount;
  const nextDurationMs = plan.extendDurationSec * 1000;

  const { data: segment, error: segmentError } = await supabase
    .from("generation_segments")
    .insert({
      project_id: project.id,
      segment_index: nextIndex,
      prompt: `Extend video from previous segment. Duration: ${plan.extendDurationSec}s`,
      seed: Math.floor(Math.random() * 1000000),
      status: "pending",
      target_duration_ms: nextDurationMs,
    })
    .select("id")
    .single();

  if (segmentError) throw segmentError;

  const idempotencyKey = `${project.id}_extend_${nextIndex}_${Date.now()}`;

  const { data: gpuJob, error: gpuError } = await supabase
    .from("gpu_jobs")
    .insert({
      project_id: project.id,
      user_id: project.user_id,
      job_type: "video_extend",
      provider: modelConfig.provider,
      idempotency_key: idempotencyKey,
      async_mode: "webhook",
      webhook_token: crypto.randomUUID(),
      status: "pending",
      input_payload: {
        model: modelConfig.model,
        video_url: lastSegment.video_url,
        duration: plan.extendDurationSec,
      },
    })
    .select("id")
    .single();

  if (gpuError) throw gpuError;

  return new Response(JSON.stringify({
    project_id: project.id,
    status: "generating",
    segment_index: nextIndex,
    gpu_job_id: gpuJob.id,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
