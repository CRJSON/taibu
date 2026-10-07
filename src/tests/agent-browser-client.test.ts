import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeAgentSnapshot,
  readAgentStream,
  canAdoptAgentRun,
  postAgentRun,
  postAgentCommand,
  orderAgentMessagesForDisplay,
} from "../lib/agent/browser-client";
import type { AgentRunView } from "../lib/agent/types";
import type { ChatMessage } from "../types";

const view: AgentRunView = {
  id: "run",
  conversationId: "conversation",
  status: "running",
  cursor: 4,
  createdAt: "2026-01-01",
  message: {
    id: "agent:run",
    role: "assistant",
    content: "正文",
    createdAt: "2026-01-01",
    agent: {
      version: 1,
      runId: "run",
      status: "running",
      parts: [{ type: "text", id: "text", text: "正文" }],
    },
  },
};
test("Agent browser merges server messages without reintroducing terminal messages from old branches", () => {
  const original = [
    {
      id: "user",
      role: "user" as const,
      content: "问题",
      createdAt: "2026-01-01",
    },
  ];
  const merged = mergeAgentSnapshot(original, view);
  assert.equal(merged.length, 2);
  assert.equal(
    mergeAgentSnapshot(merged, {
      ...view,
      message: { ...view.message, content: "更新" },
    }).length,
    2,
  );
  assert.equal(merged[1].content, "正文");
  assert.equal(original.length, 1);
  assert.equal(
    mergeAgentSnapshot(original, { ...view, status: "completed" }),
    original,
  );
});

test("commands retry an uncertain receipt with the exact same ID, mode and content", async (t) => {
  const bodies: string[] = [];
  const message = { id: "command", role: "user" as const, content: "reply", createdAt: "2026-01-01" };
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    assert.equal(url, "/api/agent/runs/run/messages");
    bodies.push(String(init?.body));
    if (bodies.length === 1) return new Response("receipt lost", { status: 502 });
    return Response.json({ message, run: view });
  });
  assert.deepEqual(await postAgentCommand("run", { content: "reply", clientRequestId: "stable", mode: "reply" }), { message, run: view });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  let denied = 0;
  t.mock.method(globalThis, "fetch", async () => {
    denied++;
    return Response.json({ error: "任务已结束" }, { status: 409 });
  });
  await assert.rejects(postAgentCommand("run", { content: "reply", clientRequestId: "denied", mode: "reply" }), /任务已结束/);
  assert.equal(denied, 1);
});

test('task output follows associated replies without changing persisted message order', () => {
  const input = (id: string, runId?: string): ChatMessage => ({ id, role: 'user', content: id, createdAt: '2026-01-01', metadata: { agentRunId: runId } });
  const messages = [input('request'), view.message, input('reply', 'run'), input('steer', 'run'), input('next request'), { ...view.message, id: 'plain', agent: undefined }];
  const original = messages.map(message => message.id);
  const ordered = orderAgentMessagesForDisplay(messages);
  assert.deepEqual(ordered.map(message => message.id), ['request', 'reply', 'steer', 'agent:run', 'next request', 'plain']);
  assert.deepEqual(messages.map(message => message.id), original);
  assert.equal(ordered[3], view.message);
});

test('display ordering preserves ordinary history, invalid associations and later assistant boundaries', () => {
  const messages: ChatMessage[] = [view.message,
    { id: 'other-run', role: 'user', content: '', createdAt: '', metadata: { agentRunId: 'other' } },
    { id: 'plain', role: 'assistant', content: '', createdAt: '' },
    { id: 'late', role: 'user', content: '', createdAt: '', metadata: { agentRunId: 'run' } },
  ];
  assert.equal(orderAgentMessagesForDisplay(messages), messages);
});

test('snapshots order legacy inputs without changing loaded history or another task', () => {
  const legacy: ChatMessage = { id: 'legacy', role: 'user', content: 'answer', createdAt: '2026-01-01', metadata: { original: true } };
  const messages = [view.message, legacy];
  const snapshot = { ...view, commandMessageIds: ['legacy', 'missing', 'agent:run'] };
  const restored = orderAgentMessagesForDisplay(messages, snapshot);
  assert.deepEqual(legacy.metadata, { original: true });
  assert.deepEqual(restored.map(message => message.id), ['legacy', 'agent:run']);
  assert.equal(restored.length, 2);
  assert.equal(orderAgentMessagesForDisplay(messages, { ...snapshot, id: 'other-run' }), messages);
});
test("late snapshots from a previous task cannot replace the current task", () => {
  const newer = { ...view, id: "new-run", createdAt: "2026-01-02", cursor: 1 };
  assert.equal(
    canAdoptAgentRun(newer, { ...view, status: "completed", cursor: 99 }),
    false,
  );
  assert.equal(canAdoptAgentRun(view, newer), true);
  assert.equal(canAdoptAgentRun(view, { ...view, cursor: 3 }), false);
  assert.equal(canAdoptAgentRun(view, { ...view, cursor: 5 }), true);
  assert.equal(
    canAdoptAgentRun(newer, { ...view, conversationId: "other" }),
    true,
  );
});

test("Agent SSE handles chunked UTF8, CRLF, history replay and malformed snapshots", async () => {
  const text = `: heartbeat\r\n\r\nevent: history\r\nid: 3\r\ndata: {"version":1,"runId":"run","sequence":3}\r\n\r\ndata: {"id":"malformed","cursor":9}\r\n\r\nevent: snapshot\r\nid: 4\r\ndata: ${JSON.stringify(view)}\r\n\r\n`;
  const bytes = new TextEncoder().encode(text),
    received: AgentRunView[] = [];
  const response = new Response(
    new ReadableStream({
      start(controller) {
        for (let index = 0; index < bytes.length; index += 7)
          controller.enqueue(bytes.slice(index, index + 7));
        controller.close();
      },
    }),
  );
  await readAgentStream(response, new AbortController().signal, (run) =>
    received.push(run),
  );
  assert.deepEqual(received, [view]);
});
test("Agent SSE abort cancels an idle reader; HTTP failures are visible", async () => {
  let cancelled = false;
  const controller = new AbortController();
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  const reading = readAgentStream(response, controller.signal, () =>
    assert.fail("no snapshot"),
  );
  controller.abort();
  await reading;
  assert.equal(cancelled, true);
  await assert.rejects(
    readAgentStream(
      new Response(null, { status: 403 }),
      new AbortController().signal,
      () => {},
    ),
    /连接中断/,
  );
});

test("creation retries a lost response with the same idempotency payload and never retries a client rejection", async (t) => {
  const bodies: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (
      _input: Parameters<typeof fetch>[0],
      init: Parameters<typeof fetch>[1],
    ) => {
      bodies.push(String(init?.body));
      if (bodies.length === 1)
        throw new TypeError("connection interrupted after commit");
      return Response.json(view);
    },
  );
  assert.deepEqual(
    await postAgentRun({ clientRequestId: "same-id", conversationId: "owned" }),
    view,
  );
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  let denied = 0;
  t.mock.method(globalThis, "fetch", async () => {
    denied++;
    return Response.json({ error: "会员权限不足" }, { status: 403 });
  });
  await assert.rejects(postAgentRun({ clientRequestId: "denied" }), /会员权限/);
  assert.equal(denied, 1);
});
