import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { OceanBackground } from "./OceanBackground";

const CREDIT_PACKAGES = [
  { id: "starter", credits: 100, price: 10, label: "Стартовый", popular: false },
  { id: "pro", credits: 500, price: 40, label: "Профессиональный", popular: true },
  { id: "business", credits: 1500, price: 100, label: "Бизнес", popular: false },
];

interface PricingPageProps {
  onBack: () => void;
}

export function PricingPage({ onBack }: PricingPageProps) {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("credits_balance")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setBalance(data?.credits_balance ?? 0));
  }, [user]);

  const handlePurchase = async (packageId: string) => {
    if (!user) return;
    setLoading(packageId);

    const { data, error } = await supabase.functions.invoke("create-payment", {
      body: { package_id: packageId },
    });

    if (error) {
      setLoading(null);
      return;
    }

    if (data?.payment_url) {
      window.location.href = data.payment_url;
    }

    setLoading(null);
  };

  return (
    <div className="relative min-h-screen">
      <OceanBackground opacity={0.1} />

      <div className="relative z-10 p-8 max-w-4xl mx-auto">
        <button onClick={onBack} className="btn-ghost mb-8">
          ← Назад к проектам
        </button>

        <div className="text-center mb-12">
          <h1 className="text-manifest-lg text-snow mb-4">Кредиты</h1>
          <p className="text-fog text-lg">
            Текущий баланс: <span className="text-orange font-mono">{balance} cr</span>
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {CREDIT_PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className={`card p-6 relative ${
                pkg.popular ? "border-magenta" : ""
              }`}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-magenta text-snow text-xs font-mono px-3 py-1 rounded-full uppercase tracking-wider">
                  Популярный
                </div>
              )}

              <div className="text-center">
                <h3 className="text-snow font-semibold text-lg mb-2">{pkg.label}</h3>
                <div className="text-manifest text-snow mb-1">{pkg.credits}</div>
                <p className="text-fog text-sm mb-4">кредитов</p>

                <div className="gradient-divider mb-4" />

                <div className="text-2xl font-semibold text-snow mb-1">
                  ${pkg.price}
                </div>
                <p className="text-fog text-sm mb-6">
                  ${(pkg.price / pkg.credits * 100).toFixed(1)}¢ / кредит
                </p>

                <button
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={loading === pkg.id}
                  className={pkg.popular ? "btn-primary w-full" : "btn-secondary w-full"}
                >
                  {loading === pkg.id ? "Загрузка..." : "Купить"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8 text-mist text-sm">
          Безопасная оплата · Кредиты не сгорают · Возврат при ошибке генерации
        </div>
      </div>
    </div>
  );
}
