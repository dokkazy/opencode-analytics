import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./migrations";

export const SKILL_RUN_STATUSES = ["completed", "error"] as const;

export type SkillRunStatus = (typeof SKILL_RUN_STATUSES)[number];

export interface SkillRunRow {
  sessionId: string;
  messageId: string;
  skillName: string;
  trigger: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  agent: string | null;
  modelProviderId: string | null;
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
  status: SkillRunStatus;
}

export interface SkillRunInput {
  sessionId: string;
  messageId: string;
  skillName: string;
  trigger: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  agent: string | null;
  modelProviderId: string | null;
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
  status: SkillRunStatus;
}

export interface InsertSkillRunResult {
  inserted: boolean;
  duplicate: boolean;
}

export interface AnalyticsDatabase {
  insertSkillRun(run: SkillRunInput): InsertSkillRunResult;
  listSkillRuns(): SkillRunRow[];
  listSkillRunsByName(name: string): SkillRunRow[];
  getSchemaVersion(): number;
  listAppliedMigrations(): string[];
  close(): void;
}

export interface AnalyticsDatabaseTestHelpers {
  beginExclusiveWrite(): void;
  rollbackExclusiveWrite(): void;
}

const testHelpersByDatabase = new WeakMap<AnalyticsDatabase, AnalyticsDatabaseTestHelpers>();

function ensureParent(filePath: string) {
  if (filePath === ":memory:") return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function applyMigrations(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      id TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);

  const getVersion = db.query(`SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations`);
  const insertMigration = db.prepare(`
    INSERT INTO schema_migrations (version, id, applied_at)
    VALUES ($version, $id, $appliedAt)
  `);

  const currentVersion = Number((getVersion.get() as { version?: number } | null)?.version ?? 0);

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    db.transaction(() => {
      db.exec(migration.sql);
      insertMigration.run({
        version: migration.version,
        id: migration.id,
        appliedAt: new Date().toISOString(),
      });
    })();
  }
}

function isDuplicateMessageIdError(error: unknown) {
  return (
    error instanceof Error &&
    /unique|constraint/i.test(error.message) &&
    /skill_runs\.message_id|message_id/i.test(error.message)
  );
}

function isSkillRunStatus(value: string): value is SkillRunStatus {
  return (SKILL_RUN_STATUSES as readonly string[]).includes(value);
}

function assertNonEmptyString(name: string, value: string) {
  if (value.trim().length === 0) {
    throw new TypeError(`Invalid skill run: ${name} must be a non-empty string`);
  }
}

function assertFiniteNumber(name: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Invalid skill run: ${name} must be a finite number`);
  }
}

function assertValidSkillRunInput(run: SkillRunInput) {
  assertNonEmptyString("sessionId", run.sessionId);
  assertNonEmptyString("messageId", run.messageId);
  assertNonEmptyString("skillName", run.skillName);
  assertNonEmptyString("trigger", run.trigger);
  assertFiniteNumber("startedAt", run.startedAt);
  assertFiniteNumber("finishedAt", run.finishedAt);
  assertFiniteNumber("durationMs", run.durationMs);
  assertFiniteNumber("inputTokens", run.inputTokens);
  assertFiniteNumber("outputTokens", run.outputTokens);
  assertFiniteNumber("totalTokens", run.totalTokens);
  assertFiniteNumber("toolCalls", run.toolCalls);

  if (!isSkillRunStatus(run.status)) {
    throw new TypeError(`Invalid skill run: status must be one of ${SKILL_RUN_STATUSES.join(", ")}`);
  }
}

function normalizeSkillRunRow(row: SkillRunRow): SkillRunRow {
  if (!isSkillRunStatus(row.status)) {
    throw new TypeError(`Invalid skill run row: unexpected status \"${String(row.status)}\"`);
  }

  return row;
}

export function getDatabaseTestHelpers(database: AnalyticsDatabase): AnalyticsDatabaseTestHelpers {
  const helpers = testHelpersByDatabase.get(database);

  if (!helpers) {
    throw new Error("No test helpers registered for this database instance");
  }

  return helpers;
}

export function createDatabase(file: string): AnalyticsDatabase {
  ensureParent(file);
  const db = new Database(file, { create: true, strict: true });
  applyMigrations(db);
  db.exec("PRAGMA busy_timeout = 50");

  const insert = db.prepare(`
    INSERT INTO skill_runs (
      session_id, message_id, skill_name, trigger, started_at, finished_at, duration_ms,
      agent, model_provider_id, model_id, input_tokens, output_tokens, total_tokens,
      tool_calls, status
    ) VALUES (
      $sessionId, $messageId, $skillName, $trigger, $startedAt, $finishedAt, $durationMs,
      $agent, $modelProviderId, $modelId, $inputTokens, $outputTokens, $totalTokens,
      $toolCalls, $status
    )
  `);

  const listAll = db.query(`
    SELECT
      session_id AS sessionId,
      message_id AS messageId,
      skill_name AS skillName,
      trigger,
      started_at AS startedAt,
      finished_at AS finishedAt,
      duration_ms AS durationMs,
      agent,
      model_provider_id AS modelProviderId,
      model_id AS modelId,
      input_tokens AS inputTokens,
      output_tokens AS outputTokens,
      total_tokens AS totalTokens,
      tool_calls AS toolCalls,
      status
    FROM skill_runs
    ORDER BY started_at DESC, id DESC
  `);

  const listBySkill = db.query(`
    SELECT
      session_id AS sessionId,
      message_id AS messageId,
      skill_name AS skillName,
      trigger,
      started_at AS startedAt,
      finished_at AS finishedAt,
      duration_ms AS durationMs,
      agent,
      model_provider_id AS modelProviderId,
      model_id AS modelId,
      input_tokens AS inputTokens,
      output_tokens AS outputTokens,
      total_tokens AS totalTokens,
      tool_calls AS toolCalls,
      status
    FROM skill_runs
    WHERE skill_name = ?
    ORDER BY started_at DESC, id DESC
  `);

  const listMigrations = db.query(`
    SELECT id, version
    FROM schema_migrations
    ORDER BY version ASC
  `);

  const getVersion = db.query(`SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations`);

  const api: AnalyticsDatabase = {
    insertSkillRun(run) {
      assertValidSkillRunInput(run);

      try {
        insert.run({
          sessionId: run.sessionId,
          messageId: run.messageId,
          skillName: run.skillName,
          trigger: run.trigger,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          durationMs: run.durationMs,
          agent: run.agent,
          modelProviderId: run.modelProviderId,
          modelId: run.modelId,
          inputTokens: run.inputTokens,
          outputTokens: run.outputTokens,
          totalTokens: run.totalTokens,
          toolCalls: run.toolCalls,
          status: run.status,
        });
        return { inserted: true, duplicate: false };
      } catch (error) {
        if (isDuplicateMessageIdError(error)) {
          return { inserted: false, duplicate: true };
        }

        throw error;
      }
    },
    listSkillRuns() {
      return (listAll.all() as SkillRunRow[]).map(normalizeSkillRunRow);
    },
    listSkillRunsByName(name: string) {
      return (listBySkill.all(name) as SkillRunRow[]).map(normalizeSkillRunRow);
    },
    getSchemaVersion() {
      return Number((getVersion.get() as { version?: number } | null)?.version ?? 0);
    },
    listAppliedMigrations() {
      return (listMigrations.all() as Array<{ id: string }>).map((row) => row.id);
    },
    close() {
      db.close();
    },
  };

  testHelpersByDatabase.set(api, {
    beginExclusiveWrite() {
      db.exec("BEGIN EXCLUSIVE");
    },
    rollbackExclusiveWrite() {
      db.exec("ROLLBACK");
    },
  });

  return api;
}
