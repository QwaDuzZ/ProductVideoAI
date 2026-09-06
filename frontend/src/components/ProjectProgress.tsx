import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { StatusPill } from "./StatusPill";

interface ProjectData {
  id: string;
  status: string;
  name: string;
  script_text?: string;
  script_preview_url?: string;
  final_video_url?: string;
  credits_spent: number;
  error_code?: string;
  user_message?: string;
  created_at: string;
}

interface ProjectProgressProps {
  projectId: string;
  onDone: () => void;
}

const PROGRESS_STEPS = [
  { key: "queued", label: "В очереди", progress: 10 },
  { key: "script_ready", label: "Сценарий готов", progress: 25 },
  { key: "generating", label: "Генерация видео", progress: 40 },
  { key: "audio_sync", label: "Синхронизация звука", progress: 70 },
  { key: "assembling", label: "Сборка", progress: 85 },
  { key: "done", label: "Готово", progress: 100 },
];

export function ProjectProgress({ projectId, onDone }: ProjectProgressProps) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const statusRef = useRef<string>("");

  const fetchProject = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (data) {
      setProject(data);
      statusRef.current = data.status;
      setLoading(false);

      if (data.status === "done") {
        setTimeout(onDone, 1500);
      }
    }
  }, [projectId, onDone]);

  useEffect(() => {
    fetchProject();

    const channel = supabase
      .channel(`project:${projectId}`)
      .on(
        "broadcast",
        { event: "project_status_changed" },
        () => fetchProject(),
      )
      .on(
        "broadcast",
        { event: "project_done" },
        () => fetchProject(),
      )
      .on(
        "broadcast",
        { event: "project_failed" },
        () => fetchProject(),
      )
      .subscribe();

    const pollingInterval = setInterval(() => {
      if (statusRef.current !== "done" && statusRef.current !== "failed") {
        fetchProject();
      }
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollingInterval);
    };
  }, [projectId, fetchProject]);

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="text-fog">Загрузка...</div>
      </div>
    );
  }

  const currentStepIndex = PROGRESS_STEPS.findIndex(
    (s) => s.key === project.status,
  );
  const currentStep = currentStepIndex >= 0 ? PROGRESS_STEPS[currentStepIndex] : undefined;

  const currentProgress = currentStep?.progress
    ?? (project.status === "failed" ? 50 : 0);

  const currentLabel = currentStep?.label
    ?? (project.status === "failed" ? "Ошибка" : "Обработка...");

  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      <div className="w-full max-w-lg text-center">
        <div className="mb-8">
          <StatusPill status={project.status} />
        </div>

        {project.status === "failed" ? (
          <div className="space-y-4">
            <div className="text-6xl mb-6">✕</div>
            <h1 className="text-manifest text-snow mb-4">Что-то пошло не так</h1>
            <p className="text-fog text-lg mb-2">
              {project.user_message || "Произошла ошибка при генерации видео"}
            </p>
            {project.error_code && (
              <p className="text-mist font-mono text-sm">{project.error_code}</p>
            )}
            <div className="bg-panel-2 rounded-sm px-4 py-3 text-sm text-fog">
              Кредиты возвращены на баланс
            </div>
            <button onClick={onDone} className="btn-primary mt-4">
              Вернуться к проектам
            </button>
          </div>
        ) : project.status === "done" ? (
          <div className="space-y-4">
            <div className="text-6xl mb-6">🎬</div>
            <h1 className="text-manifest text-snow mb-4">Видео готово!</h1>
            <p className="text-fog text-lg mb-6">
              Ваше видео готово, можно скачивать
            </p>
            {project.final_video_url && (
              <video
                src={project.final_video_url}
                controls
                className="w-full rounded-md border border-edge mb-4"
              />
            )}
            <a
              href={project.final_video_url}
              download
              className="btn-primary inline-block"
            >
              Скачать видео
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            <h1 className="text-manifest text-snow mb-4">{currentLabel}</h1>

            <div className="w-full bg-panel-2 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-magenta via-orange to-yellow transition-all duration-500"
                style={{ width: `${currentProgress}%` }}
              />
            </div>

            <p className="text-fog text-sm">
              {currentProgress}% · Примерно{" "}
              {Math.max(1, Math.round((100 - currentProgress) / 10))} мин
            </p>

            {project.script_text && (
              <div className="text-left bg-panel-2 rounded-sm p-4 mt-4">
                <p className="text-xs text-mist font-mono uppercase tracking-wider mb-2">
                  Сценарий
                </p>
                <p className="text-fog text-sm line-clamp-3">{project.script_text}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
