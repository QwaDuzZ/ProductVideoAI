import { useAuth } from "../contexts/AuthContext";

interface AuthGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return null;

  if (requireAdmin) {
    const isAdmin = user.user_metadata?.role === "admin";
    if (!isAdmin) {
      return (
        <div className="min-h-screen bg-void flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-8 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <h1 className="text-xl font-semibold text-snow mb-2">Доступ запрещён</h1>
            <p className="text-fog text-sm">У вас нет прав администратора.</p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
