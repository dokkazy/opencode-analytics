import path from "node:path";
import { DEFAULT_STORAGE_RELATIVE_PATH } from "../shared/constants";
import type { AnalyticsConfig, ResolveConfigInput } from "../shared/config-types";

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function defaultStoragePath(homeDir: string) {
  return path.join(homeDir, DEFAULT_STORAGE_RELATIVE_PATH);
}

export function resolveConfig({
  opencodeConfig,
  env,
  homeDir,
}: ResolveConfigInput): AnalyticsConfig {
  const pluginConfig = opencodeConfig?.opencodeAnalytics ?? {};
  const envEnabled = parseBoolean(env.OPENCODE_ANALYTICS_ENABLED);
  const envDebug = parseBoolean(env.OPENCODE_ANALYTICS_DEBUG);
  const envCommands = parseBoolean(env.OPENCODE_ANALYTICS_COMMANDS_ENABLED);
  const envTrackerSkill = parseBoolean(env.OPENCODE_ANALYTICS_TRACKERS_SKILL_ENABLED);

  return {
    enabled: envEnabled ?? pluginConfig.enabled ?? true,
    debug: envDebug ?? pluginConfig.debug ?? false,
    storagePath:
      env.OPENCODE_ANALYTICS_STORAGE_PATH ??
      pluginConfig.storagePath ??
      defaultStoragePath(homeDir),
    commands: {
      enabled: envCommands ?? pluginConfig.commands?.enabled ?? true,
    },
    trackers: {
      skill: {
        enabled: envTrackerSkill ?? pluginConfig.trackers?.skill?.enabled ?? true,
      },
    },
  };
}
