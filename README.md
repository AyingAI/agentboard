# AgentBoard

**Agent-native structured canvas** — 人和 AI 共享同一份白板，用自然语言协作，用结构化卡片和连线共同思考。

![](https://img.shields.io/badge/status-prototype-blue) ![](https://img.shields.io/badge/license-MIT-green)

## 这是什么

AgentBoard 不是又一个画板工具。它是**人和 Agent 共享的外部大脑**。

你说话，Agent 在白板上创建卡片、连线、分组；你拖拽编辑，Agent 读取你的修改继续协作。白板既是对话的输出，也是下一轮对话的上下文。

```
你说："帮我拆解这个产品的三个核心模块"
       ↓
Agent 理解意图 → 生成结构化 DSL → 渲染成卡片+连线
       ↓
你拖拽调整 → 双击改字 → 创建新节点 → 连接关系
       ↓
Agent 读回结构 → 继续补充 → 持续协作
```

## 快速开始

```bash
git clone https://github.com/AyingAI/agentboard.git
cd agentboard
npm install
npm run dev
```

打开 `http://localhost:5173`，点右上角 ⚙ 选择 Agent 提供方：

- **本地 CLI**（推荐）：自动检测 Claude Code / OpenCode，复用已有授权
- **Claude API**：填写 API Key
- **OpenAI / 兼容 API**：填写 Key + 自定义 Base URL（支持 Ollama、DeepSeek 等）

## 使用方式

### 创建白板

点「+ 新建」创建空白白板，每个白板是一次独立的对话 session。白板自动编号，双击标题可重命名。

### 画布操作

| 操作 | 方式 |
|------|------|
| 创建卡片 | 双击画布空白处 |
| 移动卡片 | 拖拽 |
| 编辑文字 | 双击标题或正文 |
| 创建连线 | 选中节点 → 拖底部 ⊕ 到目标节点 |
| 删除节点 | 选中后按 Delete |
| 平移画布 | 按住 Space + 拖拽，或鼠标中键拖拽 |

### 与 Agent 对话

在底部输入框描述你的想法，Agent 会自动在画布上创建结构化的节点和连线。等待时按钮会显示计时动画。

右侧「活动」面板记录了所有 Agent 操作，可展开查看详情。

## 技术架构

```
浏览器端 React App
  ├── DSL 状态层（nodes / edges / groups）
  ├── Patch 引擎（增删改 + 布局）
  ├── 校验引擎（schema / 引用完整性）
  └── Agent 适配器
        ├── 本地 CLI（Claude Code / OpenCode）
        ├── Claude API
        └── OpenAI / 兼容 API
```

- **前端**：React 18 + TypeScript + Vite 6
- **渲染**：HTML 绝对定位节点 + SVG 连线层
- **持久化**：localStorage（多白板 session + Agent 配置）
- **画布**：CSS transform GPU 加速平移，Figma 风格交互
- **CLI 桥接**：Vite 插件检测本地 Agent CLI，stdin 传 prompt

## 项目结构

```
src/
  types/dsl.ts           # 核心类型定义
  engine/                # Patch 引擎 + 校验引擎
  agent/                 # Agent 适配器（Claude / OpenAI / 本地 CLI）
  hooks/                 # React hooks（状态管理、拖拽、画布平移、连线）
  components/            # UI 组件
  data/                  # 初始数据模板
  storage.ts             # localStorage 读写
agentBridgePlugin.ts     # Vite 插件：CLI 检测 + 代理执行
```

## 开发

```bash
npm run dev        # 开发服务器
npm run build      # 生产构建
npm run typecheck  # TypeScript 类型检查
npm run test       # 单元测试
```

## License

MIT
