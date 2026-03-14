import type { DetailRow, HealthRow, OverviewRow, RecentRow } from "../queries/skills";
import type { RuntimeState } from "../shared/runtime-types";

export interface SkillsUnavailablePayload {
  code: "analytics-unavailable";
  state: Extract<RuntimeState, "disabled-at-startup">;
  title: string;
  detail: string;
  reason: string | null;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function formatNullableReason(reason: string | null) {
  return reason ?? "No additional reason was provided.";
}

export function formatSkillOverview(rows: OverviewRow[]) {
  if (rows.length === 0) {
    return "Skill overview\nNo skill runs recorded.";
  }

  return [
    "Skill overview",
    ...rows.map(
      (row) =>
        `- ${row.skillName} | runs=${row.totalRuns} | avg=${row.avgDurationMs}ms | tokens=${row.totalTokens} | tools=${row.totalToolCalls} | last=${formatDate(row.lastStartedAt)}`,
    ),
  ].join("\n");
}

export function formatSkillDetail(row: DetailRow | null) {
  if (!row) {
    return "Skill detail\nNo skill run found for the requested name.";
  }

  return [
    "Skill detail",
    `skillName: ${row.skillName}`,
    `totalRuns: ${row.totalRuns}`,
    `avgDurationMs: ${row.avgDurationMs}ms`,
    `totalTokens: ${row.totalTokens}`,
    `totalToolCalls: ${row.totalToolCalls}`,
    `lastStartedAt: ${formatDate(row.lastStartedAt)}`,
  ].join("\n");
}

export function formatSkillHealth(rows: HealthRow | HealthRow[] | null) {
  if (!rows || (Array.isArray(rows) && rows.length === 0)) {
    return "Skill health\nNo health rows available.";
  }

  const list = Array.isArray(rows) ? rows : [rows];

  return [
    "Skill health",
    ...list.map(
      (row) =>
        `- ${row.skillName} | runs=${row.totalRuns} | errors=${row.errorRuns} | avg=${row.avgDurationMs}ms | avgTokens=${row.avgTokens} | slowest=${row.slowestDurationMs}ms | last=${formatDate(row.lastStartedAt)}`,
    ),
  ].join("\n");
}

export function formatSkillRecent(rows: RecentRow[]) {
  if (rows.length === 0) {
    return "Recent skill runs\nNo recent skill runs recorded.";
  }

  return [
    "Recent skill runs",
    ...rows.map(
      (row) =>
        `- ${row.skillName} | status=${row.status} | duration=${row.durationMs}ms | tokens=${row.totalTokens} | tools=${row.toolCalls} | started=${formatDate(row.startedAt)}`,
    ),
  ].join("\n");
}

export function formatSkillsUnavailable(payload: SkillsUnavailablePayload) {
  return [
    payload.title,
    `state: ${payload.state}`,
    payload.detail,
    `reason: ${formatNullableReason(payload.reason)}`,
  ].join("\n");
}
