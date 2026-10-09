import type { Message, Tool, TSchema, Static, AssistantMessageEventStream, Model, Api, TranscriptContext, SimpleStreamOptions, Usage } from "@earendil-works/pi-ai";
import type { ChatMessage } from "@/types";
import type { AgentQuestion } from './questions';
import type { AgentTodo } from './todos';

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
      status: "pending" | "running" | "awaiting_input" | "completed" | "failed";
      input?: unknown;
      output?: unknown;
      canonicalText?: string;
    }
  | { type: "source"; id: string; title: string; url: string; content?: string }
  | { type: "question"; id: string; question: string; questions?: AgentQuestion[] }
  | { type: 'todo'; id: string; revision: number; items: AgentTodo[] }
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
  runtime?: AgentRuntimeInfo;
  compactions?: Array<{ id: string; summary?: string; through?: string; retainedFrom?: string; status: 'completed' | 'failed'; reason?: string }>;
}

/** Public projection of Pi's active context, never credentials or the full prompt. */
export interface AgentRuntimeInfo {
  model: { id: string; name: string; contextWindow: number | null; limitSource: "configured" | "unknown" };
  context?: {
    tokens: number;
    measuredTokens: number;
    estimatedTokens: number;
    source: "usage" | "mixed" | "estimated";
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    reasoning?: number;
    compactions: number;
  };
  activity?: { phase: "preparing" | "generating" | "thinking" | "responding" | "tools" | "compacting" | "retrying" | "awaiting_input" | "settling"; toolTitle?: string; attempt?: number };
  usage?: { models: Record<string, Partial<Pick<Usage, 'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'totalTokens' | 'reasoning'>>>; tools: Record<string, Partial<Pick<Usage, 'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'totalTokens' | 'reasoning'>>>; totalTokens: number };
}

export interface AgentCheckpoint {
  version: 1 | 2;
  /** V1 recovery / initial context seed; new runtime history lives in Durable. */
  messages: Message[];
  parts: AgentPart[];
  finalArtifacts: string[];
  question?: string;
  questions?: AgentQuestion[];
  questionId?: string;
  todos?: { revision: number; items: AgentTodo[] };
  compactions?: AgentMessageData['compactions'];
  summary?: string;
  finalSelectionMade?: boolean;
  summaryThrough?: number;
  knowledgeQueries?: Record<string, number>;
  streamingAssistantId?: string;
  runtime?: AgentRuntimeInfo;
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
  usage?: Usage;
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
  epoch?: number;
  createdAt: string;
  clientRequestId?: string;
  userMessage?: ChatMessage;
  commandMessageIds?: string[];
  queue?: Array<{ sequence: number; mode: 'steer' | 'follow_up' | 'reply'; message: ChatMessage; revision: number; sortOrder: number; state: 'pending' | 'claimed' | 'admitted' | 'consumed' | 'cancelled' }>;
  configuration?: { model: string; reasoning: boolean; webEnabled: boolean };
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
