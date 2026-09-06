import pg from "pg";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";

const execAsync = promisify(exec);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: false },
});

interface MediaTask {
  id: string;
  project_id: string;
  task_type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
}

const MAX_TASKS = parseInt(process.env.MAX_TASKS_PER_RUN ?? "3", 10);
const MAX_RUN_SECONDS = parseInt(process.env.MAX_RUN_SECONDS ?? "270", 10);
const INTERNAL_EDGE_URL = process.env.INTERNAL_EDGE_URL;
const INTERNAL_EDGE_TOKEN = process.env.INTERNAL_EDGE_TOKEN;
const TEMP_DIR = process.env.TEMP_DIR ?? "/tmp/pvai";

async function recoverStuckTasks(client: pg.PoolClient): Promise<void> {
  await client.query(`
    UPDATE media_tasks
    SET status = 'pending',
        error_message = 'worker_timeout_recovery',
        updated_at = NOW()
    WHERE status = 'processing'
      AND updated_at < NOW() - INTERVAL '30 minutes'
      AND attempts < 3;
  `);

  await client.query(`
    UPDATE media_tasks
    SET status = 'failed',
        error_message = 'worker_timeout_exhausted',
        updated_at = NOW()
    WHERE status = 'processing'
      AND updated_at < NOW() - INTERVAL '30 minutes'
      AND attempts >= 3;
  `);
}

async function claimTasks(client: pg.PoolClient): Promise<MediaTask[]> {
  const result = await client.query<MediaTask>(
    `
    WITH candidate AS (
      SELECT id
      FROM media_tasks
      WHERE status = 'pending'
        AND attempts < 3
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE media_tasks t
    SET status = 'processing',
        updated_at = NOW()
    FROM candidate c
    WHERE t.id = c.id
    RETURNING t.*;
    `,
    [MAX_TASKS],
  );

  return result.rows;
}

async function processTask(task: MediaTask): Promise<string> {
  const tempDir = join(TEMP_DIR, task.project_id);
  await mkdir(tempDir, { recursive: true });

  console.log(`[worker] Processing task ${task.id} (${task.task_type}) in ${tempDir}`);

  switch (task.task_type) {
    case "audio_mix":
      return processAudioMix(task, tempDir);
    case "extract_audio":
      return processExtractAudio(task, tempDir);
    case "merge_audio":
      return processMergeAudio(task, tempDir);
    case "outro":
      return processOutro(task, tempDir);
    case "stitch":
      return processStitch(task, tempDir);
    case "stabilize_chunk":
      return processStabilizeChunk(task, tempDir);
    default:
      throw new Error(`Unknown task_type: ${task.task_type}`);
  }
}

async function processAudioMix(task: MediaTask, tempDir: string): Promise<string> {
  const payload = task.payload as {
    video_url: string;
    voiceover_url?: string;
    music_url?: string;
    sfx_url?: string;
    output_path: string;
  };

  const videoPath = join(tempDir, "input_video.mp4");
  const outputPath = join(tempDir, "output_audio_mix.mp4");

  await downloadFile(payload.video_url, videoPath);

  const inputs = ["-i", videoPath];
  const filterParts: string[] = [];
  const mixLabels: string[] = [];
  let audioIdx = 1;

  if (payload.voiceover_url) {
    const voiceoverPath = join(tempDir, "voiceover.mp3");
    await downloadFile(payload.voiceover_url, voiceoverPath);
    inputs.push("-i", voiceoverPath);
    filterParts.push(`[${audioIdx}:a]volume=1.0[voiceover]`);
    mixLabels.push("[voiceover]");
    audioIdx++;
  }

  if (payload.music_url) {
    const musicPath = join(tempDir, "music.mp3");
    await downloadFile(payload.music_url, musicPath);
    inputs.push("-i", musicPath);
    filterParts.push(`[${audioIdx}:a]volume=0.15[music]`);
    mixLabels.push("[music]");
    audioIdx++;
  }

  if (payload.sfx_url) {
    const sfxPath = join(tempDir, "sfx.mp3");
    await downloadFile(payload.sfx_url, sfxPath);
    inputs.push("-i", sfxPath);
    filterParts.push(`[${audioIdx}:a]volume=0.35[sfx]`);
    mixLabels.push("[sfx]");
    audioIdx++;
  }

  let ffmpegCmd = `ffmpeg -y ${inputs.join(" ")}`;

  if (filterParts.length > 0) {
    const mixInputs = mixLabels.join("");
    filterParts.push(`${mixInputs}amix=inputs=${filterParts.length}:duration=first[out]`);
    ffmpegCmd += ` -filter_complex "${filterParts.join(";")}" -map "[out]"`;
  }

  ffmpegCmd += ` -c:v copy -c:a aac -b:a 192k "${outputPath}"`;

  await execAsync(ffmpegCmd, { timeout: 120000 });

  await validateMediaFile(outputPath, undefined, 1080, 1920);

  return outputPath;
}

async function processExtractAudio(task: MediaTask, tempDir: string): Promise<string> {
  const payload = task.payload as {
    donor_video_url: string;
    donor_duration_ms: number;
    output_path: string;
  };

  const videoPath = join(tempDir, "donor.mp4");
  const outputPath = join(tempDir, "extracted_audio.m4a");

  await downloadFile(payload.donor_video_url, videoPath);

  const durationResult = await execAsync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
  );

  const measuredDurationMs = Math.round(parseFloat(durationResult.stdout.trim()) * 1000);
  const durationExceeded = measuredDurationMs > 60000;

  if (!durationExceeded) {
    await execAsync(
      `ffmpeg -y -i "${videoPath}" -vn -acodec copy "${outputPath}"`,
      { timeout: 60000 },
    );
  }

  const resultPayload = {
    ...payload,
    measured_duration_ms: measuredDurationMs,
    duration_exceeded: durationExceeded,
  };

  await writeFile(
    join(tempDir, "result_payload.json"),
    JSON.stringify(resultPayload),
  );

  return durationExceeded ? "exceeded" : outputPath;
}

async function processMergeAudio(task: MediaTask, tempDir: string): Promise<string> {
  const payload = task.payload as {
    silent_video_url: string;
    audio_url: string;
    target_duration_ms: number;
    output_path: string;
  };

  const videoPath = join(tempDir, "silent_video.mp4");
  const audioPath = join(tempDir, "original_audio.m4a");
  const outputPath = join(tempDir, "merged.mp4");

  await downloadFile(payload.silent_video_url, videoPath);
  await downloadFile(payload.audio_url, audioPath);

  const targetDurationSec = payload.target_duration_ms / 1000;

  await execAsync(
    `ffmpeg -y -i "${videoPath}" -i "${audioPath}" ` +
    `-map 0:v -map 1:a ` +
    `-c:v copy -c:a aac ` +
    `-t ${targetDurationSec} ` +
    `"${outputPath}"`,
    { timeout: 120000 },
  );

  await validateMediaFile(outputPath, payload.target_duration_ms);

  return outputPath;
}

async function processOutro(task: MediaTask, tempDir: string): Promise<string> {
  const payload = task.payload as {
    video_url: string;
    master_audio_duration_ms: number;
    mode: "fade" | "loop";
    output_path: string;
  };

  const videoPath = join(tempDir, "input_outro.mp4");
  const outputPath = join(tempDir, "output_outro.mp4");

  await downloadFile(payload.video_url, videoPath);

  const targetDurationSec = payload.master_audio_duration_ms / 1000;

  if (payload.mode === "fade") {
    const fadeStart = Math.max(0, targetDurationSec - 1);
    await execAsync(
      `ffmpeg -y -i "${videoPath}" ` +
      `-t ${targetDurationSec} ` +
      `-vf "fade=t=out:st=${fadeStart}:d=1" ` +
      `-af "afade=t=out:st=${fadeStart}:d=1" ` +
      `-c:v libx264 -c:a aac ` +
      `"${outputPath}"`,
      { timeout: 120000 },
    );
  } else {
    await execAsync(
      `ffmpeg -y -i "${videoPath}" ` +
      `-t ${targetDurationSec} ` +
      `-c:v copy -c:a copy ` +
      `"${outputPath}"`,
      { timeout: 120000 },
    );
  }

  await validateMediaFile(outputPath, payload.master_audio_duration_ms, 1080, 1920);

  return outputPath;
}

async function processStitch(task: MediaTask, tempDir: string): Promise<string> {
  const payload = task.payload as {
    segment_urls: string[];
    output_path: string;
  };

  const outputPath = join(tempDir, "stitched.mp4");
  const concatFile = join(tempDir, "concat.txt");

  const segmentPaths: string[] = [];
  for (let i = 0; i < payload.segment_urls.length; i++) {
    const segPath = join(tempDir, `seg_${i}.mp4`);
    await downloadFile(payload.segment_urls[i], segPath);
    segmentPaths.push(segPath);
  }

  const concatContent = segmentPaths.map((p) => `file '${p}'`).join("\n");
  await writeFile(concatFile, concatContent);

  await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${outputPath}"`,
    { timeout: 120000 },
  );

  return outputPath;
}

async function processStabilizeChunk(task: MediaTask, tempDir: string): Promise<string> {
  const payload = task.payload as {
    raw_chunk_url: string;
    target_duration_ms: number;
    output_path: string;
  };

  const videoPath = join(tempDir, "raw_chunk.mp4");
  const outputPath = join(tempDir, "stabilized.mp4");

  await downloadFile(payload.raw_chunk_url, videoPath);

  const targetDurationSec = payload.target_duration_ms / 1000;

  await execAsync(
    `ffmpeg -y -i "${videoPath}" ` +
    `-t ${targetDurationSec} ` +
    `-vf "scale=854:480" ` +
    `-c:v libx264 -preset fast -crf 23 ` +
    `-c:a aac -b:a 128k ` +
    `"${outputPath}"`,
    { timeout: 120000 },
  );

  return outputPath;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destPath, buffer);
}

interface MediaInfo {
  duration: number;
  size: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width?: number;
  height?: number;
  codec?: string;
}

async function validateMediaFile(
  filePath: string,
  expectedDurationMs?: number,
  expectedWidth?: number,
  expectedHeight?: number,
): Promise<MediaInfo> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate -of json "${filePath}"`,
    { timeout: 30000 },
  );

  const probe = JSON.parse(stdout);
  const format = probe.format ?? {};
  const streams = probe.streams ?? [];

  const duration = parseFloat(format.duration ?? "0") * 1000;
  const size = parseInt(format.size ?? "0");
  const hasVideo = streams.some((s: Record<string, string>) => s.codec_type === "video");
  const hasAudio = streams.some((s: Record<string, string>) => s.codec_type === "audio");

  const videoStream = streams.find((s: Record<string, string>) => s.codec_type === "video");
  const width = videoStream?.width ? parseInt(videoStream.width) : undefined;
  const height = videoStream?.height ? parseInt(videoStream.height) : undefined;
  const codec = videoStream?.codec_name;

  if (!hasVideo) {
    throw new Error("MEDIA_VALIDATION_FAILED: No video stream found");
  }

  if (expectedDurationMs && expectedDurationMs > 0) {
    const tolerance = expectedDurationMs * 0.05;
    if (Math.abs(duration - expectedDurationMs) > tolerance) {
      throw new Error(
        `MEDIA_VALIDATION_FAILED: Duration ${duration}ms differs from expected ${expectedDurationMs}ms (tolerance ±${tolerance}ms)`,
      );
    }
  }

  if (expectedWidth && width && width !== expectedWidth) {
    throw new Error(
      `MEDIA_VALIDATION_FAILED: Width ${width} differs from expected ${expectedWidth}`,
    );
  }

  if (expectedHeight && height && height !== expectedHeight) {
    throw new Error(
      `MEDIA_VALIDATION_FAILED: Height ${height} differs from expected ${expectedHeight}`,
    );
  }

  return { duration, size, hasVideo, hasAudio, width, height, codec };
}

async function markDone(client: pg.PoolClient, taskId: string, resultUrl: string): Promise<void> {
  await client.query(
    `
    UPDATE media_tasks
    SET status = 'done',
        result_url = $1,
        updated_at = NOW()
    WHERE id = $2;
    `,
    [resultUrl, taskId],
  );
}

async function markError(client: pg.PoolClient, taskId: string, errorMessage: string): Promise<void> {
  await client.query(
    `
    UPDATE media_tasks
    SET status = CASE
        WHEN attempts + 1 >= 3 THEN 'failed'
        ELSE 'pending'
      END,
      attempts = attempts + 1,
      error_message = $1,
      updated_at = NOW()
    WHERE id = $2
    RETURNING attempts;
    `,
    [errorMessage, taskId],
  );
}

async function notifyInternalMediaCompleted(
  taskId: string,
  projectId: string,
  taskType: string,
  status: "done" | "failed",
): Promise<void> {
  if (!INTERNAL_EDGE_URL || !INTERNAL_EDGE_TOKEN) {
    console.error("[worker] INTERNAL_EDGE_URL or INTERNAL_EDGE_TOKEN not set");
    return;
  }

  try {
    const response = await fetch(`${INTERNAL_EDGE_URL}/internal-media-completed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": INTERNAL_EDGE_TOKEN,
      },
      body: JSON.stringify({
        media_task_id: taskId,
        project_id: projectId,
        task_type: taskType,
        status,
      }),
    });

    if (!response.ok) {
      console.error(`[worker] internal-media-completed failed: ${response.status}`);
    }
  } catch (error) {
    console.error("[worker] Failed to notify internal-media-completed:", error);
  }
}

const runStart = Date.now();

function isTimedOut(): boolean {
  return (Date.now() - runStart) / 1000 > MAX_RUN_SECONDS;
}

async function main(): Promise<void> {
  console.log(`[worker] Starting run (max ${MAX_RUN_SECONDS}s, max ${MAX_TASKS} tasks)`);

  const client = await pool.connect();

  try {
    await recoverStuckTasks(client);

    const tasks = await claimTasks(client);

    if (tasks.length === 0) {
      console.log("[worker] No pending tasks");
      return;
    }

    console.log(`[worker] Claimed ${tasks.length} tasks`);

    for (const task of tasks) {
      if (isTimedOut()) {
        console.log("[worker] Time limit reached, stopping");
        break;
      }

      try {
        const resultUrl = await processTask(task);
        await markDone(client, task.id, resultUrl);
        await notifyInternalMediaCompleted(task.id, task.project_id, task.task_type, "done");
        console.log(`[worker] Task ${task.id} completed`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "unknown error";
        console.error(`[worker] Task ${task.id} failed: ${errorMessage}`);
        await markError(client, task.id, errorMessage);
        await notifyInternalMediaCompleted(task.id, task.project_id, task.task_type, "failed");
      } finally {
        const taskDir = join(TEMP_DIR, task.project_id);
        await rm(taskDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`[worker] Run completed in ${((Date.now() - runStart) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error("[worker] Fatal error:", error);
  process.exit(1);
});
