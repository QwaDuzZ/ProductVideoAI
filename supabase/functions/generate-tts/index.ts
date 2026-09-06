// Edge Function: generate-tts
// ТЗ §5.6.1 — ElevenLabs TTS: голоса из tts_voices, лимиты, ретраи
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TTS_COST = 2;
const MAX_RETRIES = 2;
const MAX_SPEED_MULTIPLIER = 1.15;
const DURATION_TOLERANCE_SEC = 1;

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
      .select("id, user_id, status, language, duration_sec, audio_mode, user_adjustments")
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

    if (project.status !== "script_ready") {
      return new Response(JSON.stringify({ error_code: "INVALID_STATUS" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (project.audio_mode === "original_donor") {
      return new Response(JSON.stringify({
        project_id,
        status: "skipped",
        reason: "original_donor_mode",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: voice, error: voiceError } = await supabase
      .from("tts_voices")
      .select("voice_id, provider, display_name")
      .eq("language", project.language)
      .eq("is_active", true)
      .single();

    if (voiceError || !voice) {
      await supabase
        .from("projects")
        .update({
          status: "failed",
          error_code: "TTS_VOICE_NOT_FOUND",
        })
        .eq("id", project_id);

      return new Response(JSON.stringify({
        error_code: "TTS_VOICE_NOT_FOUND",
        user_message: "Голос для данного языка не найден.",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adjustments = project.user_adjustments
      ? JSON.parse(project.user_adjustments)
      : {};

    const script = adjustments.script as string | undefined;
    if (!script) {
      return new Response(JSON.stringify({ error_code: "NO_SCRIPT" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: chargeError } = await supabase.rpc("charge_credits", {
      p_user_id: project.user_id,
      p_cost: TTS_COST,
      p_reason: "tts_generation",
      p_project_id: project_id,
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
        const audioBuffer = await generateTTS(voice.voice_id, script);

        const audioUrl = await uploadAudio(supabase, project_id, audioBuffer);

        const ttsDurationMs = await measureAudioDuration(audioBuffer);
        const videoDurationMs = project.duration_sec * 1000;
        const diffSec = Math.abs(ttsDurationMs - videoDurationMs) / 1000;

        let finalAudioUrl = audioUrl;

        if (diffSec > DURATION_TOLERANCE_SEC) {
          const speedMultiplier = Math.min(
            videoDurationMs / ttsDurationMs,
            MAX_SPEED_MULTIPLIER,
          );

          if (speedMultiplier < 1) {
            finalAudioUrl = await adjustAudioSpeed(supabase, project_id, audioUrl, speedMultiplier);
          }
        }

        await supabase
          .from("projects")
          .update({ status: "audio_sync" })
          .eq("id", project_id);

        supabase.functions.invoke("generate-video", {
          body: { project_id },
          headers: { "x-supabase-service-role": "true" },
        }).catch((err) => console.error("[generate-tts] Failed to invoke generate-video:", err));

        return new Response(JSON.stringify({
          project_id,
          status: "tts_done",
          audio_url: finalAudioUrl,
          duration_ms: ttsDurationMs,
          voice: voice.display_name,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");
        console.error(`[generate-tts] Attempt ${attempt + 1} failed:`, lastError.message);
      }
    }

    await supabase.rpc("refund_project_credits", {
      p_project_id: project_id,
    });

    await supabase
      .from("projects")
      .update({
        status: "failed",
        error_code: "TTS_FAILED",
      })
      .eq("id", project_id);

    return new Response(JSON.stringify({
      error_code: "TTS_FAILED",
      user_message: "Не удалось сгенерировать озвучку. Кредиты возвращены.",
    }), {
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

async function generateTTS(voiceId: string, text: string): Promise<ArrayBuffer> {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs error: ${response.status}`);
  }

  return response.arrayBuffer();
}

async function uploadAudio(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  audioBuffer: ArrayBuffer,
): Promise<string> {
  const path = `voiceover/${projectId}/voiceover.mp3`;

  await supabase.storage
    .from("specials")
    .upload(path, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  await supabase.from("storage_assets").insert({
    project_id: projectId,
    bucket_id: "specials",
    object_name: path,
    purpose: "voiceover",
  });

  const { data } = supabase.storage
    .from("specials")
    .getPublicUrl(path);

  return data.publicUrl;
}

async function measureAudioDuration(audioBuffer: ArrayBuffer): Promise<number> {
  const header = new Uint8Array(audioBuffer.slice(0, 12));

  if (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0) {
    return estimateMp3Duration(audioBuffer);
  }

  return 30000;
}

function estimateMp3Duration(buffer: ArrayBuffer): number {
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  while (offset < bytes.length - 4) {
    if (bytes[offset] === 0xFF && (bytes[offset + 1] & 0xE0) === 0xE0) {
      const version = (bytes[offset + 1] >> 3) & 0x03;
      const layer = (bytes[offset + 1] >> 1) & 0x03;
      const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0F;

      if (version === 0 || layer === 0) {
        offset++;
        continue;
      }

      const bitrateTable: Record<number, number[]> = {
        3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
        2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
      };

      const versionKey = version === 3 ? 3 : 2;
      const kbps = bitrateTable[versionKey]?.[bitrateIndex] ?? 128;
      const bytesPerSecond = (kbps * 1000) / 8;

      return Math.round((buffer.byteLength / bytesPerSecond) * 1000);
    }
    offset++;
  }

  return 30000;
}

async function adjustAudioSpeed(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  audioUrl: string,
  speedMultiplier: number,
): Promise<string> {
  if (speedMultiplier === 1.0) return audioUrl;

  const response = await fetch(audioUrl);
  const buffer = await response.arrayBuffer();

  const adjustedBuffer = adjustMp3Speed(buffer, speedMultiplier);

  const path = `audio/${projectId}/adjusted_${Date.now()}.mp3`;
  await supabase.storage
    .from("specials")
    .upload(path, adjustedBuffer, { contentType: "audio/mpeg" });

  const { data } = supabase.storage
    .from("specials")
    .getPublicUrl(path);

  return data.publicUrl;
}

function adjustMp3Speed(buffer: ArrayBuffer, speedMultiplier: number): ArrayBuffer {
  const src = new Uint8Array(buffer);
  const dst = new Uint8Array(Math.ceil(src.byteLength / speedMultiplier));
  let srcOffset = 0;
  let dstOffset = 0;

  while (srcOffset < src.byteLength - 4 && dstOffset < dst.byteLength - 4) {
    if (src[srcOffset] === 0xFF && (src[srcOffset + 1] & 0xE0) === 0xE0) {
      const frameSize = getMp3FrameSize(src, srcOffset);
      if (frameSize <= 0) break;

      const bytesToCopy = Math.min(frameSize, dst.byteLength - dstOffset);
      dst.set(src.slice(srcOffset, srcOffset + bytesToCopy), dstOffset);
      dstOffset += bytesToCopy;
      srcOffset += Math.round(frameSize * speedMultiplier);
    } else {
      srcOffset++;
    }
  }

  return dst.buffer.slice(0, dstOffset);
}

function getMp3FrameSize(bytes: Uint8Array, offset: number): number {
  const version = (bytes[offset + 1] >> 3) & 0x03;
  const layer = (bytes[offset + 1] >> 1) & 0x03;
  const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0F;
  const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
  const padding = (bytes[offset + 2] >> 1) & 0x01;

  if (version === 0 || layer === 0 || bitrateIndex === 0 || sampleRateIndex === 3) return -1;

  const bitrateTable: Record<number, number[]> = {
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  };
  const sampleRates: Record<number, number[]> = {
    3: [11025, 12000, 8000],
    2: [22050, 24000, 16000],
    0: [44100, 48000, 32000],
  };

  const versionKey = version === 3 ? 3 : version === 2 ? 2 : 0;
  const kbps = bitrateTable[versionKey]?.[bitrateIndex] ?? 128;
  const sampleRate = sampleRates[versionKey]?.[sampleRateIndex] ?? 44100;

  return Math.floor((144 * kbps * 1000) / sampleRate) + padding;
}
