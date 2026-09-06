import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { StatusPill } from "./StatusPill";
import { CreditChip } from "./CreditChip";
import { OceanBackground } from "./OceanBackground";

interface Project {
  id: string;
  name: string;
  status: string;
  product_name: string;
  credits_spent: number;
  created_at: string;
  updated_at: string;
}

interface DashboardProps {
  onNewProject: () => void;
  onViewProject: (id: string) => void;
}

export function Dashboard({ onNewProject, onViewProject }: DashboardProps) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [projectsRes, profileRes] = await Promise.all([
        supabase
          .from("projects")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("credits_balance")
          .eq("id", user.id)
          .single(),
      ]);

      setProjects(projectsRes.data ?? []);
      setCredits(profileRes.data?.credits_balance ?? 0);
      setLoading(false);
    };

    fetchData();

    const channel = supabase
      .channel("projects-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects", filter: `user_id=eq.${user.id}` },
        () => fetchData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-fog">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="relative">
      <OceanBackground opacity={0.08} />

      <div className="relative z-10 p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-manifest text-snow">Мои проекты</h1>
            <p className="text-fog mt-2">
              Создавайте AI-видео для ваших товаров
            </p>
          </div>
          <div className="flex items-center gap-4">
            <CreditChip amount={credits} />
            <button onClick={onNewProject} className="btn-primary">
              + Новый проект
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-6">🎬</div>
            <h2 className="text-manifest text-snow mb-4">
              Представь, что ты можешь построить
            </h2>
            <p className="text-fog text-lg mb-8 max-w-md mx-auto">
              Загрузи товар — AI создаст продающее видео за минуты
            </p>
            <button onClick={onNewProject} className="btn-primary">
              Создать первое видео
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="card cursor-pointer group"
                onClick={() => onViewProject(project.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-panel-2 rounded-sm flex items-center justify-center text-2xl">
                      📦
                    </div>
                    <div>
                      <h3 className="text-snow font-semibold group-hover:text-magenta transition-colors">
                        {project.name}
                      </h3>
                      <p className="text-fog text-sm">
                        {project.product_name} · {new Date(project.created_at).toLocaleDateString("ru-RU")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <CreditChip amount={project.credits_spent} />
                    <StatusPill status={project.status} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
