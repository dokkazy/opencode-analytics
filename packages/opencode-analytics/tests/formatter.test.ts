import { expect, test } from "bun:test";
import {
  formatSkillDetail,
  formatSkillHealth,
  formatSkillOverview,
  formatSkillRecent,
  formatSkillsUnavailable,
} from "../src/formatters/skills";

test("formats overview rows for terminal output", () => {
  const output = formatSkillOverview([
    {
      skillName: "brainstorming",
      totalRuns: 4,
      avgDurationMs: 125,
      totalTokens: 430,
      totalToolCalls: 9,
      lastStartedAt: 1_700_000_000_000,
    },
  ]);

  expect(output).toBe(
    "Skill overview\n- brainstorming | runs=4 | avg=125ms | tokens=430 | tools=9 | last=2023-11-14T22:13:20.000Z",
  );
});

test("formats empty overview output", () => {
  const output = formatSkillOverview([]);

  expect(output).toBe("Skill overview\nNo skill runs recorded.");
});

test("formats detail rows for terminal output", () => {
  const output = formatSkillDetail({
    skillName: "javascript-typescript",
    totalRuns: 3,
    avgDurationMs: 88,
    totalTokens: 220,
    totalToolCalls: 6,
    lastStartedAt: 1_700_000_000_000,
  });

  expect(output).toBe([
    "Skill detail",
    "skillName: javascript-typescript",
    "totalRuns: 3",
    "avgDurationMs: 88ms",
    "totalTokens: 220",
    "totalToolCalls: 6",
    "lastStartedAt: 2023-11-14T22:13:20.000Z",
  ].join("\n"));
});

test("formats null detail output", () => {
  const output = formatSkillDetail(null);

  expect(output).toBe("Skill detail\nNo skill run found for the requested name.");
});

test("formats health rows for terminal output", () => {
  const output = formatSkillHealth([
    {
      skillName: "using-superpowers",
      totalRuns: 8,
      errorRuns: 1,
      avgDurationMs: 145,
      avgTokens: 91,
      slowestDurationMs: 410,
      lastStartedAt: 1_700_000_000_000,
    },
  ]);

  expect(output).toBe(
    "Skill health\n- using-superpowers | runs=8 | errors=1 | avg=145ms | avgTokens=91 | slowest=410ms | last=2023-11-14T22:13:20.000Z",
  );
});

test("formats a single health row for terminal output", () => {
  const output = formatSkillHealth({
    skillName: "using-superpowers",
    totalRuns: 8,
    errorRuns: 1,
    avgDurationMs: 145,
    avgTokens: 91,
    slowestDurationMs: 410,
    lastStartedAt: 1_700_000_000_000,
  });

  expect(output).toBe(
    "Skill health\n- using-superpowers | runs=8 | errors=1 | avg=145ms | avgTokens=91 | slowest=410ms | last=2023-11-14T22:13:20.000Z",
  );
});

test("formats null health output", () => {
  const output = formatSkillHealth(null);

  expect(output).toBe("Skill health\nNo health rows available.");
});

test("formats recent rows for terminal output", () => {
  const output = formatSkillRecent([
    {
      skillName: "brainstorming",
      status: "completed",
      durationMs: 75,
      totalTokens: 50,
      toolCalls: 2,
      startedAt: 1_700_000_000_000,
    },
  ]);

  expect(output).toBe(
    "Recent skill runs\n- brainstorming | status=completed | duration=75ms | tokens=50 | tools=2 | started=2023-11-14T22:13:20.000Z",
  );
});

test("formats empty recent output", () => {
  const output = formatSkillRecent([]);

  expect(output).toBe("Recent skill runs\nNo recent skill runs recorded.");
});

test("formats unavailable payloads for terminal output", () => {
  const output = formatSkillsUnavailable({
    code: "analytics-unavailable",
    state: "disabled-at-startup",
    title: "Analytics unavailable",
    detail: "Analytics commands are unavailable because startup initialization failed.",
    reason: "storage open failed",
  });

  expect(output).toBe([
    "Analytics unavailable",
    "state: disabled-at-startup",
    "Analytics commands are unavailable because startup initialization failed.",
    "reason: storage open failed",
  ].join("\n"));
});

test("formats unavailable payloads with null reason", () => {
  const output = formatSkillsUnavailable({
    code: "analytics-unavailable",
    state: "disabled-at-startup",
    title: "Analytics unavailable",
    detail: "Analytics commands are unavailable because startup initialization failed.",
    reason: null,
  });

  expect(output).toBe([
    "Analytics unavailable",
    "state: disabled-at-startup",
    "Analytics commands are unavailable because startup initialization failed.",
    "reason: No additional reason was provided.",
  ].join("\n"));
});
