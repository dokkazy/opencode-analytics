import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkillQueries } from "../src/queries/skills";
import type { SkillRunInput } from "../src/storage/db";
import { createDatabase, getDatabaseTestHelpers } from "../src/storage/db";

test("applies forward-only migrations and exposes schema version", () => {
  const db = createDatabase(":memory:");

  expect(db.getSchemaVersion()).toBe(1);
  expect(db.listAppliedMigrations()).toEqual(["001_initial_skill_runs"]);

  db.close();
});

test("reopening a file-backed database does not re-apply migrations", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "opencode-analytics-migrations-"));
  const file = join(tempDir, "analytics.sqlite");

  const first = createDatabase(file);
  expect(first.getSchemaVersion()).toBe(1);
  expect(first.listAppliedMigrations()).toEqual(["001_initial_skill_runs"]);
  first.close();

  const reopened = createDatabase(file);
  expect(reopened.getSchemaVersion()).toBe(1);
  expect(reopened.listAppliedMigrations()).toEqual(["001_initial_skill_runs"]);
  reopened.close();
});

test("stores one skill run and builds overview/detail/health/read models", () => {
  const db = createDatabase(":memory:");
  db.insertSkillRun({
    sessionId: "session-1",
    messageId: "assistant-1",
    skillName: "brainstorming",
    trigger: "skill",
    startedAt: 1000,
    finishedAt: 1600,
    durationMs: 600,
    agent: "creative",
    modelProviderId: "openai",
    modelId: "gpt-5.4",
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    toolCalls: 2,
    status: "completed",
  });

  const queries = createSkillQueries(db);
  expect(queries.overview(10)[0].skillName).toBe("brainstorming");
  expect(queries.detail("brainstorming")?.totalRuns).toBe(1);
  expect(queries.health("brainstorming")?.errorRuns).toBe(0);
  expect(queries.recent(10)[0].startedAt).toBe(1000);
  expect(queries.exportPayload(10)).toEqual({
    generatedAt: expect.any(String),
    overview: [
      {
        skillName: "brainstorming",
        totalRuns: 1,
        avgDurationMs: 600,
        totalTokens: 30,
        totalToolCalls: 2,
        lastStartedAt: 1000,
      },
    ],
    recent: [
      {
        skillName: "brainstorming",
        status: "completed",
        durationMs: 600,
        totalTokens: 30,
        toolCalls: 2,
        startedAt: 1000,
      },
    ],
  });

  db.close();
});

test("duplicate message ids are ignored as a dedupe no-op", () => {
  const db = createDatabase(":memory:");
  const run: SkillRunInput = {
    sessionId: "session-1",
    messageId: "assistant-1",
    skillName: "brainstorming",
    trigger: "skill",
    startedAt: 1000,
    finishedAt: 1600,
    durationMs: 600,
    agent: null,
    modelProviderId: null,
    modelId: null,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    toolCalls: 0,
    status: "completed",
  };

  expect(db.insertSkillRun(run)).toEqual({ inserted: true, duplicate: false });
  expect(db.insertSkillRun(run)).toEqual({ inserted: false, duplicate: true });
  expect(db.listSkillRuns()).toHaveLength(1);

  db.close();
});

test("storage returns raw rows while queries assemble aggregates", () => {
  const db = createDatabase(":memory:");

  db.insertSkillRun({
    sessionId: "session-1",
    messageId: "assistant-1",
    skillName: "brainstorming",
    trigger: "skill",
    startedAt: 1000,
    finishedAt: 1300,
    durationMs: 300,
    agent: null,
    modelProviderId: null,
    modelId: null,
    inputTokens: 1,
    outputTokens: 2,
    totalTokens: 3,
    toolCalls: 1,
    status: "completed",
  });

  db.insertSkillRun({
    sessionId: "session-2",
    messageId: "assistant-2",
    skillName: "brainstorming",
    trigger: "skill",
    startedAt: 2000,
    finishedAt: 2600,
    durationMs: 600,
    agent: null,
    modelProviderId: null,
    modelId: null,
    inputTokens: 2,
    outputTokens: 4,
    totalTokens: 6,
    toolCalls: 2,
    status: "error",
  });

  expect(db.listSkillRuns().map((row) => row.messageId)).toEqual(["assistant-2", "assistant-1"]);

  const queries = createSkillQueries(db);
  const detail = queries.detail("brainstorming");
  expect(detail?.totalRuns).toBe(2);
  expect(detail?.avgDurationMs).toBe(450);
  expect(queries.health("brainstorming")?.errorRuns).toBe(1);
  expect(queries.health()[0]).toEqual({
    skillName: "brainstorming",
    totalRuns: 2,
    errorRuns: 1,
    avgDurationMs: 450,
    avgTokens: 4,
    slowestDurationMs: 600,
    lastStartedAt: 2000,
  });

  db.close();
});

test("query limits clamp to spec bounds and empty results stay readable", () => {
  const db = createDatabase(":memory:");
  const queries = createSkillQueries(db);

  expect(queries.overview(0)).toEqual([]);
  expect(queries.overview(-20)).toEqual([]);
  expect(queries.recent(Number.POSITIVE_INFINITY)).toEqual([]);
  expect(queries.detail("missing-skill")).toBeNull();
  expect(queries.health("missing-skill")).toBeNull();
  expect(queries.health()).toEqual([]);
  expect(queries.exportPayload(999)).toEqual({
    generatedAt: expect.any(String),
    overview: [],
    recent: [],
  });

  db.close();
});

test("invalid status values are rejected before insert", () => {
  const db = createDatabase(":memory:");

  expect(() =>
    db.insertSkillRun({
      sessionId: "session-1",
      messageId: "assistant-1",
      skillName: "brainstorming",
      trigger: "skill",
      startedAt: 1000,
      finishedAt: 1600,
      durationMs: 600,
      agent: null,
      modelProviderId: null,
      modelId: null,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      toolCalls: 0,
      status: "pending" as never,
    }),
  ).toThrow(/status/i);

  db.close();
});

test("invalid skill run input is rejected before insert", () => {
  const db = createDatabase(":memory:");

  expect(() =>
    db.insertSkillRun({
      sessionId: " ",
      messageId: "assistant-1",
      skillName: "brainstorming",
      trigger: "skill",
      startedAt: Number.NaN,
      finishedAt: 1600,
      durationMs: 600,
      agent: null,
      modelProviderId: null,
      modelId: null,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      toolCalls: 0,
      status: "completed",
    }),
  ).toThrow(/sessionId|startedAt/i);

  db.close();
});

test("startup surfaces unreadable database targets to the caller", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "opencode-analytics-db-"));

  expect(() => createDatabase(tempDir)).toThrow();
});

test("runtime write failures rethrow non-duplicate sqlite errors", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "opencode-analytics-lock-"));
  const file = join(tempDir, "analytics.sqlite");
  const writerA = createDatabase(file);
  const writerB = createDatabase(file);
  const writerATestHelpers = getDatabaseTestHelpers(writerA);

  writerATestHelpers.beginExclusiveWrite();

  expect(() =>
    writerB.insertSkillRun({
      sessionId: "session-lock",
      messageId: "assistant-lock",
      skillName: "brainstorming",
      trigger: "skill",
      startedAt: 1000,
      finishedAt: 1400,
      durationMs: 400,
      agent: null,
      modelProviderId: null,
      modelId: null,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      toolCalls: 0,
      status: "completed",
    }),
  ).toThrow(/locked/i);

  writerATestHelpers.rollbackExclusiveWrite();
  writerA.close();
  writerB.close();
});
