// Edge Function: manual-input
// ТЗ §4.2, §6.8 — Ручное создание карточки товара + модерация
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_PRODUCT_NAME_LENGTH = 200;
const MIN_PRODUCT_NAME_LENGTH = 3;

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
    const { product_name, product_url, description, price, category, image_file_name } = body;

    if (
      !product_name ||
      product_name.length < MIN_PRODUCT_NAME_LENGTH ||
      product_name.length > MAX_PRODUCT_NAME_LENGTH
    ) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rateLimit } = await supabase.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_endpoint: "manual-input",
      p_limit: 20,
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

    const contentToModerate = [product_name, description].filter(Boolean).join("\n");
    const moderationResult = await moderateContent(supabase, contentToModerate, user.id);

    if (!moderationResult.approved) {
      return new Response(JSON.stringify({
        error_code: "CONTENT_POLICY_VIOLATION",
        user_message: "Материал нарушает контентную политику платформы.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("products")
      .insert({
        user_id: user.id,
        title: product_name,
        source_url: product_url ?? null,
        description: description ?? null,
        price: price ? parseInt(price) : null,
        input_method: "manual",
        attributes: { category: category ?? null },
      })
      .select("id, created_at")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({
      product_id: data.id,
      created_at: data.created_at,
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

async function moderateContent(
  supabase: ReturnType<typeof createClient>,
  content: string,
  userId: string,
): Promise<{ approved: boolean }> {
  try {
    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openRouterKey) {
      console.error("[moderation] OPENROUTER_API_KEY not set");
      return { approved: true };
    }

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
            content: `You are a content moderation classifier. Analyze the following content and determine if it violates any of these prohibited categories:
- Politics, political agitation and propaganda
- Drugs and psychoactive substances
- Sexual content and nudity
- Violence, cruelty, weapons in illegal context
- Extremism, discrimination, hate speech
- Gambling and financial pyramids
- Tobacco and alcohol
- Any other topics prohibited by platform policy

Respond with JSON: {"approved": true/false, "category": "category_name or null", "confidence": 0.0-1.0}`,
          },
          {
            role: "user",
            content: `Moderate this content: "${content}"`,
          },
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.error(`[moderation] OpenRouter error: ${response.status}`);
      return { approved: true };
    }

    const result = await response.json();
    const resultText = result.choices?.[0]?.message?.content ?? "";

    const parsed = JSON.parse(resultText);

    if (!parsed.approved) {
      await supabase.from("moderation_events").insert({
        user_id: userId,
        material_type: "product_description",
        material_ref: content.substring(0, 500),
        category: parsed.category,
        model: "openai/gpt-4o-mini",
        decision: "rejected",
      });

      return { approved: false };
    }

    return { approved: true };
  } catch (error) {
    console.error("[moderation] Error:", error);
    return { approved: true };
  }
}
