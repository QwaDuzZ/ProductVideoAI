// Edge Function: webhook-replicate
// ТЗ §4.2, §3.5 — Идемпотентная обработка GPU-результатов от Replicate
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const body = await req.json();
    const { id, status, output, error: errorMessage, metrics } = body;

    if (!id || !status) {
      return new Response(JSON.stringify({ error_code: "MALFORMED_PAYLOAD" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jobError } = await supabase
      .from("gpu_jobs")
      .select("id, project_id, user_id, job_type, status, webhook_token, provider_job_id")
      .eq("prediction_id", id)
      .single();

    if (jobError || !job) {
      console.error(`[webhook-replicate] Job not found for prediction: ${id}`);
      return new Response(JSON.stringify({ error_code: "JOB_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.status === "done" || job.status === "failed") {
      return new Response(JSON.stringify({
        received: true,
        prediction_id: id,
        processed: false,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? req.headers.get("X-Webhook-Token");

    if (!token || token !== job.webhook_token) {
      return new Response(JSON.stringify({ error_code: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (status === "starting" || status === "processing") {
      await supabase
        .from("gpu_jobs")
        .update({
          status: "processing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      return new Response(JSON.stringify({
        received: true,
        prediction_id: id,
        processed: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (status === "succeeded") {
      const outputUrl = Array.isArray(output) ? output[0] : output;

      if (!outputUrl) {
        return new Response(JSON.stringify({ error_code: "NO_OUTPUT" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("gpu_jobs")
        .update({
          status: "done",
          output_url: outputUrl,
          cost_actual_usd: metrics?.predict_time ? metrics.predict_time * 0.001 : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      return new Response(JSON.stringify({
        received: true,
        prediction_id: id,
        processed: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (status === "failed" || status === "canceled") {
      await supabase
        .from("gpu_jobs")
        .update({
          status: "failed",
          error_message: errorMessage ?? `Replicate ${status}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      await supabase
        .from("projects")
        .update({
          status: "failed",
          error_code: "GPU_JOB_FAILED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.project_id)
        .not("status", "in", "(done,failed)");

      return new Response(JSON.stringify({
        received: true,
        prediction_id: id,
        processed: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error_code: "UNKNOWN_STATUS" }), {
      status: 400,
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
