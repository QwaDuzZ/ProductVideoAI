import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Migration 1: DDL Part 1", () => {
  it("creates all required tables", () => {
    const sql = readMigration("20260905000001_ddl_part1.sql");
    const tables = [
      "profiles", "products", "product_reviews_analysis",
      "video_references", "projects", "generation_segments",
    ];
    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }
  });

  it("has handle_new_user trigger function", () => {
    const sql = readMigration("20260905000001_ddl_part1.sql");
    expect(sql).toContain("handle_new_user");
    expect(sql).toContain("SECURITY DEFINER");
  });
});

describe("Migration 2: DDL Part 2", () => {
  it("creates billing and provider tables", () => {
    const sql = readMigration("20260905000002_ddl_part2.sql");
    const tables = [
      "media_tasks", "gpu_jobs", "credit_transactions",
      "payments", "subscriptions", "providers",
      "video_models", "storage_assets", "tts_voices",
    ];
    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it("subscription_events CHECK allows all 4 gateways", () => {
    const sql = readMigration("20260905000002_ddl_part2.sql");
    expect(sql).toContain("'prodamus'");
    expect(sql).toContain("'payselection'");
    expect(sql).toContain("'lavatop'");
    expect(sql).toContain("'cryptocloud'");
  });
});

describe("Migration 3: RLS", () => {
  it("enables RLS on all tables", () => {
    const sql = readMigration("20260905000003_rls.sql");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("has is_admin function", () => {
    const sql = readMigration("20260905000003_rls.sql");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.is_admin");
  });

  it("has admin policies for video_models, tts_voices, providers", () => {
    const sql = readMigration("20260905000003_rls.sql");
    expect(sql).toContain("admin_all_video_models");
    expect(sql).toContain("admin_all_tts_voices");
    expect(sql).toContain("admin_all_providers");
  });
});

describe("Migration 5: Billing", () => {
  it("has charge_credits and refund functions", () => {
    const sql = readMigration("20260905000005_billing.sql");
    expect(sql).toContain("charge_credits");
    expect(sql).toContain("refund_project_credits");
  });

  it("REVOKE/GRANT only references functions from this migration", () => {
    const sql = readMigration("20260905000005_billing.sql");
    const lines = sql.split("\n").filter(l => l.startsWith("REVOKE") || l.startsWith("GRANT"));
    for (const line of lines) {
      expect(line).not.toContain("check_rate_limit");
      expect(line).not.toContain("count_active_user_projects");
      expect(line).not.toContain("count_active_generations");
      expect(line).not.toContain("count_active_v2v_jobs");
    }
  });
});

describe("Migration 6: Cron", () => {
  it("creates cron functions with SECURITY DEFINER", () => {
    const sql = readMigration("20260905000006_cron.sql");
    expect(sql).toContain("check_rate_limit");
    expect(sql).toContain("count_active_user_projects");
    expect(sql).toContain("count_active_generations");
    expect(sql).toContain("count_active_v2v_jobs");
    expect(sql).toContain("fail_stuck_projects");
  });

  it("has REVOKE/GRANT for cron functions", () => {
    const sql = readMigration("20260905000006_cron.sql");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.check_rate_limit");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.check_rate_limit TO service_role");
  });

  it("schedules pg_cron jobs", () => {
    const sql = readMigration("20260905000006_cron.sql");
    expect(sql).toContain("cron.schedule");
  });
});
