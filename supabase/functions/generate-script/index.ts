// Edge Function: generate-script
// ТЗ §6.5, §5.5, §6.8 — Генерация сценария LLM + модерация
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCRIPT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

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
      .select("id, user_id, status, product_id, duration_sec, tier, language, use_sentiment_triggers, prompt, prompt_video_ref_url")
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

    if (project.status !== "queued") {
      return new Response(JSON.stringify({ error_code: "INVALID_STATUS" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: product } = await supabase
      .from("products")
      .select("title, description, attributes")
      .eq("id", project.product_id)
      .single();

    let sentimentInsights = null;
    if (project.use_sentiment_triggers) {
      const { data: review } = await supabase
        .from("product_reviews_analysis")
        .select("pains, joys")
        .eq("product_id", project.product_id)
        .single();

      sentimentInsights = review;
    }

    const script = await generateScript({
      productTitle: product?.title ?? "",
      productDescription: product?.description ?? "",
      durationSec: project.duration_sec,
      tier: project.tier,
      language: project.language,
      prompt: project.prompt,
      sentimentInsights,
    });

    const moderationResult = await moderateScript(supabase, script, userId ?? "system");
    if (!moderationResult.approved) {
      await supabase
        .from("projects")
        .update({
          status: "failed",
          error_code: "CONTENT_POLICY_VIOLATION",
        })
        .eq("id", project_id);

      return new Response(JSON.stringify({
        error_code: "CONTENT_POLICY_VIOLATION",
        user_message: "Сценарий нарушает контентную политику платформы.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("projects")
      .update({
        status: "script_ready",
        user_adjustments: JSON.stringify({ script }),
      })
      .eq("id", project_id);

    supabase.functions.invoke("generate-tts", {
      body: { project_id },
      headers: { "x-supabase-service-role": "true" },
    }).catch((err) => console.error("[generate-script] Failed to invoke generate-tts:", err));

    return new Response(JSON.stringify({
      project_id,
      status: "script_ready",
      script,
      timeout_at: new Date(Date.now() + SCRIPT_TIMEOUT_MS).toISOString(),
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

async function generateScript(params: {
  productTitle: string;
  productDescription: string;
  durationSec: number;
  tier: string;
  language: string;
  prompt?: string | null;
  sentimentInsights?: { pains: string[]; joys: string[] } | null;
}): Promise<string> {
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openRouterKey) throw new Error("OPENROUTER_API_KEY not set");

  const languageMap: Record<string, string> = {
    ru: "Russian",
    en: "English",
    de: "German",
    es: "Spanish",
  };

  const sentimentSection = params.sentimentInsights
    ? `\n\nCustomer insights (use ONLY as internal insights, NEVER as aggressive hooks or manipulative phrases):
Pains: ${params.sentimentInsights.pains.join(", ")}
Joy triggers: ${params.sentimentInsights.joys.join(", ")}`
    : "";

  const promptSection = params.prompt
    ? `\n\nUser-provided prompt reference: ${params.prompt}`
    : "";

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
          content: `You are a professional UGC video script writer for product marketing videos.

Write a ${params.durationSec}-second video script in ${languageMap[params.language] ?? "Russian"}.

Product: ${params.productTitle}
Description: ${params.productDescription}
Tier: ${params.tier}${sentimentSection}${promptSection}

Rules:
- The script MUST include [PRODUCT_HOLDER] placeholder where the product image appears
- Script must be exactly ${params.durationSec} seconds when read at natural pace
- Use native, authentic UGC style — NOT aggressive sales language
- NO manipulative phrases like "hurry up", "buy now", "you'll regret"
- Pain points can ONLY be referenced as natural improvement of experience
- Include natural hooks and CTAs that feel organic
- Structure: Hook (0-${Math.min(5, params.durationSec)}s) → Product showcase → Benefits → CTA
- Output ONLY the script text, no timestamps or stage directions`,
        },
      ],
      max_tokens: 1000,
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);

  const result = await response.json();
  return result.choices?.[0]?.message?.content ?? "";
}

async function moderateScript(
  supabase: ReturnType<typeof createClient>,
  script: string,
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
            content: `You are a content moderation classifier. Check if this video script violates any prohibited categories: politics, drugs, sexual content, violence, extremism, gambling, tobacco, alcohol, or contains aggressive/manipulative sales language. Respond with JSON: {"approved": true/false, "category": "category_name or null"}`,
          },
          {
            role: "user",
            content: `Moderate script: "${script}"`,
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
        material_type: "script",
        material_ref: script.substring(0, 500),
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
