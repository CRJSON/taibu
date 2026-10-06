"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, CustomProviderConfig, Mention } from "@/types";
import type { ChatStateReturn } from "@/lib/chat/use-chat-state";
import {
  agentJson,
  mergeAgentSnapshot,
  readAgentStream,
  canAdoptAgentRun,
  postAgentRun,
  AgentHttpError,
} from "./browser-client";
import { isAgentRunTerminal, type AgentRunView } from "./types";

type AgentCapabilities = {
  enabled: boolean;
  ready: boolean;
  webAvailable: boolean;
  customAvailable: boolean;
};
export function useAgentChat(
  state: ChatStateReturn,
  userId: string | null,
  refreshViewer: () => Promise<unknown>,
) {
  const [mode, setModeState] = useState<"agent" | "plain">("plain");
  const [capabilities, setCapabilities] = useState<AgentCapabilities>({
    enabled: false,
    ready: false,
    webAvailable: false,
    customAvailable: false,
  });
  const [run, setRun] = useState<AgentRunView | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [syncingRunId, setSyncingRunId] = useState<string | null>(null);
  const [webEnabled, setWebEnabled] = useState(true);
  const latest = useRef({ state, refreshViewer, userId });
  latest.current = { state, refreshViewer, userId };
  const explicitMode = useRef(false);
  const completed = useRef(new Set<string>());
  const receivedCursors = useRef(new Map<string, number>());
  const latestRuns = useRef(new Map<string, AgentRunView>());
  const pendingCreations = useRef(
    new Map<string, { key: string; body: Record<string, unknown> }>(),
  );
  const adopt = useCallback((view: AgentRunView) => {
    if (
      view.conversationId !==
      latest.current.state.activeConversationIdRef.current
    )
      return;
    if ((receivedCursors.current.get(view.id) ?? -1) > view.cursor) return;
    if (!canAdoptAgentRun(latestRuns.current.get(view.conversationId), view))
      return;
    latestRuns.current.set(view.conversationId, view);
    receivedCursors.current.set(view.id, view.cursor);
    setRun((current) =>
      current?.id === view.id && current.cursor > view.cursor ? current : view,
    );
    latest.current.state.setMessages((messages) =>
      mergeAgentSnapshot(messages, view),
    );
    if (isAgentRunTerminal(view.status) && !completed.current.has(view.id)) {
      completed.current.add(view.id);
      setSyncingRunId(view.id);
      void latest.current.refreshViewer();
      void latest.current.state.refreshConversationList();
      void latest.current.state
        .retryConversationLoad()
        .finally(() =>
          setSyncingRunId((current) => (current === view.id ? null : current)),
        )
        .catch(() => {});
    }
  }, []);
  useEffect(() => {
    pendingCreations.current.clear();
    if (!userId) return;
    receivedCursors.current.clear();
    latestRuns.current.clear();
    completed.current.clear();
    explicitMode.current = false;
    try {
      const saved = localStorage.getItem(`taibu:agent-mode:${userId}`);
      if (saved === "agent" || saved === "plain") {
        explicitMode.current = true;
        setModeState(saved);
      }
    } catch {}
    const controller = new AbortController();
    const load = async () => {
      try {
        const value = await agentJson<AgentCapabilities>("/api/agent/status", {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setCapabilities(value);
        if (!explicitMode.current)
          setModeState(value.ready ? "agent" : "plain");
      } catch {
        if (!controller.signal.aborted)
          setCapabilities({
            enabled: false,
            ready: false,
            webAvailable: false,
            customAvailable: false,
          });
      }
    };
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => {
      controller.abort();
      clearInterval(timer);
      setRun(null);
    };
  }, [userId]);
  useEffect(() => {
    setRun(null);
    if (!userId || !state.activeConversationId || state.conversationLoading) {
      setRestoring(false);
      return;
    }
    setRestoring(true);
    const controller = new AbortController();
    void agentJson<AgentRunView | null>(
      `/api/agent/runs?conversationId=${encodeURIComponent(state.activeConversationId)}`,
      { signal: controller.signal },
    )
      .then((view) => {
        if (view && !controller.signal.aborted) adopt(view);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setRestoring(false);
      });
    return () => controller.abort();
  }, [adopt, userId, state.activeConversationId, state.conversationLoading]);
  const runId = run?.id;
  useEffect(() => {
    if (
      !runId ||
      !run ||
      isAgentRunTerminal(run.status) ||
      run.status === "awaiting_input"
    )
      return;
    const controller = new AbortController();
    let cursor = run.cursor;
    const listen = async () => {
      while (!controller.signal.aborted) {
        try {
          const response = await fetch(
            `/api/agent/runs/${runId}/events?after=${cursor}`,
            { signal: controller.signal },
          );
          setReconnecting(false);
          let settled = false;
          await readAgentStream(response, controller.signal, (view) => {
            cursor = Math.max(cursor, view.cursor);
            adopt(view);
            settled =
              isAgentRunTerminal(view.status) ||
              view.status === "awaiting_input";
          });
          if (settled) return;
        } catch {
          if (controller.signal.aborted) return;
          setReconnecting(true);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    };
    void listen();
    return () => controller.abort();
    // Snapshots update the same connection; only task/status transitions resubscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, run?.status, adopt]);

  const setMode = useCallback(
    (value: "agent" | "plain") => {
      explicitMode.current = true;
      setModeState(value);
      if (userId)
        try {
          localStorage.setItem(`taibu:agent-mode:${userId}`, value);
        } catch {}
    },
    [userId],
  );
  const start = async (
    conversationId: string,
    message: ChatMessage,
    options: {
      model: string;
      reasoning: boolean;
      mentions: Mention[];
      provider: CustomProviderConfig | null;
      fileContent?: string;
      replaceFromMessageId?: string;
    },
  ) => {
    if (options.provider && !capabilities.customAvailable)
      throw new Error("自定义模型后台任务未配置，可切换普通对话");
    const body: Record<string, unknown> = {
      conversationId,
      clientRequestId: crypto.randomUUID(),
      message,
      model: options.model,
      reasoning: options.reasoning,
      mentions: options.mentions,
      fileContent: options.fileContent,
      replaceFromMessageId: options.replaceFromMessageId,
      customProvider: options.provider
        ? {
            apiUrl: options.provider.apiUrl,
            apiKey: options.provider.apiKey,
            modelId: options.provider.modelId,
          }
        : undefined,
      webEnabled,
      dreamMode: latest.current.state.chatMode === "dream",
      mangpaiMode: latest.current.state.chatMode === "mangpai",
    };
    const key = JSON.stringify({
      ...body,
      clientRequestId: undefined,
      message: { content: message.content, attachments: message.attachments },
    });
    const pending = pendingCreations.current.get(conversationId);
    const requestBody = pending?.key === key ? pending.body : body;
    pendingCreations.current.set(conversationId, { key, body: requestBody });
    let view: AgentRunView;
    try {
      view = await postAgentRun(requestBody);
    } catch (error) {
      if (
        error instanceof AgentHttpError &&
        error.status >= 400 &&
        error.status < 500
      )
        pendingCreations.current.delete(conversationId);
      else {
        const recovered = await agentJson<AgentRunView | null>(
          `/api/agent/runs?conversationId=${encodeURIComponent(conversationId)}`,
        ).catch(() => null);
        if (recovered && recovered.clientRequestId === requestBody.clientRequestId) {
          pendingCreations.current.delete(conversationId);
          adopt(recovered);
          void latest.current.state.retryConversationLoad();
          return recovered;
        }
      }
      throw error;
    }
    pendingCreations.current.delete(conversationId);
    if (view.userMessage)
      latest.current.state.setMessages((messages) =>
        messages.map((current) =>
          current.id === message.id
            ? {
                ...current,
                ...view.userMessage,
                versions: current.versions,
                currentVersionIndex: current.currentVersionIndex,
              }
            : current,
        ),
      );
    adopt(view);
    void latest.current.refreshViewer();
    void latest.current.state.refreshConversationList();
    return view;
  };
  const active = !!run && !isAgentRunTerminal(run.status);
  const sendCommand = async (content: string, queue = false) => {
    if (!run || !active) throw new Error("任务已结束");
    const result = await agentJson<{ message: ChatMessage; run: AgentRunView }>(
      `/api/agent/runs/${run.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          clientRequestId: crypto.randomUUID(),
          mode:
            run.status === "awaiting_input"
              ? "reply"
              : queue
                ? "follow_up"
                : "steer",
        }),
      },
    );
    latest.current.state.setMessages((messages) =>
      messages.some((m) => m.id === result.message.id)
        ? messages
        : [...messages, result.message],
    );
    adopt(result.run);
  };
  const stop = () => {
    if (run)
      void agentJson<AgentRunView>(`/api/agent/runs/${run.id}/cancel`, {
        method: "POST",
      })
        .then(adopt)
        .catch(() => setReconnecting(true));
  };
  return {
    mode,
    setMode,
    capabilities,
    run,
    active,
    reconnecting,
    restoring,
    syncing:
      !!syncingRunId &&
      latestRuns.current.get(state.activeConversationId ?? "")?.id ===
        syncingRunId,
    start,
    sendCommand,
    stop,
    webEnabled,
    setWebEnabled,
    running: active && run?.status !== "awaiting_input",
  };
}
