import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tool, type Plugin } from "@opencode-ai/plugin";
import { createSkillCommands } from "./commands/index";
import { resolveConfig } from "./core/config";
import { createRuntimeState } from "./core/state";
import { formatSkillsUnavailable } from "./formatters/skills";
import { createSkillQueries } from "./queries/skills";
import type { AnalyticsConfig } from "./shared/config-types";
import { createDatabase, type AnalyticsDatabase, type SkillRunInput, type SkillRunRow } from "./storage/db";
import { createSkillTools, type SkillToolResult } from "./tools/skills";
import { createSkillTracker, type SkillTrackerEvent } from "./trackers/skill";

type AnalyticsCommandName =
  | "skill-analytics-overview"
  | "skill-analytics-detail"
  | "skill-analytics-health"
  | "skill-analytics-recent"
  | "skill-analytics-export";

type AnalyticsToolName =
  | "skill_analytics_overview"
  | "skill_analytics_detail"
  | "skill_analytics_health"
  | "skill_analytics_recent"
  | "skill_analytics_export";

interface TestOverrides {
  startupError?: Error | string;
  seedRows?: SkillRunInput[];
  trackerInsertError?: Error;
}

interface RuntimeLike {
  current(): "active" | "disabled-at-startup" | "disabled-after-runtime-error";
  reason(): string | null;
  disableAtStartup(message: string): void;
  disableAfterRuntimeError(message: string): void;
}

interface ReadStorage {
  listSkillRuns(): SkillRunRow[];
  listSkillRunsByName(name: string): SkillRunRow[];
}

type PluginHooks = Awaited<ReturnType<Plugin>>;
type PluginConfigHook = NonNullable<PluginHooks["config"]>;
type PluginConfigInput = Parameters<PluginConfigHook>[0];
type CommandExecuteBeforeHook = NonNullable<PluginHooks["command.execute.before"]>;
type CommandExecuteBeforeInput = Parameters<CommandExecuteBeforeHook>[0];
type CommandExecuteBeforeOutput = Parameters<CommandExecuteBeforeHook>[1];
type ToolExecuteBeforeHook = NonNullable<PluginHooks["tool.execute.before"]>;
type ToolExecuteBeforeInput = Parameters<ToolExecuteBeforeHook>[0];
type ToolExecuteBeforeOutput = Parameters<ToolExecuteBeforeHook>[1];
type EventHook = NonNullable<PluginHooks["event"]>;
type EventHookInput = Parameters<EventHook>[0];
type ChatMessageHook = NonNullable<PluginHooks["chat.message"]>;
type ChatMessageInput = Parameters<ChatMessageHook>[0];
type ChatMessageOutput = Parameters<ChatMessageHook>[1];

type PluginConfigShape = {
  enabled?: boolean;
  debug?: boolean;
  storagePath?: string;
  commands?: { enabled?: boolean };
  trackers?: { skill?: { enabled?: boolean } };
};

type ParsedCommandArgs =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; message: string };

const COMMAND_TO_TOOL: Record<AnalyticsCommandName, keyof ReturnType<typeof createSkillCommands>> = {
  "skill-analytics-overview": "overview",
  "skill-analytics-detail": "detail",
  "skill-analytics-health": "health",
  "skill-analytics-recent": "recent",
  "skill-analytics-export": "export",
};

const TOOL_ARGS = createToolArgs();
type ToolArgShape = (typeof TOOL_ARGS)[keyof typeof TOOL_ARGS];

const TOOL_DEFINITIONS: Array<{
  toolName: AnalyticsToolName;
  key: keyof ReturnType<typeof createSkillCommands>;
  description: string;
  args: ToolArgShape;
}> = [
  {
    toolName: "skill_analytics_overview",
    key: "overview",
    description: "Return skill analytics overview rows.",
    args: TOOL_ARGS.overview,
  },
  {
    toolName: "skill_analytics_detail",
    key: "detail",
    description: "Return detail for one skill analytics row.",
    args: TOOL_ARGS.detail,
  },
  {
    toolName: "skill_analytics_health",
    key: "health",
    description: "Return skill analytics health rows.",
    args: TOOL_ARGS.health,
  },
  {
    toolName: "skill_analytics_recent",
    key: "recent",
    description: "Return recent skill analytics rows.",
    args: TOOL_ARGS.recent,
  },
  {
    toolName: "skill_analytics_export",
    key: "export",
    description: "Export skill analytics as raw JSON.",
    args: TOOL_ARGS.export,
  },
];

function createToolArgs() {
  return {
    overview: {
      limit: tool.schema.number().int().min(1).max(50).optional().describe("Maximum number of rows to return"),
    },
    detail: {
      name: tool.schema.string().min(1).describe("Skill name to inspect"),
    },
    health: {
      name: tool.schema.string().min(1).optional().describe("Optional skill name filter"),
    },
    recent: {
      limit: tool.schema.number().int().min(1).max(50).optional().describe("Maximum number of rows to return"),
    },
    export: {
      limit: tool.schema.number().int().min(1).max(50).optional().describe("Maximum number of rows to export"),
    },
  } as const;
}

function toErrorMessage(value: unknown) {
  if (value instanceof Error && value.message.trim().length > 0) return value.message;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return "Unknown analytics startup failure";
}

function normalizeRow(row: SkillRunInput): SkillRunRow {
  return { ...row };
}

function createMemoryReadStorage(rows: SkillRunInput[]): ReadStorage {
  const seeded = rows.map(normalizeRow);

  return {
    listSkillRuns() {
      return [...seeded].sort((a, b) => b.startedAt - a.startedAt || b.finishedAt - a.finishedAt);
    },
    listSkillRunsByName(name: string) {
      return this.listSkillRuns().filter((row) => row.skillName === name);
    },
  };
}

function formatCommandValidationError(commandName: AnalyticsCommandName, issues: string[]) {
  return [`Invalid arguments for /${commandName}`, ...issues.map((issue) => `- ${issue}`)].join("\n");
}

function parseCommandLimit(commandName: AnalyticsCommandName, tokens: string[]): ParsedCommandArgs {
  if (tokens.length === 0) {
    return { ok: true, args: {} };
  }

  if (tokens.length > 1) {
    return {
      ok: false,
      message: formatCommandValidationError(commandName, [`unexpected extra arguments: ${tokens.slice(1).join(" ")}.`]),
    };
  }

  if (!/^\d+$/.test(tokens[0] ?? "")) {
    return {
      ok: false,
      message: formatCommandValidationError(commandName, ["limit must be an integer between 1 and 50."]),
    };
  }

  const limit = Number(tokens[0]);

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return {
      ok: false,
      message: formatCommandValidationError(commandName, ["limit must be an integer between 1 and 50."]),
    };
  }

  return { ok: true, args: { limit } };
}

function parseCommandName(commandName: AnalyticsCommandName, tokens: string[], required: boolean): ParsedCommandArgs {
  if (tokens.length === 0) {
    return required
      ? {
          ok: false,
          message: formatCommandValidationError(commandName, ["name is required."]),
        }
      : { ok: true, args: {} };
  }

  const name = tokens.join(" ").trim();

  if (name.length === 0) {
    return required
      ? {
          ok: false,
          message: formatCommandValidationError(commandName, ["name is required."]),
        }
      : { ok: true, args: {} };
  }

  return { ok: true, args: { name } };
}

function isValidUsage(value: unknown): value is Extract<SkillTrackerEvent, { type: "assistant.completed" }>["usage"] {
  if (!value || typeof value !== "object") return false;

  const usage = value as Record<string, unknown>;
  return (
    typeof usage.inputTokens === "number" &&
    Number.isFinite(usage.inputTokens) &&
    typeof usage.outputTokens === "number" &&
    Number.isFinite(usage.outputTokens) &&
    typeof usage.totalTokens === "number" &&
    Number.isFinite(usage.totalTokens)
  );
}

function isValidOutcome(value: unknown): value is "completed" | "error" {
  return value === "completed" || value === "error";
}

function deepMergeOpencodeConfig(fileConfig: unknown, projectConfig: unknown) {
  const filePlugin = readPluginConfig(fileConfig);
  const projectPlugin = readPluginConfig(projectConfig);

  return {
    opencodeAnalytics: {
      ...filePlugin,
      ...projectPlugin,
      commands: {
        ...filePlugin.commands,
        ...projectPlugin.commands,
      },
      trackers: {
        ...filePlugin.trackers,
        ...projectPlugin.trackers,
        skill: {
          ...filePlugin.trackers?.skill,
          ...projectPlugin.trackers?.skill,
        },
      },
    },
  };
}

function readPluginConfig(value: unknown): PluginConfigShape {
  if (!value || typeof value !== "object") return {};

  const root = value as { opencodeAnalytics?: PluginConfigShape };
  return root.opencodeAnalytics && typeof root.opencodeAnalytics === "object"
    ? root.opencodeAnalytics
    : {};
}

function readProjectOpencodeConfig(worktree: string) {
  const file = path.join(worktree, "opencode.json");
  if (!fs.existsSync(file)) return {};

  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return {};
  }
}

function shouldForwardTrackerEvents(config: ReturnType<typeof resolveConfig>, runtime: RuntimeLike) {
  return config.enabled && config.trackers.skill.enabled && runtime.current() === "active";
}

function appendWarning(text: string, warning: { title: string; detail: string; reason: string | null }) {
  return [
    text,
    "",
    `Warning: ${warning.title}`,
    warning.detail,
    `reason: ${warning.reason ?? "No additional reason was provided."}`,
  ].join("\n");
}

function renderCommandResult(
  commandName: AnalyticsCommandName,
  result: SkillToolResult<unknown>,
  formatter: (value: unknown) => string,
) {
  if (commandName === "skill-analytics-export") {
    if (!result.ok) {
      return JSON.stringify({ unavailable: result.unavailable }, null, 2);
    }

    return JSON.stringify(
      result.state === "disabled-after-runtime-error"
        ? { warning: result.warning, data: result.data }
        : { data: result.data },
      null,
      2,
    );
  }

  if (!result.ok) {
    return formatSkillsUnavailable(result.unavailable);
  }

  const normalizedData =
    commandName === "skill-analytics-detail" && result.data === null
      ? { notFound: true, name: "unknown" }
      : result.data;

  if (
    commandName === "skill-analytics-detail" &&
    normalizedData &&
    typeof normalizedData === "object" &&
    (normalizedData as { notFound?: boolean }).notFound === true
  ) {
    const name = (normalizedData as { name?: string }).name ?? "unknown";
    const text = `Skill detail\nNo skill run found for \"${name}\".`;
    return result.state === "disabled-after-runtime-error" ? appendWarning(text, result.warning) : text;
  }

  const text = formatter(normalizedData);
  return result.state === "disabled-after-runtime-error" ? appendWarning(text, result.warning) : text;
}

function parseCommandArguments(commandName: AnalyticsCommandName, raw: string): ParsedCommandArgs {
  const trimmed = raw.trim();
  const tokens = trimmed.length === 0 ? [] : trimmed.split(/\s+/);

  switch (commandName) {
    case "skill-analytics-detail":
      return parseCommandName(commandName, tokens, true);
    case "skill-analytics-health":
      return parseCommandName(commandName, tokens, false);
    case "skill-analytics-overview":
    case "skill-analytics-recent":
    case "skill-analytics-export":
      return parseCommandLimit(commandName, tokens);
  }
}

function toToolCallEvent(input: ToolExecuteBeforeInput, args: ToolExecuteBeforeOutput["args"]): SkillTrackerEvent {
  return {
    type: "tool.call",
    sessionId: input.sessionID,
    timestamp: Date.now(),
    toolCallId: input.callID,
    toolName: input.tool,
    input: args,
  };
}

function toAssistantCompletedEvent(event: EventHookInput["event"]): SkillTrackerEvent | null {
  if (!event || typeof event !== "object") return null;
  const candidate = event as Record<string, unknown>;
  if (candidate.type !== "assistant.completed") return null;
  if (!isValidUsage(candidate.usage) || !isValidOutcome(candidate.outcome)) return null;

  return {
    type: "assistant.completed",
    sessionId: typeof candidate.sessionId === "string" ? candidate.sessionId : "",
    timestamp: typeof candidate.timestamp === "number" ? candidate.timestamp : Number.NaN,
    messageId: typeof candidate.messageId === "string" ? candidate.messageId : "",
    agent: typeof candidate.agent === "string" || candidate.agent === null ? candidate.agent : null,
    modelProviderId:
      typeof candidate.modelProviderId === "string" || candidate.modelProviderId === null
        ? candidate.modelProviderId
        : null,
    modelId: typeof candidate.modelId === "string" || candidate.modelId === null ? candidate.modelId : null,
    usage: candidate.usage,
    toolCalls: typeof candidate.toolCalls === "number" ? candidate.toolCalls : Number.NaN,
    outcome: candidate.outcome,
  };
}

function toChatMessageEvent(input: ChatMessageInput, output: ChatMessageOutput): SkillTrackerEvent | null {
  const part = Array.isArray(output?.parts)
    ? output.parts.find((candidate) => (candidate as { role?: string } | null)?.role === "assistant") ?? output.parts[0]
    : null;

  if (!part || typeof part !== "object") return null;

  const candidate = part as Record<string, unknown>;
  if (candidate.role !== "assistant") return null;
  if (candidate.usage !== undefined && !isValidUsage(candidate.usage)) return null;
  if (candidate.outcome !== undefined && !isValidOutcome(candidate.outcome)) return null;

  return {
    type: "chat.message",
    sessionId: input.sessionID,
    timestamp: typeof candidate.timestamp === "number" ? candidate.timestamp : Date.now(),
    message: {
      id: typeof candidate.id === "string" ? candidate.id : (input.messageID ?? ""),
      role: typeof candidate.role === "string" ? candidate.role : "assistant",
      agent:
        typeof candidate.agent === "string" || candidate.agent === null ? candidate.agent : (input.agent ?? null),
      modelProviderId:
        typeof candidate.modelProviderId === "string" || candidate.modelProviderId === null
          ? candidate.modelProviderId
          : (input.model?.providerID ?? null),
      modelId:
        typeof candidate.modelId === "string" || candidate.modelId === null
          ? candidate.modelId
          : (input.model?.modelID ?? null),
      usage: candidate.usage as Extract<SkillTrackerEvent, { type: "chat.message" }>["message"]["usage"],
      toolCalls: typeof candidate.toolCalls === "number" ? candidate.toolCalls : undefined,
      outcome: candidate.outcome as Extract<SkillTrackerEvent, { type: "chat.message" }>["message"]["outcome"],
    },
  };
}

export const OpenCodeAnalyticsPlugin: Plugin = async (input) => {
  const overrides = (input as typeof input & { __testOverrides?: TestOverrides }).__testOverrides ?? {};
  const runtime = createRuntimeState();

  const combinedConfig = deepMergeOpencodeConfig(
    readProjectOpencodeConfig(input.worktree),
    (input.project as { config?: unknown } | undefined)?.config,
  );

  const config: AnalyticsConfig = resolveConfig({
    opencodeConfig: combinedConfig,
    env: process.env,
    homeDir: os.homedir(),
  });

  const seededRows = overrides.seedRows ?? [];
  let readStorage: ReadStorage = createMemoryReadStorage(seededRows);
  let trackerStorage: Pick<AnalyticsDatabase, "insertSkillRun"> = {
    insertSkillRun() {
      return { inserted: false, duplicate: true };
    },
  };

  if (!config.enabled) {
    runtime.disableAtStartup("Analytics disabled by configuration");
  } else if (overrides.startupError) {
    runtime.disableAtStartup(toErrorMessage(overrides.startupError));
  } else {
    try {
      const database = createDatabase(config.storagePath);
      for (const row of seededRows) {
        database.insertSkillRun(row);
      }

      readStorage = database;
      trackerStorage = {
        insertSkillRun(run) {
          if (overrides.trackerInsertError) {
            throw overrides.trackerInsertError;
          }

          return database.insertSkillRun(run);
        },
      };
    } catch (error) {
      runtime.disableAtStartup(toErrorMessage(error));
    }
  }

  const queries = createSkillQueries(readStorage);
  const tools = createSkillTools({ queries, runtime });
  const commands = createSkillCommands(tools);
  const tracker = createSkillTracker({
    storage: trackerStorage,
    onPersistRuntimeError(error) {
      runtime.disableAfterRuntimeError(toErrorMessage(error));
    },
  });

  const registeredTools = Object.fromEntries(
    TOOL_DEFINITIONS.map(({ toolName, key, description, args }) => [
      toolName,
      tool({
        description,
        args,
        async execute(args) {
          return JSON.stringify(commands[key].tool(args as never));
        },
      }),
    ]),
  );

  const hooks: PluginHooks = {
    tool: registeredTools,
    event: async ({ event }) => {
      if (!shouldForwardTrackerEvents(config, runtime)) return;
      const trackerEvent = toAssistantCompletedEvent(event);
      if (!trackerEvent) return;
      tracker.handleEvent(trackerEvent);
    },
    "tool.execute.before": async (toolInput, output) => {
      if (!shouldForwardTrackerEvents(config, runtime)) return;
      tracker.handleEvent(toToolCallEvent(toolInput, output.args));
    },
    "chat.message": async (messageInput, output) => {
      if (!shouldForwardTrackerEvents(config, runtime)) return;
      const trackerEvent = toChatMessageEvent(messageInput, output);
      if (!trackerEvent) return;
      tracker.handleEvent(trackerEvent);
    },
  };

  if (config.commands.enabled) {
    hooks.config = async (pluginConfig: PluginConfigInput) => {
      const target = pluginConfig as PluginConfigInput & { command?: Record<string, unknown> };
      target.command ??= {};

      target.command["skill-analytics-overview"] = {
        description: "Show skill analytics overview",
        template: "Internal analytics command",
      };
      target.command["skill-analytics-detail"] = {
        description: "Show skill analytics detail for a named skill",
        template: "Internal analytics command",
      };
      target.command["skill-analytics-health"] = {
        description: "Show skill analytics health",
        template: "Internal analytics command",
      };
      target.command["skill-analytics-recent"] = {
        description: "Show recent skill analytics runs",
        template: "Internal analytics command",
      };
      target.command["skill-analytics-export"] = {
        description: "Export raw skill analytics JSON",
        template: "Internal analytics command",
      };
    };

    hooks["command.execute.before"] = async (
      commandInput: CommandExecuteBeforeInput,
      output: CommandExecuteBeforeOutput,
    ) => {
      const commandName = commandInput.command as AnalyticsCommandName;
      const key = COMMAND_TO_TOOL[commandName];
      if (!key) return;

      const parsedArgs = parseCommandArguments(commandName, commandInput.arguments);
      if (!parsedArgs.ok) {
        output.parts.push({
          type: "text",
          text: parsedArgs.message,
        } as never);
        return;
      }

      const formatter =
        commands[key].render.mode === "terminal"
          ? (commands[key].render.formatter as (value: unknown) => string)
          : (_value: unknown) => "";

      let result: SkillToolResult<unknown>;

      try {
        result = commands[key].tool(parsedArgs.args as never) as SkillToolResult<unknown>;
      } catch (error) {
        const message = error instanceof Error && error.message.trim().length > 0 ? error.message : "Unknown command error.";
        output.parts.push({
          type: "text",
          text: formatCommandValidationError(commandName, [message.endsWith(".") ? message : `${message}.`]),
        } as never);
        return;
      }

      const formatted = renderCommandResult(
        commandName,
        commandName === "skill-analytics-detail" && result.ok && result.data === null
          ? ({ ...result, data: { notFound: true, name: String((parsedArgs.args as { name?: string }).name ?? "unknown") } } as SkillToolResult<unknown>)
          : result,
        formatter,
      );

      output.parts.push({
        type: "text",
        text: formatted,
      } as never);
    };
  }

  return hooks;
};

export default OpenCodeAnalyticsPlugin;
