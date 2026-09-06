// Edge Function: create-payment
// ТЗ §4.2, §7.3, §7.7 — Создание платежа, серверная фиксация сумм
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PACKAGES: Record<string, { amount: number; currency: string; credits: number }> = {
  "starter_ru": { amount: 2900, currency: "RUB", credits: 300 },
  "growth_ru": { amount: 6900, currency: "RUB", credits: 750 },
  "starter_us": { amount: 29, currency: "USD", credits: 300 },
  "growth_us": { amount: 79, currency: "USD", credits: 850 },
  "basic_eu": { amount: 29, currency: "EUR", credits: 300 },
  "pro_eu": { amount: 79, currency: "EUR", credits: 850 },
  "starter_la": { amount: 19, currency: "USD", credits: 200 },
  "growth_la": { amount: 49, currency: "USD", credits: 550 },
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
    const { package_id, gateway } = body;

    if (!package_id || !gateway) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pkg = PACKAGES[package_id];
    if (!pkg) {
      return new Response(JSON.stringify({ error_code: "PACKAGE_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await supabase
      .from("payments")
      .select("id, gateway_payment_id, status")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .single();

    if (existing) {
      return new Response(JSON.stringify({
        payment_id: existing.id,
        gateway_payment_id: existing.gateway_payment_id,
        checkout_url: `https://checkout.example.com/${existing.gateway_payment_id}`,
        amount: pkg.amount,
        currency: pkg.currency,
        credits_awarded: pkg.credits,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gatewayPaymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        user_id: user.id,
        gateway_payment_id: gatewayPaymentId,
        payment_gateway: gateway,
        amount: pkg.amount,
        currency: pkg.currency,
        credits_awarded: pkg.credits,
        status: "pending",
      })
      .select("id")
      .single();

    if (paymentError) throw paymentError;

    const checkoutUrl = `https://checkout.example.com/${gatewayPaymentId}`;

    return new Response(JSON.stringify({
      payment_id: payment.id,
      gateway_payment_id: gatewayPaymentId,
      checkout_url: checkoutUrl,
      amount: pkg.amount,
      currency: pkg.currency,
      credits_awarded: pkg.credits,
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
