// Edge Function: poll-async-jobs
// ТЗ §4.5 — Опрос асинхронных задач (async_mode=polling)
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

const MAX_JOBS_PER_CYCLE = 5;
const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVALS = [30, 60, 120];

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

    const { data: jobs, error: jobsError } = await supabase
      .from("gpu_jobs")
      .select("id, project_id, user_id, job_type, provider, provider_job_id, poll_attempts, async_mode")
      .eq("async_mode", "polling")
      .in("status", ["pending", "processing"])
      .lte("next_poll_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(MAX_JOBS_PER_CYCLE);

    if (jobsError) throw jobsError;

    let completed = 0;
    let failed = 0;

    for (const job of jobs ?? []) {
      try {
        const result = await pollProvider(job.provider, job.provider_job_id);

        if (result.status === "succeeded") {
          await supabase
            .from("gpu_jobs")
            .update({
              status: "done",
              output_url: result.output_url,
              output_duration_ms: result.output_duration_ms,
              output_width: result.output_width,
              output_height: result.output_height,
              cost_actual_usd: result.cost_actual_usd,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          completed++;
        } else if (result.status === "failed") {
          await supabase
            .from("gpu_jobs")
            .update({
              status: "failed",
              error_message: result.error ?? "Provider failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          await supabase
            .from("projects")
            .update({
              status: "failed",
              error_code: "GPU_JOB_FAILED",
            })
            .eq("id", job.project_id);

          failed++;
        } else {
          const newPollAttempts = job.poll_attempts + 1;

          if (newPollAttempts >= MAX_POLL_ATTEMPTS) {
            await supabase
              .from("gpu_jobs")
              .update({
                status: "failed",
                error_message: "POLLING_EXHAUSTED",
                poll_attempts: newPollAttempts,
                updated_at: new Date().toISOString(),
              })
              .eq("id", job.id);

            await supabase
              .from("projects")
              .update({
                status: "failed",
                error_code: "POLLING_EXHAUSTED",
              })
              .eq("id", job.project_id);

            failed++;
          } else {
            const intervalIndex = Math.min(newPollAttempts, POLL_INTERVALS.length - 1);
            const nextInterval = POLL_INTERVALS[intervalIndex];
            const nextPollAt = new Date(Date.now() + nextInterval * 1000).toISOString();

            await supabase
              .from("gpu_jobs")
              .update({
                poll_attempts: newPollAttempts,
                next_poll_at: nextPollAt,
                updated_at: new Date().toISOString(),
              })
              .eq("id", job.id);
          }
        }
      } catch (error) {
        console.error(`[poll-async-jobs] Error polling job ${job.id}:`, error);
        failed++;
      }
    }

    return new Response(JSON.stringify({
      processed: jobs?.length ?? 0,
      completed,
      failed,
      next_run_in_sec: 60,
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

async function pollProvider(
  provider: string,
  providerJobId: string | null,
): Promise<{
  status: string;
  output_url?: string;
  output_duration_ms?: number;
  output_width?: number;
  output_height?: number;
  cost_actual_usd?: number;
  error?: string;
}> {
  if (!providerJobId) {
    return { status: "failed", error: "No provider_job_id" };
  }

  switch (provider) {
    case "replicate":
      return pollReplicate(providerJobId);
    case "openrouter":
      return pollOpenRouter(providerJobId);
    case "fal":
      return pollFal(providerJobId);
    default:
      return { status: "failed", error: `Unknown provider: ${provider}` };
  }
}

async function pollReplicate(predictionId: string): Promise<{
  status: string;
  output_url?: string;
  output_duration_ms?: number;
  output_width?: number;
  output_height?: number;
  cost_actual_usd?: number;
  error?: string;
}> {
  const token = Deno.env.get("REPLICATE_API_TOKEN");
  if (!token) return { status: "failed", error: "REPLICATE_API_TOKEN not set" };

  const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    return { status: "failed", error: `Replicate API error: ${response.status}` };
  }

  const data = await response.json();

  if (data.status === "succeeded") {
    const output = data.output;
    return {
      status: "succeeded",
      output_url: Array.isArray(output) ? output[0] : output,
      cost_actual_usd: data.metrics?.predict_time ? data.metrics.predict_time * 0.001 : undefined,
    };
  }

  if (data.status === "failed") {
    return { status: "failed", error: data.error ?? "Replicate prediction failed" };
  }

  return { status: "processing" };
}

async function pollOpenRouter(jobId: string): Promise<{
  status: string;
  output_url?: string;
  error?: string;
}> {
  const token = Deno.env.get("OPENROUTER_API_KEY");
  if (!token) return { status: "failed", error: "OPENROUTER_API_KEY not set" };

  const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    return { status: "failed", error: `OpenRouter API error: ${response.status}` };
  }

  const data = await response.json();

  if (data.state === "complete") {
    return {
      status: "succeeded",
      output_url: data.output_url,
    };
  }

  if (data.state === "error") {
    return { status: "failed", error: data.error ?? "OpenRouter generation failed" };
  }

  return { status: "processing" };
}

async function pollFal(jobId: string): Promise<{
  status: string;
  output_url?: string;
  error?: string;
}> {
  const key = Deno.env.get("FAL_KEY");
  if (!key) return { status: "failed", error: "FAL_KEY not set" };

  const response = await fetch(`https://queue.fal.run/${jobId}/status`, {
    headers: { Authorization: `Key ${key}` },
  });

  if (!response.ok) {
    return { status: "failed", error: `fal.ai API error: ${response.status}` };
  }

  const data = await response.json();

  if (data.status === "COMPLETED") {
    const resultRes = await fetch(`https://queue.fal.run/${jobId}`, {
      headers: { Authorization: `Key ${key}` },
    });

    if (!resultRes.ok) {
      return { status: "failed", error: `fal.ai result fetch error: ${resultRes.status}` };
    }

    const result = await resultRes.json();
    return {
      status: "succeeded",
      output_url: result.output_url ?? result.output?.video?.url,
    };
  }

  if (data.status === "FAILED") {
    return { status: "failed", error: data.error ?? "fal.ai job failed" };
  }

  return { status: "processing" };
}
