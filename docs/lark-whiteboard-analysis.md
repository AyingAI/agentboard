# Lark Whiteboard Skill 深度分析

> 来源：https://github.com/larksuite/cli/tree/main/skills/lark-whiteboard
> 日期：2026-06-15
> 目的：为 AgentBoard 项目的 Agent 能力设计提供参考

---

## 目录结构

```
lark-whiteboard/
  SKILL.md                  ← 薄入口：快速决策表 → 按需跳转子文档
  elements/                 ← 可组合的原语（「怎么写」）
    schema.md               # 节点类型、属性、枚举值、硬约束
    layout.md               # 网格方法论、Flex映射、Dagre排版、间距规则
    style.md                # 5套色板、语义角色、上色步骤
    typography.md           # 字号层级、对齐规则
    connectors.md           # 连线策略、锚点法则
    content.md              # 信息量决策、分组策略、连线预判
    image.md                # 图片准备流程
  routes/                   ← 渲染变体（「怎么画」）
    dsl.md                  # DSL 路径 workflow
    svg.md                  # SVG 路径 workflow
    mermaid.md              # Mermaid 路径 workflow
  scenes/                   ← 场景范式（「画什么」）
    architecture.md         # 架构图（含骨架JSON）
    flowchart.md            # 流程图（Dagre为主）
    organization.md         # 组织架构图
    swimlane.md             # 泳道图
    comparison.md           # 对比表
    fishbone.md             # 鱼骨图
    flywheel.md             # 飞轮图
    funnel.md               # 漏斗图
    pyramid.md              # 金字塔图
    milestone.md            # 里程碑/时间线
    bar-chart.md            # 柱状图
    line-chart.md           # 折线图
    treemap.md              # 矩形树图
    photo-showcase.md       # 图片展示
    mermaid.md              # Mermaid 图表
  references/               ← 工具文档
    lark-whiteboard-query.md
    lark-whiteboard-update.md
    lark-whiteboard-workflow.md
```

**核心理念**：SKILL.md 不堆细节，而是做「路由决策」——根据用户需求和 LLM 身份，分发到正确的子文档。子文档各司其职：`elements/` 教「怎么写」，`scenes/` 教「画什么」，`routes/` 教「用哪种渲染路径」。

---

## 10 个核心要点

### 1. DSL 设计：Flexbox 心智模型 + 硬约束

DSL 引擎基于 Yoga（React Native 的 Flexbox 实现），让 LLM 用熟悉的 CSS Flexbox 概念来布局，大幅降低学习成本。

**核心映射**：

| DSL 属性 | CSS 心智模型 | 说明 |
|---------|------------|------|
| `layout: 'horizontal'` | `flex-direction: row` | — |
| `layout: 'vertical'` | `flex-direction: column` | — |
| `layout: 'none'` | `position: absolute` | 子节点用 x/y，容器必须有固定宽高 |
| `layout: 'dagre'` | Mermaid/DOT 有向图布局 | 引擎自动计算拓扑位置 |
| `width/height: 'fill-container'` | `flex: 1` | 填满父级剩余空间 |
| `width/height: 'fit-content'` | `width/height: auto` | — |
| `alignItems` | CSS `align-items` | 但枚举无 `flex-` 前缀 |
| `justifyContent` | CSS `justify-content` | — |
| `gap` | CSS `gap` | **必须显式写** |
| `padding` | CSS `padding` | **必须显式写** |

**关键简化**：
- 没有 `flex-wrap`（需要换行时用嵌套 frame 模拟）
- 没有 `margin`（结构靠 gap/padding）
- 没有 `alignSelf`
- 枚举值去掉了 `flex-` 前缀（`'start'` 而非 `'flex-start'`）
- `alignItems` 默认值是 `'start'`（CSS 默认是 `stretch`）

### 2. 节点类型体系

**容器节点**：
- `frame`：唯一可包含子节点的类型，支持 4 种布局模式

**基础图形**：
- `rect` / `ellipse` / `cylinder` / `diamond` / `triangle` / `trapezoid`
- 每种有特定的使用场景和约束（如 cylinder 弧度固定 16px，必须用固定宽度）

**内容节点**：
- `text`：纯文本节点
- `stickyNote`：便签（9 种预设颜色）
- `image`：图片节点（需先上传到画板获取 media token）
- `svg`：内联 SVG（支持背景装饰和图标两种用法）
- `icon`：内置图标库（无需手写 SVG path）

**关系节点**：
- `connector`：连线（必须放顶层 nodes，不能嵌套在 children 里）

**富文本**：
- `WBTextRun[]`：类似 HTML 内联样式，支持 bold/italic/underline/strikethrough/hyperlink/listType/quote

**尺寸值**：
- `number`：固定像素
- `'fit-content'`：内容撑开
- `'fill-container'`：填满父级
- 都支持 `(N)` fallback 写法

### 3. 多渲染路由 + 模型自识别

SKILL.md 要求 Agent「先自报身份」，然后根据身份分流到不同渲染路径：

| 图表类型 | Claude/Gemini/GPT/GLM | Doubao/Seed/Other |
|---------|----------------------|-------------------|
| 思维导图/时序图/类图/饼图/甘特图 | → Mermaid | → Mermaid |
| 其他图表 | → SVG（自由发挥） | → DSL（结构化生成） |

**设计原因**：不同模型家族对 SVG 和结构化 JSON 的能力不均衡——Claude/GPT 在 SVG 上创造力强，Doubao 在结构化 JSON 上更稳定。

**SVG 路径的硬兜底**：遇到以下任一情况→丢弃 SVG，改走 DSL：
1. 渲染命令直接报错（语法级崩溃）
2. 两轮改写仍无法消除 `--check` 的 `text-overflow` error
3. 目测 PNG 视觉严重错乱（文字大面积溢出、元素重叠压住关键信息、布局整体崩溃）

### 4. 场景库（Scenes）——结构化范式文档

每个 scene 文件包含 5 个模块：

| 模块 | 内容 |
|------|------|
| **Content 约束** | 该场景画多少节点、节点文字规则、什么该出现什么不该 |
| **Layout 选型表** | 不同子场景对应的布局策略（grid/flow/tree/free） |
| **Layout 规则** | 具体间距、宽度、对齐、嵌套规则 |
| **骨架 JSON** | 可直接套用的完整 JSON 模板 |
| **陷阱/常见错误** | 这个场景最容易犯的错误及正确做法 |

**代表性场景**：
- `architecture.md`：明确「连线非必要不画，分层结构本身已表达调用方向」「cylinder 必须固定宽度」
- `flowchart.md`：强制走 DSL+Dagre 而非 Mermaid，定义语义化配色规范（成功绿/失败红/判断黄）
- `swimlane.md`：跨角色流程的标准画法

### 5. 配色系统——语义角色 + 多色板

**不是简单的颜色枚举，而是定义了完整的上色方法论**：

**上色步骤**：
1. 找出图中有几个分组（层级/分支/类别/阶段）
2. 为每个分组选一种不同颜色（从色板中选 2-4 种）
3. 分组容器用浅色填充——告诉读者「这块是一个整体」
4. 分组内节点用白色填充 + 该分组的深色 borderColor

**5 套色板**：经典 / 商务 / 科技 / 清新 / 极简，每套定义 7 个语义角色的完整色值。

**核心规则**：
- 外层浅色、内层白色（外重内轻）
- 不同分组必须用不同颜色
- 所有节点有边框（borderWidth=2）
- 连线用灰色（#BBBFC4），不抢节点注意力
- 不要仅靠颜色区分信息——同时使用边框、形状辅助

### 6. 内容规划——信息量匹配需求详细度

**信息量阶梯**：

| 用户需求 | 合理信息量 |
|---------|-----------|
| 「画一个简单的 XX 架构图」 | 3 层，每层 2-3 节点，无侧边栏 |
| 「画一个 XX 架构图」（普通） | 3-4 层，每层 3-4 节点 |
| 「画一个完整/详细的 XX 架构图」 | 4-5 层，每层 4-6 节点，可加侧边栏 |
| 流程图 | 6-10 步骤 + 1-2 个条件分支 |
| 对比表 | 4-6 个维度，每格 1-2 行说明 |
| 组织架构 | 3-4 层，每个父节点下 2-4 个子节点 |

**分组规则**：每组 2-5 个节点，超过 5 个拆成子组。

**连线预判**：

| 连线数 | 策略 |
|--------|------|
| ≤8 | 逐条画 |
| 9-15 | 代表性连线 |
| >15 | 层到层连线，或回退精简 |

### 7. 工作流 Pipeline：渲染 → 自查 → 修复（最多 2 轮）

```
Step 1: 读取 scene 指南 → 确定布局策略
Step 2: 生成完整 DSL（含颜色）
Step 3: 渲染 → 自查清单 → 目测 PNG → 有问题的按症状表修复 → 重新渲染
        → 2 轮后仍有严重问题 → 走 Mermaid/SVG 兜底
Step 4: 写入画板
```

**渲染前自查清单**（DSL 路径的 6 项必检）：
- [ ] 不同分组用了不同颜色？同组节点样式完全一致？
- [ ] 外层浅色背景、内层白色节点？
- [ ] 所有节点有边框（borderWidth=2）？文字在背景上清晰可读？
- [ ] 连线用灰色（#BBBFC4），不用彩色？
- [ ] frame 都写了 layout 属性？gap 和 padding 都显式设置了？
- [ ] 含文字节点 height 用 fit-content？connector 在顶层 nodes 数组？

**症状→修复表**：

| 看到的问题 | 改什么 |
|-----------|--------|
| 文字被截断 | height 改为 fit-content |
| 文字溢出容器右侧 | 增大 width，或缩短文字 |
| 节点重叠粘连 | 增大 gap |
| 节点挤成一团 | 增大 padding 和 gap |
| 连线穿过节点 | 调整 fromAnchor/toAnchor 或增大间距 |
| 大面积空白 | 缩小外层 frame 宽度 |
| 文字和背景色太接近 | 调整 fillColor 或 textColor |
| 布局整体偏左/偏右 | 调整绝对定位的 x 坐标使内容居中 |

### 8. Dagre 拓扑排版引擎

`layout: 'dagre'` 让引擎自动计算网状连线的节点位置。

**排版规则**：
- **不透明节点**：Dagre 内的子容器，只要未声明 `isCluster: true`，对外层 Dagre 就是固定宽高的原子节点。外层连线无法寻址其内部子节点（引擎自动重定向至外壳）
- **透明子图**：同时声明 `layout: "dagre"` + `layoutOptions: { isCluster: true }`，内部节点直接参与外层拓扑运算，连线可穿越子图边界
- **连线兜底重定向**：edges 引用不透明节点内部子节点 ID 时，自动重定向至最近的不透明祖先节点

**Dagre 版式统一原则**：
1. Dagre 解决的是拓扑关系，不是自动把画布铺满
2. 嵌套时默认是不透明节点
3. 混合布局时 Flex 负责分区，Dagre 负责局部复杂关系
4. 选用前先看：最长链路方向、分支是否对称、是否有长回边
5. 长回边优先收敛到局部，不要让一条边把整个 Dagre 宽度拉爆

### 9. SVG 路径——自由设计 vs 画板约束

SVG 路径的核心理念是「**你有完全的设计自由**」：

**设计原则**：
- 不要做成普通的网页或千篇一律的模板
- 大胆使用 path 做图标、连接指引、氛围点缀
- 打破单调的 `<rect>` 牢笼，全篇用矩形和文字应付视为不及格
- 文字用 `<text>`（不是 `<path>`），CJK ≈ 1em / Latin ≈ 0.6em 重排规则
- 连线用正交折线（`<polyline>` 带水平/垂直折点）

**画板支持的元素**：
- 形状：`<rect>` / `<circle>` / `<ellipse>` / `<polygon>`
- 连线：`<line>` / `<polyline>` / `<path>`
- 文本：`<text>` / `<tspan>`
- 分组：`<g>` / `<a>` / `<use>` 引用 `<symbol>`
- 变换：`translate` / `rotate` / `scale`

**不支持的装饰特性**（会导致渲染问题）：
- `<radialGradient>` / `<filter>` / `<pattern>` / `<clipPath>` / `<mask>`
- `<text>` / `<image>` 在 SVG 沙箱中无法加载字体和外部资源

### 10. 错误预防体系

**三层防错**：

**第一层：关键约束速查**（DSL 路径末尾的 6 条硬约束）：
1. 含文字节点的 height 必须用 `'fit-content'`
2. `fill-container` 仅在 flex 父容器中生效
3. `layout: 'none'` 的容器必须有固定宽高
4. connector 必须放在顶层 nodes 数组
5. flex 容器内的 x/y 会被完全忽略
6. Dagre 子容器默认为不透明节点

**第二层：致命错误示例**（❌ 标记 + ✅ 正确写法）：
```
❌ flex 容器内写 x/y
❌ layout: 'none' 容器用 fit-content
❌ connector 嵌套在 children 里
❌ Dagre 套固定宽高外框
❌ fill-container 死锁（祖先链无固定尺寸）
```

**第三层：场景陷阱**（每个 scene 文件末尾）：
- 架构图：「所有架构图都用分层条带」→ 多模块平级网状互联应选岛屿式
- 流程图：「误用 Mermaid」→ 只要用户没带 mermaid 语法代码，强制走 DSL+Dagre
- 「cylinder 用 fill-container 宽度」→ 必须固定宽度 120-200px

---

## 对 AgentBoard 的改进建议

### P0 — 立即可做

1. **拆分 prompts.ts**：参考 `elements/` + `scenes/` 结构，把巨大的 system prompt 拆成可组合的模块
   - `prompts/schema.ts`：DSL 类型约束
   - `prompts/layout.ts`：布局指南
   - `prompts/style.ts`：配色规范
   - `prompts/content.ts`：信息量决策
   - `prompts/scenes/architecture.ts`：架构图范式

2. **加入检查清单**：在 Agent 输出 DSLPatch 后增加自检步骤
   - 节点位置是否在画布范围内？
   - 连线是否引用了存在的节点 ID？
   - 新增节点是否与已有节点重叠？

3. **信息量阶梯**：在 prompt 中加入「根据用户需求详细程度调整信息密度」的指导

### P1 — 中期规划

4. **多路由策略**：根据 Agent 模型身份分流（本地 CLI vs Claude API vs OpenAI），适配不同输出策略
   - Claude/GPT：可以让 Agent 发挥更多创造力
   - 本地 CLI / 弱模型：使用更结构化的模板

5. **症状→修复表**：建立 Agent 常见错误 → 修复指令映射
   - 校验引擎报错时，不只是拒绝 patch，而是给出具体修复建议
   - 实现自动回退修复（最多 N 轮）

6. **配色系统**：为卡片/连线引入语义色板
   - 分组容器：浅色背景 + 深色边框
   - 内容节点：白色填充 + 分色边框
   - 连线：统一灰色

### P2 — 长期愿景

7. **布局引擎**：引入 Flex 自动布局能力
   - 水平/垂直堆叠
   - gap/padding 控制间距
   - `fill-container` 自动均分

8. **场景库**：建立常见图表类型的设计范式
   - 架构图范式（分层条带 / 岛屿式）
   - 流程图范式（Dagre 自动拓扑）
   - 对比表范式（等宽卡片网格）

9. **SVG 节点支持**：在 DSL 中支持 SVG 节点类型
   - 用于装饰性背景（连线、曲线、发光效果）
   - 用于内联图标（Feather/Lucide 风格）

10. **模型自识别**：让 Agent 知道自己是什么模型，据此调整输出策略

---

## 关键设计原则总结

1. **薄入口 + 深文档**：SKILL.md 只做路由，细节下沉到子文档
2. **反例教学**：每个规则都配「错误 vs 正确」的代码示例，Agent 从反例中学得最快
3. **硬约束前置**：在 Agent 开始写代码前，先给它看「什么东西绝对不能做」
4. **多级回退**：主路径 → 修复重试 → 兜底路径，防止单点失败
5. **语义化设计**：配色、排版、布局的选择都对应到「要表达什么信息关系」，而不是随意美观
6. **间距显式化**：gap 和 padding 必须显式写（不写节点粘连），消除 Agent 依赖默认值的侥幸心理
7. **信息密度阶梯**：不同详细程度的请求产出不同信息量的图表，不要一刀切
