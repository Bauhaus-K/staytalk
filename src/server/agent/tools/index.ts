import { z } from "zod";
import type { AgentTool } from "../llm/types";
import { escalateTool } from "./escalate";
import { searchKnowledgeTool } from "./search-knowledge";
import type { ToolDefinition } from "./types";

/** Tools available to the guest agent, in a fixed order (part of the cached prefix). */
export const AGENT_TOOLS: ToolDefinition[] = [
  searchKnowledgeTool,
  escalateTool,
] as ToolDefinition[];

// Strict tool schemas don't support some JSON Schema keywords; zod still
// enforces them at runtime before a tool runs.
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "pattern",
  "format",
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !UNSUPPORTED_KEYWORDS.has(key))
        .map(([key, v]) => [key, sanitize(v)]),
    );
  }
  return value;
}

export function toApiTool(tool: ToolDefinition): AgentTool {
  const schema = sanitize(z.toJSONSchema(tool.schema)) as AgentTool["input_schema"];
  return {
    name: tool.name,
    description: tool.description,
    input_schema: schema,
    strict: true,
  };
}

export function apiTools(tools: ToolDefinition[] = AGENT_TOOLS): AgentTool[] {
  return tools.map(toApiTool);
}

export function findTool(name: string, tools: ToolDefinition[] = AGENT_TOOLS) {
  return tools.find((t) => t.name === name);
}
