import { expect, test } from "bun:test";
import {
  createSkillCommands,
  type SkillCommandBundle,
} from "../src/commands/index";
import {
  formatSkillDetail,
  formatSkillHealth,
  formatSkillOverview,
  formatSkillRecent,
  formatSkillsUnavailable,
} from "../src/formatters/skills";
import type { SkillTools } from "../src/tools/skills";

function createToolsStub(): SkillTools {
  return {
    overview: () => ({ ok: true, state: "active", data: [] }),
    detail: () => ({ ok: true, state: "active", data: null }),
    health: () => ({ ok: true, state: "active", data: [] }),
    recent: () => ({ ok: true, state: "active", data: [] }),
    export: () => ({ ok: true, state: "active", data: { generatedAt: "", overview: [], recent: [] } }),
  };
}

test("creates bundled commands that wrap tools directly", () => {
  const tools = createToolsStub();
  const commands = createSkillCommands(tools);

  expect(commands.overview.tool).toBe(tools.overview);
  expect(commands.detail.tool).toBe(tools.detail);
  expect(commands.health.tool).toBe(tools.health);
  expect(commands.recent.tool).toBe(tools.recent);
  expect(commands.export.tool).toBe(tools.export);
});

test("detail command includes required arg prompting metadata", () => {
  const commands = createSkillCommands(createToolsStub());

  expect(commands.detail.args).toEqual([
    {
      name: "name",
      type: "string",
      required: true,
      prompt: "Skill name",
      description: "Name of the skill to inspect",
    },
  ]);
});

test("overview, health, recent, and export commands expose the expected arg metadata", () => {
  const commands = createSkillCommands(createToolsStub());

  expect(commands.overview.args).toEqual([
    {
      name: "limit",
      type: "number",
      required: false,
      prompt: "Result limit",
      description: "Maximum number of overview rows to return",
    },
  ]);

  expect(commands.health.args).toEqual([
    {
      name: "name",
      type: "string",
      required: false,
      prompt: "Skill name",
      description: "Optional skill name to filter health to a single skill",
    },
  ]);

  expect(commands.recent.args).toEqual([
    {
      name: "limit",
      type: "number",
      required: false,
      prompt: "Result limit",
      description: "Maximum number of recent rows to return",
    },
  ]);

  expect(commands.export.args).toEqual([
    {
      name: "limit",
      type: "number",
      required: false,
      prompt: "Result limit",
      description: "Maximum number of rows to include in the export payload",
    },
  ]);
});

test("terminal commands include formatter and unavailable rendering metadata", () => {
  const commands = createSkillCommands(createToolsStub());

  expect(commands.overview.render).toEqual({
    mode: "terminal",
    formatter: formatSkillOverview,
    unavailableFormatter: formatSkillsUnavailable,
    warningField: "warning",
  });

  expect(commands.detail.render).toEqual({
    mode: "terminal",
    formatter: formatSkillDetail,
    unavailableFormatter: formatSkillsUnavailable,
    warningField: "warning",
  });

  expect(commands.health.render).toEqual({
    mode: "terminal",
    formatter: formatSkillHealth,
    unavailableFormatter: formatSkillsUnavailable,
    warningField: "warning",
  });

  expect(commands.recent.render).toEqual({
    mode: "terminal",
    formatter: formatSkillRecent,
    unavailableFormatter: formatSkillsUnavailable,
    warningField: "warning",
  });
});

test("export command stays structured JSON-friendly", () => {
  const commands: SkillCommandBundle = createSkillCommands(createToolsStub());

  expect(commands.export.tool).toBeDefined();
  expect(commands.export.render).toEqual({
    mode: "structured",
    unavailableField: "unavailable",
    warningField: "warning",
  });
});

test("overview, health, recent, and export commands expose the expected render metadata rules", () => {
  const commands: SkillCommandBundle = createSkillCommands(createToolsStub());

  for (const command of [commands.overview, commands.health, commands.recent]) {
    expect(command.render.mode).toBe("terminal");
    expect(command.render.unavailableFormatter).toBe(formatSkillsUnavailable);
    expect(command.render.warningField).toBe("warning");
  }

  expect(commands.overview.render.formatter).toBe(formatSkillOverview);
  expect(commands.health.render.formatter).toBe(formatSkillHealth);
  expect(commands.recent.render.formatter).toBe(formatSkillRecent);
  expect(commands.export.render).toEqual({
    mode: "structured",
    unavailableField: "unavailable",
    warningField: "warning",
  });
});
