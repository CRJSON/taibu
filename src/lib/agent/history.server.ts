import "server-only";
import type { Message } from "@earendil-works/pi-ai";
import type { ChatMessage } from "@/types";

/** Shared history DTO conversion; Web does not load a Harness or provider catalog. */
export function piHistory(messages: ChatMessage[]): Message[] {
  return messages.filter(message => message.role !== "system").map(message =>
    message.role === "user" ? {
      role: "user", content: message.content, timestamp: Date.parse(message.createdAt),
    } : {
      role: "assistant", content: [{ type: "text", text: message.content }],
      api: "openai-completions", provider: "taibu", model: message.model ?? "history",
      timestamp: Date.parse(message.createdAt), stopReason: "stop",
      usage: {
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    },
  ) as Message[];
}
