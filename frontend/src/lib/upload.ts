import { supabase } from "./supabase";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const TARGET_VIDEO_WIDTH = 854;
const TARGET_VIDEO_HEIGHT = 1520;

interface UploadResult {
  url: string;
  path: string;
  size: number;
  duration_ms?: number;
}

export async function uploadImage(file: File): Promise<UploadResult> {
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("Файл слишком большой (макс. 10 МБ)");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Поддерживаются только изображения");
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Необходима авторизация");

  const presignedRes = await supabase.functions.invoke("upload-presigned", {
    body: {
      filename: file.name,
      content_type: file.type,
      target: "product",
    },
  });

  if (presignedRes.error) throw new Error(presignedRes.error.message);

  const { upload_url, storage_path } = presignedRes.data;

  const uploadRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!uploadRes.ok) throw new Error("Ошибка загрузки файла");

  const { data: urlData } = supabase.storage
    .from("public")
    .getPublicUrl(storage_path);

  return {
    url: urlData.publicUrl,
    path: storage_path,
    size: file.size,
  };
}

export async function uploadVideo(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<UploadResult> {
  if (file.size > MAX_VIDEO_SIZE) {
    throw new Error("Файл слишком большой (макс. 100 МБ)");
  }

  if (!file.type.startsWith("video/")) {
    throw new Error("Поддерживаются только видео");
  }

  onProgress?.(0);

  const compressed = await compressVideo(file, onProgress);

  onProgress?.(80);

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Необходима авторизация");

  const presignedRes = await supabase.functions.invoke("upload-presigned", {
    body: {
      filename: compressed.name,
      content_type: compressed.type,
      target: "reference",
    },
  });

  if (presignedRes.error) throw new Error(presignedRes.error.message);

  const { upload_url, storage_path } = presignedRes.data;

  const uploadRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": compressed.type },
    body: compressed,
  });

  if (!uploadRes.ok) throw new Error("Ошибка загрузки файла");

  onProgress?.(95);

  const duration_ms = await getVideoDuration(compressed);

  const { data: urlData } = supabase.storage
    .from("public")
    .getPublicUrl(storage_path);

  onProgress?.(100);

  return {
    url: urlData.publicUrl,
    path: storage_path,
    size: compressed.size,
    duration_ms,
  };
}

async function compressVideo(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);

      if (video.videoWidth <= TARGET_VIDEO_WIDTH && file.size <= 50 * 1024 * 1024) {
        resolve(file);
        return;
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      const scale = Math.min(
        TARGET_VIDEO_WIDTH / video.videoWidth,
        TARGET_VIDEO_HEIGHT / video.videoHeight,
        1,
      );

      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);

      const stream = canvas.captureStream(24);
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
        videoBitsPerSecond: 2_000_000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const compressed = new File(
          [blob],
          file.name.replace(/\.[^.]+$/, ".webm"),
          { type: "video/webm" },
        );
        resolve(compressed);
      };

      recorder.start();

      video.srcObject = stream;
      video.play();

      const duration = video.duration;
      const startTime = Date.now();

      const drawFrame = () => {
        if (video.ended || video.paused) {
          recorder.stop();
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const elapsed = (Date.now() - startTime) / 1000;
        const progress = Math.min(75, (elapsed / duration) * 75);
        onProgress?.(progress);

        requestAnimationFrame(drawFrame);
      };

      requestAnimationFrame(drawFrame);
    };

    video.onerror = () => reject(new Error("Ошибка чтения видео"));
    video.src = URL.createObjectURL(file);
  });
}

async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(Math.round(video.duration * 1000));
    };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  const min = Math.floor(sec / 60);
  const remaining = sec % 60;
  return min > 0 ? `${min} мин ${remaining} сек` : `${sec} сек`;
}
