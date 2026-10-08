# 界面、设置与 Agent 命盘展示

## 视觉规范

参考 [Claude 风格资料](https://github.com/catyiqian/claude-design-style/blob/main/SKILL.md)、[Claude 官网](https://claude.com/product/overview) 和 [assistant-ui 工具视图](https://www.assistant-ui.com/docs/tools)。没有引入第二套聊天 SDK。

`src/app/globals.css` 统一背景、表面、文字、边框、强调色及反馈状态。浅色使用暖米白、炭灰文字和陶土色；深色使用暖灰背景及较亮的陶土强调色。按钮前景使用独立 `on-accent` 变量保证两种主题的对比度。中文标题优先使用系统宋体，正文和控件沿用系统无衬线字体，不依赖外部字体下载。

排盘的五行、星曜及吉凶语义配色保留。表单焦点、键盘跳过导航、系统主题、全局字号和减少动画偏好共用现有设置。

## 设置地址

`/settings` 默认转到 `/settings/general`。页面顶部可返回应用，桌面左侧导航与右侧内容并列；手机通过「分类」进入列表，选择后进入详情。

| 分类 | 地址 |
| --- | --- |
| 常规 | `/settings/general` |
| 账户 | `/settings/profile` |
| 订阅 | `/settings/upgrade` |
| 个性化 | `/settings/personalization` |
| 自定义模型 BYOK | `/settings/byok` |
| 命盘 | `/settings/charts` |
| 知识库 | `/settings/knowledge-base` |
| MCP | `/settings/mcp-service` |
| 帮助 | `/settings/help` |
| 公告管理 | `/settings/admin-announcements` |
| 功能管理 / 激活码 | `/settings/admin-features/toggles` / `/settings/admin-features/keys` |
| 模型管理 / 网关 | `/settings/admin-ai-services/models` / `/settings/admin-ai-services/gateways` |

旧 `#settings/<分类>/<子分类>` 链接由全局兼容桥转换成页面地址，保留链接自己的查询参数。未知分类或不支持的子地址返回 404。未启用的功能按原有开关限制；管理员面板继续使用现有管理员检查和服务端权限。

分类与管理员子分类切换保留已访问面板的组件实例，因此未保存的输入不会因切换丢失。账号切换按用户重新挂载面板，隔离前一账号的数据和草稿。手动保存表单共用离开保护，多份草稿只弹出一次确认；全局历史监听先询问草稿保护，再通知路由订阅者，取消返回或前进会恢复原来的历史位置。刷新和关闭标签页使用浏览器离开保护。草稿只在设置工作区存活，离开确认后放弃，未存入服务器或长期本地缓存。

## 工具结果视图

`src/lib/agent/tool-presentation.ts` 根据工具名和完成状态读取实际结构化结果。结果可为现有 `{ artifactId, result }` 封装或旧的规范 JSON；不调用计算器、随机起卦、保存接口、模型或积分接口。

| 工具 | 共享视图 |
| --- | --- |
| 八字 | 四柱专业表 |
| 紫微 | 十二宫命盘 |
| 奇门 | 九宫盘 |
| 六爻 | 本卦、变卦与六爻详情 |
| 梅花 | 本卦、互卦、变卦及动爻 |
| 大六壬 | 三传、四课与天地盘 |
| 小六壬 | 推演链与落宫 |
| 塔罗 | 返回的牌阵、牌面与正逆位 |

MCP 默认详情中的紫微宫位位置和六爻嵌套本爻使用纯展示映射；返回数据中省略的旺衰、关系等字段保持为空。塔罗查找已有牌面资产，梅花及六爻查找已有卦象图案，均不产生新的计算结果。

完成命盘显示摘要和不可交互的预览，展开后使用共享组件完整展示。固定操作定位到原工具结果，工作区标签按账号和会话隔离并恢复；自动出现时不打开工作区、不抢焦点或触发滚动。数据不完整和组件异常降级到规范文本，原始调用详情仍可展开。失败、等待、执行与中断沿用任务状态展示。普通 AI 回复继续使用原来的 Markdown 与图表渲染。

工具卡片与最终回复的保存成果按 `artifactId` 去重，工作区只计一份命盘。旧版保存成果标签通过对应工具结果恢复，不再重新计算八字或紫微；若历史记录没有原始工具结果，则保留原命盘页面入口并说明数据缺失。查询与知识库显示条目列表，联网来源只允许安全的 HTTP/HTTPS 链接。

## 本地验收

固定栈为 `taibu-agent-1006b`，地址 `http://127.0.0.1:3196`。使用 `pnpm local:update` 更新 Web 与 worker，保留现有账号、数据库和持久卷。本次 UI 不增加数据库迁移或新环境变量。

执行 `pnpm test`、`pnpm lint`、`pnpm build`。浏览器组件回归使用 `node scripts/tests/p5-browser-fixture.mjs --chrome`（复用已安装 Chrome），覆盖真实 React 组件及八种真实 MCP 计算输出，身份和 HTTP 边界为受控夹具；它不代替 Next、鉴权或生产样式验收。生产页面另在 3196 固定栈进行浅深主题、桌面与 320px 手机、独立设置路由和 Agent 操作验收。

### 2026-10-08 验收结果

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 1524 / 1524，无跳过；含取消历史导航的事件顺序、八种工具输出、成果去重与历史恢复 |
| `pnpm lint` | ESLint 与架构检查通过 |
| `pnpm build` | Core、worker 与 Next 生产构建通过，类型检查和 122 个页面生成完成 |
| `node scripts/tests/p5-browser-fixture.mjs --chrome` | 113 项通过；八种占术的默认／完整真实 MCP 输出、文本降级、命盘展示无新增 API 请求 |
| `node scripts/tests/agent-selfhost-browser.mjs --project taibu-agent-1006b --chrome` | 6 个 Agent 任务与普通对话通过；真实登录、设置路由与草稿保护、命盘恢复、一次扣费／退款、真实 worker 崩溃接管、成果幂等保存；外部请求、5xx、运行时异常均为 0 |
| 生产页面视觉与偏好 | 浅色、深色、实时系统主题变化、减少动画、1440px 桌面、768px 平板、320px 手机与 125% 字号通过；手机命盘／工作区全屏 |
| `pnpm local:update` / `pnpm local:status` | 更新固定栈；11 个服务运行，已有数据库和数据卷保留 |

生产浏览器任务使用确定性离线模型，并真实经过 Next API、worker、八字工具与保存／积分链路。八种占术的结果视图由真实 MCP 计算输出的组件浏览器夹具验证；外部模型的推理质量和真实联网调用未验证。账号切换、功能关闭与保存失败由受控组件回归覆盖，管理员子地址另在实际管理员会话中检查。

生产浏览器验收截图保留在私有 `.taibu-local/taibu-agent-1006b` 目录。实施已在现有 `master` 工作树完成，所需平台、Core 与 Agent 基础分别整合；本轮没有推送或线上部署。
