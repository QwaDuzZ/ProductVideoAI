import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

interface AuthFormProps {
  mode: "login" | "register" | "forgot";
  onModeChange: (mode: "login" | "register" | "forgot") => void;
}

export function AuthForm({ mode, onModeChange }: AuthFormProps) {
  const { signIn, signUp, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    let result;
    if (mode === "login") {
      result = await signIn(email, password);
    } else if (mode === "register") {
      result = await signUp(email, password);
    } else {
      result = await resetPassword(email);
      if (!result.error) setSuccess(true);
    }

    if (result.error) setError(result.error);
    setLoading(false);
  };

  const titles = {
    login: "Вход в аккаунт",
    register: "Создать аккаунт",
    forgot: "Восстановить пароль",
  };

  const subtitles = {
    login: "Войдите, чтобы продолжить создавать видео",
    register: "Начните создавать AI-видео для ваших товаров",
    forgot: "Мы отправим ссылку для сброса пароля",
  };

  const ctaLabels = {
    login: "Войти",
    register: "Зарегистрироваться",
    forgot: "Отправить ссылку",
  };

  if (success) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="text-6xl mb-6">✉</div>
          <h1 className="text-manifest text-snow mb-4">Письмо отправлено</h1>
          <p className="text-fog mb-8">
            Проверьте почту <span className="text-snow">{email}</span> и перейдите по ссылке
          </p>
          <button
            onClick={() => {
              setSuccess(false);
              onModeChange("login");
            }}
            className="btn-primary"
          >
            Вернуться к входу
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-manifest text-snow mb-3">{titles[mode]}</h1>
          <p className="text-fog text-lg">{subtitles[mode]}</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-fog mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input w-full"
                placeholder="you@example.com"
                required
              />
            </div>

            {mode !== "forgot" && (
              <div>
                <label className="block text-sm text-fog mb-2">Пароль</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            )}

            {error && (
              <div className="text-danger text-sm bg-danger/10 px-3 py-2 rounded-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? "Загрузка..." : ctaLabels[mode]}
            </button>
          </form>

          {mode === "login" && (
            <div className="mt-4 space-y-3">
              <button
                onClick={() => onModeChange("forgot")}
                className="text-orange text-sm hover:underline w-full text-center block"
              >
                Забыли пароль?
              </button>
              <div className="text-center text-fog text-sm">
                Нет аккаунта?{" "}
                <button
                  onClick={() => onModeChange("register")}
                  className="text-orange hover:underline"
                >
                  Зарегистрируйтесь
                </button>
              </div>
            </div>
          )}

          {mode === "register" && (
            <div className="mt-4 text-center text-fog text-sm">
              Уже есть аккаунт?{" "}
              <button
                onClick={() => onModeChange("login")}
                className="text-orange hover:underline"
              >
                Войдите
              </button>
            </div>
          )}

          {mode === "forgot" && (
            <div className="mt-4 text-center text-fog text-sm">
              <button
                onClick={() => onModeChange("login")}
                className="text-orange hover:underline"
              >
                ← Вернуться к входу
              </button>
            </div>
          )}
        </div>

        <div className="gradient-divider mt-8" />
      </div>
    </div>
  );
}
