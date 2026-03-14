export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;
export const DEFAULT_STORAGE_RELATIVE_PATH = ".opencode-analytics/data/analytics.sqlite";

export const RUNTIME_STATES = {
  ACTIVE: "active",
  DISABLED_AT_STARTUP: "disabled-at-startup",
  DISABLED_AFTER_RUNTIME_ERROR: "disabled-after-runtime-error",
} as const;
