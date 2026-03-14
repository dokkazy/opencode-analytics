import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenCodeAnalyticsPlugin from "../src/index";
import type { SkillRunInput } from "../src/storage/db";

const envKeys = [
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "OPENCODE_ANALYTICS_COMMANDS_ENABLED",
  "OPENCODE_ANALYTICS_STORAGE_PATH",
] as const;

const originalEnv = new Map<string, string | undefined>(
  envKeys.map((key) => [key, process.env[key]]),
);

const SEEDED_RUN: SkillRunInput = {
  sessionId: "seed-session",
  messageId: "seed-message",
  skillName: "brainstorming",
  trigger: "skill",
  startedAt: 1_700_000_000_000,
  finishedAt: 1_700_000_000_120,
  durationMs: 120,
  agent: "coder-agent",
  modelProviderId: "openai",
  modelId: "gpt-5.4",
  inputTokens: 10,
  outputTokens: 14,
  totalTokens: 24,
  toolCalls: 2,
  status: "completed",
};

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function makeTempDir(label: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
}

function writeOpencodeConfig(worktree: string, config: Record<string, unknown>) {
  fs.writeFileSync(path.join(worktree, "opencode.json"), JSON.stringify(config, null, 2));
}

async function createPlugin(options?: {
  worktree?: string;
  directory?: string;
  opencodeConfig?: Record<string, unknown>;
  projectConfig?: Record<string, unknown>;
  env?: Partial<NodeJS.ProcessEnv>;
  testOverrides?: {
    startupError?: Error | string;
    seedRows?: SkillRunInput[];
    trackerInsertError?: Error;
  };
}) {
  const worktree = options?.worktree ?? makeTempDir("opencode-analytics-plugin-worktree");
  const directory = options?.directory ?? worktree;
  const home = makeTempDir("opencode-analytics-plugin-home");

  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.HOMEDRIVE = path.parse(home).root.replace(/\\$/, "");
  process.env.HOMEPATH = home.slice(process.env.HOMEDRIVE.length) || path.sep;

  if (options?.env) {
    for (const [key, value] of Object.entries(options.env)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  if (options?.opencodeConfig) {
    writeOpencodeConfig(worktree, options.opencodeConfig);
  }

  const hooks = await OpenCodeAnalyticsPlugin({
    client: {},
    project: options?.projectConfig ? { config: options.projectConfig } : {},
    directory,
    worktree,
    serverUrl: new URL("https://example.com"),
    $: {},
    __testOverrides: options?.testOverrides,
  } as never);

  return { hooks, worktree, directory, home };
}

async function executeTool(
  hooks: Awaited<ReturnType<typeof OpenCodeAnalyticsPlugin>>,
  name: string,
  args: Record<string, unknown> = {},
) {
  const tool = hooks.tool?.[name];
  expect(tool).toBeDefined();

  const result = await tool!.execute(args as never, {
    sessionID: "session-1",
    messageID: "message-1",
    agent: "coder-agent",
    directory: ".",
    worktree: ".",
    abort: new AbortController().signal,
    metadata() {},
    async ask() {},
  });

  return JSON.parse(result);
}

async function runCommand(
  hooks: Awaited<ReturnType<typeof OpenCodeAnalyticsPlugin>>,
  command: string,
  args = "",
) {
  const output: { parts: Array<{ type: string; text: string }> } = { parts: [] };
  await hooks["command.execute.before"]?.(
    {
      command,
      sessionID: "session-1",
      arguments: args,
    },
    output as never,
  );

  return output.parts[0]?.text ?? "";
}

test("registers the five tools, seeds storage, uses home-dir default storage, and registers commands when enabled", async () => {
  const { hooks, home } = await createPlugin({
    opencodeConfig: {
      opencodeAnalytics: {
        commands: { enabled: true },
      },
    },
    testOverrides: {
      seedRows: [SEEDED_RUN],
    },
  });

  expect(Object.keys(hooks.tool ?? {}).sort()).toEqual([
    "skill_analytics_detail",
    "skill_analytics_export",
    "skill_analytics_health",
    "skill_analytics_overview",
    "skill_analytics_recent",
  ]);

  const config = { command: {} as Record<string, unknown> };
  await hooks.config?.(config as never);
  expect(Object.keys(config.command).sort()).toEqual([
    "skill-analytics-detail",
    "skill-analytics-export",
    "skill-analytics-health",
    "skill-analytics-overview",
    "skill-analytics-recent",
  ]);

  const overview = await executeTool(hooks, "skill_analytics_overview", { limit: 5 });
  expect(overview).toEqual({
    ok: true,
    state: "active",
    data: [expect.objectContaining({ skillName: "brainstorming", totalRuns: 1 })],
  });

  expect(
    fs.existsSync(path.join(home, ".opencode-analytics", "data", "analytics.sqlite")),
  ).toBe(true);
});

test("env overrides project config so commands are not registered when commands.enabled resolves false", async () => {
  const { hooks } = await createPlugin({
    opencodeConfig: {
      opencodeAnalytics: {
        commands: { enabled: true },
      },
    },
    env: {
      OPENCODE_ANALYTICS_COMMANDS_ENABLED: "false",
    },
  });

  expect(hooks.config).toBeUndefined();
  expect(hooks["command.execute.before"]).toBeUndefined();
});

test("startup failure still exposes read tools with unavailable payloads and commands render unavailable output", async () => {
  const { hooks } = await createPlugin({
    opencodeConfig: {
      opencodeAnalytics: {
        commands: { enabled: true },
      },
    },
    testOverrides: {
      startupError: new Error("forced startup failure"),
    },
  });

  const detail = await executeTool(hooks, "skill_analytics_detail", { name: "brainstorming" });
  expect(detail).toEqual({
    ok: false,
    state: "disabled-at-startup",
    unavailable: expect.objectContaining({
      code: "analytics-unavailable",
      reason: "forced startup failure",
    }),
  });

  const commandOutput = await runCommand(hooks, "skill-analytics-overview");
  expect(commandOutput).toContain("Analytics unavailable");
  expect(commandOutput).toContain("forced startup failure");
});

test("runtime write failure disables future recording until restart while read tools and export command remain available with warnings", async () => {
  const { hooks } = await createPlugin({
    opencodeConfig: {
      opencodeAnalytics: {
        commands: { enabled: true },
      },
    },
    testOverrides: {
      seedRows: [SEEDED_RUN],
      trackerInsertError: new Error("forced tracker insert failure"),
    },
  });

  await hooks["tool.execute.before"]?.(
    { tool: "skill", sessionID: "runtime-session", callID: "call-1" },
    { args: { name: "javascript-typescript" } } as never,
  );
  await hooks.event?.({
    event: {
      type: "assistant.completed",
      sessionId: "runtime-session",
      timestamp: 1_700_000_000_400,
      messageId: "assistant-runtime-1",
      agent: "coder-agent",
      modelProviderId: "openai",
      modelId: "gpt-5.4",
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      toolCalls: 1,
      outcome: "completed",
    },
  } as never);

  await hooks["tool.execute.before"]?.(
    { tool: "skill", sessionID: "runtime-session", callID: "call-2" },
    { args: { name: "should-be-skipped" } } as never,
  );
  await hooks["chat.message"]?.(
    { sessionID: "runtime-session", messageID: "assistant-runtime-2", agent: "coder-agent" },
    {
      message: { role: "assistant" } as never,
      parts: [
        {
          id: "assistant-runtime-2",
          role: "assistant",
          agent: "coder-agent",
          modelProviderId: "openai",
          modelId: "gpt-5.4",
          usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
          toolCalls: 1,
          outcome: "completed",
        },
      ],
    } as never,
  );

  const overview = await executeTool(hooks, "skill_analytics_overview", { limit: 5 });
  expect(overview).toEqual({
    ok: true,
    state: "disabled-after-runtime-error",
    data: [expect.objectContaining({ skillName: "brainstorming", totalRuns: 1 })],
    warning: expect.objectContaining({
      code: "analytics-runtime-warning",
      reason: "forced tracker insert failure",
    }),
  });

  const exported = JSON.parse(await runCommand(hooks, "skill-analytics-export", "5"));
  expect(exported).toEqual({
    warning: expect.objectContaining({ reason: "forced tracker insert failure" }),
    data: {
      generatedAt: expect.any(String),
      overview: [expect.objectContaining({ skillName: "brainstorming" })],
      recent: [expect.objectContaining({ skillName: "brainstorming" })],
    },
  });
});

test("commands handle detail notFound and tracker hooks do not forward when the tracker is disabled", async () => {
  const { hooks } = await createPlugin({
    opencodeConfig: {
      opencodeAnalytics: {
        commands: { enabled: true },
        trackers: { skill: { enabled: false } },
      },
    },
    testOverrides: {
      trackerInsertError: new Error("should never fire"),
    },
  });

  await hooks["tool.execute.before"]?.(
    { tool: "skill", sessionID: "session-disabled", callID: "disabled-call-1" },
    { args: { name: "brainstorming" } } as never,
  );
  await hooks.event?.({
    event: {
      type: "assistant.completed",
      sessionId: "session-disabled",
      timestamp: 100,
      messageId: "assistant-disabled-1",
      agent: "coder-agent",
      modelProviderId: "openai",
      modelId: "gpt-5.4",
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      toolCalls: 1,
      outcome: "completed",
    },
  } as never);
  await hooks["chat.message"]?.(
    { sessionID: "session-disabled", messageID: "assistant-disabled-2", agent: "coder-agent" },
    {
      message: { role: "assistant" } as never,
      parts: [],
    } as never,
  );

  const overview = await executeTool(hooks, "skill_analytics_overview", { limit: 5 });
  expect(overview).toEqual({ ok: true, state: "active", data: [] });

  const detailOutput = await runCommand(hooks, "skill-analytics-detail", "missing-skill");
  expect(detailOutput).toBe('Skill detail\nNo skill run found for "missing-skill".');
});

test("command layer returns user-friendly validation errors for invalid numeric and blank detail arguments", async () => {
  const { hooks } = await createPlugin({
    opencodeConfig: {
      opencodeAnalytics: {
        commands: { enabled: true },
      },
    },
  });

  await expect(runCommand(hooks, "skill-analytics-overview", "abc")).resolves.toBe(
    'Invalid arguments for /skill-analytics-overview\n- limit must be an integer between 1 and 50.',
  );
  await expect(runCommand(hooks, "skill-analytics-recent", "1.5")).resolves.toBe(
    'Invalid arguments for /skill-analytics-recent\n- limit must be an integer between 1 and 50.',
  );
  await expect(runCommand(hooks, "skill-analytics-detail", "   ")).resolves.toBe(
    'Invalid arguments for /skill-analytics-detail\n- name is required.',
  );
});

test("command layer rejects unsupported extra positional arguments with controlled output", async () => {
  const { hooks } = await createPlugin({
    opencodeConfig: {
      opencodeAnalytics: {
        commands: { enabled: true },
      },
    },
  });

  await expect(runCommand(hooks, "skill-analytics-export", "5 extra")).resolves.toBe(
    'Invalid arguments for /skill-analytics-export\n- unexpected extra arguments: extra.',
  );
  await expect(runCommand(hooks, "skill-analytics-overview", "5 extra")).resolves.toBe(
    'Invalid arguments for /skill-analytics-overview\n- unexpected extra arguments: extra.',
  );
});

test("command layer accepts spaced skill names for detail and health", async () => {
  const spacedRun: SkillRunInput = {
    ...SEEDED_RUN,
    messageId: "seed-spaced-message",
    skillName: "brainstorming advanced",
  };

  const { hooks } = await createPlugin({
    opencodeConfig: {
      opencodeAnalytics: {
        commands: { enabled: true },
      },
    },
    testOverrides: {
      seedRows: [spacedRun],
    },
  });

  await expect(runCommand(hooks, "skill-analytics-detail", "brainstorming advanced")).resolves.toContain(
    "skillName: brainstorming advanced",
  );
  await expect(runCommand(hooks, "skill-analytics-health", "brainstorming advanced")).resolves.toContain(
    "- brainstorming advanced | runs=1",
  );
});

test("config merge keeps nested file settings unless project config overrides them, and env still wins", async () => {
  const completionTimestamp = Date.now() + 1_000;

  const { hooks } = await createPlugin({
    opencodeConfig: {
      opencodeAnalytics: {
        commands: { enabled: true },
        trackers: { skill: { enabled: false } },
      },
    },
    projectConfig: {
      opencodeAnalytics: {
        trackers: { skill: { enabled: true } },
      },
    },
    env: {
      OPENCODE_ANALYTICS_COMMANDS_ENABLED: "false",
    },
  });

  expect(hooks.config).toBeUndefined();

  await hooks["tool.execute.before"]?.(
    { tool: "skill", sessionID: "merged-session", callID: "merged-call-1" },
    { args: { name: "brainstorming" } } as never,
  );
  await hooks.event?.({
    event: {
      type: "assistant.completed",
      sessionId: "merged-session",
      timestamp: completionTimestamp,
      messageId: "assistant-merged-1",
      agent: "coder-agent",
      modelProviderId: "openai",
      modelId: "gpt-5.4",
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
      toolCalls: 1,
      outcome: "completed",
    },
  } as never);

  const overview = await executeTool(hooks, "skill_analytics_overview", { limit: 5 });
  expect(overview).toEqual({
    ok: true,
    state: "active",
    data: [expect.objectContaining({ skillName: "brainstorming", totalRuns: 1 })],
  });
});

test("malformed assistant completion and chat message payloads are ignored without disabling runtime analytics", async () => {
  const { hooks } = await createPlugin({
    opencodeConfig: {
      opencodeAnalytics: {
        commands: { enabled: true },
      },
    },
    testOverrides: {
      seedRows: [SEEDED_RUN],
      trackerInsertError: new Error("should not be reached by malformed events"),
    },
  });

  await hooks["tool.execute.before"]?.(
    { tool: "skill", sessionID: "malformed-session", callID: "malformed-call-1" },
    { args: { name: "ignored malformed outcome" } } as never,
  );
  await hooks.event?.({
    event: {
      type: "assistant.completed",
      sessionId: "malformed-session",
      timestamp: Date.now() + 1_000,
      messageId: "assistant-malformed-1",
      agent: "coder-agent",
      modelProviderId: "openai",
      modelId: "gpt-5.4",
      usage: { inputTokens: 1, outputTokens: 2 },
      toolCalls: 1,
      outcome: "pending",
    },
  } as never);

  await hooks["tool.execute.before"]?.(
    { tool: "skill", sessionID: "malformed-session", callID: "malformed-call-2" },
    { args: { name: "ignored malformed chat" } } as never,
  );
  await hooks["chat.message"]?.(
    { sessionID: "malformed-session", messageID: "assistant-malformed-2", agent: "coder-agent" },
    {
      message: { role: "assistant" } as never,
      parts: [
        {
          id: "assistant-malformed-2",
          role: "assistant",
          agent: "coder-agent",
          usage: { inputTokens: 1, totalTokens: 3 },
          toolCalls: 1,
          outcome: "broken",
        },
      ],
    } as never,
  );

  const overview = await executeTool(hooks, "skill_analytics_overview", { limit: 5 });
  expect(overview).toEqual({
    ok: true,
    state: "active",
    data: [expect.objectContaining({ skillName: "brainstorming", totalRuns: 1 })],
  });
});
