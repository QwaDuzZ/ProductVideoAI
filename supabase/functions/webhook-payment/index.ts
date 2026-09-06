// Edge Function: webhook-payment-:gateway
// ТЗ §4.2, §7.7, §9.3 — Приём платёжных вебхуков
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

    const url = new URL(req.url);
    const gateway = url.pathname.split("/").pop();

    if (!gateway || !["prodamus", "payselection", "lavatop", "cryptocloud"].includes(gateway)) {
      return new Response(JSON.stringify({ error_code: "INVALID_GATEWAY" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const rawPayload = JSON.stringify(body);

    const eventId = extractEventId(body, gateway);
    if (!eventId) {
      return new Response(JSON.stringify({ error_code: "MALFORMED_PAYLOAD" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signatureValid = await verifySignature(body, gateway, req.headers);
    if (!signatureValid) {
      return new Response(JSON.stringify({ error_code: "INVALID_SIGNATURE" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingEvent } = await supabase
      .from("payments")
      .select("id, status")
      .eq("event_id", eventId)
      .single();

    if (existingEvent) {
      return new Response(JSON.stringify({
        received: true,
        event_id: eventId,
        processed: false,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentData = extractPaymentData(body, gateway);
    if (!paymentData) {
      return new Response(JSON.stringify({ error_code: "MALFORMED_PAYLOAD" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: payment } = await supabase
      .from("payments")
      .select("id, user_id, amount, currency, credits_awarded, status")
      .eq("gateway_payment_id", paymentData.gateway_payment_id)
      .single();

    if (!payment) {
      console.error(`[webhook] Payment not found: ${paymentData.gateway_payment_id}`);
      return new Response(JSON.stringify({ error_code: "PAYMENT_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payment.amount !== paymentData.amount || payment.currency !== paymentData.currency) {
      await supabase
        .from("payments")
        .update({
          status: "failed",
          raw_payload: body,
          signature_verified: true,
        })
        .eq("id", payment.id);

      console.error(`[webhook] Amount mismatch: expected ${payment.amount} ${payment.currency}, got ${paymentData.amount} ${paymentData.currency}`);
      return new Response(JSON.stringify({ error_code: "AMOUNT_MISMATCH" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payment.status === "succeeded") {
      return new Response(JSON.stringify({
        received: true,
        event_id: eventId,
        processed: false,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (paymentData.status === "succeeded") {
      await supabase
        .from("payments")
        .update({
          status: "succeeded",
          event_id: eventId,
          raw_payload: body,
          signature_verified: true,
          processed_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      await supabase.rpc("charge_credits", {
        p_user_id: payment.user_id,
        p_amount: payment.credits_awarded,
        p_reason: "payment",
        p_project_id: null,
      });
    } else if (paymentData.status === "refunded") {
      await supabase
        .from("payments")
        .update({
          status: "refunded",
          event_id: eventId,
          raw_payload: body,
          signature_verified: true,
          processed_at: new Date().toISOString(),
          refund_reason: paymentData.refund_reason ?? "webhook_refund",
        })
        .eq("id", payment.id);

      await supabase.rpc("refund_project_credits", {
        p_project_id: null,
      });
    }

    return new Response(JSON.stringify({
      received: true,
      event_id: eventId,
      processed: true,
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

function extractEventId(body: Record<string, unknown>, gateway: string): string | null {
  switch (gateway) {
    case "prodamus":
      return (body.OrderId as string) ?? null;
    case "payselection":
      return (body.event_id as string) ?? (body.id as string) ?? null;
    case "lavatop":
      return (body.event_id as string) ?? (body.id as string) ?? null;
    case "cryptocloud":
      return (body.event_id as string) ?? (body.invoice_id as string) ?? null;
    default:
      return null;
  }
}

function extractPaymentData(
  body: Record<string, unknown>,
  gateway: string,
): { gateway_payment_id: string; amount: number; currency: string; status: string; refund_reason?: string } | null {
  try {
    switch (gateway) {
      case "prodamus":
        return {
          gateway_payment_id: String(body.OrderId),
          amount: Number(body.Sum),
          currency: "RUB",
          status: body.Status === "paid" ? "succeeded" : body.Status === "refunded" ? "refunded" : "pending",
        };
      case "payselection":
        return {
          gateway_payment_id: String(body.payment_id ?? body.id),
          amount: Number(body.amount),
          currency: String(body.currency ?? "RUB"),
          status: body.status === "succeeded" ? "succeeded" : body.status === "refunded" ? "refunded" : "pending",
          refund_reason: body.refund_reason as string,
        };
      case "lavatop":
        return {
          gateway_payment_id: String(body.payment_id ?? body.id),
          amount: Number(body.amount),
          currency: String(body.currency ?? "USD"),
          status: body.status === "paid" ? "succeeded" : body.status === "refunded" ? "refunded" : "pending",
          refund_reason: body.refund_reason as string,
        };
      case "cryptocloud":
        return {
          gateway_payment_id: String(body.invoice_id ?? body.id),
          amount: Number(body.amount),
          currency: String(body.currency ?? "USD"),
          status: body.status === "paid" ? "succeeded" : body.status === "refunded" ? "refunded" : "pending",
          refund_reason: body.refund_reason as string,
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function verifySignature(
  body: Record<string, unknown>,
  gateway: string,
  headers: Headers,
): Promise<boolean> {
  try {
    switch (gateway) {
      case "prodamus": {
        const sign = headers.get("x-prodamus-signature");
        if (!sign) return false;
        const apiKey = Deno.env.get("PRODAMUS_API_KEY");
        if (!apiKey) return false;
        const expectedSign = await hmacSha256(apiKey, JSON.stringify(body));
        return sign === expectedSign;
      }
      case "payselection": {
        const sign = headers.get("x-payselection-signature");
        if (!sign) return false;
        const apiKey = Deno.env.get("PAY_SELECTION_API_KEY");
        if (!apiKey) return false;
        const expectedSign = await hmacSha256(apiKey, JSON.stringify(body));
        return sign === expectedSign;
      }
      case "lavatop": {
        const sign = headers.get("x-lavatop-signature");
        if (!sign) return false;
        const apiKey = Deno.env.get("LAVATOP_API_KEY");
        if (!apiKey) return false;
        const expectedSign = await hmacSha256(apiKey, JSON.stringify(body));
        return sign === expectedSign;
      }
      case "cryptocloud": {
        const sign = headers.get("x-cryptocloud-signature");
        if (!sign) return false;
        const apiKey = Deno.env.get("CRYPTOCLOUD_API_KEY");
        if (!apiKey) return false;
        const expectedSign = await hmacSha256(apiKey, JSON.stringify(body));
        return sign === expectedSign;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
