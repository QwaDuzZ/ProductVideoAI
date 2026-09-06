import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { StatusPill } from "./StatusPill";

interface AdminUser {
  id: string;
  email: string;
  credits_balance: number;
  created_at: string;
}

interface AdminProject {
  id: string;
  name: string;
  status: string;
  user_email: string;
  credits_spent: number;
  created_at: string;
}

export function AdminPanel() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "projects" | "moderation">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("is_admin").then(({ data }) => setIsAdmin(data ?? false));
  }, [user]);

  const fetchAdminData = useCallback(async () => {
    setLoading(true);

    if (activeTab === "users") {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, credits_balance, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      setUsers(data ?? []);
    } else if (activeTab === "projects") {
      const { data } = await supabase
        .from("projects")
        .select("id, name, status, credits_spent, created_at, profiles!inner(email)")
        .order("created_at", { ascending: false })
        .limit(50);

      setProjects(
        (data ?? []).map((p: any) => ({
          ...p,
          user_email: p.profiles?.email ?? "unknown",
        })),
      );
    }

    setLoading(false);
  }, [activeTab]);

  useEffect(() => {
    if (isAdmin) fetchAdminData();
  }, [isAdmin, fetchAdminData]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="text-fog">Доступ запрещён</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-manifest text-snow mb-8">Админ-панель</h1>

        <div className="flex gap-2 mb-8">
          {(["users", "projects", "moderation"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-snow text-void"
                  : "text-fog hover:text-snow"
              }`}
            >
              {{ users: "Пользователи", projects: "Проекты", moderation: "Модерация" }[tab]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-fog">Загрузка...</div>
        ) : activeTab === "users" ? (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="card flex items-center justify-between p-4">
                <div>
                  <p className="text-snow font-medium">{u.email}</p>
                  <p className="text-fog text-sm">
                    Регистрация: {new Date(u.created_at).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <div className="text-orange font-mono text-sm">{u.credits_balance} cr</div>
              </div>
            ))}
          </div>
        ) : activeTab === "projects" ? (
          <div className="space-y-2">
            {projects.map((p) => (
              <div key={p.id} className="card flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-snow font-medium">{p.name}</p>
                    <p className="text-fog text-sm">{p.user_email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-orange font-mono text-sm">{p.credits_spent} cr</span>
                  <StatusPill status={p.status} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-fog">
            Журнал модерации — в разработке
          </div>
        )}
      </div>
    </div>
  );
}
