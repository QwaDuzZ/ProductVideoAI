import { useState, useCallback } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuthForm } from "./components/AuthForm";
import { OnboardingFlow } from "./components/OnboardingFlow";
import { Dashboard } from "./components/Dashboard";
import { ProjectWizard } from "./components/ProjectWizard";
import { ProjectProgress } from "./components/ProjectProgress";
import { PricingPage } from "./components/PricingPage";
import { AdminPanel } from "./components/AdminPanel";
import { OceanBackground } from "./components/OceanBackground";
import { Toast } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthGuard } from "./components/AuthGuard";

type Screen =
  | { type: "auth"; mode: "login" | "register" | "forgot" }
  | { type: "onboarding" }
  | { type: "dashboard" }
  | { type: "wizard" }
  | { type: "progress"; projectId: string }
  | { type: "pricing" }
  | { type: "admin" };

interface ToastMessage {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

let toastId = 0;

function AppContent() {
  const { user, loading } = useAuth();
  const [screen, setScreen] = useState<Screen>({ type: "auth", mode: "login" });
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <OceanBackground opacity={0.15} />
        <div className="relative z-10 text-fog">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthForm
        mode={screen.type === "auth" ? screen.mode : "login"}
        onModeChange={(mode) => setScreen({ type: "auth", mode })}
      />
    );
  }

  if (!hasOnboarded && screen.type === "dashboard") {
    return (
      <OnboardingFlow onComplete={() => setHasOnboarded(true)} />
    );
  }

  switch (screen.type) {
    case "dashboard":
      return (
        <>
          <Dashboard
            onNewProject={() => setScreen({ type: "wizard" })}
            onViewProject={(id) => setScreen({ type: "progress", projectId: id })}
          />
          {toasts.map((t) => (
            <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
          ))}
        </>
      );

    case "wizard":
      return (
        <ProjectWizard
          onComplete={(projectId) => {
            addToast("Проект создан! Генерация запущена.", "success");
            setScreen({ type: "progress", projectId });
          }}
          onCancel={() => setScreen({ type: "dashboard" })}
        />
      );

    case "progress":
      return (
        <ProjectProgress
          projectId={screen.projectId}
          onDone={() => setScreen({ type: "dashboard" })}
        />
      );

    case "pricing":
      return (
        <PricingPage onBack={() => setScreen({ type: "dashboard" })} />
      );

    case "admin":
      return (
        <AuthGuard requireAdmin>
          <AdminPanel />
        </AuthGuard>
      );

    default:
      return (
        <Dashboard
          onNewProject={() => setScreen({ type: "wizard" })}
          onViewProject={(id) => setScreen({ type: "progress", projectId: id })}
        />
      );
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
