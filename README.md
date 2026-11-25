# AgentBoard

AgentBoard 是一个在浏览器中运行的开源白板。你和 Agent 可以在同一画布上编辑卡片、连线、分组和交互组件，并把结果导出为 Markdown。

[English](./README.en.md) · [更新记录](./CHANGELOG.md) · [安全与隐私](./SECURITY.md) · [贡献指南](./CONTRIBUTING.md)

![AgentBoard 画布](./assets/agentboard-cover.png)

## v0.6.0 的主要功能

- **统一画布**。在同一视图里编辑正文、操作交互组件和调整结构。「智能布局」按内容关系排列卡片，未连接 Agent 时使用本地规则。「更多布局操作」提供「仅整理间距」。分区导航和总览可以定位白板上的内容。
- **可操作的交互组件**。Agent 能生成 HTML、SVG 和 JavaScript 图表、对比矩阵或计算器。滑块、选项和其他交互状态随白板保存。可以引用组件中的一个元素，带上它的当前状态继续讨论。
- **免配置示例**。在新白板上点击「免配置体验」，即可试用内置的定价与增长推演沙盘。示例使用模拟数据。
- **选中内容后直接操作**。选中单张卡片可展开细化、找风险、生成交互视觉或切换语义角色。多选后可以对比、建立关联、合并提炼、编组或复制。角色切换保留自定义标签。
- **Markdown 卡片**。支持标题、列表、引用、链接和可勾选清单。粘贴网址可创建带原文链接的证据卡，粘贴清单会保留所有待办项。
- **白板目标与按需洞察**。在顶栏「目标」保存本板的目标和约束，之后的请求和智能布局会带上这两项信息。通过「AI 洞察」手动检查全板盲点、提炼结论与行动，或生成交互沙盘。布局与洞察菜单展开时浮在画布上方。
- **审阅和导出**。改写或删除内容时可以先预览，白板支持 25 步撤销和重做。用「导出文档」复制或下载整板或选中卡片的 Markdown，其中包含分组、清单状态、交互参数和连线关系。小屏可从白板菜单打开导出，也可以下载 `.agentboard.json` 备份。

从 v0.5.0 升级后，旧白板中仍保存的目标与约束会迁移到「目标」。原来的探索模式、后台主动分析和 TypeSafe 核查已移除。

## 快速开始

建议使用 Node.js 22.12 或更新的 22.x 版本，也可使用 Node.js 24。

```bash
git clone https://github.com/AyingAI/agentboard.git
cd agentboard
npm ci
npm run dev -- --host 127.0.0.1
```

打开终端显示的地址，默认是 `http://127.0.0.1:5173/`。新白板提供交互示例、四个起始提示词和手动建卡入口。

## 连接 Agent

在「Agent 设置」选择一种连接方式。

| 方式 | 配置 |
| --- | --- |
| 本地 CLI | 安装并登录 CLI，从检测到的工具中选择。支持 Claude Code、Codex、Gemini、Antigravity、Pi、OpenCode 等。 |
| Claude API | 选择模型，填写 API Key。可指定兼容的 Base URL。 |
| OpenAI / 兼容 API | 先设置 Base URL，再填写 API Key、模型和输出预算。可连接 Ollama、DeepSeek 等兼容服务。 |

API 地址使用 HTTPS。本机模型可使用回环地址的 HTTP 接口。切换 API 服务或修改实际地址后，需要重新输入对应的 Key。CLI 桥接由 `npm run dev` 提供，静态构建支持手动白板、示例和浏览器直连 API。

## 数据保存和发送

- 白板、活动记录和 API 设置保存在当前浏览器的 `localStorage` 中。API Key 使用浏览器本地存储，使用时作为认证头发送给该 API。
- 点击发送或触发 AI 操作时，所配置的 CLI 或 API 会收到请求和白板上下文。全板洞察会使用所有卡片正文。CLI 的工具能力和数据处理由该 CLI 及其提供商决定。
- 导出的 Markdown 和 JSON 可能包含卡片内容、来源链接与交互数据。JSON 还包含交互源码。发布或分享前请检查这些内容。

更多边界与漏洞报告方式见 [安全策略](./SECURITY.md)。

## 常用操作

| 操作 | 方法 |
| --- | --- |
| 新建或编辑卡片 | 双击画布空白处新建。双击卡片标题或正文编辑。 |
| 多选 | 框选、`Shift` / `⌘/Ctrl + 点击`，或 `⌘/Ctrl + A` 全选。 |
| 复制与删除 | `⌘/Ctrl + D` 复制，`Delete` 或 `Backspace` 删除。 |
| 添加连线 | 选中卡片，从四周连接点拖动到目标卡片。 |
| 平移与缩放 | 滚轮或 `Space + 拖拽` 平移，`⌘/Ctrl + 滚轮` 缩放。 |
| 撤销与重做 | `⌘/Ctrl + Z` 撤销，`⌘/Ctrl + Shift + Z` 重做。 |

## 开发与测试

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
```

浏览器测试在 macOS 上使用 Chrome，在其他平台使用 Playwright Chromium。默认测试替换模型端点响应。真实 CLI 测试需要已登录的本地工具并消耗模型额度。

AgentBoard 使用 [MIT 协议](./LICENSE)。
