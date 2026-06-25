# AgentBoard

Agent-native structured canvas。人和 Agent 共享同一份 DSL 白板状态，人看到卡片和连线，Agent 读写结构化 JSON。

## 启动

```bash
npm install
npm run dev       # 开发 → http://localhost:5173
npm run build     # 生产构建
npm run typecheck # 类型检查
npm run test      # 单元测试
```

## 技术栈

- **前端**: React 18 + TypeScript + Vite 6
- **测试**: Vitest
- **无后端**: 纯浏览器应用，localStorage 持久化
- **Agent CLI 桥接**: Vite 插件 (`agentBridgePlugin.ts`) 在 dev server 中暴露 `/api/clis` 和 `/api/agent/run`，调用本地 `claude` / `opencode` CLI

## 目录结构

```
src/
  types/dsl.ts           # 核心类型：BoardDSL, BoardNode, BoardEdge, DSLPatch, AgentConfig, BoardSession
  engine/
    patch.ts             # Patch 引擎——对 BoardDSL 应用增删改+layout
    validation.ts        # 校验引擎——检查 schema、引用完整性
  agent/
    types.ts             # AgentAdapter 接口定义
    prompts.ts           # System prompt（含 DSL schema）+ user message 构建
    claudeAgent.ts       # Anthropic Messages API 适配器（fetch 直连）
    openaiAgent.ts       # OpenAI / 兼容 API 适配器（支持自定义 baseUrl）
    localCliAgent.ts     # 本地 CLI 适配器（调 /api/agent/run）
    __tests__/           # Agent 层测试
  hooks/
    useBoardSessions.ts  # 多白板 session CRUD + 当前 session 管理
    useBoardState.ts     # 单白板校验
    useAgent.ts          # Agent 调用入口（根据 config 选适配器）
    useAgentConfig.ts    # Agent 配置持久化（localStorage）
    useDrag.ts           # 节点拖拽
    useCanvasPan.ts      # 画布平移（Space+拖拽 / 中键拖拽，CSS transform）
    useEdgeCreation.ts   # 连线创建（从节点连接点拖到另一节点）
  components/
    BoardCanvas.tsx      # 画布主组件：SVG 线条层 + HTML 节点层 + 分组
    BoardNode.tsx        # 单个节点卡片（编辑、选中、连接点）
    PromptBar.tsx        # 底部输入栏 + 发送 + 进度指示器
    ActivityPanel.tsx    # 右侧活动面板（Agent 操作历史）
    AgentConfig.tsx      # Agent 设置弹窗（选择 Provider、填 Key、选 CLI）
    InspectorPanel.tsx   # DSL 内部调试面板组件；不要接入普通用户默认界面
  data/
    initialBoard.ts      # 初始演示数据 + emptyBoard 空模板
  storage.ts             # localStorage 读写：sessions + agent config
appBridgePlugin.ts       # Vite 插件：本地 CLI 检测 + 代理执行
```

## 核心架构

### DSL 模型

- `BoardDSL` = `{ board, nodes[], edges[], groups[], metadata }`
- 节点类型：`card`（概念卡片）、`note`（便签）
- 连线：箭头或直线，从节点边缘出发（非穿透节点中心）
- Agent 通过 `DSLPatch` 增量修改：`add_node | update_node | delete_node | add_edge | delete_edge | layout`

### Agent 接入

接口 `AgentAdapter` → `generatePatch(request) → DSLPatch`

三种实现：

| Provider | 适配器 | 连接方式 |
|----------|--------|----------|
| `local-cli` | `LocalCliAdapter` | Vite 插件 → 本地 CLI stdin |
| `claude` | `ClaudeAgentAdapter` | `fetch()` → `api.anthropic.com` |
| `openai` | `OpenAIAgentAdapter` | `fetch()` → 自定义 baseUrl |

配置存 localStorage key `agentboard.config`，默认 `{ provider: 'local-cli' }`。

### 多白板 Session

- 存储 key: `agentboard.sessions` → `{ sessions: BoardSession[], activeId }`
- 新建白板：空模板（0 个节点），自动编号 "白板 1"、"白板 2"…
- 旧数据自动迁移：`agentboard.phase1.board` → session

### 画布交互

- **创建节点**：双击画布空白处
- **移动节点**：拖拽
- **编辑文字**：双击节点标题/正文
- **删除节点**：选中后按 Delete
- **创建连线**：选中节点→从上/右/下/左任一连接点拖到目标节点
- **连线编辑体验约束**：选中节点必须显示上、右、下、左四个连接点；从任一连接点拖拽到另一个节点即可创建连线。连线本身必须可选中，并支持 Delete / Backspace 删除。
- **平移画布**：Space+左键拖拽 或 鼠标中键拖拽（CSS `transform: translate`，GPU 加速）
- **卡片**：白底、自适应高度、`white-space: pre-wrap` 支持换行
- **线条**：从节点边缘出发（`edgePoint()` 计算矩形边框交点），z-index 低于节点永不遮挡

### 关键设计决策

1. **无后端**——纯浏览器应用，Agent CLI 桥接通过 Vite 插件在 dev server 中实现中间件
2. **HTML + SVG 渲染**——节点用绝对定位 div，连线用 SVG `<line>`，不做 Canvas 渲染
3. **GPU 平移**——用 `transform: translate()` 而非 `scrollLeft/Top`，Figma 风格
4. **无 Mock Agent**——Phase 1 的 mock 已删除，默认用本地 CLI
5. **顶栏精简**——只展示用户关心的：白板选择器、活动记录、Agent 设置。不要在默认顶栏暴露 `DSL`、`复制`、`导出`、`导入` 这类 JSON/调试入口；这些会干扰普通用户心智。
6. **Patch 原子性**——所有 DSL 修改通过 `applyPatch()` 校验，失败则整体回滚

## 技术选型原则

AgentBoard 是「用户可见型 Agent 产品」，不是模型项目。它的核心资产不是 prompt，而是**一套稳定、可读、可渲染、可编辑、可回放的状态协议**（即 `BoardDSL` + `DSLPatch`）。技术决策一律服务于这条主线。

1. **TS 是产品层和编排层主栈**——前端、Agent orchestrator（`useAgent`）、DSL renderer 共享 `src/types/dsl.ts` 一套类型。新增涉及前端与 Agent 之间传递的结构，类型定义必须落在 `dsl.ts`，不另起一份。
2. **DSL schema 单一来源（红线）**——`dsl.ts` 是唯一权威定义。`prompts.ts` 里给 Agent 的文本 schema 必须与 `dsl.ts` 保持一致；改任一处都要同步另一处，并用测试断言两者字段对齐。schema 复制是本项目最隐蔽的故障源（TS 编译器不报，Agent 却拿到错契约）。
3. **Python 只进模型/数据层**——若未来引入 embedding、离线知识库、eval，才用 Python，且不让它成为产品主栈。小团队优先减少系统边界。
4. **Agent runtime 是状态机，按事件系统对待**——长期演进方向是补齐以下韧性能力（按当前实现状态判断，不要默认全都有）：
   - 本地 Claude CLI 已通过 NDJSON 流式回传启动、工具、生成字数和心跳事件；最终 DSL 仍在完整收齐后解析和应用
   - cancel 已实现（`AbortController` + 输入栏停止按钮）
   - retry / timeout 已实现基础版（瞬时错误重试，单次调用超时）
   - resumable state 已实现基础版（session 内持久化 `activities` / `runs`，刷新后 interaction 可继续）
   - human-in-the-loop（已实现：`interaction_request` / `resumeRun`，继续保持）

判断技术问题时先问：「这个 Agent 怎么长期稳定地活在产品里？」而非「模型能不能做」。

## 约束

- 不安装全局依赖，所有依赖在 `package.json` 内
- 不修改 `.env` 文件（密钥存 localStorage）
- 不改 `src/engine/patch.ts` 和 `src/engine/validation.ts`（Phase 1 已验证稳定）
- 改 `dsl.ts` 的 DSL 结构时，必须同步 `src/agent/prompts.ts` 的文本 schema（见技术选型原则 2）
