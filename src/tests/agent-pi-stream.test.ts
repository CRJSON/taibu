import { test } from "node:test";
import assert from "node:assert/strict";
import { MockLanguageModelV3 } from "ai/test";
import {
  normalizeContext,
  isContextOverflow,
  Type,
  type Api,
  type Model,
} from "@earendil-works/pi-ai";
import {
  createPiSDKStream,
  toAgentModelMessages,
} from "../lib/agent/pi-stream.server";
import type { AIModelConfig } from "../types";

type Part =
  Awaited<
    ReturnType<MockLanguageModelV3["doStream"]>
  >["stream"] extends ReadableStream<infer P>
    ? P
    : never;
const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 4, reasoning: 1 },
};
const piModel = {
  id: "fixture",
  provider: "taibu",
  api: "openai-completions",
} as Model<Api>;
const config: AIModelConfig = {
  id: "fixture",
  name: "fixture",
  vendor: "other",
  modelId: "fixture",
  apiUrl: "https://model.example/v1",
  apiKeyEnvVar: "KEY",
  supportsReasoning: true,
};
const context = () =>
  normalizeContext({
    systemPrompt: "existing personality",
    messages: [{ role: "user", content: "query", timestamp: 1 }],
    tools: [
      {
        name: "search",
        description: "fixture tool",
        parameters: Type.Object({ query: Type.String() }),
      },
    ],
  });
function mockModel(parts: Part[]) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          parts.forEach((part) => controller.enqueue(part));
          controller.close();
        },
      }),
    }),
  });
}

test('SDK requests include native prompt sections and replay their latest updates before instructions', async t => {
  const sdk = require('../lib/ai/providers/ai-sdk-provider') as typeof import('../lib/ai/providers/ai-sdk-provider');
  t.mock.method(sdk, 'isModelAvailable', () => true);
  const model = mockModel([
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text' },
    { type: 'text-delta', id: 'text', delta: 'answer with guide' },
    { type: 'text-end', id: 'text' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
  ]);
  t.mock.method(sdk, 'createModelFromConfig', () => model);
  const input = normalizeContext({ messages: [
    { role: 'system', content: '系统约定', timestamp: 1, sections: { taibu_methods: '<taibu_methods>旧目录</taibu_methods>', instructions: '<instructions>先计算后解读</instructions>', obsolete: '已移除权限' } },
    { role: 'user', content: 'query', timestamp: 2 },
    { role: 'system', content: '', timestamp: 3, sections: { taibu_methods: '<taibu_methods>解读前读取八字指引</taibu_methods>', obsolete: null } },
  ] });
  const output = createPiSDKStream(config, { reasoning: false })(piModel, input);
  assert.equal((await output.result()).stopReason, 'stop');
  const prompt = model.doStreamCalls[0].prompt;
  assert.equal(prompt.filter(message => message.role === 'system').length, 1);
  assert.equal(prompt[0].role, 'system');
  assert.match(String(prompt[0].content), /<taibu_methods>解读前读取八字指引<\/taibu_methods>/);
  assert.doesNotMatch(String(prompt[0].content), /旧目录|已移除权限/);
  assert.ok(String(prompt[0].content).indexOf('<taibu_methods>') < String(prompt[0].content).indexOf('<instructions>'));
});

test('SDK output tokens respect the smallest source, native model and per-request budget', async t => {
  const sdk = require('../lib/ai/providers/ai-sdk-provider') as typeof import('../lib/ai/providers/ai-sdk-provider');
  t.mock.method(sdk, 'isModelAvailable', () => true);
  const model = mockModel([
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text' },
    { type: 'text-delta', id: 'text', delta: 'budgeted answer' },
    { type: 'text-end', id: 'text' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
  ]);
  t.mock.method(sdk, 'createModelFromConfig', () => model);
  for (const [sourceLimit, requestLimit, expected] of [[12288, undefined, 2400], [12288, 1200, 1200], [800, 1200, 800]] as const) {
    const output = createPiSDKStream({ ...config, defaultMaxTokens: sourceLimit }, { reasoning: false })({ ...piModel, maxTokens: 2400 }, context(), { maxTokens: requestLimit });
    assert.equal((await output.result()).stopReason, 'stop');
    assert.equal(model.doStreamCalls.at(-1)!.maxOutputTokens, expected);
  }
});

test('source fallback and transient errors share three external attempts; empty responses recover once', async t => {
  const sdk = require('../lib/ai/providers/ai-sdk-provider') as typeof import('../lib/ai/providers/ai-sdk-provider');
  t.mock.method(sdk, 'isModelAvailable', () => true);
  const model = new MockLanguageModelV3({ doStream: async () => { throw Object.assign(new Error('network timeout'), { statusCode: 503 }); } });
  t.mock.method(sdk, 'createModelFromConfig', () => model);
  const fallback = { ...config, sources: Array.from({length:5},(_,index)=>({sourceKey:String(index),sourceName:String(index),apiUrl:`https://source${index}.example/v1`,apiKeyEnvVar:'KEY'})) };
  let stream = createPiSDKStream(fallback,{reasoning:false})(piModel,context());
  for await(const event of stream) void event;
  assert.equal((await stream.result()).stopReason,'error'); assert.equal(model.doStreamCalls.length,3);
  const empty = mockModel([{ type:'stream-start', warnings:[] },{type:'finish', finishReason:{unified:'stop',raw:'stop'},usage}]);
  t.mock.method(sdk, 'createModelFromConfig', () => empty);
  stream = createPiSDKStream(config,{reasoning:false})(piModel,context());
  for await(const event of stream) void event;
  assert.equal((await stream.result()).stopReason,'error'); assert.equal(empty.doStreamCalls.length,2);
});

test("Pi StreamFn uses one SDK request and preserves text, reasoning signatures and tool arguments", async (t) => {
  const sdk =
    require("../lib/ai/providers/ai-sdk-provider") as typeof import("../lib/ai/providers/ai-sdk-provider");
  const model = mockModel([
    { type: "stream-start", warnings: [] },
    { type: "reasoning-start", id: "reason" },
    { type: "reasoning-delta", id: "reason", delta: "推理" },
    {
      type: "reasoning-end",
      id: "reason",
      providerMetadata: { openai: { reasoningSignature: "signed" } },
    },
    { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: "说明" },
    { type: "text-end", id: "text" },
    {
      type: "tool-call",
      toolCallId: "call",
      toolName: "search",
      input: '{"query":"星象"}',
    },
    {
      type: "finish",
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage,
    },
  ]);
  t.mock.method(sdk, "createModelFromConfig", () => model);
  const output = await createPiSDKStream(config, {
    reasoning: true,
    apiKey: "ephemeral-fixture",
  })(piModel, context());
  const events = [];
  for await (const event of output) events.push(event);
  const message = await output.result();
  assert.equal(message.stopReason, "toolUse");
  assert.equal(message.usage.totalTokens, 8);
  assert.equal(message.usage.reasoning, 1);
  assert.ok(events.some((e) => e.type === "thinking_end"));
  assert.ok(events.some((e) => e.type === "text_end"));
  assert.deepEqual(
    message.content.find((p) => p.type === "toolCall")?.arguments,
    { query: "星象" },
  );
  const converted = toAgentModelMessages([message]);
  const parts = converted[0].content;
  assert.ok(Array.isArray(parts));
  assert.deepEqual(parts.find((p) => p.type === "reasoning")?.providerOptions, {
    openai: { reasoningSignature: "signed" },
  });
  assert.equal(model.doStreamCalls.length, 1);
  assert.equal(model.doStreamCalls[0].tools?.length, 1);
  assert.ok(model.doStreamCalls[0].abortSignal);
});

test("SDK cached inputs map to Pi without double-counting and overflow stays recognizable without private details", async (t) => {
  const sdk = require("../lib/ai/providers/ai-sdk-provider") as typeof import("../lib/ai/providers/ai-sdk-provider");
  t.mock.method(sdk, "isModelAvailable", () => true);
  t.mock.method(sdk, "createModelFromConfig", () => mockModel([
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: "answer" },
    { type: "text-end", id: "text" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: { inputTokens: { total: 900, noCache: 600, cacheRead: 200, cacheWrite: 100 }, outputTokens: { total: 100, text: 70, reasoning: 30 } } },
  ]));
  let stream = createPiSDKStream(config, { reasoning: false })(piModel, context());
  for await (const _event of stream) void _event;
  const result = await stream.result();
  assert.equal(result.usage.input, 600);
  assert.equal(result.usage.cacheRead, 200);
  assert.equal(result.usage.cacheWrite, 100);
  assert.equal(result.usage.output, 100);
  assert.equal(result.usage.reasoning, 30);
  assert.equal(result.usage.totalTokens, 1000);
  t.mock.method(sdk, "createModelFromConfig", () => new MockLanguageModelV3({ doStream: async () => { throw new Error("context_length_exceeded private-user-content secret-key"); } }));
  t.mock.method(console, "error", () => {});
  stream = createPiSDKStream(config, { reasoning: false })(piModel, context());
  for await (const _event of stream) void _event;
  const failure = await stream.result();
  assert.equal(isContextOverflow(failure), true);
  assert.doesNotMatch(JSON.stringify(failure), /private-user-content|secret-key/);
});

test("Pi source fallback retries only before any response part; provider errors are sanitized", async (t) => {
  const sdk =
    require("../lib/ai/providers/ai-sdk-provider") as typeof import("../lib/ai/providers/ai-sdk-provider");
  const loggedErrors = t.mock.method(console, "error", () => {});
  t.mock.method(sdk, "isModelAvailable", () => true);
  const fallback = {
    ...config,
    sources: [
      {
        sourceKey: "first",
        sourceName: "first",
        apiUrl: "https://first.example/v1",
        apiKeyEnvVar: "FIRST",
      },
      {
        sourceKey: "second",
        sourceName: "second",
        apiUrl: "https://second.example/v1",
        apiKeyEnvVar: "SECOND",
      },
    ],
  };
  const failing = new MockLanguageModelV3({
    doStream: async () => {
      throw new Error("private provider error api-key-secret");
    },
  });
  const success = mockModel([
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: "fallback success" },
    { type: "text-end", id: "text" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
  ]);
  t.mock.method(sdk, "createModelFromConfig", (value: AIModelConfig) =>
    value.sourceKey === "first" ? failing : success,
  );
  let stream = await createPiSDKStream(fallback, { reasoning: false })(
    piModel,
    context(),
  );
  for await (const _event of stream) {
    void _event;
  }
  assert.equal((await stream.result()).stopReason, "stop");
  assert.equal(success.doStreamCalls.length, 1);
  const partial = mockModel([
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: "already visible" },
    { type: "error", error: new Error("api-key-secret") },
  ]);
  t.mock.method(sdk, "createModelFromConfig", (value: AIModelConfig) =>
    value.sourceKey === "first" ? partial : success,
  );
  stream = await createPiSDKStream(fallback, { reasoning: false })(
    piModel,
    context(),
  );
  for await (const _event of stream) {
    void _event;
  }
  const failed = await stream.result();
  assert.equal(failed.stopReason, "error");
  assert.ok(!JSON.stringify(failed).includes("api-key-secret"));
  assert.equal(success.doStreamCalls.length, 1);
  assert.equal(
    loggedErrors.mock.callCount(),
    0,
    "SDK does not print raw provider exceptions",
  );
});

test("unsupported tool warnings and abnormal model finish reasons fail explicitly", async (t) => {
  const sdk =
    require("../lib/ai/providers/ai-sdk-provider") as typeof import("../lib/ai/providers/ai-sdk-provider");
  t.mock.method(console, "warn", () => {});
  for (const scenario of ["tools", "error", "content-filter", "other"] as const) {
    const model = mockModel([
      {
        type: "stream-start",
        warnings:
          scenario === "tools"
            ? [{ type: "unsupported", feature: "tools" }]
            : [],
      },
      { type: "text-start", id: "text" },
      { type: "text-delta", id: "text", delta: "partial" },
      { type: "text-end", id: "text" },
      {
        type: "finish",
        finishReason: {
          unified: scenario === "tools" ? "stop" : scenario,
          raw: scenario,
        },
        usage,
      },
    ]);
    t.mock.method(sdk, "createModelFromConfig", () => model);
    const stream = await createPiSDKStream(config, {
      reasoning: false,
      apiKey: "fixture",
    })(piModel, context());
    for await (const event of stream) void event;
    const message = await stream.result();
    assert.equal(message.stopReason, "error", scenario);
    assert.match(message.errorMessage ?? "", /工具调用.*普通对话/);
  }
});

test("SDK EOF without a finish marker emits a Pi error, preserving partial text without a success event", async (t) => {
  const sdk = require("../lib/ai/providers/ai-sdk-provider") as typeof import("../lib/ai/providers/ai-sdk-provider");
  t.mock.method(sdk, "createModelFromConfig", () => mockModel([
    { type: "stream-start", warnings: [] }, { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: "partial" }, { type: "text-end", id: "text" },
  ]));
  const stream = createPiSDKStream(config, { reasoning: false, apiKey: "fixture" })(piModel, context());
  const events = [];
  for await (const event of stream) events.push(event);
  assert.equal((await stream.result()).stopReason, "error");
  assert.equal(events.some(event => event.type === "done"), false);
  assert.equal(events.at(-1)?.type, "error");
  assert.equal((await stream.result()).content[0].type, "text");
});

test("SDK timeout and user abort both emit a Pi failure after partial output", async (t) => {
  const sdk = require("../lib/ai/providers/ai-sdk-provider") as typeof import("../lib/ai/providers/ai-sdk-provider");
  for (const scenario of ["timeout", "user"] as const) {
    const timeout = new AbortController(), user = new AbortController();
    t.mock.method(AbortSignal, "timeout", () => timeout.signal);
    const model = new MockLanguageModelV3({
      doStream: async ({ abortSignal }) => ({ stream: new ReadableStream<Part>({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "text" });
          controller.enqueue({ type: "text-delta", id: "text", delta: "partial" });
          abortSignal!.addEventListener("abort", () => controller.error(abortSignal!.reason), { once: true });
        },
      }) }),
    });
    t.mock.method(sdk, "createModelFromConfig", () => model);
    const stream = createPiSDKStream(config, { reasoning: false, apiKey: "fixture" })(piModel, context(), { signal: user.signal });
    const events = [];
    for await (const event of stream) {
      events.push(event);
      if (event.type === "text_delta") (scenario === "timeout" ? timeout : user).abort();
    }
    assert.equal((await stream.result()).stopReason, scenario === "timeout" ? "error" : "aborted");
    assert.equal(events.some(event => event.type === "done"), false, scenario);
    assert.equal(model.doStreamCalls.length, 1);
  }
});
