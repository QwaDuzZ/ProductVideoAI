import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { SegmentControl } from "./SegmentControl";
import { ProductCatalog } from "./ProductCatalog";
import { uploadImage } from "../lib/upload";

interface WizardData {
  // Step 1: Product
  productName: string;
  productDescription: string;
  productImage: File | null;
  // Step 2: Reference
  referenceMode: "template" | "custom";
  templateId: string;
  customPrompt: string;
  // Step 3: Settings
  audioMode: "tts" | "donor";
  language: string;
  style: "standard" | "premium";
  duration: 30 | 60;
}

interface ProjectWizardProps {
  onComplete: (projectId: string) => void;
  onCancel: () => void;
}

export function ProjectWizard({ onComplete, onCancel }: ProjectWizardProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<WizardData>({
    productName: "",
    productDescription: "",
    productImage: null,
    referenceMode: "template",
    templateId: "",
    customPrompt: "",
    audioMode: "tts",
    language: "ru",
    style: "standard",
    duration: 30,
  });

  const updateData = (partial: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...partial }));
  };

  const handleStep1Next = () => {
    if (!data.productName.trim()) {
      setError("Введите название товара");
      return;
    }
    if (!data.productDescription.trim()) {
      setError("Введите описание товара");
      return;
    }
    setError("");
    setStep(2);
  };

  const handleStep2Next = () => {
    if (data.referenceMode === "template" && !data.templateId) {
      setError("Выберите шаблон");
      return;
    }
    if (data.referenceMode === "custom" && !data.customPrompt.trim()) {
      setError("Введите промпт");
      return;
    }
    setError("");
    setStep(3);
  };

  const handleCreate = async () => {
    if (!user) return;
    setLoading(true);
    setError("");

    try {
      let imageUrl: string | null = null;
      if (data.productImage) {
        try {
          const result = await uploadImage(data.productImage);
          imageUrl = result.url;
        } catch (err) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки изображения");
          setLoading(false);
          return;
        }
      }

      const productRes = await supabase
        .from("products")
        .insert({
          user_id: user.id,
          title: data.productName,
          description: data.productDescription,
          images: imageUrl ? [imageUrl] : [],
        })
        .select()
        .single();

      if (productRes.error) {
        setError("Ошибка создания товара");
        setLoading(false);
        return;
      }

      const projectRes = await supabase.functions.invoke("create-project", {
        body: {
          product_id: productRes.data.id,
          reference_mode: data.referenceMode,
          template_id: data.templateId || undefined,
          custom_prompt: data.customPrompt || undefined,
          audio_mode: data.audioMode,
          language: data.language,
          style: data.style,
          duration: data.duration,
        },
      });

      if (projectRes.error) {
        setError(projectRes.error.message || "Ошибка создания проекта");
        setLoading(false);
        return;
      }

      onComplete(projectRes.data.project_id);
    } catch (err) {
      setError("Произошла ошибка");
      setLoading(false);
    }
  };

  const steps = [
    { num: 1, label: "Товар" },
    { num: 2, label: "Референс" },
    { num: 3, label: "Настройки" },
  ];

  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <button onClick={onCancel} className="btn-ghost">
            ← Назад
          </button>
          <div className="flex items-center gap-2">
            {steps.map((s) => (
              <div
                key={s.num}
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                  step === s.num
                    ? "bg-magenta/10 text-magenta"
                    : step > s.num
                      ? "bg-success/10 text-success"
                      : "text-mist"
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs">
                  {step > s.num ? "✓" : s.num}
                </span>
                {s.label}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-snow mb-4">Товар</h2>

              <ProductCatalog
                selectable
                onSelect={(product) => {
                  updateData({
                    productName: product.name,
                    productDescription: product.description,
                  });
                }}
              />

              <div className="gradient-divider my-4" />

              <p className="text-mist text-sm text-center">Или создайте новый товар</p>

              <div>
                <label className="block text-sm text-fog mb-2">Название</label>
                <input
                  type="text"
                  value={data.productName}
                  onChange={(e) => updateData({ productName: e.target.value })}
                  className="input w-full"
                  placeholder="iPhone 15 Pro Max"
                />
              </div>

              <div>
                <label className="block text-sm text-fog mb-2">Описание</label>
                <textarea
                  value={data.productDescription}
                  onChange={(e) => updateData({ productDescription: e.target.value })}
                  className="input w-full h-32 resize-none"
                  placeholder="Опишите товар: материал, цвет, особенности..."
                />
              </div>

              <div>
                <label className="block text-sm text-fog mb-2">Фото (необязательно)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => updateData({ productImage: e.target.files?.[0] ?? null })}
                  className="input w-full file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border-0 file:bg-panel-2 file:text-snow hover:file:bg-edge"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-snow mb-4">Референс</h2>

              <SegmentControl
                options={[
                  { value: "template", label: "Шаблон" },
                  { value: "custom", label: "Свой промпт" },
                ]}
                value={data.referenceMode}
                onChange={(v) => updateData({ referenceMode: v as WizardData["referenceMode"] })}
              />

              {data.referenceMode === "template" && (
                <div>
                  <label className="block text-sm text-fog mb-2">Выберите шаблон</label>
                  <select
                    value={data.templateId}
                    onChange={(e) => updateData({ templateId: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">Выберите...</option>
                    <option value="unboxing">Распаковка</option>
                    <option value="lifestyle">Лайфстайл</option>
                    <option value="closeup">Крупный план</option>
                    <option value="comparison">Сравнение</option>
                  </select>
                </div>
              )}

              {data.referenceMode === "custom" && (
                <div>
                  <label className="block text-sm text-fog mb-2">Промпт</label>
                  <textarea
                    value={data.customPrompt}
                    onChange={(e) => updateData({ customPrompt: e.target.value })}
                    className="input w-full h-32 resize-none"
                    placeholder="Опишите желаемое видео: стиль, настроение, движения камеры..."
                  />
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-snow mb-4">Настройки</h2>

              <div>
                <label className="block text-sm text-fog mb-2">Аудио</label>
                <SegmentControl
                  options={[
                    { value: "tts", label: "AI-озвучка" },
                    { value: "donor", label: "Свой звук" },
                  ]}
                  value={data.audioMode}
                  onChange={(v) => updateData({ audioMode: v as WizardData["audioMode"] })}
                />
              </div>

              <div>
                <label className="block text-sm text-fog mb-2">Язык</label>
                <select
                  value={data.language}
                  onChange={(e) => updateData({ language: e.target.value })}
                  className="input w-full"
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-fog mb-2">Стиль</label>
                <SegmentControl
                  options={[
                    { value: "standard", label: "Стандарт (35 cr)" },
                    { value: "premium", label: "Премиум (80 cr)" },
                  ]}
                  value={data.style}
                  onChange={(v) => updateData({ style: v as WizardData["style"] })}
                />
              </div>

              <div>
                <label className="block text-sm text-fog mb-2">Длительность</label>
                <SegmentControl
                  options={[
                    { value: "30", label: "30 сек" },
                    { value: "60", label: "60 сек" },
                  ]}
                  value={String(data.duration)}
                  onChange={(v) => updateData({ duration: Number(v) as 30 | 60 })}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="text-danger text-sm bg-danger/10 px-3 py-2 rounded-sm mt-4">
              {error}
            </div>
          )}

          <div className="flex justify-between mt-6">
            <button
              onClick={() => (step === 1 ? onCancel() : setStep(step - 1))}
              className="btn-ghost"
            >
              {step === 1 ? "Отмена" : "Назад"}
            </button>

            {step < 3 ? (
              <button
                onClick={step === 1 ? handleStep1Next : handleStep2Next}
                className="btn-primary"
              >
                Далее
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={loading}
                className="btn-primary"
              >
                {loading ? "Создание..." : "Создать проект"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
