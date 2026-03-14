import { MAX_LIMIT } from "../shared/constants";
import type { RuntimeState } from "../shared/runtime-types";
import type {
  DetailRow,
  ExportPayload,
  HealthRow,
  OverviewRow,
  RecentRow,
  SkillQueries,
} from "../queries/skills";
import type { SkillsUnavailablePayload } from "../formatters/skills";

export interface SkillsWarningPayload {
  code: "analytics-runtime-warning";
  state: Extract<RuntimeState, "disabled-after-runtime-error">;
  title: string;
  detail: string;
  reason: string | null;
}

export type SkillToolResult<T> =
  | {
      ok: true;
      state: "active";
      data: T;
    }
  | {
      ok: true;
      state: "disabled-after-runtime-error";
      data: T;
      warning: SkillsWarningPayload;
    }
  | {
      ok: false;
      state: "disabled-at-startup";
      unavailable: SkillsUnavailablePayload;
    };

type HealthResult = HealthRow[] | HealthRow | null;

export interface SkillTools {
  overview(args?: { limit?: number }): SkillToolResult<OverviewRow[]>;
  detail(args: { name: string }): SkillToolResult<DetailRow | null>;
  health(args?: { name?: string }): SkillToolResult<HealthResult>;
  recent(args?: { limit?: number }): SkillToolResult<RecentRow[]>;
  export(args?: { limit?: number }): SkillToolResult<ExportPayload>;
}

interface RuntimeReader {
  current(): RuntimeState;
  reason(): string | null;
}

interface CreateSkillToolsOptions {
  queries: SkillQueries;
  runtime: RuntimeReader;
}

function assertObject(value: unknown, label: string) {
  if (value === undefined) return {} as Record<string, unknown>;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} arguments must be an object`);
  }

  return value as Record<string, unknown>;
}

function assertNoExtraKeys(args: Record<string, unknown>, allowedKeys: string[], label: string) {
  const extras = Object.keys(args).filter((key) => !allowedKeys.includes(key));
  if (extras.length > 0) {
    throw new TypeError(`${label} received unsupported argument(s): ${extras.join(", ")}`);
  }
}

function validateLimit(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new TypeError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }

  return value;
}

function validateName(value: unknown) {
  if (typeof value !== "string") {
    throw new TypeError("name must be a non-empty string");
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError("name must be a non-empty string");
  }

  return normalized;
}

function createUnavailable(state: Extract<RuntimeState, "disabled-at-startup">, reason: string | null): SkillsUnavailablePayload {
  return {
    code: "analytics-unavailable",
    state,
    title: "Analytics unavailable",
    detail: "Analytics commands are unavailable because startup initialization failed.",
    reason,
  };
}

function createWarning(state: Extract<RuntimeState, "disabled-after-runtime-error">, reason: string | null): SkillsWarningPayload {
  return {
    code: "analytics-runtime-warning",
    state,
    title: "Analytics collection disabled",
    detail: "Analytics collection stopped after a runtime error. Showing the last persisted data.",
    reason,
  };
}

function resolveRuntime<T>(runtime: RuntimeReader, read: () => T): SkillToolResult<T> {
  const state = runtime.current();
  const reason = runtime.reason();

  if (state === "disabled-at-startup") {
    return {
      ok: false,
      state,
      unavailable: createUnavailable(state, reason),
    };
  }

  const data = read();

  if (state === "disabled-after-runtime-error") {
    return {
      ok: true,
      state,
      data,
      warning: createWarning(state, reason),
    };
  }

  return {
    ok: true,
    state,
    data,
  };
}

export function createSkillTools({ queries, runtime }: CreateSkillToolsOptions): SkillTools {
  return {
    overview(rawArgs) {
      const args = assertObject(rawArgs, "overview");
      assertNoExtraKeys(args, ["limit"], "overview");
      const limit = validateLimit(args.limit);
      return resolveRuntime(runtime, () => queries.overview(limit));
    },
    detail(rawArgs) {
      const args = assertObject(rawArgs, "detail");
      assertNoExtraKeys(args, ["name"], "detail");
      const name = validateName(args.name);
      return resolveRuntime(runtime, () => queries.detail(name));
    },
    health(rawArgs) {
      const args = assertObject(rawArgs, "health");
      assertNoExtraKeys(args, ["name"], "health");
      const name = args.name === undefined ? undefined : validateName(args.name);
      return resolveRuntime(runtime, () => (name === undefined ? queries.health() : queries.health(name)));
    },
    recent(rawArgs) {
      const args = assertObject(rawArgs, "recent");
      assertNoExtraKeys(args, ["limit"], "recent");
      const limit = validateLimit(args.limit);
      return resolveRuntime(runtime, () => queries.recent(limit));
    },
    export(rawArgs) {
      const args = assertObject(rawArgs, "export");
      assertNoExtraKeys(args, ["limit"], "export");
      const limit = validateLimit(args.limit);
      return resolveRuntime(runtime, () => queries.exportPayload(limit));
    },
  };
}
