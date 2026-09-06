
interface StatusPillProps {
  status: string;
  label?: string;
}

const STATUS_CONFIG: Record<string, { className: string; dot: string }> = {
  draft: { className: "status-pending", dot: "bg-fog" },
  queued: { className: "status-queued", dot: "bg-queue" },
  script_ready: { className: "bg-yellow/10 text-yellow", dot: "bg-yellow" },
  generating: { className: "status-processing", dot: "bg-magenta animate-pulse" },
  audio_sync: { className: "status-processing", dot: "bg-magenta animate-pulse" },
  assembling: { className: "status-processing", dot: "bg-magenta animate-pulse" },
  done: { className: "status-done", dot: "bg-success" },
  failed: { className: "status-failed", dot: "bg-danger" },
  canceled: { className: "bg-fog/10 text-fog", dot: "bg-fog" },
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  queued: "В очереди",
  script_ready: "Сценарий готов",
  generating: "Генерация",
  audio_sync: "Синхронизация",
  assembling: "Сборка",
  done: "Готово",
  failed: "Ошибка",
  canceled: "Отменено",
};

export function StatusPill({ status, label }: StatusPillProps) {
  const fallback = { className: "status-pending", dot: "bg-fog" };
  const config = STATUS_CONFIG[status] ?? fallback;
  const displayLabel = label ?? STATUS_LABELS[status] ?? status;

  return (
    <span className={`status-pill ${config.className}`}>
      <span className={`w-2 h-2 rounded-full ${config.dot}`} />
      {displayLabel}
    </span>
  );
}
