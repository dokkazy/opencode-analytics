import { expect, test } from "bun:test";
import { resolveConfig } from "../src/core/config";
import { createRuntimeState } from "../src/core/state";

test("environment variables override opencode config and defaults", () => {
  const config = resolveConfig({
    opencodeConfig: {
      opencodeAnalytics: {
        debug: false,
        commands: { enabled: true },
      },
    },
    env: {
      OPENCODE_ANALYTICS_DEBUG: "true",
      OPENCODE_ANALYTICS_COMMANDS_ENABLED: "false",
    },
    homeDir: "C:/Users/demo",
  });

  expect(config.debug).toBe(true);
  expect(config.commands.enabled).toBe(false);
  expect(config.storagePath.replaceAll("\\", "/")).toBe(
    "C:/Users/demo/.opencode-analytics/data/analytics.sqlite",
  );
});

test("explicit storagePath precedence prefers env over opencode config", () => {
  const config = resolveConfig({
    opencodeConfig: {
      opencodeAnalytics: {
        storagePath: "C:/config/path/analytics.sqlite",
      },
    },
    env: {
      OPENCODE_ANALYTICS_STORAGE_PATH: "C:/env/path/analytics.sqlite",
    },
    homeDir: "C:/Users/demo",
  });

  expect(config.storagePath.replaceAll("\\", "/")).toBe(
    "C:/env/path/analytics.sqlite",
  );
});

test("opencode config storagePath overrides the default path", () => {
  const config = resolveConfig({
    opencodeConfig: {
      opencodeAnalytics: {
        storagePath: "/tmp/custom-analytics.sqlite",
      },
    },
    env: {},
    homeDir: "/home/demo",
  });

  expect(config.storagePath).toBe("/tmp/custom-analytics.sqlite");
});

test("invalid env values fall back to config/defaults", () => {
  const config = resolveConfig({
    opencodeConfig: {
      opencodeAnalytics: {
        enabled: true,
        trackers: { skill: { enabled: true } },
      },
    },
    env: {
      OPENCODE_ANALYTICS_ENABLED: "not-a-bool",
      OPENCODE_ANALYTICS_TRACKERS_SKILL_ENABLED: "also-bad",
    },
    homeDir: "/home/demo",
  });

  expect(config.enabled).toBe(true);
  expect(config.trackers.skill.enabled).toBe(true);
});

test("runtime state transitions from active to disabled-after-runtime-error", () => {
  const state = createRuntimeState();
  expect(state.current()).toBe("active");
  state.disableAfterRuntimeError("db locked");
  expect(state.current()).toBe("disabled-after-runtime-error");
});

test("runtime state supports startup failure mode", () => {
  const state = createRuntimeState();
  state.disableAtStartup("corrupt db");
  expect(state.current()).toBe("disabled-at-startup");
  expect(state.reason()).toBe("corrupt db");
});
