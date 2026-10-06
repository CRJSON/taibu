import type { Message, Tool, TSchema, Static, AssistantMessageEventStream, Model, Api, TranscriptContext, SimpleStreamOptions } from "@earendil-works/pi-ai";
import type { ChatMessage } from "@/types";

export type AgentRunStatus =
  | "queued"
  | "running"
  | "awaiting_input"
  | "cancelling"
  | "completed"
  | "cancelled"
  | "failed";
export type AgentPart =
  | { type: "text"; id: string; text: string }
  | { type: "reasoning"; id: string; text: string }
  | {
      type: "tool";
      id: string;
      name: string;
      title: string;
      status: "running" | "completed" | "failed";
      input?: unknown;
      output?: unknown;
    }
  | { type: "source"; id: string; title: string; url: string; content?: string }
  | { type: "question"; id: string; question: string }
  | {
      type: "artifact";
      id: string;
      title: string;
      recordId?: string;
      chartId?: string;
      chartType?: string;
    };

export interface AgentMessageData {
  version: 1;
  runId: string;
  status: AgentRunStatus;
  parts: AgentPart[];
  error?: string;
}

export interface AgentCheckpoint {
  version: 1 | 2;
  /** V1 recovery / initial context seed; new runtime history lives in Durable. */
  messages: Message[];
  parts: AgentPart[];
  finalArtifacts: string[];
  question?: string;
  summary?: string;
  finalSelectionMade?: boolean;
  summaryThrough?: number;
  knowledgeQueries?: Record<string, number>;
  streamingAssistantId?: string;
  durable?: {
    engine: "pi-durable/1.0.4";
    seeded?: boolean;
    started?: boolean;
    legacySettled?: boolean;
    waitingToolId?: string;
    answeredCommands?: number[];
  };
}

export type PiStreamFn = (model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions) => AssistantMessageEventStream;
export interface DomainToolResult<T = unknown> {
  content: Array<{ type: "text"; text: string }>;
  details: T;
  canonicalText?: string;
}
/** Business tools have no dependency on an agent loop implementation. */
export interface DomainTool<T extends TSchema = TSchema, R = unknown> extends Tool<T> {
  label: string;
  replay?: "safe";
  execute(callId: string, args: Static<T>, signal?: AbortSignal): Promise<DomainToolResult<R>>;
}

export interface AgentRunView {
  id: string;
  conversationId: string;
  status: AgentRunStatus;
  message: ChatMessage;
  cursor: number;
  createdAt: string;
  clientRequestId?: string;
  userMessage?: ChatMessage;
}

export interface AgentRunEvent {
  sequence: number;
  runId: string;
  type: "snapshot" | "terminal";
  run: AgentRunView;
}

export const AGENT_ACTIVE_STATUSES: AgentRunStatus[] = [
  "queued",
  "running",
  "awaiting_input",
  "cancelling",
];
export function isAgentRunTerminal(status: AgentRunStatus) {
  return (
    status === "completed" || status === "cancelled" || status === "failed"
  );
}

export function agentMessageContent(parts: AgentPart[]) {
  return parts
    .filter(
      (part): part is Extract<AgentPart, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n\n");
}
