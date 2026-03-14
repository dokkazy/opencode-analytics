export interface Migration {
  id: string;
  version: number;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: "001_initial_skill_runs",
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        id TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS skill_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        message_id TEXT NOT NULL UNIQUE,
        skill_name TEXT NOT NULL,
        trigger TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        agent TEXT,
        model_provider_id TEXT,
        model_id TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        tool_calls INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_skill_runs_skill_name ON skill_runs(skill_name);
      CREATE INDEX IF NOT EXISTS idx_skill_runs_started_at ON skill_runs(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_skill_runs_status ON skill_runs(status);
    `,
  },
];
