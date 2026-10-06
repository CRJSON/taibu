# 太卜 Agent

`/chat` 在 Agent 开关开启、worker 在线时默认进入 Agent，可在输入框上方切换普通对话。运行中的任务可以补充信息、调整方向、排队续问和停止。关闭页面不会停止任务；再次打开同一对话会恢复服务端状态并重连。

## 运行链路

```mermaid
flowchart LR
  UI[聊天界面] --> API[鉴权与任务 API]
  API --> DB[(Supabase 任务与消息)]
  DB --> Worker[Node worker: 租约与心跳]
  Worker --> Pi[Pi Durable Harness]
  Pi --> SDK[现有 AI SDK 模型与网关]
  Pi --> Tools[15 个计算工具 / 用户资料 / 知识库 / Tavily]
  Tools --> DB
  Worker --> DB
  DB --> SSE[游标事件补发与状态快照]
  SSE --> UI
```

执行内核固定为 `@earendil-works/pi-durable@1.0.4`，配套 Pi AI／Chord 同版本。使用原生 Harness、GenerationTask、ToolTask、CompactionTask、请求去重和队列；模型桥接继续经过 `pi-stream.server.ts` 的 AI SDK，复用模型配置、网关排序、来源切换、推理和采样配置。开始输出后不会重新切换来源。模型和摘要权限在服务端重新校验，SDK 错误不会打印上游凭据。Durable 目前是实验接口，版本固定，并用官方存储契约测试检查适配器。

没有任务步数、检索次数或总运行时长上限。结束条件是模型完成、`ask_user` 等待补充、用户停止或不可恢复错误。外部请求仍有单次超时。Durable 按现有模型窗口自动选择完整工具回合的压缩边界，摘要通过原有 AI SDK 和网关生成，保留最近消息、成果 ID 和实际来源。完整原始记录保留在 Durable 提交日志中；检查点仅保留业务状态、公开部分和供下一任务复用的最终模型上下文。

## 工具与成果

15 个计算工具直接复用 `taibu-core/mcp` 的定义、输入校验、引擎及规范 JSON／文本输出。工具结果按业务任务、Durable ToolTask ID 和模型调用 ID 暂存；随机种子从这个稳定标识产生。重启重放同一 ToolTask 会复用结果，模型在不同回合重用调用 ID 会生成不同工具任务。只有具备幂等缓存的业务工具声明安全重放。

`ask_user` 在原生 ToolTask 中提交问题 memo 后等待，外层任务进入 `awaiting_input` 并关闭当前 Harness。补充输入进入同一 Durable 队列，回复 memo 落库后恢复该 ToolTask；不创建新业务任务，也不再次扣费。正常进程退出和租约故障关闭 Harness，保留待恢复任务；用户停止则写入原生 abort 并等待工具结束。

个人命盘、历史、个性化档案和知识库使用已有服务。工具注入当前任务所属用户，并在每次执行及缓存重放前直接读取会员和功能开关；配置读取失败拒绝执行，不复用宽松缓存。模型回合、压缩摘要和最终记录保存也遵守这一规则。知识库 RPC 绑定当前租约的用户，查询结束后恢复管理员会话的 JWT 上下文。普通会员的联网、Plus/Pro 知识库和 Pro 向量权限保持现有规则。

Tavily 工具按需检索，返回标题、摘要和 URL；来源卡片仅使用实际返回的 HTTP(S) 来源。用户可关闭联网。附件提取复用现有 Dify 流程。网页、用户资料和工具返回都作为资料处理，不能改变工具权限。

Agent 在最终答复前通过 `select_final_artifacts` 选择成果，支持空选择。成功完成时一次事务保存最终分析和规范计算文本，并复用或新增标准八字／紫微命盘。非标准时区、紫微规则或原生 SQL 日期不能表达的农历日期保留在分析记录中，避免将不同计算口径混入原生命盘。中间尝试仅留在执行历史。已有资料的修改、删除仍通过原有界面进行。分析保存遵守“命理记录”功能开关。

## 持久化与结算

迁移 `20261005_100000_agent_runtime.sql` 提供六张业务运行表；`20261005_120000_agent_chart_identity.sql` 在排盘时间字段迁移后更新命盘身份与去重；`20261006_100000_agent_pi_durable.sql` 增加 `agent_durable_commits` 和 worker 引擎标识。安全对象显式设置 `search_path` 和执行权限。原生日志只由受租约保护的管理员 RPC 读取／提交，普通用户不能直接读取或写入。公开消息修改仍受活动任务保护。

任务状态：`queued → running → awaiting_input / completed / cancelled / failed`，停止过程使用 `cancelling`。租约每秒续期，失效窗口为 60 秒；新的 worker 接管时递增执行版本，旧版本不能写入。每个业务任务对应独立的 Durable Storage，只允许当前租约进程推进。RPC 原子保存原生写批次及业务检查点，连续序号和相同批次去重保证丢失响应可重试；指令在原生 submission 进入 placed 状态时才被确认消费。结果不明时暂停当前执行并由新持有者重读日志。

存储适配复用 Pi MemoryStorage 的提交校验、索引、文档历史和分叉语义，先提交 PostgreSQL 日志，再应用已确认批次。重启分页重放日志后由 Harness 接续原生任务。这与官方 JSONL 后端一样会把当前任务的索引和历史保存在进程内存中，日志随任务长度增长；上下文压缩不会删除原始记录。大规模部署应监测单任务内存及日志增长，后续可替换为通过相同契约的 SQL 查询后端。

V2 检查点由 Durable worker 执行；混合版本部署中 Core worker 只能领取 V1。旧检查点首次接管时补齐已提交工具结果并一次导入历史，后续恢复统一走原生机制。已转换的活动任务需要 Durable worker 完成，回滚应用前应先停用新任务入口并完成这些任务，保留新增表与列。

成功保存、业务任务状态、最终消息及完成事件仍由原有结算事务一起提交，保存成功而响应未到不会重复生成成果。SDK 必须提供有效结束事件；异常 EOF、超时或 abort 会进入失败／停止路径，保留已显示正文，不保存成功分析。worker 退出及租约故障仍保留原生待恢复任务。

创建使用用户和 `clientRequestId` 去重，相同 ID 携带不同内容返回 409。活动对话只允许一个任务。指令接受和任务结算使用同一行锁：在最终回合落库前收到的指令会继续执行，再保存最终成果。

`20261006_110000_agent_lifecycle_fixes.sql` 在每次编辑／重新生成前更新当前版本槽位的正文、Agent 信息及完整后续消息，支持切回旧分支后再编辑。复用现有 JSON 版本和积分账本，不新增表或字段，也不回填已丢失的旧分支。该迁移同时阻止删除存在活动任务的对话（直接 DELETE 和图删除 RPC 均受保护）；先停止任务，等待结算完成，再删除。它追加于 Pi Durable 迁移后，保留原有结算与退款函数。

托管模型在创建事务中扣 1 次积分，自定义模型不扣。补充、调整、排队续问和恢复共用任务。失败／停止时没有可见正文且没有保存成果则退款一次；有正文或成果则保留扣费。新请求在上一任务结束后创建新任务。

BYOK 沿用浏览器的自定义模型界面，启动时将密钥提交给服务端，使用 AES-256-GCM 保存任务副本，AAD 绑定用户和任务。密钥不写入消息、事件、检查点、日志或响应。等待补充时保留副本，完成、失败、停止时删除。自定义服务必须是公开 HTTPS 地址；socket DNS 解析拒绝私网、保留地址和混合解析结果，并拒绝重定向。平台网关使用管理员管理的配置。

## 启动与配置

Node 需要 `>=22.19`；Docker 使用现有 Node 24 镜像。

```bash
pnpm install
pnpm dev                 # Web
pnpm agent:worker        # 另一终端：构建 core/worker 并启动后台执行
```

生产构建 `pnpm build` 会生成 `.agent/worker.mjs`。在与 Web 使用相同运行环境的常驻进程中执行：

```bash
node .agent/worker.mjs
node .agent/worker.mjs --check   # 仅验证构建加载，不访问数据库
node .agent/worker.mjs --health  # 检查最近 30 秒内的 worker 心跳
```

构建会将 Core 的公开包与运行依赖一并放入 `.agent/node_modules`，保持计算引擎的模块边界。worker 的外部 Next 服务端入口由 Docker runner 携带，并在镜像构建时执行 `--check`。新增依赖的许可证随 `.agent/licenses` 打包，Pi 原始 MIT 许可证保存在 `licenses/pi.LICENSE`。模型请求和摘要的单次超时为 5 分钟，Agent 数据库 RPC 为 30 秒，BYOK 连接与检索另外使用各自的请求超时；它们不限制任务总时长。租约续期从启动开始，覆盖长日志重放阶段。

Web 和所有 worker 需要相同的 Supabase URL、anon key、系统管理员账号、模型密钥和任务加密密钥。新增变量见 `.env.example`：

| 变量 | 用途 |
| --- | --- |
| `TAVILY_API_KEY` | Tavily 搜索；为空时不提供联网工具 |
| `AGENT_CREDENTIAL_ENCRYPTION_KEY` | 32 字节标准 Base64；BYOK 后台任务必需 |
| `AGENT_WORKER_CONCURRENCY` | 每个 worker 并发，默认 2；不限制任务长度 |

使用 `openssl rand -base64 32` 生成任务密钥，在秘密管理中设置并备份。所有 worker 必须一致；轮换前先结束已有 BYOK 任务。功能开关沿用管理中心的 `feature_disabled:agent`。`GET /api/agent/status` 向登录用户返回功能、worker、联网及加密服务可用状态，未就绪时界面保留普通对话入口。

Docker runner 同时包含 Web 和 worker 构建，可使用同一镜像的两个服务：Web 默认命令为 `node server.js`，worker 命令为 `node .agent/worker.mjs`。`docker-compose.local.yml` 和 `selfhost up` 已增加 worker 与健康检查。新的隔离自托管项目会生成任务密钥，原有项目不会被自动迁移或重建；基线发生结构变化时继续拒绝旧数据库哈希。

线上迁移按仓库规范通过 Supabase MCP 执行。完整空库自托管基线包含该迁移；已有自托管数据库只应用增量迁移，不重放空库基线。

## API 与事件

| 请求 | 用途 |
| --- | --- |
| `POST /api/agent/runs` | 创建任务；拥有的 `conversationId`、`clientRequestId`、用户消息及模型配置 |
| `GET /api/agent/runs?conversationId=…` | 读取对话的最近任务 |
| `GET /api/agent/runs/:id` | 读取拥有的任务快照 |
| `GET /api/agent/runs/:id/events?after=…` | SSE，补发游标后的事件再发送一致的完整快照 |
| `POST /api/agent/runs/:id/messages` | `reply / steer / follow_up`，指令也使用 `clientRequestId` 去重 |
| `POST /api/agent/runs/:id/cancel` | 请求停止；等待 worker 安全结算 |

公开快照包含任务状态、`cursor` 和版本 1 的聊天消息。消息包含有序正文、推理、工具、问题、来源、成果部分，并生成普通消息可读的 `content`。SSE `history` 事件重放持久化事件，`snapshot` 提供当前完整公开状态；连接中断、刷新或浏览器关闭均不会取消任务。

快照还包含创建请求标识与公开用户消息。浏览器对丢失响应及服务端故障使用相同创建请求重试，在结果不明时保留请求标识并查找已接受的任务。补充／排队指令的自动及手动重试也保留原内容、模式和请求 ID，即使等待态已恢复。等待补充期间 SSE 继续订阅，其他标签页恢复或停止任务会更新当前界面。所有异步回包绑定用户登录周期和对话选择周期；发送成功仅清理提交后未更改的草稿，保护新的输入、引用和附件。旧任务的迟到快照不能替换新任务；恢复状态、同步历史版本期间锁住输入和历史操作。最终分析记录只保存最后的答复及选定计算文本，过程正文仍保留在聊天和运行记录中；新的计算或追加指令会重新要求确认最终成果。

Pi 原生语义与宿主边界：`submit(requestId)` 是持久化收据去重，宿主必须重用原 ID 和完整内容；`placed` 表示输入已被采用，`done` 才表示已回答。`Harness.close()` 保留可恢复工作，`Conversation.abort()` 持久化停止请求。`ask_user` 在同一 ToolTask 内使用问题／回复 memo。模型流的 `end()` 只关闭事件流，成功由正常 `done` 事件与 stop reason 决定。观察器停止后还须等待已开始的投影回调，再提交最终状态。聊天版本由现有消息 JSON 管理，每个业务任务拥有独立原生日志，不用原生 fork 代替聊天版本。

## 本次变更范围与验证

分支 `codex/agent-chat` 从 `5725dde` 创建，保留原有工作区改动。Agent 新增范围是 `src/lib/agent`、`src/app/api/agent`、Agent 消息组件、迁移及专项测试；集成改动集中在聊天 hooks／界面、AI SDK 适配、知识库持久化注入、功能开关、消息类型、成果入口、worker 构建／部署配置和 schema 文档。已有 core 算法、自托管及其它未提交改动保持独立。

| Agent 变更组 | 文件范围与集成点 |
| --- | --- |
| 执行与安全 | `src/lib/agent/*`：Pi 适配、工具、检查点、租约、凭据、目标地址校验、浏览器重连 |
| 接口 | `src/app/api/agent/*`：状态、创建、读取、事件、指令与停止 |
| 聊天 | `AgentMessage.tsx`、聊天 layout／composer／message／hooks、`src/types/index.ts`：模式切换、有序部分、任务恢复、历史版本 |
| 现有服务 | AI SDK provider 导出复用入口、知识库 search 注入持久化权限、`app-settings.ts` 功能开关、records 页面成果入口 |
| 数据库 | Agent 运行、命盘身份、Durable 和生命周期四份迁移、schema 快照、自托管空库生成器与数据库合同测试 |
| 运行与部署 | `scripts/agent-worker.mjs`、`scripts/build-agent-worker.mjs`、Dockerfile／Compose、selfhost worker 就绪检查、Pi 许可证 |
| 验证与说明 | `src/tests/agent-*.test.ts`、`scripts/tests/agent-*.mjs`、环境变量、架构及部署文档 |

表中已有文件仅记录 Agent 集成部分，不将整份文件的既有修改归入 Agent。开始前保存了 HEAD、工作区／暂存区 diff 与状态快照，位置为本机临时目录 `taibu-agent-baseline-fk9fpljn`。

验收期间对既有紫微改动中的一处未闭合函数调用补齐了右括号，仅作为语法修复；没有重写其算法。Docker 原有 `taibu-local` 服务和数据未修改。每次隔离建库使用新的项目名与端口；对已有验收栈更新应用代码前，核对初始化 SQL 正文、限流增量和 Storage SQL 完全一致，不重放基线或修改数据库版本标识。

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm test:db
pnpm test:auth
node scripts/tests/agent-selfhost-browser.mjs --project <独立演示项目> --chrome
```

专项检查覆盖超过常见循环阈值、摘要、缺信息暂停后继续、缓存结果恢复、截断参数、接口权限、AES-GCM、DNS/重定向、SSE 重连、扣费／退款、租约接管、晚到指令、保存和事件的原子性及命盘复用。浏览器验收使用独立的自托管数据库和确定性离线模型，真实经过 Next API、AI SDK、Pi、worker 和保存流程；这不代表真实模型的推理质量或 Tavily 外网可用性。真实联网和线上 Supabase MCP 迁移需另行配置验收环境。

### 2026-10-05 Core 基线本地隔离验收结果

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 1400 / 1400 通过，0 跳过 |
| `pnpm test:db` | 41 / 41 通过，0 跳过 |
| `pnpm test:auth` | 21 / 21 通过，0 跳过 |
| `pnpm lint`、`pnpm typecheck`、`pnpm build` | 全部退出码 0 |
| `node .agent/worker.mjs --check` | worker 构建及运行依赖加载通过；Docker 镜像构建也执行同一检查 |
| 生产浏览器端到端 | 6 个真实任务通过，0 外部请求、0 服务端 5xx、0 页面运行时异常 |

运行单测实际执行了 37 轮模型调用和 35 次八字计算，验证任务不会被常见默认循环阈值截断。浏览器使用项目 `taibu-agent-verified-1005` 与独立数据库，覆盖跨命盘、最终保存与成果入口、重复提交、编辑与重新生成、补充后续跑、刷新恢复、移动端、停止退款及普通对话。通过强制终止 worker 再启动验证 60 秒租约过期后的接管，已提交计算未重复执行，分析未重复保存，积分仅扣一次。

截图保留在该项目私有目录中的 `agent-acceptance.png` 与 `agent-mobile-acceptance.png`。临时开发服务器及三个本次验收项目均已停止，隔离卷保留；Agent 验收镜像保留为 `taibu-web:agent-verified-1005`。原有 `taibu-local` 容器持续运行且健康，`taibu-web:local` 已恢复到其原始镜像，避免影响后续重启。

既有问题：原始镜像 `8cd4056e484f` 的匿名 `/chat` → `/records` 导航也间歇出现 React hydration #418。该告警可由原有版本独立复现；最后一轮 Agent 完整浏览器验收没有出现。后续页面渲染维护应单独跟踪这一问题。

真实 Tavily 联网、真实模型推理质量及线上 Supabase MCP 迁移尚未执行，按本次要求保留为外部环境验收项。当前交付是工作区实现与本地验证，没有提交或部署。

### 2026-10-06 Pi Durable 切换验收

直接依赖已替换为 Pi Durable／Pi AI／Chord 1.0.4，移除 Pi Agent Core。Web 的历史转换与 worker 执行模块分开，任务消息格式仍为 V1，原生检查点为 V2；新增迁移和空库基线保持原子积分／保存事务。

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 1459 / 1459 通过，0 跳过 |
| 原生执行专项 | 20 / 20 通过：37 轮模型、35 次计算、分次补充、旧任务迁移、恢复与请求超时 |
| 存储适配 | 官方 23 项存储契约，加分页重开和丢失收据检查，共 25 / 25 通过 |
| `pnpm test:db` | 43 / 43 通过：提交／检查点原子性、消费确认、混合 worker 与租约隔离 |
| `pnpm test:auth` | 21 / 21 通过；使用真实 GoTrue／PostgREST |
| `pnpm lint`、`pnpm typecheck` | 退出码 0 |
| Docker 中的 `pnpm build` | 生产 Web／worker 构建通过；主机与 Linux 镜像中的 worker `--check` 均通过 |
| 浏览器复跑 | 6 个任务及普通对话通过，外部请求、5xx、页面运行时异常均为 0 |

浏览器通过真实终止 worker 验证 60 秒租约接管、缓存计算不重做、一次扣费及一次保存。第一轮仍捕获既有 React hydration #418，第二轮完整严格验收为 0 异常；保留这一既有问题的独立追踪。截图位于私有项目 `taibu-durable-1006` 的验收目录。

最终镜像再次通过完整严格浏览器验收，保留为 `taibu-web:agent-durable-1006`（`sha256:68b467e860901f0943b2ac7f780b4eecfca579ccebd00ef34b794058100a7b9e`），已核对包含旧问题迁移、启动阶段续租与 RPC 超时。隔离栈停止，卷与截图保留；原有 `taibu-local` 服务不变，共用 `taibu-web:local` 恢复到原始镜像。

主工作区 `.next` 被另一构建进程持有，使用独立 Docker 构建运行 `pnpm build` 并验证生产运行依赖，不删除或抢占对方构建锁。切换前另存了 `taibu-pi-durable-baseline-cn8qo3gv` 备份，保留原有未提交修改。真实外部验收和线上 MCP 迁移继续按用户要求延后。

### 2026-10-06 独立审查问题修复验收

修复限流返回值、SDK abort／异常 EOF 结算、重复编辑的分支尾部保存、跨对话异步回包、等待输入订阅、命令重试收据、活动对话删除结算保护、草稿竞态与 fresh 权限检查。真实浏览器另复现并修复空对话缓存卡在 loading 的问题。全部在 `codex/agent-chat` 的隔离工作树完成，未提交、部署或执行线上迁移。

| 检查 | 当前结果 |
| --- | --- |
| `pnpm test` | 1471 / 1471，0 跳过 |
| `pnpm test:db` | 46 / 46，含连续编辑／旧分支再编辑，以及四种活动状态下删除保护和一次退款 |
| `pnpm test:auth` | 21 / 21，真实 GoTrue/PostgREST，临时资源已清理 |
| 离线浏览器 hooks 验收 | 95 项；含 A→B→A、等待输入跨标签页恢复／取消、丢失响应重试、草稿与同账号重新登录竞态；0 运行时异常 |
| lint、严格类型、Web／worker 构建、worker `--check` | 均通过 |

本轮浏览器为实际 React hooks 和受控 HTTP／SSE 边界，未复跑此前 Docker 生产浏览器端到端套件；外部模型、Tavily 和线上 Supabase 边界继续保留。增量迁移只在一次性数据库中验证，已有部署须应用 `20261006_110000_agent_lifecycle_fixes.sql` 才具备新的分支／删除保护。
