// Edge Function: analyze-reference
// ТЗ §4.2, §5.4, §6.8, §7.2 — Семантический разбор донора (1 кредит)
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANALYSIS_COST = 1;
const MAX_RETRIES = 2;

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
    const { reference_id } = body;

    if (!reference_id) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ref, error: refError } = await supabase
      .from("video_references")
      .select("id, user_id, source_video_url")
      .eq("id", reference_id)
      .single();

    if (refError || !ref) {
      return new Response(JSON.stringify({ error_code: "REFERENCE_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (ref.user_id !== user.id) {
      return new Response(JSON.stringify({ error_code: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await supabase
      .from("video_references")
      .select("motion_skeleton_json")
      .eq("id", reference_id)
      .single();

    if (existing?.motion_skeleton_json && Object.keys(existing.motion_skeleton_json).length > 0) {
      return new Response(JSON.stringify({
        reference_id,
        ...existing.motion_skeleton_json,
        cached: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rateLimit } = await supabase.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_endpoint: "analyze-reference",
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

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await analyzeVideo(ref.source_video_url);

        const { error: chargeError } = await supabase.rpc("charge_credits", {
          p_user_id: user.id,
          p_cost: ANALYSIS_COST,
          p_reason: "analyze_reference",
        });

        if (chargeError) {
          return new Response(JSON.stringify({ error_code: "INSUFFICIENT_CREDITS" }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabase
          .from("video_references")
          .update({ motion_skeleton_json: result })
          .eq("id", reference_id);

        return new Response(JSON.stringify({
          reference_id,
          ...result,
          cached: false,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");
        console.error(`[analyze-reference] Attempt ${attempt + 1} failed:`, lastError.message);
      }
    }

    return new Response(JSON.stringify({ error_code: "AI_PROVIDER_ERROR" }), {
      status: 502,
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

async function analyzeVideo(videoUrl: string): Promise<Record<string, unknown>> {
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openRouterKey) throw new Error("OPENROUTER_API_KEY not set");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Analyze this video reference and return a JSON structure with:
- "structure": array of scenes with start_sec, end_sec, scene type (hook/transition/cta/body)
- "detected_hooks": array of detected hooks
- "detected_cta": array of detected CTAs
- "tempo": "fast" | "medium" | "slow"
- "notes": any additional observations`,
        },
        {
          role: "user",
          content: `Analyze video: ${videoUrl}`,
        },
      ],
      max_tokens: 1000,
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content ?? "{}";

  return JSON.parse(content);
}
