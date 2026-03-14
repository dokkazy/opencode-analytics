import { expect, test } from "bun:test";
import type { SkillRunInput } from "../src/storage/db";
import { createSkillTracker, type SkillTrackerEvent } from "../src/trackers/skill";

function createStorageStub(options?: {
  insertResult?: { inserted: boolean; duplicate: boolean };
  insertError?: Error;
}) {
  const writes: SkillRunInput[] = [];

  return {
    writes,
    storage: {
      insertSkillRun(run: SkillRunInput) {
        writes.push(run);

        if (options?.insertError) {
          throw options.insertError;
        }

        return options?.insertResult ?? { inserted: true, duplicate: false };
      },
    },
  };
}

function openSkillCall(overrides?: Partial<Extract<SkillTrackerEvent, { type: "tool.call" }>>): SkillTrackerEvent {
  return {
    type: "tool.call",
    sessionId: "session-1",
    timestamp: 100,
    toolCallId: "tool-part-1",
    toolName: "skill",
    input: { name: "brainstorming" },
    ...overrides,
  };
}

function completionEvent(overrides?: Partial<Extract<SkillTrackerEvent, { type: "assistant.completed" }>>): SkillTrackerEvent {
  return {
    type: "assistant.completed",
    sessionId: "session-1",
    timestamp: 250,
    messageId: "assistant-1",
    agent: "coder-agent",
    modelProviderId: "openai",
    modelId: "gpt-5.4",
    usage: { inputTokens: 11, outputTokens: 19, totalTokens: 30 },
    toolCalls: 2,
    outcome: "completed",
    ...overrides,
  };
}

function fallbackAssistantMessage(
  overrides?: Partial<Extract<SkillTrackerEvent, { type: "chat.message" }>>,
): SkillTrackerEvent {
  return {
    type: "chat.message",
    sessionId: "session-1",
    timestamp: 250,
    message: {
      id: "assistant-1",
      role: "assistant",
      agent: "coder-agent",
      modelProviderId: "openai",
      modelId: "gpt-5.4",
      usage: { inputTokens: 11, outputTokens: 19, totalTokens: 30 },
      toolCalls: 2,
      outcome: "completed",
    },
    ...overrides,
  };
}

test("tracks only skill and skill_use, and skill_use is recorded as one ordered batch run", () => {
  const { writes, storage } = createStorageStub();
  const tracker = createSkillTracker({ storage, onPersistRuntimeError() {} });

  tracker.handleEvent({
    type: "tool.call",
    sessionId: "session-1",
    timestamp: 10,
    toolCallId: "ignored-1",
    toolName: "fetch",
    input: { url: "https://example.com" },
  });
  tracker.handleEvent(completionEvent({ timestamp: 20, messageId: "assistant-ignore" }));

  tracker.handleEvent({
    type: "tool.call",
    sessionId: "session-1",
    timestamp: 100,
    toolCallId: "skill-use-1",
    toolName: "skill_use",
    input: { skill_names: ["using-superpowers", "brainstorming", "javascript-typescript"] },
  });
  tracker.handleEvent(completionEvent({ timestamp: 175, messageId: "assistant-batch" }));

  expect(writes).toHaveLength(1);
  expect(writes[0]).toEqual({
    sessionId: "session-1",
    messageId: "assistant-batch",
    skillName: "using-superpowers, brainstorming, javascript-typescript",
    trigger: "skill_use",
    startedAt: 100,
    finishedAt: 175,
    durationMs: 75,
    agent: "coder-agent",
    modelProviderId: "openai",
    modelId: "gpt-5.4",
    inputTokens: 11,
    outputTokens: 19,
    totalTokens: 30,
    toolCalls: 2,
    status: "completed",
  });
});

test("uses a per-session FIFO queue and closes runs on assistant completion", () => {
  const { writes, storage } = createStorageStub();
  const tracker = createSkillTracker({ storage, onPersistRuntimeError() {} });

  tracker.handleEvent(openSkillCall({ toolCallId: "s1-first", input: { name: "first" }, timestamp: 100 }));
  tracker.handleEvent(openSkillCall({ toolCallId: "s1-second", input: { name: "second" }, timestamp: 120 }));
  tracker.handleEvent(openSkillCall({
    sessionId: "session-2",
    toolCallId: "s2-first",
    input: { name: "other-session" },
    timestamp: 130,
  }));

  tracker.handleEvent(completionEvent({ sessionId: "session-1", messageId: "assistant-1", timestamp: 200 }));
  tracker.handleEvent(completionEvent({ sessionId: "session-2", messageId: "assistant-2", timestamp: 210 }));
  tracker.handleEvent(completionEvent({ sessionId: "session-1", messageId: "assistant-3", timestamp: 240 }));

  expect(writes.map((run) => [run.sessionId, run.skillName, run.messageId, run.startedAt, run.finishedAt])).toEqual([
    ["session-1", "first", "assistant-1", 100, 200],
    ["session-2", "other-session", "assistant-2", 130, 210],
    ["session-1", "second", "assistant-3", 120, 240],
  ]);
});

test("dedupes completed tool-part ids and repeated completion delivery across event and fallback paths", () => {
  const { writes, storage } = createStorageStub();
  const tracker = createSkillTracker({ storage, onPersistRuntimeError() {} });

  tracker.handleEvent(openSkillCall());
  tracker.handleEvent(completionEvent());
  tracker.handleEvent(fallbackAssistantMessage());
  tracker.handleEvent(openSkillCall({ timestamp: 300 }));
  tracker.handleEvent(completionEvent({ timestamp: 350, messageId: "assistant-2" }));

  expect(writes).toHaveLength(1);
  expect(writes[0]?.messageId).toBe("assistant-1");
});

test("dedupes duplicate pre-completion tool.call delivery for the same toolCallId", () => {
  const { writes, storage } = createStorageStub();
  const tracker = createSkillTracker({ storage, onPersistRuntimeError() {} });

  tracker.handleEvent(openSkillCall({ toolCallId: "dup-open", input: { name: "first" }, timestamp: 100 }));
  tracker.handleEvent(openSkillCall({ toolCallId: "dup-open", input: { name: "first" }, timestamp: 100 }));
  tracker.handleEvent(openSkillCall({ toolCallId: "next-open", input: { name: "second" }, timestamp: 125 }));

  tracker.handleEvent(completionEvent({ messageId: "assistant-1", timestamp: 200 }));
  tracker.handleEvent(completionEvent({ messageId: "assistant-2", timestamp: 240 }));

  expect(writes).toEqual([
    expect.objectContaining({
      skillName: "first",
      messageId: "assistant-1",
      startedAt: 100,
      finishedAt: 200,
    }),
    expect.objectContaining({
      skillName: "second",
      messageId: "assistant-2",
      startedAt: 125,
      finishedAt: 240,
    }),
  ]);
});

test("does not collide when different sessions reuse the same toolCallId", () => {
  const { writes, storage } = createStorageStub();
  const tracker = createSkillTracker({ storage, onPersistRuntimeError() {} });

  tracker.handleEvent(openSkillCall({ sessionId: "session-1", toolCallId: "shared-id", input: { name: "first" } }));
  tracker.handleEvent(openSkillCall({ sessionId: "session-2", toolCallId: "shared-id", input: { name: "second" } }));

  tracker.handleEvent(completionEvent({ sessionId: "session-1", messageId: "assistant-1", timestamp: 200 }));
  tracker.handleEvent(completionEvent({ sessionId: "session-2", messageId: "assistant-1", timestamp: 220 }));

  expect(writes).toEqual([
    expect.objectContaining({ sessionId: "session-1", skillName: "first", messageId: "assistant-1" }),
    expect.objectContaining({ sessionId: "session-2", skillName: "second", messageId: "assistant-1" }),
  ]);
});

test("supports chat.message fallback for assistant messages", () => {
  const { writes, storage } = createStorageStub();
  const tracker = createSkillTracker({ storage, onPersistRuntimeError() {} });

  tracker.handleEvent(openSkillCall());
  tracker.handleEvent(fallbackAssistantMessage());

  expect(writes).toHaveLength(1);
  expect(writes[0]?.messageId).toBe("assistant-1");
});

test("drops malformed open events and partial completions missing required data", () => {
  const { writes, storage } = createStorageStub();
  const tracker = createSkillTracker({ storage, onPersistRuntimeError() {} });

  tracker.handleEvent(openSkillCall({ sessionId: "", toolCallId: "bad-open-1" }));
  tracker.handleEvent(openSkillCall({ toolCallId: "bad-open-2", input: { name: "   " } }));
  tracker.handleEvent({
    type: "tool.call",
    sessionId: "session-1",
    timestamp: 100,
    toolCallId: "bad-open-3",
    toolName: "skill_use",
    input: { skill_names: ["good", "", "also-good"] },
  });

  tracker.handleEvent(openSkillCall({ toolCallId: "good-open" }));
  tracker.handleEvent(completionEvent({ messageId: "", timestamp: 150 }));
  tracker.handleEvent(completionEvent({ timestamp: Number.NaN, messageId: "assistant-bad" }));

  expect(writes).toEqual([]);
});

test("drops out-of-order completions with negative duration and keeps the run open for a later valid completion", () => {
  const { writes, storage } = createStorageStub();
  const tracker = createSkillTracker({ storage, onPersistRuntimeError() {} });

  tracker.handleEvent(openSkillCall({ toolCallId: "ordered-open", input: { name: "ordered" }, timestamp: 200 }));
  tracker.handleEvent(completionEvent({ messageId: "assistant-early", timestamp: 150 }));
  tracker.handleEvent(completionEvent({ messageId: "assistant-valid", timestamp: 260 }));

  expect(writes).toEqual([
    expect.objectContaining({
      skillName: "ordered",
      messageId: "assistant-valid",
      startedAt: 200,
      finishedAt: 260,
      durationMs: 60,
    }),
  ]);
});

test("persists error runs when completion data is valid and outcome is error", () => {
  const { writes, storage } = createStorageStub();
  const tracker = createSkillTracker({ storage, onPersistRuntimeError() {} });

  tracker.handleEvent(openSkillCall());
  tracker.handleEvent(completionEvent({ outcome: "error" }));

  expect(writes).toHaveLength(1);
  expect(writes[0]?.status).toBe("error");
});

test("tolerates storage duplicate no-op results without crashing", () => {
  const { writes, storage } = createStorageStub({ insertResult: { inserted: false, duplicate: true } });
  const tracker = createSkillTracker({ storage, onPersistRuntimeError() {} });

  expect(() => {
    tracker.handleEvent(openSkillCall());
    tracker.handleEvent(completionEvent());
  }).not.toThrow();

  expect(writes).toHaveLength(1);
});

test("on storage write failure calls onPersistRuntimeError and does not throw", () => {
  const error = new Error("database locked");
  const { storage } = createStorageStub({ insertError: error });
  const runtimeErrors: Array<{ error: Error; run: SkillRunInput }> = [];
  const tracker = createSkillTracker({
    storage,
    onPersistRuntimeError(persistError, run) {
      runtimeErrors.push({ error: persistError as Error, run });
    },
  });

  expect(() => {
    tracker.handleEvent(openSkillCall());
    tracker.handleEvent(completionEvent());
  }).not.toThrow();

  expect(runtimeErrors).toHaveLength(1);
  expect(runtimeErrors[0]).toEqual({
    error,
    run: expect.objectContaining({
      sessionId: "session-1",
      messageId: "assistant-1",
      skillName: "brainstorming",
      status: "completed",
    }),
  });
});
