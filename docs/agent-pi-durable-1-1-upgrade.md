# Agent Pi Durable 1.1.0 依赖升级与引擎代际迁移

四个 `@earendil-works` 依赖（pi-ai、pi-durable、pi-mcp、chord）精确固定为 1.1.0。采用正式发布版的原生摘要模型入口、历史定点上下文、模型和工具时间投影及六档推理配置；本轮按用户要求删除 1.0.4／V1 执行兼容，只接受当前引擎。输入框模型菜单统一管理推理、上下文及 2–4 个可独立选模型的协作 Agent。既有十一体系命盘联动、后台租约、会员权限、一次扣费与成果保存继续复用。

## 上游核对与依赖升级

| 仓库 / 依赖 | 升级结果 |
| --- | --- |
| pi（参考检出） | `f1b2e77f5`（本地核对日期 2026-10-09，发布 tag v1.1.0 之后 11 个提交）；14 个包全部 1.1.0 |
| pi-desktop（参考检出） | `ed54ce977`（2026-10-09）；根版本 0.18.0-beta.2；已采用 Pi 1.1.0 |
| taibu 依赖 | pi-ai、pi-durable、pi-mcp、chord 由 1.0.4 升到 1.1.0（chord 为仅版本号发布，窗口内无源码变更） |

2026-10-10 再次核对 [Pi 最新正式发布](https://github.com/earendil-works/pi/releases/tag/v1.1.0)，仍为 1.1.0。上表未发布提交数量描述本轮参考检出 `f1b2e77f5`，不代表持续变化的远端 main。

1.1.0 破坏性变更与本地适配：

- durable `Storage` 查询新增 `order`/`ScanOrder`，游标必须按扫描顺序续传；`latestSubmission` 改用 `descending` 扫描，找到最新一条 input 即返回，不再分页全量历史。
- durable `TaskRuntime.context()` 改为 `{ at }` 选项对象；根会话读取不传选项，子分析和早报从原生回答收据的 `answer` 读取 `{ at: receipt.answer }`，避免重复实现历史上下文重建。
- pi-ai 流函数必须返回 `AssistantMessageEventStream`；本地流桥接已符合，无需改动。
- pi-ai 估算改为 3.5 字符/token；仅修正对应单测期望（8 字符 toolResult 估算为 3 token）。

## 第一轮引擎迁移（历史记录，已被当前引擎策略替代）

新增 `src/lib/agent/engine.ts` 作为唯一常量来源（`AGENT_ENGINE = "pi-durable/1.1.0"`），worker 心跳、原生 checkpoint 与 API 投影共同引用。迁移 `supabase/migrations/20261009_100000_agent_pi_durable_1_1.sql`：

- 心跳白名单加入 `pi-durable/1.1.0`，仍接受历史 `pi-durable/1.0.4`（升级窗口内旧 worker 照常心跳）。
- `agent_claim_run` 采用代际排序规则：worker 只能认领自己代际或更旧的 V2 run，绝不认领更新的 run。升级后的 worker 可接管在途 run，旧二进制无法接管它不理解的 run。
- checkpoint 类型放宽为 `"pi-durable/1.0.4" | "pi-durable/1.1.0"`；run 创建时写入代际，恢复时保留原标记。

selfhost 基线随迁移重新生成，并登记经审查的指纹增量升级（`c49d95371d32c4da037a0ab2c5ca82bf188be438787baada29a484c1f45fa658` → `223d3ed92db07a499114b15eb8be07f258a1e54effc47ee0a1bb812ec7403824`，共 6 条历史指纹路径），既有本地栈凭 sha256 校验后单事务应用，无需重建。

## 第二轮适配

### 统一受控模型入口与摘要

压缩 hook 使用 `HookApi.models.getModel()` 与 `completeSimple()`，模型目录仍由现有 `model-registry.server.ts` 注入。`UsageDoc` 管用量记录，`Models` 管模型解析和调用，二者不是替代关系。原目录已委托 `createPiSDKStream` 处理网关来源回退，采用 hook 模型入口不会丢失该能力。

摘要与主调用共用服务端重新授权、五分钟单次请求超时、中断、来源排序及三次外部尝试预算。摘要只接受完整非空文本，明确关闭推理和图片输入，保持 2000 输出 token 上限。原始历史、事实与成果引用作为待整理资料，工具结果不能改写摘要指令。摘要和实际 token 用量继续在同一个原生提交批次中落库；错误或截断保留未压缩历史。

Pi 内置供应商的重试和成本目录不会自动覆盖 Taibu 的自定义 AI SDK 传输。桥接显式采用原生 `isRetryableAssistantError` 判断可恢复错误，补齐 `server_busy` 和 `finish_reason: error` 在尚未输出时的重试；已输出内容不重新生成。`maxRetries: 0` 保持来源切换和瞬态重试共享三次尝试，避免 SDK 与宿主叠加重试。

### 历史上下文与恢复

`parallel_analysis` 和早报复用 `conversation.context(context, { at: receipt.answer })`，由 Pi 处理历史可见性和压缩记录。子分析必须以 `stop` 正常完成，截断结果不作为完整依据汇入父回答。早报的依据、工具与权限约束保持原有检查。

第二轮曾验证真实 1.0.4 检查点恢复；用户随后明确要求废弃该版本。本轮已移除旧夹具、V1 导入、工具修复及摘要 memo 回退，改为负向门控测试：旧版本、旧引擎、缺失引擎信息必须在打开存储或调用模型／工具前拒绝。当前 1.1.0 的原生崩溃接管、问题恢复与缓存重放继续保留。

### 时间投影与界面

原生 assistant `durationMs` 以及 generation/tool task 的 `startedAt`、`endedAt` 写入既有公开消息 JSON，经检查点、任务 API、SSE 和聊天历史投影复用。消息标题显示当前根会话已完成的模型响应总用时及次数；它不包含工具执行或等待用户回答。工具卡显示本次 `execute()` 实测用时，展开后另列包含等待与恢复的执行阶段。二者不混算。

历史记录没有测量字段时不补造数值；零毫秒显示“不足 1 毫秒”，未完成、被中断及非法时间不显示实测值。`HarnessOptions.now` 仅通过既有运行时依赖注入用于可复现测试，生产使用原生默认时钟。十一种命盘的原始快照、模型定位、历史焦点和计费不依赖这些时间字段。

### 六档推理配置与 SDK 请求

共享 `AIReasoningEffort`、管理员新建／编辑界面、POST／PATCH 校验与数据库约束统一支持 `minimal / low / medium / high / xhigh / max`。非法字符串、空字符串和错误类型在 RPC 前被拒绝，管理员权限门控保持原有路径。

安装的 OpenAI Chat Completions SDK 验证器只接受到 `xhigh`，并会丢弃部分兼容网关扩展字段。现有 `createModelFromConfig` fetch 适配器统一转发 `reasoning_effort`、`reasoning.effort`、供应商 thinking 参数及管理员自定义扩展；`max` 不传给会拒绝它的 SDK 选项校验器。底层仍调用原有 guarded fetch，保留 DNS／重定向、请求信号和超时边界。消息、工具、模型、流式模式、输出预算及 SDK 的 `maxCompletionTokens` 等别名禁止被自定义扩展覆盖。普通对话与 Agent 共用该入口。

真实安装的 SDK 通过受控 fetch 测试两种参数格式的全部六档 HTTP JSON 序列化，以及输出预算保护；它不宣称每个外部供应商都支持六档。

迁移 `20261009_120000_ai_reasoning_effort_levels.sql` 仅扩展现有 CHECK 约束，不更改表权限、模型数据或安全对象。schema 快照与自托管基线同步。基线 `223d3ed9…` 增量升级为 `29359295c5ffdf9c652bc33d766fbcb4a0456d712ed982fdc19b274a5d2ee8b6`，新迁移 SHA256 为 `b20e45bcea4a96d43476c3656a1220d2bfd104d860eb935835928bd92bd42673`；七条已审查历史路径按顺序追加迁移，未知指纹继续拒绝。已有固定栈不重建数据库或数据卷。

## 能力核对结果

| Pi 1.1.0 能力 | Taibu 采用方式或边界 |
| --- | --- |
| `HookApi.models` / `ToolExecutionApi.models` | 压缩 hook 改用原生 Models；计算工具继续复用 Core，已有子分析走原生受控 Harness，无需新增重复模型通道 |
| `{ at }` 历史上下文 | 子分析与早报按回答收据读取 |
| `ScanOrder` | 最新提交显式降序；适配器继承新版 MemoryStorage 的四类排序与方向游标契约，其余调用保持原生默认顺序 |
| task 时钟、tool/assistant 耗时 | 原生字段投影到 API／SSE／历史／界面；测试可注入时钟 |
| 上下文内存复用、首条 system 排序、3.5 字符/token | 使用发布版自动行为；不把消息排序等同于外部网关缓存命中 |
| server_busy／Mistral 异常结束重试 | 在实际 AI SDK 桥接中接入原生错误分类与宿主尝试预算 |
| Haiku 5.5 等目录、分档成本、Bedrock／Radius 专有传输 | 平台目录来自现有 DB，传输来自配置网关；六档推理已贯通，未自动上架模型或套用内置价格 |
| MCP OAuth signal 与 close 修复 | 静态 Bearer MCP 使用升级后的 transport；当前不调用 OAuth authorize/register/token/discovery |
| 分类器、图片分类、OAuth agentName | 当前没有对应分类或交互式 OAuth 流程 |
| Durable Objects SQLite、SSH、code mode、远程 CBOR server、TUI／coding-agent | 当前是 PostgreSQL／Node worker／Web API 产品，不引入另一套执行或存储体系 |
| evals／telemetry | 保留现有域评测与事件观测；传递安装 telemetry 不等同于配置采集端 |
| `settings.progress` | 保留现有 200ms 投影节流，与原生活动事件协作 |
| v1.1.0 后 11 个提交 | 参考检出用于审查；四个运行依赖仍锁定正式 1.1.0，未发布的 provider／coding-agent 变更不属于当前传输和运行面 |

## 第一轮验证记录（依赖与引擎代际）

| 验证 | 结果 |
| --- | --- |
| `pnpm verify -- --chrome` | 全部门通过：lint/架构、严格类型；1572 项单元/路由/协议；20 项包/许可证/skill；60 项隔离 PostgreSQL 契约；23 项真实 Auth/PostgREST；1 项真实 Redis；离线浏览器 142 项检查（276 次 fixture 请求，无外部请求与运行时异常）；worker 与 Next 生产构建 |
| 数据库契约 | 新增“worker 只认领自己或更旧代际、心跳白名单拒绝未知引擎”用例，全部通过 |
| selfhost 守卫 | 指纹检查与 6 条增量升级路径断言通过；基线 `--write` 后 check 通过 |
| 固定栈升级 | `pnpm local:update` 成功；指纹 `c49d9537…` → `223d3ed9…`；新 worker 心跳 `pi-durable/1.1.0`，历史心跳行保留 1.0.4 |
| 固定栈验收 | chart-only 全体系命盘联动通过（真实 worker/SSE、十一种原盘、桌面/手机追问、一次计费）；最新 run checkpoint 记录 `pi-durable/1.1.0`，升级前 run 保留 1.0.4；积分 7 → 6 |
| 截图 | `.taibu-local/taibu-agent-1006b/agent-chart-*.png` |

第一轮未推送 origin、未部署生产；四个升级提交已在本地 master。第二轮验证记录在下方单独登记，不把第一轮结果当作新增实现的验收。

## 第二轮验证记录（下方当前引擎策略调整前）

2026-10-10 完成第二轮验收：

| 验证 | 结果与范围 |
| --- | --- |
| `pnpm verify -- --chrome` | 13 个检查阶段全部通过：lint／架构、严格类型、1586 项单元／接口／协议、worker／Next 生产构建、20 项包／许可证／skill、61 项 PostgreSQL 契约、23 项真实 Auth/PostgREST、1 项真实 Redis、147 项组件浏览器检查 |
| 专项 | 新版运行时 82 项通过；真实 SDK 的六档／两格式请求序列化、摘要权限／回退／截断、旧 1.0.4 原生日志恢复、原有域功能与时间投影均覆盖 |
| 最后回归 | 接入原生分类器后补齐 `ECONNRESET` 代码／消息到原生网络错误提示的归一化；11 项实际桥接测试以及重新运行的 lint、严格类型全部通过 |
| 浏览器组件 | 276 次受控 API 请求；新建 `max`、编辑 `xhigh`、历史未知测量不补造数值、JSON 恢复模型耗时、工具实测／执行阶段分开显示均通过；无外部请求或运行时异常 |
| 固定栈迁移 | 更新前以 selfhost CLI 备份数据库、账号配置及文件存储；`223d3ed9…` → `29359295…`，原账号与卷保留；首次因 Docker API 暂停响应失败，恢复响应后沿相同项目流程重试成功，无全局容器引擎重启 |
| 固定栈应用 | Web／worker 同镜像 `sha256:e10f4e64d109f4a04b2e006888622ab2195891fe8d0143e8bf8c17b2396ca812`，两者健康；执行入口仍为 `http://127.0.0.1:3196` |
| 完整实际页面 | `agent-selfhost-browser.mjs --project taibu-agent-1006b --account <私有验收账号> --chrome` 完成 7 个 Agent 任务及普通对话；真实 worker 崩溃接管、编辑／重新生成、补充、停止退款、十一体系命盘／历史焦点、桌面／手机追问、模型时间刷新恢复与 320px 收边通过 |
| 实际页面边界 | 真实 Next／AI SDK／Pi／worker／数据库／SSE，模型为固定栈离线夹具；无外部请求、服务端 5xx 或页面运行时异常；语音使用测试替身 |
| 收尾审计 | 测试账号积分 70 → 63，符合六个完成 Agent 任务加一次普通对话，取消任务退款；无活动运行；schema 生成检查与 diff 检查通过 |

日志与截图保留在私有 `.taibu-local`，包括 `pi-110-verify.log`、`pi-110-selfhost-browser.log` 及固定栈 `agent-acceptance.png`／`agent-chart-*.png`。旧源代码、引用及本地栈完整备份位于 `.taibu-local/backups/pi-110-native-20261009`。

本会话没有可调用的 Supabase MCP；迁移仅在隔离契约库和固定本地栈验收，未执行线上迁移。下方记录本轮在第二轮基础上的最终调整与验证。

## 当前引擎与多模型协作

`20261010_100000_agent_current_engine_only.sql` 使心跳、创建及认领只接受 V2／`pi-durable/1.1.0`。活动旧任务通过现有 `agent_finish_run` 结算为失败（已经请求停止的任务结算为取消），撤销租约并递增 fence，消费待处理指令，清理任务凭据；无正文／成果的已扣费任务退款一次，有正文／成果的任务保留原扣费。已完成历史及成果保留供阅读，编辑／重新生成不载入旧原生日志。旧 worker 不能再次写入或认领；迁移重复执行不重复结算或退款。

自托管升级目标为 `6c272730dec136ce350d145c4f1d12b15fc5a30632b8996a1cf01de6a0971116`，迁移 SHA256 为 `6d78410e8a10b710bc9d03a28920b6a066ea3c035e29b96d89bd72bac216fa06`。既有经审查指纹路径按顺序追加该迁移，未知 schema 仍拒绝。基线 manifest 的 sourceFingerprint 是源文件校验，不能代替整个 selfhost schema bundle 的升级指纹。

模型菜单内选择主模型的推理档位与查看上下文；普通对话和 Agent 的会话配置均持久化。Agent 可启用 2–4 名成员，逐一设置名称、平台模型、六档推理和分工。请求创建时冻结配置并逐一校验会员权限；运行期间修改用于下一项独立任务，当前补充／续问沿用已冻结配置。普通对话不展示协作配置。

协作扩展现有 `parallel_analysis`：主模型安排每名成员，子会话绑定自己的原生模型、thinkingLevel 和受控 SDK stream，权限在每次调用及摘要时重新读取。`xhigh`／`max` 明确映射，避免 Pi 默认将其降为 `high`。子分析只使用相应体系的 Core／方法工具，正常完整结束后才汇入主模型；恢复复用稳定收据与工具缓存，父任务统一汇总和保存成果，整项任务扣一次积分。界面显示每名成员的实际模型、进度与可展开分析，累计用量按实际模型记录。

成员可选管理员目录中的模型和自定义网关。每名成员单独填写 BYOK 密钥不在本轮范围；切换自定义直连主模型时按单模型启动，平台协作配置保留供切回时使用，服务端拒绝直连主模型混用收费平台成员。网关与供应商是否支持全部六档仍由模型配置与外部服务决定。

模型目录返回安全的推理参数格式元数据；未配置分档格式的模型只显示推理启停。会话所选档位覆盖管理员默认值及冲突的自定义推理字段。关闭推理（包括压缩摘要）会清除推理档位并关闭已配置的 thinking 开关，避免自定义参数重新开启。协作失败保留失败过程，由主模型说明限制，结束钩子不强制无限重试。账号切换同步隔离成员名称、分工及档位，防止把前一账号的配置显示或保存到新账号。

## 当前引擎与协作的交付验证

2026-10-10：

| 验证 | 结果与范围 |
| --- | --- |
| `pnpm verify -- --chrome` | 13 个阶段通过：1595 项单元／路由／协议、20 项包／许可证／skill、62 项 PostgreSQL、23 项真实 Auth/PostgREST、1 项真实 Redis、157 项组件浏览器检查，以及 lint、严格类型和 worker／Next 生产构建 |
| 最后专项 | 新增协作失败结束、关闭推理与格式冲突测试后，相关运行时／SDK／模型目录接口专项通过；最后 lint 与严格类型通过 |
| 最后组件浏览器 | 158 项检查、307 次受控请求，无外部请求或运行时异常；新增切换直连时不携带平台成员且保留协作配置的回归 |
| 固定栈 | 备份后沿同一项目完成升级，schema bundle 为 `6c272730…`；Web／worker 同镜像 `sha256:f2deb9aa80af05c7fb691c3524ab789a0c2ea7e32b10bb66b5f61f24ef824e10`，健康且当前引擎为 1.1.0 |
| 实际页面 | 完整流程的 7 个 Agent 任务及普通对话通过；覆盖编辑／重生成、补充、停止退款、真实 worker 崩溃接管、十一体系命盘联动和历史焦点、桌面／手机追问；协作专项另完成 1 项任务 |
| 协作实际传输 | 两路真实 AI SDK 请求分别使用不同模型及 `max`／`xhigh`；一次计费、历史结果恢复、320px 模型与分析菜单通过。供应商为固定栈离线模型夹具 |
| 验收收尾 | 测试积分 63 → 54：完整流程与协作共扣 8 次，另一次初始页面断言中止前已完成的任务扣 1 次；取消任务已退款。无活动任务、无临时模型，schema 和 diff 检查通过 |

首次页面脚本有重复变量声明，修复后执行；输入历史检查补上 `/clear` 动画帧回调等待。重复验收时临时模型受目录缓存影响，夹具在无活动任务且核对项目归属后只重启本栈 Web／worker，再单独重跑协作；不重建数据库、不更换账号或数据卷。全部页面步骤无外部请求、服务端 5xx 或运行时异常。日志和截图保留在私有 `.taibu-local/pi-110-delivery-*` 及固定栈目录。

## MCP 与主分支最终整合

本地 `mcp` 的 `14c51d84` 原先未被主分支接收。本轮在 MCP 分支三方合并主分支的 Core 修复，保留时间／日界／校验、15 个工具的全部输入约束及输出机器字段，合入文案、示例和宫名统一。补齐天干位置改为“年干”等名称后的规范 JSON 坐标映射；紫微“仆役／交友”查询与回显统一为“交友”。所有公开工具示例均实际执行并校验输出，四柱反推示例找到真实候选；飞星省略或空四化列表仍检查全部四化。

MCP 专项 45 项核心测试、17 项 Agent 命盘联动及严格类型通过。离线 Skill bundle／15 份工具参考与 Agent 内嵌方法目录按现有脚本同步；首次全量检查发现旧内嵌目录漂移，修复后再次执行完整验证。

| 最终验证 | 结果 |
| --- | --- |
| 主分支 `pnpm verify -- --chrome` | 13 个阶段全部通过；1601 项单元／路由／协议、20 项包／许可证／Skill、62 项 PostgreSQL、23 项真实 Auth/PostgREST、1 项 Redis、158 项浏览器检查（308 次受控请求，无外部请求和运行时异常），lint、严格类型、worker 和 Next 生产构建通过 |
| 合并后的固定栈 | 同一项目与数据卷；Web／worker 同镜像 `sha256:b4e230e07e72d9cea1659fa23876f171d15e7b0fdb25080d3e40d780bf12513e`，schema bundle 仍为 `6c272730…`，引擎为 1.1.0 |
| 合并后的页面专项 | 十一体系命盘／定位／历史／桌面手机追问及协作分别完成一项任务；两路模型的实际请求与 `max`／`xhigh`、一次计费和历史恢复通过；模型为本地离线夹具 |
| 最后收尾 | 专项积分 54 → 52；没有活动任务或临时模型。弹层缩小窗口后的检查等待重排进入视口，保留 320px 原尺寸断言；中止的首次尺寸断言未创建任务或扣费。临时目录缓存清理仅重启归属已核对且无活动任务的 Web／worker |

功能提交保留在对应分支：Agent 实现 `4fbbe7fa`；MCP 合并修复 `f77649b1`、离线产物 `23074c26`、内嵌目录 `161c50c1`。本地 `core`、`refactor`、`mcp`、`taibu-agent` 的全部提交均由 master 接收。远端清理范围仅为已整合的 `feat/mcp`、`fix/issue-12-daily-byok`、`refactor/modular-acceptance-20261002`；daily 分支以补丁等价核对 squash 合入。统一推送 master 及当前 Agent／MCP 分支，并保留本地 Core／Refactor 分支。
