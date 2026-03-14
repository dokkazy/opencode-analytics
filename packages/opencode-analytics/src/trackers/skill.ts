import type { InsertSkillRunResult, SkillRunInput } from "../storage/db";

export type SkillTrackerEvent =
  | {
      type: "tool.call";
      sessionId: string;
      timestamp: number;
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: "assistant.completed";
      sessionId: string;
      timestamp: number;
      messageId: string;
      agent: string | null;
      modelProviderId: string | null;
      modelId: string | null;
      usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      };
      toolCalls: number;
      outcome: "completed" | "error";
    }
  | {
      type: "chat.message";
      sessionId: string;
      timestamp: number;
      message: {
        id: string;
        role: string;
        agent?: string | null;
        modelProviderId?: string | null;
        modelId?: string | null;
        usage?: {
          inputTokens: number;
          outputTokens: number;
          totalTokens: number;
        };
        toolCalls?: number;
        outcome?: "completed" | "error";
      };
    };

export interface SkillTrackerStorage {
  insertSkillRun(run: SkillRunInput): InsertSkillRunResult;
}

export interface SkillTracker {
  handleEvent(event: SkillTrackerEvent): void;
}

export interface CreateSkillTrackerOptions {
  storage: SkillTrackerStorage;
  onPersistRuntimeError(error: unknown, run: SkillRunInput): void;
}

interface OpenRun {
  sessionId: string;
  toolCallId: string;
  skillName: string;
  trigger: "skill" | "skill_use";
  startedAt: number;
}

interface CompletionPayload {
  sessionId: string;
  timestamp: number;
  messageId: string;
  agent: string | null;
  modelProviderId: string | null;
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
  outcome: "completed" | "error";
}

type TrackedToolName = OpenRun["trigger"];
type Usage = CompletionPayload extends { inputTokens: infer _I } ? {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} : never;

const TRACKED_TOOLS = new Set<TrackedToolName>(["skill", "skill_use"]);
const MAX_SESSION_DEDUPE_IDS = 256;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTrackedToolName(value: string): value is TrackedToolName {
  return TRACKED_TOOLS.has(value as TrackedToolName);
}

function getBoundedSessionIds(store: Map<string, string[]>, sessionId: string) {
  const ids = store.get(sessionId) ?? [];

  if (!store.has(sessionId)) {
    store.set(sessionId, ids);
  }

  return ids;
}

function hasSessionScopedId(store: Map<string, string[]>, sessionId: string, id: string) {
  return (store.get(sessionId) ?? []).includes(id);
}

function rememberSessionScopedId(store: Map<string, string[]>, sessionId: string, id: string) {
  const ids = getBoundedSessionIds(store, sessionId);
  ids.push(id);

  if (ids.length > MAX_SESSION_DEDUPE_IDS) {
    ids.splice(0, ids.length - MAX_SESSION_DEDUPE_IDS);
  }

  if (ids.length === 0) {
    store.delete(sessionId);
  } else {
    store.set(sessionId, ids);
  }
}

function readUsage(value: unknown): Usage | null {
  if (!value || typeof value !== "object") return null;

  const usage = value as Partial<Usage>;

  if (
    !isFiniteNumber(usage.inputTokens) ||
    !isFiniteNumber(usage.outputTokens) ||
    !isFiniteNumber(usage.totalTokens)
  ) {
    return null;
  }

  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

function normalizeSkillName(toolName: string, input: unknown): string | null {
  if (!input || typeof input !== "object") return null;

  if (toolName === "skill") {
    const name = (input as { name?: unknown }).name;
    return isNonEmptyString(name) ? name.trim() : null;
  }

  if (toolName === "skill_use") {
    const names = (input as { skill_names?: unknown }).skill_names;
    if (!Array.isArray(names) || names.length === 0) return null;

    const normalized: string[] = [];

    for (const name of names) {
      if (!isNonEmptyString(name)) return null;
      normalized.push(name.trim());
    }

    return normalized.join(", ");
  }

  return null;
}

function toCompletionPayload(event: SkillTrackerEvent): CompletionPayload | null {
  if (event.type === "assistant.completed") {
    const usage = readUsage(event.usage);

    if (
      !isNonEmptyString(event.sessionId) ||
      !isFiniteNumber(event.timestamp) ||
      !isNonEmptyString(event.messageId) ||
      !usage ||
      !isFiniteNumber(event.toolCalls)
    ) {
      return null;
    }

    return {
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      messageId: event.messageId,
      agent: event.agent,
      modelProviderId: event.modelProviderId,
      modelId: event.modelId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      toolCalls: event.toolCalls,
      outcome: event.outcome,
    };
  }

  if (event.type === "chat.message") {
    if (event.message.role !== "assistant") return null;

    const usage = readUsage(event.message.usage);
    const toolCalls = event.message.toolCalls;
    const outcome = event.message.outcome;

    if (
      !isNonEmptyString(event.sessionId) ||
      !isFiniteNumber(event.timestamp) ||
      !isNonEmptyString(event.message.id) ||
      !usage ||
      !isFiniteNumber(usage.inputTokens) ||
      !isFiniteNumber(usage.outputTokens) ||
      !isFiniteNumber(usage.totalTokens) ||
      !isFiniteNumber(toolCalls) ||
      (outcome !== "completed" && outcome !== "error")
    ) {
      return null;
    }

    return {
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      messageId: event.message.id,
      agent: event.message.agent ?? null,
      modelProviderId: event.message.modelProviderId ?? null,
      modelId: event.message.modelId ?? null,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      toolCalls,
      outcome,
    };
  }

  return null;
}

export function createSkillTracker({ storage, onPersistRuntimeError }: CreateSkillTrackerOptions): SkillTracker {
  const openRunsBySession = new Map<string, OpenRun[]>();
  const seenToolPartIdsBySession = new Map<string, string[]>();
  const completedMessageIdsBySession = new Map<string, string[]>();

  function handleToolCall(event: Extract<SkillTrackerEvent, { type: "tool.call" }>) {
    if (!isTrackedToolName(event.toolName)) return;
    if (!isNonEmptyString(event.sessionId) || !isNonEmptyString(event.toolCallId) || !isFiniteNumber(event.timestamp)) {
      return;
    }
    if (hasSessionScopedId(seenToolPartIdsBySession, event.sessionId, event.toolCallId)) return;

    const skillName = normalizeSkillName(event.toolName, event.input);
    if (!skillName) return;

    const queue = openRunsBySession.get(event.sessionId) ?? [];
    queue.push({
      sessionId: event.sessionId,
      toolCallId: event.toolCallId,
      skillName,
      trigger: event.toolName,
      startedAt: event.timestamp,
    });
    rememberSessionScopedId(seenToolPartIdsBySession, event.sessionId, event.toolCallId);
    openRunsBySession.set(event.sessionId, queue);
  }

  function handleCompletion(payload: CompletionPayload) {
    if (hasSessionScopedId(completedMessageIdsBySession, payload.sessionId, payload.messageId)) return;

    const queue = openRunsBySession.get(payload.sessionId);
    const openRun = queue?.[0];

    if (!openRun) return;
    if (payload.timestamp < openRun.startedAt) return;

    queue.shift();

    if (queue && queue.length > 0) {
      openRunsBySession.set(payload.sessionId, queue);
    } else {
      openRunsBySession.delete(payload.sessionId);
    }

    rememberSessionScopedId(completedMessageIdsBySession, payload.sessionId, payload.messageId);

    const run: SkillRunInput = {
      sessionId: openRun.sessionId,
      messageId: payload.messageId,
      skillName: openRun.skillName,
      trigger: openRun.trigger,
      startedAt: openRun.startedAt,
      finishedAt: payload.timestamp,
      durationMs: payload.timestamp - openRun.startedAt,
      agent: payload.agent,
      modelProviderId: payload.modelProviderId,
      modelId: payload.modelId,
      inputTokens: payload.inputTokens,
      outputTokens: payload.outputTokens,
      totalTokens: payload.totalTokens,
      toolCalls: payload.toolCalls,
      status: payload.outcome,
    };

    try {
      storage.insertSkillRun(run);
    } catch (error) {
      onPersistRuntimeError(error, run);
    }
  }

  return {
    handleEvent(event) {
      if (event.type === "tool.call") {
        handleToolCall(event);
        return;
      }

      const payload = toCompletionPayload(event);
      if (!payload) return;
      handleCompletion(payload);
    },
  };
}
