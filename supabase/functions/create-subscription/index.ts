// Edge Function: create-subscription (Фаза 1)
// ТЗ §4.2, §7.3 — Создание подписки, серверная фиксация сумм
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLANS: Record<string, { amount: number; currency: string; credits: number }> = {
  starter: { amount: 2900, currency: "RUB", credits: 300 },
  growth: { amount: 6900, currency: "RUB", credits: 750 },
  basic: { amount: 29, currency: "EUR", credits: 300 },
  pro: { amount: 79, currency: "EUR", credits: 850 },
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
    const { plan_tier, gateway } = body;

    if (!plan_tier || !gateway) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const plan = PLANS[plan_tier];
    if (!plan) {
      return new Response(JSON.stringify({ error_code: "INVALID_PLAN" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: activeSub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["trialing", "active"])
      .single();

    if (activeSub) {
      return new Response(JSON.stringify({ error_code: "ACTIVE_SUBSCRIPTION_EXISTS" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const externalSubId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .insert({
        user_id: user.id,
        gateway_name: gateway,
        external_sub_id: externalSubId,
        plan_tier,
        status: "trialing",
        credits_allowance: plan.credits,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (subError) throw subError;

    const checkoutUrl = `https://checkout.example.com/${externalSubId}`;

    return new Response(JSON.stringify({
      subscription_id: subscription.id,
      checkout_url: checkoutUrl,
      plan_tier,
      credits_allowance: plan.credits,
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
