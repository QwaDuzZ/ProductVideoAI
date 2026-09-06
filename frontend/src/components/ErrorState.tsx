interface ErrorStateProps {
  code: string;
  message?: string;
  onRetry?: () => void;
  onBack?: () => void;
}

const ERROR_MESSAGES: Record<string, { title: string; description: string; action?: string }> = {
  CONTENT_POLICY_VIOLATION: {
    title: "Контент нарушает политику",
    description: "Материал нарушает контентную политику платформы. Загрузите другой материал.",
    action: "Загрузить другой материал",
  },
  MEDIA_VALIDATION_FAILED: {
    title: "Файл повреждён",
    description: "Медиафайл не может быть обработан. Попробуйте загрузить другой файл.",
    action: "Попробовать снова",
  },
  TTS_VOICE_NOT_FOUND: {
    title: "Голос не найден",
    description: "Выбранный голос недоступен для этого языка. Попробуйте другой голос.",
    action: "Выбрать другой голос",
  },
  TTS_FAILED: {
    title: "Ошибка озвучки",
    description: "Не удалось создать озвучку. Попробуйте снова.",
    action: "Попробовать снова",
  },
  VIDEO_GENERATION_FAILED: {
    title: "Ошибка генерации",
    description: "AI не смог создать видео. Кредиты возвращены на баланс.",
    action: "Создать новый проект",
  },
  UPSCALE_FAILED: {
    title: "Ошибка апскейла",
    description: "Не удалось увеличить разрешение. Попробуйте снова.",
    action: "Попробовать снова",
  },
  GPU_RATE_LIMIT: {
    title: "Сервер перегружен",
    description: "Слишком много запросов. Подождите несколько минут.",
    action: "Подождать и попробовать",
  },
  INSUFFICIENT_CREDITS: {
    title: "Недостаточно кредитов",
    description: "Пополните баланс для продолжения.",
    action: "Пополнить баланс",
  },
  MODERATION_FAILED: {
    title: "Ошибка модерации",
    description: "Не удалось проверить материал. Попробуйте снова.",
    action: "Попробовать снова",
  },
  DONOR_DURATION_EXCEEDED: {
    title: "Видео слишком длинное",
    description: "Длительность донора превышает 60 секунд. Загрузите короткое видео.",
    action: "Загрузить другое видео",
  },
};

export function ErrorState({ code, message, onRetry, onBack }: ErrorStateProps) {
  const errorConfig = ERROR_MESSAGES[code] ?? {
    title: "Произошла ошибка",
    description: message || "Что-то пошло не так. Попробуйте снова.",
    action: "Попробовать снова",
  };

  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="card p-8">
          <div className="text-danger text-6xl mb-6">✕</div>

          <h1 className="text-xl font-semibold text-snow mb-3">
            {errorConfig.title}
          </h1>

          <p className="text-fog mb-6">{errorConfig.description}</p>

          {code && (
            <div className="bg-panel-2 rounded-sm px-3 py-2 mb-6">
              <p className="text-mist font-mono text-xs">{code}</p>
            </div>
          )}

          <div className="bg-panel-2 rounded-sm px-4 py-3 mb-6 text-sm text-fog">
            Кредиты возвращены на баланс
          </div>

          <div className="flex flex-col gap-3">
            {onRetry && errorConfig.action && (
              <button onClick={onRetry} className="btn-primary w-full">
                {errorConfig.action}
              </button>
            )}
            {onBack && (
              <button onClick={onBack} className="btn-ghost w-full">
                Вернуться к проектам
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ModerationBlockProps {
  onGoBack: () => void;
}

export function ModerationBlock({ onGoBack }: ModerationBlockProps) {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="card p-8">
          <div className="text-yellow text-6xl mb-6">⚠</div>

          <h1 className="text-xl font-semibold text-snow mb-3">
            Материал на модерации
          </h1>

          <p className="text-fog mb-6">
            Ваш материал проходит проверку. Это занимает до 24 часов.
            Мы уведомим вас о результатах по email.
          </p>

          <button onClick={onGoBack} className="btn-primary">
            Вернуться к проектам
          </button>
        </div>
      </div>
    </div>
  );
}
