import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, lstat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import {
  ROOT,
  validateConfig,
  validateProject,
  localDocker,
  validateResourceOwnership,
} from "../selfhost.mjs";

const index = process.argv.indexOf("--project");
assert.ok(index >= 0, "specify an independent demo project with --project");
const project = validateProject(process.argv[index + 1]);
const directory = path.join(ROOT, ".taibu-local", project);
const file = path.join(directory, "config.json");
const stat = await lstat(file);
assert.ok(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077));
const config = validateConfig(JSON.parse(await readFile(file, "utf8")));
assert.equal(config.LOCAL_PROJECT, project);
assert.equal(config.DEMO_ENABLED, "true");
const browser = await chromium.launch({
  headless: true,
  ...(process.argv.includes("--chrome") ? { channel: "chrome" } : {}),
});
const outside = [],
  errors = [],
  failures = [];
const created = [];
let page;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  await context.route("**/*", (route) => {
    const origin = new URL(route.request().url()).origin;
    if (origin === config.APP_ORIGIN) return route.continue();
    outside.push(origin);
    return route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => {
    let message = error.message.replace(
      /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/gu,
      "[redacted token]",
    );
    for (const [key, value] of Object.entries(config))
      if (value && /PASSWORD|KEY|SECRET|INSTANCE/u.test(key))
        message = message.replaceAll(value, "[redacted]");
    errors.push(`${new URL(page.url()).pathname}: ${error.name}: ${message.slice(0, 240)}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500)
      failures.push(new URL(response.url()).pathname);
  });
  const get = async (route) => {
    const response = await context.request.get(`${config.APP_ORIGIN}${route}`);
    assert.ok(response.ok(), `read ${route}: ${response.status()}`);
    return response.json();
  };
  const credits = async () =>
    (await get("/api/user/membership")).membership.aiChatCount;
  const composer = () =>
    page.locator("textarea").filter({ visible: true }).last();
  const uiReady = () => page.locator('[data-agent-ready="true"]').waitFor();
  const waitForRun = async (id, status, attempts = 160) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const run = await get(`/api/agent/runs/${id}`);
      if (run.status === status) return run;
      assert.ok(
        !["failed", "cancelled", "completed"].includes(run.status),
        `unexpected task outcome ${run.status}: ${run.message.agent?.error ?? ""}`,
      );
      await delay(250);
    }
    throw new Error(`task did not reach ${status}`);
  };
  const newChat = async () => {
    await page.goto(`${config.APP_ORIGIN}/chat`);
    await page.getByRole("button", { name: "Agent", exact: true }).waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (button) =>
          button.textContent === "Agent" &&
          button.getAttribute("aria-pressed") === "true",
      ),
    );
  };
  const send = async (text) => {
    await uiReady();
    const response = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/agent/runs" &&
        response.request().method() === "POST",
    );
    await composer().fill(text);
    await composer().press("Enter");
    const result = await response;
    assert.equal(result.status(), 201, "UI starts a durable task");
    const run = await result.json();
    assert.equal(run.message.agent.version, 1);
    assert.ok(!JSON.stringify(run).includes(config.DEMO_API_KEY));
    assert.ok(
      !("checkpoint" in run) && !("credential" in run) && !("input" in run),
    );
    created.push(run.id);
    return { run, payload: result.request().postDataJSON() };
  };
  await page.goto(`${config.APP_ORIGIN}/chat`);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByPlaceholder("邮箱前缀").fill(config.USER_EMAIL);
  await page.getByPlaceholder("输入密码").fill(config.USER_PASSWORD);
  await page
    .locator("form")
    .getByRole("button", { name: "登录", exact: true })
    .click();
  await page.getByPlaceholder("输入密码").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Agent", exact: true }).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (button) =>
        button.textContent === "Agent" &&
        button.getAttribute("aria-pressed") === "true",
    ),
  );
  assert.equal(
    (await get("/api/agent/status")).ready,
    true,
    "real worker heartbeat reaches Web",
  );
  assert.ok((await context.cookies()).some((cookie) => cookie.httpOnly));

  const initial = await credits();
  const first = await send("Agent验收：跨命盘对比，请排盘并保存最终分析。");
  await page.goto(`${config.APP_ORIGIN}/chat?id=${first.run.conversationId}`);
  const finished = await waitForRun(first.run.id, "completed");
  await page.locator('[data-agent-status="completed"]').waitFor();
  assert.equal(await credits(), initial - 1);
  assert.equal(
    finished.message.agent.parts.filter(
      (part) =>
        part.type === "tool" &&
        part.name === "bazi" &&
        part.status === "completed",
    ).length,
    2,
  );
  const artifacts = finished.message.agent.parts.filter(
    (part) => part.type === "artifact",
  );
  assert.equal(artifacts.filter((part) => part.chartType === "bazi").length, 2);
  const record = artifacts.find((part) => part.recordId);
  assert.ok(record);
  const saved = await get(`/api/records/${record.recordId}`);
  assert.ok(
    saved.content.includes("日主") && saved.content.includes("Agent 离线验收"),
    "canonical tools and final analysis are saved together",
  );
  const duplicate = await context.request.post(
    `${config.APP_ORIGIN}/api/agent/runs`,
    { data: first.payload },
  );
  assert.ok(duplicate.ok());
  assert.equal((await duplicate.json()).id, first.run.id);
  assert.equal(
    await credits(),
    initial - 1,
    "duplicate submission does not debit again",
  );
  await page.screenshot({
    path: path.join(directory, "agent-acceptance.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: record.title, exact: true }).click();
  await page.waitForURL(
    (url) =>
      url.pathname === "/records" &&
      url.searchParams.get("id") === record.recordId,
  );
  await page
    .getByRole("heading", { name: "编辑命理记录", exact: true })
    .waitFor();
  console.log(
    "Agent 浏览器：真实登录、跨命盘工具调用、后台完成、刷新恢复、成果入口和一次扣费通过。",
  );

  await page.goto(`${config.APP_ORIGIN}/chat?id=${first.run.conversationId}`);
  await page.locator('[data-agent-status="completed"]').waitFor();
  await uiReady();
  const regenerateResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/agent/runs" &&
      response.request().method() === "POST",
  );
  await page
    .locator("button")
    .filter({ has: page.locator("svg.lucide-refresh-cw") })
    .last()
    .click();
  const regeneratedResponse = await regenerateResponse;
  assert.equal(regeneratedResponse.status(), 201);
  const regenerated = await regeneratedResponse.json();
  created.push(regenerated.id);
  assert.notEqual(
    regenerated.id,
    first.run.id,
    "regeneration creates a new task",
  );
  const regeneratedResult = await waitForRun(regenerated.id, "completed");
  await page.locator('[data-agent-status="completed"]').waitFor();
  assert.deepEqual(
    regeneratedResult.message.agent.parts
      .filter((part) => part.type === "artifact" && part.chartId)
      .map((part) => part.chartId)
      .sort(),
    artifacts
      .filter((part) => part.chartId)
      .map((part) => part.chartId)
      .sort(),
    "regeneration reuses the existing native charts",
  );
  assert.equal(await credits(), initial - 2);
  await uiReady();
  const editResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/agent/runs" &&
      response.request().method() === "POST",
  );
  await page
    .locator("button")
    .filter({ has: page.locator("svg.lucide-pencil") })
    .first()
    .click();
  await page
    .locator("textarea")
    .filter({ visible: true })
    .first()
    .fill("Agent验收：编辑消息后跨命盘对比并保存。");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  const editedResponse = await editResponse;
  assert.equal(editedResponse.status(), 201);
  const edited = await editedResponse.json();
  created.push(edited.id);
  await waitForRun(edited.id, "completed");
  await page.locator('[data-agent-status="completed"]').waitFor();
  assert.equal(await credits(), initial - 3);
  console.log(
    "Agent 浏览器：重新生成、编辑后续跑、历史版本保留及原生命盘复用通过。",
  );

  await newChat();
  const beforeReply = await credits();
  const second = await send("Agent验收：补充信息后排盘，请先询问出生信息。");
  await waitForRun(second.run.id, "awaiting_input");
  await page.goto(`${config.APP_ORIGIN}/chat?id=${second.run.conversationId}`);
  await page.locator('[data-agent-status="awaiting_input"]').waitFor();
  await page.getByText("补充信息后继续同一任务", { exact: true }).waitFor();
  await page
    .getByText("请补充出生年月日、出生时刻和性别。", { exact: true })
    .waitFor();
  await uiReady();
  const replyResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/agent/runs/${second.run.id}/messages` &&
      response.request().method() === "POST",
  );
  await composer().fill("1990年1月15日9时，男。");
  await composer().press("Enter");
  assert.ok((await replyResponse).ok());
  await waitForRun(second.run.id, "completed");
  await page.locator('[data-agent-status="completed"]').waitFor();
  assert.equal(
    await credits(),
    beforeReply - 1,
    "supplement uses the original task charge",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(directory, "agent-mobile-acceptance.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "mobile layout has no horizontal overflow",
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  console.log("Agent 浏览器：等待补充、刷新后继续同一任务、移动端布局通过。");

  await newChat();
  const beforeCancel = await credits();
  const third = await send("Agent验收：补充信息，请先询问，等待时停止。");
  await waitForRun(third.run.id, "awaiting_input");
  await page.locator('[data-agent-status="awaiting_input"]').waitFor();
  const cancelResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
      `/api/agent/runs/${third.run.id}/cancel`,
  );
  await page.getByRole("button", { name: "停止任务", exact: true }).click();
  assert.ok((await cancelResponse).ok());
  await waitForRun(third.run.id, "cancelled");
  await page.locator('[data-agent-status="cancelled"]').waitFor();
  assert.equal(
    await credits(),
    beforeCancel,
    "stopping without visible body or saved result refunds once",
  );
  await context.request.post(
    `${config.APP_ORIGIN}/api/agent/runs/${third.run.id}/cancel`,
  );
  assert.equal(await credits(), beforeCancel);
  console.log("Agent 浏览器：用户停止、终态恢复、一次退款通过。");

  await newChat();
  const beforeCrash = await credits();
  const crash = await send("Agent验收：崩溃恢复，请排盘并保存最终分析。");
  for (let attempt = 0; attempt < 120; attempt++) {
    const progress = await get(`/api/agent/runs/${crash.run.id}`);
    if (
      progress.message.agent.parts.some(
        (part) =>
          part.type === "tool" &&
          part.name === "bazi" &&
          part.status === "completed",
      )
    )
      break;
    assert.ok(["queued", "running"].includes(progress.status));
    assert.ok(attempt < 119, "calculation checkpoint was not committed");
    await delay(100);
  }
  const dockerEnvironment = await localDocker();
  const worker = `${project}-worker-1`;
  const marker = execFileSync(
    "docker",
    [
      "inspect",
      "--format",
      '{{index .Config.Labels "io.taibu.local.instance"}}',
      worker,
    ],
    { env: dockerEnvironment, encoding: "utf8" },
  ).trim();
  validateResourceOwnership(marker, config.LOCAL_INSTANCE_ID);
  execFileSync("docker", ["kill", "--signal", "KILL", worker], {
    env: dockerEnvironment,
    stdio: "pipe",
  });
  execFileSync("docker", ["start", worker], {
    env: dockerEnvironment,
    stdio: "pipe",
  });
  console.log("Agent 浏览器：已终止隔离 worker，等待租约失效后接管同一任务。");
  await page.goto(`${config.APP_ORIGIN}/chat?id=${crash.run.conversationId}`);
  const recovered = await waitForRun(crash.run.id, "completed", 360);
  await page.locator('[data-agent-status="completed"]').waitFor();
  assert.equal(
    recovered.message.agent.parts.filter(
      (part) => part.type === "tool" && part.name === "bazi",
    ).length,
    1,
    "committed calculation is not executed twice",
  );
  assert.equal(
    recovered.message.agent.parts.filter(
      (part) => part.type === "artifact" && part.recordId,
    ).length,
    1,
  );
  assert.equal(
    await credits(),
    beforeCrash - 1,
    "worker takeover keeps the original charge",
  );
  console.log(
    "Agent 浏览器：真实 worker 崩溃、租约接管、刷新重连及成果幂等保存通过。",
  );

  await newChat();
  await page.getByRole("button", { name: "普通对话", exact: true }).click();
  const plainResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/chat" &&
      response.request().method() === "POST",
  );
  await composer().fill(`普通对话本地验收 ${randomUUID()}`);
  await composer().press("Enter");
  assert.ok((await plainResponse).ok());
  await page
    .getByText(/这是本地离线演示回复/)
    .first()
    .waitFor();
  const conversation = new URL(page.url()).searchParams.get("id");
  assert.ok(conversation);
  assert.equal(
    await get(`/api/agent/runs?conversationId=${conversation}`),
    null,
    "plain chat uses the existing route",
  );
  assert.deepEqual(outside, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log("普通对话回归通过；浏览器无外部请求、服务端 5xx 或运行时异常。");
  console.log(
    `隔离验收截图：.taibu-local/${project}/agent-acceptance.png、agent-mobile-acceptance.png；任务数=${created.length}`,
  );
} catch (error) {
  console.error(
    JSON.stringify({
      pathname: page ? new URL(page.url()).pathname : null,
      outside,
      errors,
      failures,
    }),
  );
  await page
    ?.screenshot({
      path: path.join(directory, "agent-browser-failure.png"),
      fullPage: true,
    })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
