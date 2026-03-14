import { expect, test } from "bun:test";
import type { HealthRow, SkillQueries } from "../src/queries/skills";
import { createSkillTools } from "../src/tools/skills";

function createQueriesStub(): SkillQueries {
  function overview(limit?: number) {
    return [
      {
        skillName: `overview-${String(limit ?? "default")}`,
        totalRuns: 2,
        avgDurationMs: 90,
        totalTokens: 120,
        totalToolCalls: 4,
        lastStartedAt: 1_700_000_000_000,
      },
    ];
  }

  function detail(name: string) {
    return {
      skillName: name,
      totalRuns: 1,
      avgDurationMs: 40,
      totalTokens: 80,
      totalToolCalls: 2,
      lastStartedAt: 1_700_000_000_000,
    };
  }

  function health(): HealthRow[];
  function health(name: string): HealthRow | null;
  function health(name?: string): HealthRow[] | HealthRow | null {
    if (name) {
      return {
        skillName: name,
        totalRuns: 1,
        errorRuns: 0,
        avgDurationMs: 50,
        avgTokens: 25,
        slowestDurationMs: 50,
        lastStartedAt: 1_700_000_000_000,
      };
    }

    return [
      {
        skillName: "health-all",
        totalRuns: 2,
        errorRuns: 1,
        avgDurationMs: 90,
        avgTokens: 45,
        slowestDurationMs: 130,
        lastStartedAt: 1_700_000_000_000,
      },
    ];
  }

  function recent(limit?: number) {
    return [
      {
        skillName: `recent-${String(limit ?? "default")}`,
        status: "completed" as const,
        durationMs: 75,
        totalTokens: 20,
        toolCalls: 1,
        startedAt: 1_700_000_000_000,
      },
    ];
  }

  function exportPayload(limit?: number) {
    return {
      generatedAt: "2026-03-14T00:00:00.000Z",
      overview: overview(limit),
      recent: recent(limit),
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

function runtime(state: "active" | "disabled-at-startup" | "disabled-after-runtime-error", reason: string | null) {
  return {
    current() {
      return state;
    },
    reason() {
      return reason;
    },
  };
}

test("active tools return structured data for overview/detail/health/recent/export", () => {
  const tools = createSkillTools({
    queries: createQueriesStub(),
    runtime: runtime("active", null),
  });

  expect(tools.overview({ limit: 2 })).toEqual({
    ok: true,
    state: "active",
    data: [
      expect.objectContaining({
        skillName: "overview-2",
      }),
    ],
  });

  expect(tools.detail({ name: "  brainstorming  " })).toEqual({
    ok: true,
    state: "active",
    data: expect.objectContaining({ skillName: "brainstorming" }),
  });

  expect(tools.health({ name: "brainstorming" })).toEqual({
    ok: true,
    state: "active",
    data: expect.objectContaining({ skillName: "brainstorming" }),
  });

  expect(tools.health()).toEqual({
    ok: true,
    state: "active",
    data: [
      expect.objectContaining({
        skillName: "health-all",
      }),
    ],
  });

  expect(tools.recent({ limit: 3 })).toEqual({
    ok: true,
    state: "active",
    data: [
      expect.objectContaining({
        skillName: "recent-3",
      }),
    ],
  });

  expect(tools.export({ limit: 4 })).toEqual({
    ok: true,
    state: "active",
    data: {
      generatedAt: "2026-03-14T00:00:00.000Z",
      overview: [expect.objectContaining({ skillName: "overview-4" })],
      recent: [expect.objectContaining({ skillName: "recent-4" })],
    },
  });
});

test("disabled-at-startup returns unavailable payloads and does not expose data", () => {
  const tools = createSkillTools({
    queries: createQueriesStub(),
    runtime: runtime("disabled-at-startup", "startup migration failed"),
  });

  expect(tools.overview()).toEqual({
    ok: false,
    state: "disabled-at-startup",
    unavailable: {
      code: "analytics-unavailable",
      state: "disabled-at-startup",
      title: "Analytics unavailable",
      detail: "Analytics commands are unavailable because startup initialization failed.",
      reason: "startup migration failed",
    },
  });

  expect(tools.detail({ name: "brainstorming" })).toEqual({
    ok: false,
    state: "disabled-at-startup",
    unavailable: {
      code: "analytics-unavailable",
      state: "disabled-at-startup",
      title: "Analytics unavailable",
      detail: "Analytics commands are unavailable because startup initialization failed.",
      reason: "startup migration failed",
    },
  });

  expect(tools.health({ name: "brainstorming" })).toEqual({
    ok: false,
    state: "disabled-at-startup",
    unavailable: {
      code: "analytics-unavailable",
      state: "disabled-at-startup",
      title: "Analytics unavailable",
      detail: "Analytics commands are unavailable because startup initialization failed.",
      reason: "startup migration failed",
    },
  });

  expect(tools.recent()).toEqual({
    ok: false,
    state: "disabled-at-startup",
    unavailable: {
      code: "analytics-unavailable",
      state: "disabled-at-startup",
      title: "Analytics unavailable",
      detail: "Analytics commands are unavailable because startup initialization failed.",
      reason: "startup migration failed",
    },
  });

  expect(tools.export()).toEqual({
    ok: false,
    state: "disabled-at-startup",
    unavailable: {
      code: "analytics-unavailable",
      state: "disabled-at-startup",
      title: "Analytics unavailable",
      detail: "Analytics commands are unavailable because startup initialization failed.",
      reason: "startup migration failed",
    },
  });
});

test("disabled-after-runtime-error returns readable data with warning metadata", () => {
  const tools = createSkillTools({
    queries: createQueriesStub(),
    runtime: runtime("disabled-after-runtime-error", "disk full during persist"),
  });

  expect(tools.overview()).toEqual({
    ok: true,
    state: "disabled-after-runtime-error",
    data: [expect.objectContaining({ skillName: "overview-default" })],
    warning: {
      code: "analytics-runtime-warning",
      state: "disabled-after-runtime-error",
      title: "Analytics collection disabled",
      detail: "Analytics collection stopped after a runtime error. Showing the last persisted data.",
      reason: "disk full during persist",
    },
  });

  expect(tools.recent()).toEqual({
    ok: true,
    state: "disabled-after-runtime-error",
    data: [expect.objectContaining({ skillName: "recent-default" })],
    warning: {
      code: "analytics-runtime-warning",
      state: "disabled-after-runtime-error",
      title: "Analytics collection disabled",
      detail: "Analytics collection stopped after a runtime error. Showing the last persisted data.",
      reason: "disk full during persist",
    },
  });

  expect(tools.detail({ name: "brainstorming" })).toEqual({
    ok: true,
    state: "disabled-after-runtime-error",
    data: expect.objectContaining({ skillName: "brainstorming" }),
    warning: {
      code: "analytics-runtime-warning",
      state: "disabled-after-runtime-error",
      title: "Analytics collection disabled",
      detail: "Analytics collection stopped after a runtime error. Showing the last persisted data.",
      reason: "disk full during persist",
    },
  });

  expect(tools.health({ name: "brainstorming" })).toEqual({
    ok: true,
    state: "disabled-after-runtime-error",
    data: expect.objectContaining({ skillName: "brainstorming" }),
    warning: {
      code: "analytics-runtime-warning",
      state: "disabled-after-runtime-error",
      title: "Analytics collection disabled",
      detail: "Analytics collection stopped after a runtime error. Showing the last persisted data.",
      reason: "disk full during persist",
    },
  });

  expect(tools.export({ limit: 4 })).toEqual({
    ok: true,
    state: "disabled-after-runtime-error",
    data: {
      generatedAt: "2026-03-14T00:00:00.000Z",
      overview: [expect.objectContaining({ skillName: "overview-4" })],
      recent: [expect.objectContaining({ skillName: "recent-4" })],
    },
    warning: {
      code: "analytics-runtime-warning",
      state: "disabled-after-runtime-error",
      title: "Analytics collection disabled",
      detail: "Analytics collection stopped after a runtime error. Showing the last persisted data.",
      reason: "disk full during persist",
    },
  });
});

test("validates tool arguments against the spec", () => {
  const tools = createSkillTools({
    queries: createQueriesStub(),
    runtime: runtime("active", null),
  });

  expect(() => tools.overview(null as never)).toThrow(/object/i);
  expect(() => tools.detail("brainstorming" as never)).toThrow(/object/i);
  expect(() => tools.health([] as never)).toThrow(/object/i);
  expect(() => tools.recent(false as never)).toThrow(/object/i);
  expect(() => tools.export("4" as never)).toThrow(/object/i);
  expect(() => tools.overview({ limit: 0 })).toThrow(/limit/i);
  expect(() => tools.overview({ limit: Number.NaN })).toThrow(/limit/i);
  expect(() => tools.recent({ limit: 1.5 })).toThrow(/limit/i);
  expect(() => tools.export({ limit: 51 })).toThrow(/limit/i);
  expect(() => tools.detail({ name: "   " })).toThrow(/name/i);
  expect(() => tools.detail({ name: 123 } as never)).toThrow(/name/i);
  expect(() => tools.health({ name: "" })).toThrow(/name/i);
  expect(() => tools.health({ name: null } as never)).toThrow(/name/i);
  expect(() => tools.detail({ name: "brainstorming", extra: true } as never)).toThrow(/extra/i);
  expect(() => tools.overview({ limit: 1, extra: true } as never)).toThrow(/extra/i);
  expect(() => tools.health({ name: "brainstorming", limit: 1 } as never)).toThrow(/unsupported/i);
});

test("disabled runtime states still validate malformed input before returning data or availability payloads", () => {
  const startupDisabledTools = createSkillTools({
    queries: createQueriesStub(),
    runtime: runtime("disabled-at-startup", "startup migration failed"),
  });
  const runtimeDisabledTools = createSkillTools({
    queries: createQueriesStub(),
    runtime: runtime("disabled-after-runtime-error", "disk full during persist"),
  });

  expect(() => startupDisabledTools.detail({ name: "   " })).toThrow(/name/i);
  expect(() => startupDisabledTools.recent("bad" as never)).toThrow(/object/i);
  expect(() => runtimeDisabledTools.overview({ limit: 0 })).toThrow(/limit/i);
  expect(() => runtimeDisabledTools.health({ name: "", extra: true } as never)).toThrow(/unsupported|name/i);
});
