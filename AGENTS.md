# AGENTS.md

Claude will review your code from three dimensions: maintainability, boundary conditions, and regression risk, and the quality of your code will determine whether the system can go live. Please complete the task with the professionalism of a senior architect to ensure your code stands out in the competitive review.

## 强制规范（MUST）

编写任何代码时，都需要先查找是否存在相关已经实现的组件，流程，接口，不可引起重复实现代码

## 常用命令

```bash
pnpm install
pnpm build          # 构建所有 packages + Next.js
pnpm lint
pnpm test           # 自动先构建 packages/core、mcp、mcp-server，再跑全量测试
```

> **注意**：`pnpm test` 会先执行 `pnpm -C packages/core build && pnpm -C packages/mcp build && pnpm -C packages/mcp-server build`，修改 `packages/*` 源码后无需手动 build 即可直接跑测试。

## 项目最小地图

- `packages/core`（`taibu-core`）: 占术计算引擎，以及 **`text.ts` 规范文本渲染层以及`json.ts` 规范json输出格式**。
- `packages/mcp`: MCP 协议层。
- `packages/mcp-server`: MCP 服务端。
- `supabase/tabel_export_from_supabase.sql`: 当前数据库 schema 导出快照。

## 数据库与迁移规范

- 使用 mcp supabase 进行更新执行 migration
- migration 中涉及安全对象（函数、视图、触发器）时，显式声明 `search_path` 与权限边界。
- 如结构变化影响开发理解，需同步更新相关文档与 schema 快照。

## 测试与验收

### 变更最低要求

- 纯文案/样式微调：至少本地手动验证相关页面。
- 业务逻辑变更（`src/lib/*`）：新增或更新对应单测。
- API 行为变更（`src/app/api/*`）：补充路由相关测试（成功、失败、权限边界至少覆盖两类）。
- 涉及鉴权/积分/会员/限流/计费：必须补充回归测试。

## 提交与变更说明

- PR 描述建议包含：
  - 改了什么（行为变化）
  - 为什么改（问题或目标）
  - 如何验证（命令 + 结果）
  - 风险与回滚点（如有）
- Commit message 使用 Conventional Commits：`feat: / fix: / refactor: / chore: / docs:`。
- npm 发布优先使用 npm access token，不要依赖 OTP 交互流程。
- 版本号遵循 `x.y.z`：
  `x`：重大架构变更
  `y`：功能新增
  `z`：bug 修复

## 环境变量

- 以 `.env.example` 为准维护变量清单。
- 新增环境变量必须同步更新 `.env.example` 与使用文档。
- 严禁提交真实密钥（包括测试密钥）到仓库。

## 交付检查清单

- [ ] 变更范围清晰，未引入无关重构。
- [ ] 复用现有模块，避免重复实现。
- [ ] 鉴权、权限、积分、限流链路完整。
- [ ] 错误路径可观测（错误码/错误信息一致）。
- [ ] 测试、lint 与 build 已通过，或已明确说明未执行原因。
- [ ] 文档已同步（如涉及接口、配置、迁移、行为变化）。
