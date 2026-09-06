// Edge Function: create-project
// ТЗ §4.2, §4.4.1, §6.1, §7.2 — Создание проекта, списание кредитов, лимиты
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CREDIT_COSTS: Record<string, Record<number, number>> = {
  standard: { 30: 35, 60: 70 },
  premium: { 30: 80, 60: 160 },
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

    const body = await req.json();
    const {
      product_id,
      reference_id,
      duration_sec,
      tier,
      model_id,
      language,
      ugc_type,
      outro_mode,
      audio_mode,
      use_sentiment_triggers,
      v2v_legal_accepted,
    } = body;

    if (!product_id || !duration_sec || !tier || !model_id) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (![30, 60].includes(duration_sec)) {
      return new Response(JSON.stringify({
        error_code: "VALIDATION_ERROR",
        user_message: "Duration must be 30 or 60 seconds",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["standard", "premium"].includes(tier)) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (audio_mode === "original_donor") {
      if (!reference_id) {
        return new Response(JSON.stringify({
          error_code: "VALIDATION_ERROR",
          user_message: "reference_id required for original_donor audio mode",
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: ref } = await supabase
        .from("video_references")
        .select("mode")
        .eq("id", reference_id)
        .single();

      if (!ref || ref.mode !== "inpainting") {
        return new Response(JSON.stringify({
          error_code: "VALIDATION_ERROR",
          user_message: "original_donor requires inpainting mode reference",
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: rateLimit } = await supabase.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_endpoint: "create-project",
      p_limit: 10,
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

    const { data: activeCount } = await supabase.rpc("count_active_user_projects", {
      p_user_id: user.id,
    });

    if (activeCount && activeCount >= 2) {
      return new Response(JSON.stringify({ error_code: "ACTIVE_PROJECT_LIMIT" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const costCredits = CREDIT_COSTS[tier]?.[duration_sec] ?? 35;

    const { error: chargeError } = await supabase.rpc("charge_credits", {
      p_user_id: user.id,
      p_cost: costCredits,
      p_reason: "project_creation",
      p_project_id: null,
    });

    if (chargeError) {
      return new Response(JSON.stringify({ error_code: "INSUFFICIENT_CREDITS" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        product_id,
        reference_id: reference_id ?? null,
        duration_sec,
        tier,
        model_id,
        language: language ?? "ru",
        ugc_type: ugc_type ?? "clean",
        outro_mode: outro_mode ?? "fade",
        audio_mode: audio_mode ?? "ai_full",
        use_sentiment_triggers: use_sentiment_triggers ?? false,
        v2v_legal_accepted: v2v_legal_accepted ?? false,
        cost_credits: costCredits,
        status: "queued",
      })
      .select("id, status, cost_credits")
      .single();

    if (projectError) {
      await supabase.rpc("refund_project_credits", {
        p_project_id: null,
      });
      throw projectError;
    }

    await supabase
      .from("credit_transactions")
      .update({ project_id: project.id })
      .eq("user_id", user.id)
      .eq("reason", "project_creation")
      .is("project_id", null)
      .order("created_at", { ascending: false })
      .limit(1);

    supabase.functions.invoke("generate-script", {
      body: { project_id: project.id },
      headers: { "x-supabase-service-role": "true" },
    }).catch((err) => console.error("[create-project] Failed to invoke generate-script:", err));

    return new Response(JSON.stringify({
      project_id: project.id,
      status: project.status,
      cost_credits: project.cost_credits,
      eta_minutes: 12,
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
