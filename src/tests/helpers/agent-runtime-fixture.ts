import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAssistantMessageEventStream, getCurrentTools, type AssistantMessage } from "@earendil-works/pi-ai";
import type { StorageWrite } from "@earendil-works/pi-durable";
import type { PiStreamFn as StreamFn } from "../../lib/agent/types";
import { AgentStore, type AgentRunRow, type AgentArtifactRow, type AgentCommandRow } from "../../lib/agent/store.server";
import { emptyPiAssistant } from "../../lib/agent/pi-stream.server";
import type { AIModelConfig } from "../../types";
import { countTokens } from "../../lib/token-utils";
export const config: AIModelConfig = {
  id: "fixture",
  name: "fixture",
  vendor: "other",
  modelId: "fixture",
  apiUrl: "https://model.example/v1",
  apiKeyEnvVar: "FIXTURE_KEY",
  supportsReasoning: false,
  requiredTier: "free",
};
export const row = (): AgentRunRow => {
  const id = randomUUID();
  return {
    id,
    user_id: randomUUID(),
    conversation_id: randomUUID(),
    request_id: randomUUID(),
    request_hash: "hash",
    status: "running",
    checkpoint: {
      version: 1,
      messages: [
        { role: "user", content: "请用工具分析", timestamp: Date.now() },
      ],
      parts: [],
      finalArtifacts: [],
    },
    public_message: {
      id: `agent:${id}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      agent: { version: 1, runId: id, status: "running", parts: [] },
    },
    input: {
      model: "fixture",
      reasoning: false,
      webEnabled: false,
      systemPrompt: "fixture",
      title: "fixture",
      userMessage: {
        id: "user",
        role: "user",
        content: "请用工具分析",
        createdAt: new Date().toISOString(),
      },
    },
    billing: "charged",
    worker_id: "test-worker",
    fence: 1,
    cancel_requested: false,
    record_id: null,
    created_at: new Date().toISOString(),
    event_cursor: 1,
  };
};
export class MemoryStore extends AgentStore {
  readonly drafts = new Map<string, AgentArtifactRow>();
  readonly writes: Array<{ name: string; args: Record<string, unknown> }> = [];
  pending: AgentCommandRow[] = [];
  log: Array<{ sequence: number; writes: StorageWrite[] }> = [];
  draft(callId: string) {
    return [...this.drafts.values()].find(d => d.call_id === callId || d.call_id.endsWith(`:${callId}`));
  }
  nativeEntries() {
    return this.log.flatMap(c => c.writes).filter(w => w.type === "entry").map(w => w.value);
  }
  constructor() {
    super({} as SupabaseClient);
  }
  override async artifact(_run: AgentRunRow, callId: string) {
    return this.drafts.get(callId) ?? null;
  }
  override async artifacts() {
    return [...this.drafts.values()].filter((a) => a.kind === "calculation");
  }
  override async commands() {
    return this.pending;
  }
  override async rpc<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    this.writes.push({ name, args: structuredClone(args) });
    if (name === "agent_durable_read") return this.log.filter(c => c.sequence > Number(args.p_after)).slice(0, 200) as T;
    if (name === "agent_durable_commit") {
      const sequence = Number(args.p_sequence);
      const writes = structuredClone(args.p_writes) as StorageWrite[];
      const existing = this.log.find(c => c.sequence === sequence);
      if (existing) assert.deepEqual(existing.writes, writes);
      else {
        assert.equal(sequence, this.log.length + 1);
        this.log.push({ sequence, writes });
      }
      for (const write of writes) {
        if (write.type === "submission" && ["placed", "done"].includes(write.value.status)) {
          const match = /^command:(\d+)$/.exec(write.value.requestId ?? "");
          if (match) this.pending = this.pending.filter(c => c.sequence !== Number(match[1]));
        }
      }
      return sequence as T;
    }
    if (name === "agent_cache_tool") {
      const data = {
        id: randomUUID(),
        call_id: args.p_call_id,
        tool_name: args.p_tool_name,
        kind: args.p_kind,
        args: args.p_args,
        result: args.p_result,
      } as AgentArtifactRow;
      this.drafts.set(data.call_id, data);
      return data as T;
    }
    if (name === "agent_checkpoint" && args.p_command)
      this.pending = this.pending.filter((c) => c.sequence !== args.p_command);
    return false as T;
  }
}
export function scripted(
  build: (index: number) => AssistantMessage["content"],
  onContext?: (messages: Parameters<StreamFn>[1]["messages"]) => void,
): StreamFn {
  let round = 0;
  return (model, context) => {
    assert.ok(getCurrentTools(context.messages).length);
    onContext?.(context.messages);
    const output = createAssistantMessageEventStream(),
      message = emptyPiAssistant(model);
    message.content = build(round++);
    message.usage.input = countTokens(JSON.stringify(context.messages));
    message.usage.totalTokens = message.usage.input;
    message.stopReason = message.content.some((p) => p.type === "toolCall")
      ? "toolUse"
      : "stop";
    output.push({ type: "start", partial: message });
    output.push({ type: "done", reason: message.stopReason, message });
    output.end(message);
    return output;
  };
}
