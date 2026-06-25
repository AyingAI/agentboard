# AgentBoard

**Agent-native structured canvas** — 一个 local-first 的结构化白板，让人和 AI Agent 围绕同一份白板状态协作。

[English README](./README.md)

![status](https://img.shields.io/badge/status-prototype-blue)
![license](https://img.shields.io/badge/license-MIT-green)

AgentBoard 把和 Agent 的对话变成一张可编辑画布。用户可以让 Agent 拆解产品、梳理 workflow、画架构图或决策树；Agent 返回结构化白板操作；用户再移动卡片、编辑文字、创建连线，并基于更新后的白板继续对话。

## 它能做什么

- 用自然语言创建可编辑的卡片、便签、分组和连线。
- 白板以结构化 `BoardDSL` 存储，而不是一张扁平图片。
- Agent 输出通过经过校验的 `DSLPatch` 操作应用到白板。
- Agent 可以读取最近的人类编辑增量，不必每次都读取完整白板。
- 通过 Vite 开发服务器桥接本地 CLI Agent，例如 Claude Code 和 OpenCode。
- 支持 Claude API 和 OpenAI 兼容 API。
- 白板 session 和 Agent 设置保存在本机浏览器 `localStorage`。

## 为什么需要它

很多 Agent 产品会把上下文丢在冗长聊天记录里。AgentBoard 用画布本身作为共享的外部记忆：

```txt
人的意图
  -> Agent 规划结构化白板变更
  -> AgentBoard 校验并应用 DSLPatch
  -> 人编辑可见画布
  -> Agent 读取更新后的结构和最近编辑
```

关键不是“AI 画了一张图”，而是人和 Agent 一直在操作同一个结构化对象。

## 快速开始

```bash
git clone https://github.com/AyingAI/agentboard.git
cd agentboard
npm install
npm run dev
```

打开 `http://localhost:5173`。

然后在设置面板选择 Agent 提供方：

- **Local CLI**：自动检测 Claude Code、OpenCode 等本地 CLI。
- **Claude API**：使用 Anthropic API key。
- **OpenAI-compatible API**：使用 OpenAI 或兼容的 base URL。

API key 只保存在浏览器 `localStorage`。不要把 secrets 提交到仓库。

## 画布基础操作

| 操作 | 交互 |
| --- | --- |
| 创建卡片 | 双击画布空白处 |
| 移动卡片 | 拖拽 |
| 编辑卡片文字 | 双击标题或正文 |
| 创建连线 | 选中节点，拖拽连接点到另一个节点 |
| 编辑连线标签 | 选中或双击连线标签 |
| 删除选中内容 | Delete 或 Backspace |
| 平移画布 | Space + 拖拽，或鼠标中键拖拽 |

## 核心协议

AgentBoard 围绕一个很小的白板协议构建。

### `BoardDSL`

`BoardDSL` 是可见白板的事实来源：

```ts
type BoardDSL = {
  version: string;
  board: { id: string; title: string; viewport: { x: number; y: number; zoom: number } };
  nodes: BoardNode[];
  edges: BoardEdge[];
  groups: BoardGroup[];
  metadata: Record<string, unknown>;
};
```

### `DSLPatch`

Agent 不直接修改白板。它返回一个 patch：

```ts
type DSLPatch = {
  type: 'dsl_patch';
  summary: string;
  ops: PatchOp[];
  questions?: string[];
};
```

支持的操作包括 `add_node`、`update_node`、`delete_node`、`add_edge`、`delete_edge`、`add_group`、`update_group`、`delete_group` 和 `layout`。

每个 patch 都会先校验再应用。无效引用、重复 ID、无效几何信息或 schema 不匹配都会让 patch 原子失败，不会留下半更新状态。

### 增量上下文包

当用户编辑白板后再次调用 Agent，AgentBoard 默认发送紧凑的增量上下文：

- 已变化的编辑事件
- 已变化的节点 ID 和连线 ID
- 已变化节点的完整对象
- 与变化节点相关的连线
- 附近节点的轻量摘要
- 紧凑的白板摘要

全局任务，例如整图整理、导出或流程执行，仍然会接收完整白板上下文。

## 架构

```txt
React app
  ├── BoardDSL state
  ├── patch engine
  ├── validation engine
  ├── canvas renderer
  └── agent adapters
        ├── local CLI bridge
        ├── Claude API
        └── OpenAI-compatible API
```

项目结构：

```txt
src/
  types/dsl.ts           # 协议和共享类型
  engine/                # patch 应用和校验
  agent/                 # 适配器、prompt、解析、韧性处理
  hooks/                 # React 状态、拖拽、平移、session
  components/            # 画布和 UI 组件
  data/                  # 初始白板模板
  storage.ts             # localStorage 持久化
agentBridgePlugin.ts     # 用于本地 CLI 执行的 Vite middleware
```

## 开发

```bash
npm run dev        # 启动 Vite 开发服务器
npm run typecheck  # TypeScript 校验
npm run test       # Vitest 测试
npm run build      # 生产构建
```

## 当前状态

AgentBoard 仍是原型。它适合用于实验结构化 Agent 协作，但还不是一个托管式多人产品。

当前边界：

- 仅支持 local-first 存储。
- 没有服务端账号、权限或同步模型。
- 本地 CLI bridge 只在 Vite 开发服务器中运行。
- 外部副作用应保持显式，并由用户授权。

## 贡献

欢迎提交 issue 和 pull request。提交变更前请运行：

```bash
npm run typecheck
npm run test
npm run build
```

贡献指南见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

MIT. See [LICENSE](LICENSE).
