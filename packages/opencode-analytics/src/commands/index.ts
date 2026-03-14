import {
  formatSkillDetail,
  formatSkillHealth,
  formatSkillOverview,
  formatSkillRecent,
  formatSkillsUnavailable,
} from "../formatters/skills";
import type { SkillTools } from "../tools/skills";

export interface CommandArgSpec {
  name: string;
  type: "string" | "number";
  required: boolean;
  prompt: string;
  description: string;
}

interface TerminalRenderConfig<Formatter> {
  mode: "terminal";
  formatter: Formatter;
  unavailableFormatter: typeof formatSkillsUnavailable;
  warningField: "warning";
}

interface StructuredRenderConfig {
  mode: "structured";
  unavailableField: "unavailable";
  warningField: "warning";
}

export interface SkillCommandBundle {
  overview: {
    tool: SkillTools["overview"];
    args: CommandArgSpec[];
    render: TerminalRenderConfig<typeof formatSkillOverview>;
  };
  detail: {
    tool: SkillTools["detail"];
    args: [CommandArgSpec];
    render: TerminalRenderConfig<typeof formatSkillDetail>;
  };
  health: {
    tool: SkillTools["health"];
    args: CommandArgSpec[];
    render: TerminalRenderConfig<typeof formatSkillHealth>;
  };
  recent: {
    tool: SkillTools["recent"];
    args: CommandArgSpec[];
    render: TerminalRenderConfig<typeof formatSkillRecent>;
  };
  export: {
    tool: SkillTools["export"];
    args: CommandArgSpec[];
    render: StructuredRenderConfig;
  };
}

export function createSkillCommands(tools: SkillTools): SkillCommandBundle {
  return {
    overview: {
      tool: tools.overview,
      args: [
        {
          name: "limit",
          type: "number",
          required: false,
          prompt: "Result limit",
          description: "Maximum number of overview rows to return",
        },
      ],
      render: {
        mode: "terminal",
        formatter: formatSkillOverview,
        unavailableFormatter: formatSkillsUnavailable,
        warningField: "warning",
      },
    },
    detail: {
      tool: tools.detail,
      args: [
        {
          name: "name",
          type: "string",
          required: true,
          prompt: "Skill name",
          description: "Name of the skill to inspect",
        },
      ],
      render: {
        mode: "terminal",
        formatter: formatSkillDetail,
        unavailableFormatter: formatSkillsUnavailable,
        warningField: "warning",
      },
    },
    health: {
      tool: tools.health,
      args: [
        {
          name: "name",
          type: "string",
          required: false,
          prompt: "Skill name",
          description: "Optional skill name to filter health to a single skill",
        },
      ],
      render: {
        mode: "terminal",
        formatter: formatSkillHealth,
        unavailableFormatter: formatSkillsUnavailable,
        warningField: "warning",
      },
    },
    recent: {
      tool: tools.recent,
      args: [
        {
          name: "limit",
          type: "number",
          required: false,
          prompt: "Result limit",
          description: "Maximum number of recent rows to return",
        },
      ],
      render: {
        mode: "terminal",
        formatter: formatSkillRecent,
        unavailableFormatter: formatSkillsUnavailable,
        warningField: "warning",
      },
    },
    export: {
      tool: tools.export,
      args: [
        {
          name: "limit",
          type: "number",
          required: false,
          prompt: "Result limit",
          description: "Maximum number of rows to include in the export payload",
        },
      ],
      render: {
        mode: "structured",
        unavailableField: "unavailable",
        warningField: "warning",
      },
    },
  };
}
