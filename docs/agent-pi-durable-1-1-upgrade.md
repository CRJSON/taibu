# Agent Pi Durable 1.1.0 依赖升级与引擎代际迁移

本轮把 taibu-agent 的四个 `@earendil-works` 依赖（pi-ai、pi-durable、pi-mcp、chord）从 1.0.4 精确升级到 1.1.0，并主动迁移自身实现里内嵌的引擎代际标记：新 worker 与新 run 记录 `pi-durable/1.1.0`，升级前写下的 checkpoint 保留 `pi-durable/1.0.4`，在途 run 仍可被升级后的 worker 恢复。同时采纳 1.1.0 的两个新能力：工具实测耗时展示与提交逆序扫描。参考检出 pi 与 pi-desktop 已更新至最新版本并完成核对。

## 上游核对与依赖升级

| 仓库 / 依赖 | 升级结果 |
| --- | --- |
| pi（参考检出） | `f1b2e77f5`（2026-10-09，发布 tag v1.1.0 之后 11 个提交）；14 个包全部 1.1.0 |
| pi-desktop（参考检出） | `ed54ce977`（2026-10-09）；根版本 0.18.0-beta.2；已采用 Pi 1.1.0 |
| taibu 依赖 | pi-ai、pi-durable、pi-mcp、chord 由 1.0.4 升到 1.1.0（chord 为仅版本号发布，窗口内无源码变更） |

1.1.0 破坏性变更与本地适配：

- durable `Storage` 查询新增 `order`/`ScanOrder`，游标必须按扫描顺序续传；`latestSubmission` 改用 `descending` 扫描，找到最新一条 input 即返回，不再分页全量历史。
- durable `TaskRuntime.context()` 改为 `{ at }` 选项对象；本地两处 `root.context(context)` 调用均不传选项，不受影响。
- pi-ai 流函数必须返回 `AssistantMessageEventStream`；本地流桥接已符合，无需改动。
- pi-ai 估算改为 3.5 字符/token；仅修正对应单测期望（8 字符 toolResult 估算为 3 token）。

## 引擎代际迁移

新增 `src/lib/agent/engine.ts` 作为唯一常量来源（`AGENT_ENGINE = "pi-durable/1.1.0"`），worker 心跳、原生 checkpoint 与 API 投影共同引用。迁移 `supabase/migrations/20261009_100000_agent_pi_durable_1_1.sql`：

- 心跳白名单加入 `pi-durable/1.1.0`，仍接受历史 `pi-durable/1.0.4`（升级窗口内旧 worker 照常心跳）。
- `agent_claim_run` 采用代际排序规则：worker 只能认领自己代际或更旧的 V2 run，绝不认领更新的 run。升级后的 worker 可接管在途 run，旧二进制无法接管它不理解的 run。
- checkpoint 类型放宽为 `"pi-durable/1.0.4" | "pi-durable/1.1.0"`；run 创建时写入代际，恢复时保留原标记。

selfhost 基线随迁移重新生成，并登记经审查的指纹增量升级（`c49d95371d32c4da037a0ab2c5ca82bf188be438787baada29a484c1f45fa658` → `223d3ed92db07a499114b15eb8be07f258a1e54effc47ee0a1bb812ec7403824`，共 6 条历史指纹路径），既有本地栈凭 sha256 校验后单事务应用，无需重建。

## 采纳与暂缓

已显式采纳：

- 工具卡展示 durable 实测耗时 `durationMs`（毫秒 / 十分之一秒 / 整秒三档格式；未完成步骤不显示数值）。
- 最新用户输入用提交逆序扫描定位（如上）。

自动获得（无需代码改动）：会话级内存上下文复用（`contextRetentionMs` 默认 10 分钟）、首条 system 消息前移以保住 Anthropic prompt cache、server_busy / Mistral 重试、成本目录按 prompt 长度分档。

暂缓（评估后不引入）：`ToolExecutionApi.models` / `HookApi.models`（本地已有 `UsageDoc` 用量聚合）、`Conversation.context(context, { at })`、Durable Objects SQLite 后端、`settings.progress`（本地已按 200ms 节流）。

## 验证记录

| 验证 | 结果 |
| --- | --- |
| `pnpm verify -- --chrome` | 全部门通过：lint/架构、严格类型；1572 项单元/路由/协议；20 项包/许可证/skill；60 项隔离 PostgreSQL 契约；23 项真实 Auth/PostgREST；1 项真实 Redis；离线浏览器 142 项检查（276 次 fixture 请求，无外部请求与运行时异常）；worker 与 Next 生产构建 |
| 数据库契约 | 新增“worker 只认领自己或更旧代际、心跳白名单拒绝未知引擎”用例，全部通过 |
| selfhost 守卫 | 指纹检查与 6 条增量升级路径断言通过；基线 `--write` 后 check 通过 |
| 固定栈升级 | `pnpm local:update` 成功；指纹 `c49d9537…` → `223d3ed9…`；新 worker 心跳 `pi-durable/1.1.0`，历史心跳行保留 1.0.4 |
| 固定栈验收 | chart-only 全体系命盘联动通过（真实 worker/SSE、十一种原盘、桌面/手机追问、一次计费）；最新 run checkpoint 记录 `pi-durable/1.1.0`，升级前 run 保留 1.0.4；积分 7 → 6 |
| 截图 | `.taibu-local/taibu-agent-1006b/agent-chart-*.png` |

升级窗口内的上下文复用与重试行为由上游测试覆盖，本地只验证集成路径；未做长时间在途 run 的跨代恢复压测。本轮未推送 origin、未部署生产；变更位于 taibu-agent 分支并快进合并到本地 master。
