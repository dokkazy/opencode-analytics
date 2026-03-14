import { DEFAULT_LIMIT, MAX_LIMIT } from "../shared/constants";
import type { AnalyticsDatabase, SkillRunRow, SkillRunStatus } from "../storage/db";

export interface OverviewRow {
  skillName: string;
  totalRuns: number;
  avgDurationMs: number;
  totalTokens: number;
  totalToolCalls: number;
  lastStartedAt: number;
}

export interface DetailRow extends OverviewRow {}

export interface HealthRow {
  skillName: string;
  totalRuns: number;
  errorRuns: number;
  avgDurationMs: number;
  avgTokens: number;
  slowestDurationMs: number;
  lastStartedAt: number;
}

export interface RecentRow {
  skillName: string;
  status: SkillRunStatus;
  durationMs: number;
  totalTokens: number;
  toolCalls: number;
  startedAt: number;
}

export interface ExportPayload {
  generatedAt: string;
  overview: OverviewRow[];
  recent: RecentRow[];
}

interface AggregateRow {
  skillName: string;
  totalRuns: number;
  avgDurationMs: number;
  totalTokens: number;
  totalToolCalls: number;
  errorRuns: number;
  avgTokens: number;
  slowestDurationMs: number;
  lastStartedAt: number;
}

export interface SkillQueries {
  overview(limit?: number): OverviewRow[];
  detail(name: string): DetailRow | null;
  health(): HealthRow[];
  health(name: string): HealthRow | null;
  recent(limit?: number): RecentRow[];
  exportPayload(limit?: number): ExportPayload;
}

function clampLimit(limit: number | undefined, fallback = DEFAULT_LIMIT) {
  const value = Number.isFinite(limit) ? Math.trunc(limit as number) : fallback;
  return Math.min(MAX_LIMIT, Math.max(1, value));
}

function aggregateSkillRows(rows: SkillRunRow[]): AggregateRow[] {
  const bySkill = new Map<
    string,
    {
      skillName: string;
      totalRuns: number;
      totalDurationMs: number;
      totalTokens: number;
      totalToolCalls: number;
      errorRuns: number;
      slowestDurationMs: number;
      lastStartedAt: number;
    }
  >();

  for (const row of rows) {
    const current = bySkill.get(row.skillName) ?? {
      skillName: row.skillName,
      totalRuns: 0,
      totalDurationMs: 0,
      totalTokens: 0,
      totalToolCalls: 0,
      errorRuns: 0,
      slowestDurationMs: 0,
      lastStartedAt: 0,
    };

    current.totalRuns += 1;
    current.totalDurationMs += row.durationMs;
    current.totalTokens += row.totalTokens;
    current.totalToolCalls += row.toolCalls;
    current.errorRuns += row.status === "error" ? 1 : 0;
    current.slowestDurationMs = Math.max(current.slowestDurationMs, row.durationMs);
    current.lastStartedAt = Math.max(current.lastStartedAt, row.startedAt);

    bySkill.set(row.skillName, current);
  }

  return [...bySkill.values()]
    .map((row) => ({
      skillName: row.skillName,
      totalRuns: row.totalRuns,
      avgDurationMs: Math.trunc(row.totalDurationMs / row.totalRuns),
      totalTokens: row.totalTokens,
      totalToolCalls: row.totalToolCalls,
      errorRuns: row.errorRuns,
      avgTokens: Math.trunc(row.totalTokens / row.totalRuns),
      slowestDurationMs: row.slowestDurationMs,
      lastStartedAt: row.lastStartedAt,
    }))
    .sort((a, b) => b.totalRuns - a.totalRuns || b.lastStartedAt - a.lastStartedAt);
}

function createReadSnapshot(rows: SkillRunRow[]) {
  const aggregates = aggregateSkillRows(rows);

  return {
    overviewRows: aggregates.map(({ errorRuns, avgTokens, slowestDurationMs, ...row }) => row),
    healthRows: aggregates.map(({ totalToolCalls, totalTokens, ...row }) => row),
    recentRows: rows.map((row) => ({
      skillName: row.skillName,
      status: row.status,
      durationMs: row.durationMs,
      totalTokens: row.totalTokens,
      toolCalls: row.toolCalls,
      startedAt: row.startedAt,
    })),
  };
}

export function createSkillQueries(
  storage: Pick<AnalyticsDatabase, "listSkillRuns" | "listSkillRunsByName">,
): SkillQueries {
  function overview(limit = DEFAULT_LIMIT): OverviewRow[] {
    const snapshot = createReadSnapshot(storage.listSkillRuns());
    return snapshot.overviewRows.slice(0, clampLimit(limit));
  }

  function detail(name: string): DetailRow | null {
    const row = aggregateSkillRows(storage.listSkillRunsByName(name))[0];
    if (!row) return null;
    const { errorRuns, avgTokens, slowestDurationMs, ...detailRow } = row;
    return detailRow;
  }

  function health(): HealthRow[];
  function health(name: string): HealthRow | null;
  function health(name?: string): HealthRow[] | HealthRow | null {
    const rows = name ? storage.listSkillRunsByName(name) : storage.listSkillRuns();
    const snapshot = createReadSnapshot(rows);
    return name ? snapshot.healthRows[0] ?? null : snapshot.healthRows;
  }

  function recent(limit = DEFAULT_LIMIT): RecentRow[] {
    const snapshot = createReadSnapshot(storage.listSkillRuns());
    return snapshot.recentRows.slice(0, clampLimit(limit));
  }

  function exportPayload(limit = DEFAULT_LIMIT): ExportPayload {
    const safeLimit = clampLimit(limit);
    const snapshot = createReadSnapshot(storage.listSkillRuns());

    return {
      generatedAt: new Date().toISOString(),
      overview: snapshot.overviewRows.slice(0, safeLimit),
      recent: snapshot.recentRows.slice(0, safeLimit),
    };
  }

  return {
    overview,
    detail,
    health,
    recent,
    exportPayload,
  };
}
