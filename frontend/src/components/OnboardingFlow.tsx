import { useState } from "react";

interface OnboardingStep {
  title: string;
  description: string;
  icon: string;
}

const steps: OnboardingStep[] = [
  {
    title: "Загрузите товар",
    description: "Добавьте фото и описание — AI проанализирует ваш продукт за секунды",
    icon: "📦",
  },
  {
    title: "AI создаст видео",
    description: "Сценарий, озвучка, монтаж — всё автоматически. Вы контролируете каждый шаг",
    icon: "🎬",
  },
  {
    title: "Готово к публикации",
    description: "Скачайте ролик в 1080p и загрузите на маркетплейс или в соцсети",
    icon: "🚀",
  },
];

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const step = steps[currentStep];

  if (!step) return null;

  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      <div className="w-full max-w-lg text-center">
        <div className="mb-8">
          <div className="text-8xl mb-6">{step.icon}</div>
          <h1 className="text-manifest text-snow mb-4">
            {step.title}
          </h1>
          <p className="text-fog text-lg max-w-md mx-auto">
            {step.description}
          </p>
        </div>

        <div className="flex justify-center gap-2 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === currentStep ? "bg-magenta w-8" : "bg-edge"
              }`}
            />
          ))}
        </div>

        <div className="flex justify-center gap-4">
          {currentStep > 0 && (
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              className="btn-ghost"
            >
              Назад
            </button>
          )}
          {currentStep < steps.length - 1 ? (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="btn-primary"
            >
              Далее
            </button>
          ) : (
            <button onClick={onComplete} className="btn-primary">
              Начать создавать
            </button>
          )}
        </div>

        <button
          onClick={onComplete}
          className="mt-6 text-fog text-sm hover:text-snow transition-colors"
        >
          Пропустить тур
        </button>
      </div>
    </div>
  );
}
