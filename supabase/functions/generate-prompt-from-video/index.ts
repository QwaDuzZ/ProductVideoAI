// Edge Function: generate-prompt-from-video
// ТЗ §4.2, §5.4, §6.8, §7.2 — Генерация промпта с [PRODUCT_HOLDER] (1 кредит)
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT_COST = 1;
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

    const { data: rateLimit } = await supabase.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_endpoint: "generate-prompt-from-video",
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

    const { error: chargeError } = await supabase.rpc("charge_credits", {
      p_user_id: user.id,
      p_cost: PROMPT_COST,
      p_reason: "generate_prompt_from_video",
    });

    if (chargeError) {
      return new Response(JSON.stringify({ error_code: "INSUFFICIENT_CREDITS" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const prompt = await generatePrompt(ref.source_video_url);

        const moderationResult = await moderatePrompt(supabase, prompt, user.id);
        if (!moderationResult.approved) {
          return new Response(JSON.stringify({
            error_code: "CONTENT_POLICY_VIOLATION",
            user_message: "Материал нарушает контентную политику платформы.",
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({
          reference_id,
          prompt,
          has_product_holder: prompt.includes("[PRODUCT_HOLDER]"),
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");
        console.error(`[generate-prompt] Attempt ${attempt + 1} failed:`, lastError.message);
      }
    }

    await supabase.rpc("refund_project_credits", {
      p_project_id: null,
    });

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

async function generatePrompt(videoUrl: string): Promise<string> {
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
          content: `Generate a video generation prompt based on this reference video. The prompt MUST include [PRODUCT_HOLDER] placeholder where the product image should appear. Format as a single descriptive paragraph suitable for AI video generation.`,
        },
        {
          role: "user",
          content: `Generate prompt for video: ${videoUrl}`,
        },
      ],
      max_tokens: 500,
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);

  const result = await response.json();
  return result.choices?.[0]?.message?.content ?? "";
}

async function moderatePrompt(
  supabase: ReturnType<typeof createClient>,
  prompt: string,
  userId: string,
): Promise<{ approved: boolean }> {
  try {
    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openRouterKey) return { approved: true };

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
            content: `You are a content moderation classifier. Check if this prompt violates any prohibited categories: politics, drugs, sexual content, violence, extremism, gambling, tobacco, alcohol. Respond with JSON: {"approved": true/false, "category": "category_name or null"}`,
          },
          {
            role: "user",
            content: `Moderate prompt: "${prompt}"`,
          },
        ],
        max_tokens: 100,
      }),
    });

    if (!response.ok) return { approved: true };

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content ?? '{"approved": true}';
    const parsed = JSON.parse(content);

    if (!parsed.approved) {
      await supabase.from("moderation_events").insert({
        user_id: userId,
        material_type: "prompt",
        material_ref: prompt.substring(0, 500),
        category: parsed.category,
        model: "openai/gpt-4o-mini",
        decision: "rejected",
      });
    }

    return { approved: parsed.approved };
  } catch {
    return { approved: true };
  }
}
