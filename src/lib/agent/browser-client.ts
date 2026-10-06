import type { ChatMessage } from "@/types";
import { isAgentRunTerminal, type AgentRunView } from "./types";

export function canAdoptAgentRun(
  current: AgentRunView | undefined,
  incoming: AgentRunView,
) {
  if (!current || current.conversationId !== incoming.conversationId)
    return true;
  if (current.id === incoming.id) return incoming.cursor >= current.cursor;
  return Date.parse(incoming.createdAt) >= Date.parse(current.createdAt);
}

export function mergeAgentSnapshot(messages: ChatMessage[], run: AgentRunView) {
  const index = messages.findIndex((m) => m.id === run.message.id);
  if (index < 0)
    return isAgentRunTerminal(run.status)
      ? messages
      : [...messages, run.message];
  const next = [...messages];
  next[index] = run.message;
  return next;
}
export async function readAgentStream(
  response: Response,
  signal: AbortSignal,
  onRun: (run: AgentRunView) => void,
) {
  if (!response.ok || !response.body) throw new Error("任务连接中断");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replaceAll("\r\n", "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split(/\r?\n/u)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const run = JSON.parse(data) as AgentRunView;
        if (
          typeof run.id === "string" &&
          typeof run.conversationId === "string" &&
          Number.isSafeInteger(run.cursor) &&
          run.cursor >= 0 &&
          run.message?.agent?.version === 1 &&
          Array.isArray(run.message.agent.parts)
        )
          onRun(run);
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export class AgentHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function postAgentRun(body: Record<string, unknown>) {
  const request = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  try {
    return await agentJson<AgentRunView>("/api/agent/runs", request);
  } catch (error) {
    if (
      error instanceof AgentHttpError &&
      error.status >= 400 &&
      error.status < 500
    )
      throw error;
    return agentJson<AgentRunView>("/api/agent/runs", request);
  }
}
export async function agentJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  const value = await response.json().catch(() => {
    throw new AgentHttpError("任务服务暂时不可用", response.status);
  });
  if (!response.ok)
    throw new AgentHttpError(
      typeof value.error === "string" ? value.error : "任务服务暂时不可用",
      response.status,
    );
  return value as T;
}
