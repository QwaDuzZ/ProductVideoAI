// Edge Function: upload-presigned
// ТЗ §4.2, §3.4 — Выдача Presigned URL + регистрация в storage_assets
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FILE_SIZES: Record<string, number> = {
  references: 157_286_400, // 150 MB
  products: 10_485_760, // 10 MB
  prompt_refs: 157_286_400, // 150 MB
};

const ALLOWED_CONTENT_TYPES: Record<string, string[]> = {
  references: ["video/mp4", "video/quicktime", "video/webm"],
  products: ["image/jpeg", "image/png", "image/webp"],
  prompt_refs: ["video/mp4", "video/quicktime", "video/webm"],
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
    const { file_name, content_type, size_bytes, target } = body;

    if (!file_name || !content_type || !target) {
      return new Response(JSON.stringify({ error_code: "VALIDATION_ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowedTargets = ["references", "products", "prompt_refs"];
    if (!allowedTargets.includes(target)) {
      return new Response(JSON.stringify({ error_code: "INVALID_TARGET" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowedTypes = ALLOWED_CONTENT_TYPES[target];
    if (!allowedTypes.includes(content_type)) {
      return new Response(JSON.stringify({ error_code: "INVALID_CONTENT_TYPE" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const maxSize = MAX_FILE_SIZES[target];
    if (size_bytes && size_bytes > maxSize) {
      return new Response(JSON.stringify({ error_code: "FILE_TOO_LARGE" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rateLimit } = await supabase.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_endpoint: "upload-presigned",
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

    const bucket = target === "references" ? "uploads" : "specials";
    const objectPath = `${target}/${user.id}/${Date.now()}_${file_name}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(objectPath, { upsert: false });

    if (error) throw error;

    const purposeMap: Record<string, string> = {
      references: "reference_upload",
      products: "product_image",
      prompt_refs: "prompt_ref_upload",
    };

    await supabase.from("storage_assets").insert({
      bucket_id: bucket,
      object_name: objectPath,
      purpose: purposeMap[target],
    });

    return new Response(JSON.stringify({
      signed_url: data.signedUrl,
      token: data.path,
      ttl_sec: 900,
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
