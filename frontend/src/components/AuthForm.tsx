import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

interface AuthFormProps {
  mode: "login" | "register" | "forgot";
  onModeChange: (mode: "login" | "register" | "forgot") => void;
}

export function AuthForm({ mode, onModeChange }: AuthFormProps) {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();
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

            {mode !== "forgot" && (
              <>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-edge"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-panel-2 px-3 text-fog">или</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={signInWithGoogle}
                  disabled={loading}
                  className="btn-secondary w-full flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Войти через Google
                </button>
              </>
            )}
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
