# AgentBoard 产品方案说明：Agent 可视化上下文层

> 版本：v0.2  
> 定位更新：从「Agent-native 白板」升级为「Agent-native Visual Context Layer」  
> 中文定义：**Agent 可视化上下文层**  
> 核心判断：**白板不是本体，白板只是上下文的一种视图。AgentBoard 真正要做的是让 Agent 和人类围绕同一份结构化上下文协作。**

---

## 0. 一句话结论

AgentBoard 不应该被定义成「AI 白板」或「Agent 白板」。

更准确的定义是：

> **AgentBoard 是给普通 Agent 交互使用的可视化上下文层。**
>
> 它把聊天、任务、文件、工具调用、推理过程、用户修改和 Agent 产出的结果，沉淀为一份结构化 Context DSL。
>
> 人类看到的是卡片、流程、关系图、表格、时间线等可视化界面；Agent 读取的是稳定、可更新、可追踪的结构化上下文。
>
> 用户可以直接修改这些可视化对象，Agent 会基于修改后的上下文继续理解和行动。

这个方向比「白板产品」更大，也更准确。

白板只是 View。

真正的产品本体是：

> **Context DSL + Visual Views + Agent Patch Loop**

---

## 1. 为什么要重新定义

原始思路是：

```text
AgentBoard = DSL 白板
```

这个定义已经比传统白板前进了一步，因为它不是让人多一个画图工具，而是让 Agent 能读写白板背后的 DSL。

但新的理解是：

```text
AgentBoard = 普通 Agent 交互的可视化上下文层
```

这个定义更重要。

因为 Agent 交互的核心问题并不是「没有白板」，而是：

- 上下文藏在聊天记录里，线性、混乱、难复用。
- Agent 经常误解用户，但用户很难精准纠错。
- Agent 的思考过程和执行过程不可见。
- 人和 Agent 没有一个共同操作的「工作对象」。
- 多 Agent 协作时，互相传长文本，状态不透明。
- 用户看到的是一堆回答，不是一个可以持续演化的上下文。

所以 AgentBoard 不应该只解决「怎么把 Agent 输出变成图」。

它应该解决的是：

> **怎么让 Agent 和人类共同维护一份稳定、可视化、可编辑、可追踪的上下文。**

---

## 2. 产品本体：不是 Board，而是 Context

### 2.1 Board 是表现层

白板、卡片、表格、流程图、时间线，本质都是 View。

它们不是数据本体。

真正的数据本体应该是：

```text
Context DSL
```

也就是 Agent 能读懂、人类能编辑、系统能校验、历史能追踪的结构化上下文。

### 2.2 新的产品结构

```text
用户自然语言 / 用户界面操作 / 文件 / 工具调用 / Agent 输出
        ↓
Context Extraction / Context Update
        ↓
Context DSL
        ↓
多种 Visual View 渲染
        ↓
人类查看、编辑、确认、纠错
        ↓
Context Patch
        ↓
Agent 读回更新后的上下文继续工作
```

### 2.3 一句话理解

聊天框负责输入。

Context DSL 负责理解。

Visual View 负责让人看懂。

Patch 负责让 Agent 和人持续协作。

---

## 3. 它解决的不是画图问题，而是 Agent 交互问题

### 3.1 普通 Agent 交互的缺陷

现在大部分 Agent 产品仍然以聊天框为中心。

聊天框适合问答，但不适合长期复杂协作。

主要问题有四个：

#### 1）上下文线性堆积

聊天记录会越来越长。

Agent 要从大量文本里判断：

- 当前目标是什么？
- 用户已经确认了什么？
- 哪些只是临时想法？
- 哪些是强约束？
- 哪些风险还没解决？
- 哪些任务已经完成？
- 用户刚刚修改了什么？

这对 Agent 和人类都不友好。

#### 2）用户纠错成本高

当 Agent 理解错时，用户通常只能继续打字解释：

> 不是这个意思，我刚才说的是……

这会让交互变成反复纠偏。

如果上下文被结构化，用户可以直接改对象：

- 删除错误节点。
- 修改需求描述。
- 把风险优先级调高。
- 把「假设」标记为「已确认」。
- 把场景从「卧室」改成「玄关」。
- 把某个结论标记为「暂不采纳」。

这比继续解释高效得多。

#### 3）Agent 工作过程不可见

Agent 往往最后输出一段结论，但用户不知道：

- 它引用了哪些信息？
- 它忽略了哪些约束？
- 它做了哪些中间判断？
- 哪一步开始跑偏？
- 哪些内容已经沉淀到上下文？
- 哪些任务只是建议，还没有执行？

可视化上下文层可以把这些过程显性化。

#### 4）人和 Agent 没有共同操作对象

在聊天框里，人和 Agent 不是共同操作一个东西，而是在互相传话。

AgentBoard 要让双方共同操作一个结构化对象：

> 项目、方案、流程、需求、任务、风险、证据、记忆、决策，都在同一个上下文空间里持续演化。

---

## 4. 产品定位

### 4.1 推荐定位

> **AgentBoard 是 Agent 的可视化上下文层。**
>
> 它让 Agent 不再只通过聊天记录理解任务，而是通过结构化 Context DSL 理解当前目标、关键对象、关系、决策、风险、任务和历史修改。
>
> 人类不需要看 DSL，只需要通过卡片、关系图、表格、时间线、流程图等界面理解和编辑上下文。
>
> 每一次人类修改，都会变成 Agent 可读的 Context Patch；每一次 Agent 行动，也会更新上下文状态。

### 4.2 不建议的定位

不要说：

- AI 白板
- 智能白板
- Agent 白板
- 类 Miro 的 AI 工具
- 类飞书画板的 Agent 工具

这些定位会把产品拉回传统白板赛道，用户会自然拿它和飞书画板、Boardmix、Miro、FigJam 对比。

### 4.3 更准确的英文定位

可以使用：

```text
Agent-native Visual Context Layer
```

或：

```text
Visual Context Infrastructure for AI Agents
```

或：

```text
Context Canvas for Agentic Workflows
```

### 4.4 中文表达

可以使用：

```text
Agent 可视化上下文层
```

或：

```text
Agent 工作上下文台
```

或：

```text
面向 Agent 的可视化上下文界面
```

其中最准确的是：

> **Agent 可视化上下文层**

---

## 5. 核心价值

### 5.1 对用户的价值

用户获得的不是一个白板，而是一种更清楚的 Agent 交互方式。

用户可以：

- 看见 Agent 当前理解了什么。
- 看见任务目标、关键对象、风险、决策和待办。
- 直接修改 Agent 的理解，而不是用长文字解释。
- 点选某个上下文对象继续追问。
- 追踪 Agent 为什么得出某个结论。
- 把一次对话沉淀为长期可复用的项目上下文。
- 让多个 Agent 围绕同一份上下文协作。

### 5.2 对 Agent 的价值

Agent 获得的不是一段聊天记录，而是一份结构化上下文。

Agent 可以读到：

- 当前目标。
- 关键实体。
- 实体之间的关系。
- 已确认决策。
- 尚未验证的假设。
- 风险和反对意见。
- 用户手动修改过的内容。
- 最近上下文变化。
- 可执行的操作 schema。
- 当前视图里的选中对象。

这会降低误解，也让 Agent 更容易持续工作。

### 5.3 对企业的价值

企业获得的是可审计、可管理、可追踪的 Agent 工作状态。

它可以用于：

- Agent 工作过程留痕。
- 关键决策依据追踪。
- 人类确认节点。
- 多 Agent 协作状态管理。
- 项目上下文复用。
- 权限和审计。
- 风险控制。

企业不会只为「好看的白板」付费，但可能会为「Agent 过程可控」付费。

---

## 6. 核心产品机制

AgentBoard 的核心不是生成图，而是维护上下文。

可以抽象为五个机制：

```text
Context Capture
Context Structuring
Context Visualization
Context Editing
Context Patch Loop
```

### 6.1 Context Capture：捕捉上下文

上下文来源包括：

- 用户自然语言输入。
- 用户在界面上的点击、拖拽、修改、删除。
- 文件内容。
- Agent 输出。
- 工具调用结果。
- 多 Agent 的中间产物。
- 用户历史偏好和项目记忆。

### 6.2 Context Structuring：结构化上下文

系统把杂乱信息抽取成结构化对象：

- Goal
- Entity
- Relation
- Decision
- Assumption
- Risk
- Task
- Evidence
- Artifact
- Memory
- Tool Run
- Agent Run

### 6.3 Context Visualization：可视化上下文

同一份 Context DSL 可以被渲染成不同视图：

- Card View
- Canvas View
- Table View
- Timeline View
- Flow View
- Inspector View
- Memory Map View

### 6.4 Context Editing：人类编辑上下文

用户可以直接编辑可视化对象：

- 改标题。
- 改描述。
- 改状态。
- 改优先级。
- 建立关系。
- 删除错误理解。
- 标记确认/否定。
- 给节点添加评论。
- 选择某个对象继续追问。

### 6.5 Context Patch Loop：上下文补丁循环

Agent 不应该每次重写整个上下文，而应该输出 patch。

每次 Agent 输出的是：

```json
{
  "type": "context_patch",
  "summary": "我更新了当前产品方案中的风险和待验证问题。",
  "ops": [
    {
      "op": "add_context_item",
      "item": {
        "type": "risk",
        "title": "用户可能不愿意在家中放置摄像头",
        "status": "open",
        "priority": "high"
      }
    },
    {
      "op": "link_context_items",
      "from": "risk_privacy_camera",
      "to": "assumption_home_mirror_entry",
      "relation": "challenges"
    }
  ]
}
```

Patch 的好处：

- 可以局部修改。
- 可以撤销。
- 可以审计。
- 可以回放。
- 可以追踪是谁改的。
- 可以做多 Agent 协作。
- 可以避免 Agent 每次重画整个上下文。

---

## 7. Context DSL 设计草案

### 7.1 顶层结构

```json
{
  "version": "0.2",
  "workspace": {
    "id": "workspace_001",
    "title": "AI 穿搭镜产品方案",
    "owner": "user_001"
  },
  "context": {
    "goal": {},
    "items": [],
    "relations": [],
    "views": [],
    "events": [],
    "metadata": {}
  }
}
```

### 7.2 Context Item

```json
{
  "id": "item_001",
  "type": "risk",
  "title": "隐私顾虑",
  "body": "用户可能不愿意让摄像头长期出现在卧室或玄关。",
  "status": "open",
  "priority": "high",
  "confidence": 0.82,
  "createdBy": "agent_product",
  "updatedBy": "user",
  "source": {
    "type": "chat",
    "messageId": "msg_123"
  },
  "tags": ["privacy", "hardware", "adoption"]
}
```

### 7.3 Relation

```json
{
  "id": "rel_001",
  "from": "item_privacy_risk",
  "to": "item_home_mirror_scenario",
  "type": "challenges",
  "label": "会削弱该场景的接受度",
  "createdBy": "agent_risk"
}
```

### 7.4 View

View 是同一份上下文的不同渲染方式，不是数据本体。

```json
{
  "id": "view_canvas_001",
  "type": "canvas",
  "title": "产品机会结构图",
  "items": ["item_001", "item_002", "item_003"],
  "layout": {
    "mode": "freeform",
    "positions": {
      "item_001": { "x": 100, "y": 120 },
      "item_002": { "x": 420, "y": 120 }
    }
  }
}
```

### 7.5 Event

事件记录人和 Agent 对上下文做过什么。

```json
{
  "id": "event_001",
  "type": "update_context_item",
  "actor": "user",
  "target": "item_privacy_risk",
  "before": {
    "priority": "medium"
  },
  "after": {
    "priority": "high"
  },
  "timestamp": "2026-06-12T10:00:00Z"
}
```

---

## 8. 视图设计

### 8.1 Card View：默认上下文卡片

适合普通用户快速理解当前上下文。

卡片类型包括：

- 目标
- 用户
- 场景
- 需求
- 假设
- 决策
- 风险
- 任务
- 证据

适合作为默认视图，因为它比无限白板更轻，不会让用户一开始被复杂画布吓住。

### 8.2 Canvas View：关系和结构

适合表达：

- 产品方案结构。
- 流程。
- 架构。
- 需求关系。
- 风险链路。
- 多 Agent 分工。
- 用户旅程。

Canvas View 才是传统意义上的白板，但它不是唯一界面。

### 8.3 Table View：对比和优先级

适合表达：

- 功能优先级。
- 竞品对比。
- 风险清单。
- 用户访谈归纳。
- 任务排期。
- 多方案评分。

### 8.4 Timeline View：过程和历史

适合表达：

- Agent 执行过程。
- 工具调用历史。
- 决策演变。
- 项目进度。
- 用户修改记录。
- 多 Agent 工作流。

### 8.5 Flow View：工作流和工具链

适合表达：

- Agent 工作流。
- 工具调用链。
- MCP 连接。
- 数据流。
- 自动化流程。
- 多 Agent 协作编排。

### 8.6 Inspector View：单对象细节

用户点选任意上下文对象后，可以看到：

- 完整描述。
- 来源。
- 状态。
- 置信度。
- 谁创建。
- 谁修改。
- 相关对象。
- 历史版本。
- 可执行操作。
- 针对该对象继续追问。

---

## 9. 产品体验示例

### 9.1 典型任务：分析 AI 穿搭镜产品机会

用户输入：

```text
帮我分析这个 AI 穿搭镜产品有没有机会。
```

Agent 不只是回复一段长文，而是生成 Visual Context：

```text
目标：
判断 AI 穿搭镜的商业化机会。

用户群体：
25-35 岁、一线/新一线女性、在意形象但不想过度用力。

核心场景：
出门前在玄关或卧室照镜子，判断今天穿搭是否合适。

产品假设：
穿衣镜是天然高频入口，比 App 更自然。

核心价值：
减少穿搭纠结，提升出门前的确定感。

关键风险：
硬件成本、隐私顾虑、审美可信度、安装门槛。

待验证问题：
用户是否愿意让摄像头出现在家里？
用户是否相信 AI 的穿搭判断？
¥199/月真人顾问和硬件订阅相比，哪个更容易接受？
```

这些内容以卡片和关系图方式展示。

用户可以直接点「隐私顾虑」卡片，说：

```text
这个风险太重要，展开分析。
```

Agent 会围绕该节点继续工作。

用户也可以把「卧室」改成「玄关」。

Agent 下一轮会读到这个修改，并调整后续分析。

---

## 10. MVP 方案

### 10.1 MVP 不做完整白板

第一版不要先做无限画布、多人协作、复杂图形、模板市场。

那会陷入传统白板工具的工程泥潭。

更好的 MVP 是：

> **普通 Agent Chat + 自动生成的 Visual Context Panel**

### 10.2 MVP 页面结构

```text
┌────────────────────────────────────────────┐
│ Chat                    Visual Context      │
│                                            │
│ 用户和 Agent 对话       卡片 / 关系 / 表格   │
│                                            │
│                                            │
│                         Inspector           │
│                         节点详情 / 来源 / 操作 │
└────────────────────────────────────────────┘
```

或者：

```text
左侧：Chat
中间：Visual Context
右侧：Inspector / Agent Activity
```

### 10.3 MVP 只支持 5 类上下文对象

| 对象 | 作用 |
|---|---|
| Goal | 当前任务目标 |
| Entity | 产品、用户、功能、市场、模块等关键对象 |
| Decision | 已确认判断 |
| Risk | 风险、疑问、反对意见 |
| Task | 下一步行动 |

暂时不要做太多对象类型。

对象越多，Agent 越容易乱，用户也越难理解。

### 10.4 MVP 只支持 4 种视图

| 视图 | 作用 |
|---|---|
| Card View | 默认展示上下文对象 |
| Canvas View | 展示关系和结构 |
| Table View | 展示对比和优先级 |
| Timeline View | 展示 Agent 执行过程和修改历史 |

### 10.5 MVP 只支持 6 个操作

```json
[
  "add_context_item",
  "update_context_item",
  "delete_context_item",
  "link_context_items",
  "mark_status",
  "switch_view"
]
```

### 10.6 MVP 核心闭环

```text
用户正常聊天
    ↓
Agent 生成回答 + context_patch
    ↓
Visual Context 自动更新
    ↓
用户直接修改某个上下文对象
    ↓
系统记录 edit_event
    ↓
Agent 读回 Context DSL + edit_events
    ↓
继续基于更新后的上下文工作
```

MVP 只要证明这个闭环，就已经足够。

---

## 11. 为什么它比传统聊天框更强

### 11.1 聊天框的问题

聊天框适合：

- 快速问答。
- 短任务。
- 单次生成。
- 简单咨询。

但不适合：

- 长期项目。
- 复杂方案。
- 多约束推理。
- 多 Agent 协作。
- 需要持续修改的工作对象。
- 需要审计和回放的企业任务。

### 11.2 AgentBoard 的优势

AgentBoard 的优势不是「输出更漂亮」。

而是：

- Agent 的理解可见。
- 用户的纠错可操作。
- 上下文可持续沉淀。
- 任务状态可追踪。
- 复杂关系可视化。
- 多 Agent 可以共享同一份状态。
- 人类和 Agent 真正共同操作一个对象。

### 11.3 最关键差异

普通聊天：

```text
人说话 → Agent 回答 → 人再解释 → Agent 再回答
```

AgentBoard：

```text
人说话 → Agent 更新上下文 → 人直接编辑上下文 → Agent 基于新上下文继续行动
```

这里真正变化的是交互范式。

---

## 12. 使用场景

### 12.1 产品方案分析

适合：

- 产品机会判断。
- MVP 拆解。
- 用户需求分析。
- 商业模式推演。
- 竞品分析。
- 风险评审。

输出形式：

- 用户卡片。
- 场景卡片。
- 假设卡片。
- 风险图。
- 任务表。
- 决策记录。

### 12.2 Agent 工作流设计

适合：

- 设计一个专业 Agent。
- 拆解 Agent 需要的工具。
- 规划 MCP 连接。
- 设计多 Agent 分工。
- 观察工具调用链。
- 调试 Agent 输出。

输出形式：

- 工作流图。
- 工具链。
- Agent 分工图。
- 执行时间线。
- 错误和修复记录。

### 12.3 市场调研整理

适合：

- 用户访谈归纳。
- 竞品资料整理。
- 行业报告消化。
- 证据和结论关联。
- 假设验证。

输出形式：

- 主题聚类。
- 原话证据卡。
- 洞察卡。
- 风险和疑问。
- 后续调研任务。

### 12.4 技术架构推演

适合：

- 系统模块拆解。
- 数据流设计。
- 接口依赖。
- 风险链路。
- 技术方案对比。

输出形式：

- 架构图。
- 模块卡片。
- 数据流关系。
- 风险表。
- 待办任务。

### 12.5 企业 Agent 审计

适合：

- Agent 执行过程留痕。
- 人类确认节点。
- 关键决策依据。
- 工具调用历史。
- 多 Agent 协作状态。

输出形式：

- Timeline。
- Decision Log。
- Tool Run Log。
- Evidence Map。
- Risk Register。

---

## 13. 商业化方向

### 13.1 个人专业版

目标用户：

- AI 产品经理。
- 独立开发者。
- Agent builder。
- AI 咨询顾问。
- 创作者。
- 研究型工作者。

核心卖点：

- 让复杂 AI 对话变成结构化上下文。
- 产品方案、调研、架构、工作流可视化沉淀。
- 支持自定义 Agent / API Key。
- 支持导出 Markdown / JSON / PNG / Mermaid。
- 支持版本历史。

### 13.2 团队协作版

目标用户：

- 产品团队。
- 研发团队。
- AI 应用团队。
- 咨询团队。
- 创新业务团队。

核心卖点：

- 多人围绕同一份 Agent 上下文协作。
- 多 Agent 角色参与。
- 项目上下文持续沉淀。
- 决策和风险可追踪。
- 任务自动拆解和更新。

### 13.3 企业 / 私有化版

目标用户：

- 企业 AI 平台团队。
- 数字化部门。
- 知识管理团队。
- 需要 Agent 审计和权限控制的组织。

核心卖点：

- 私有化部署。
- 企业内部模型接入。
- 权限和审计。
- Agent 过程可视化。
- 企业知识库接入。
- 与飞书、钉钉、企微、OA、CRM、ERP 等系统连接。

### 13.4 SDK / API 模式

这是很值得重视的商业化方向。

很多 Agent 产品都需要更好的交互层，但不一定愿意自己开发：

- 上下文卡片。
- Agent 执行过程。
- 工具调用时间线。
- 结构化任务状态。
- 人类确认和纠错。
- 多视图切换。
- Context Patch Engine。

AgentBoard 可以做成：

```text
Agent Context Canvas SDK
```

对外提供：

- Context DSL schema。
- Visual Context 组件。
- Patch Engine。
- Agent Adapter。
- View Renderer。
- Event Log。
- Inspector UI。

这可能比单纯做一个 SaaS 产品更有防守性。

---

## 14. 技术架构草案

### 14.1 总体架构

```text
Frontend
  ├─ Chat Panel
  ├─ Visual Context Panel
  ├─ Card View
  ├─ Canvas View
  ├─ Table View
  ├─ Timeline View
  ├─ Inspector
  └─ Agent Activity Panel

Context Core
  ├─ Context Store
  ├─ Context DSL Schema
  ├─ Patch Engine
  ├─ Event Log
  ├─ Validation Engine
  ├─ View Mapping Engine
  └─ Version History

Agent Layer
  ├─ Agent Adapter
  ├─ Prompt Builder
  ├─ Context Compressor
  ├─ Schema Guard
  ├─ Patch Validator
  ├─ Repair Prompt
  └─ Tool Run Collector

Storage
  ├─ Workspace Data
  ├─ Context Items
  ├─ Relations
  ├─ Events
  ├─ Agent Runs
  ├─ Tool Runs
  └─ Export Files
```

### 14.2 关键模块

| 模块 | 作用 |
|---|---|
| Context Store | 保存当前结构化上下文 |
| Patch Engine | 应用 Agent 或用户产生的上下文修改 |
| Validation Engine | 校验 schema、引用、关系、状态 |
| View Mapping Engine | 把同一份 Context DSL 渲染成不同 View |
| Agent Adapter | 适配不同 Agent、模型或工作流 |
| Event Log | 记录所有人类和 Agent 的操作 |
| Inspector | 展示单个上下文对象的来源、状态、历史和操作 |
| Version History | 支持回滚、对比、审计 |

---

## 15. 产品边界

### 15.1 第一阶段不做什么

不要做：

- 完整 Miro。
- 完整 FigJam。
- 复杂绘图工具。
- 大量图形库。
- 模板市场。
- 多人实时光标。
- 自由画笔。
- 图片编辑。
- 复杂自动排版。
- 通用项目管理系统。
- 通用知识库系统。

这些都会让产品失焦。

### 15.2 第一阶段必须做好什么

必须做好：

- Context DSL 稳定。
- Agent 输出 patch 稳定。
- 用户可以直接编辑上下文。
- Agent 能读回用户修改。
- 上下文对象能被多视图渲染。
- 用户能点选对象继续追问。
- 每次 Agent 回复都能更新上下文。
- 出错时能校验和修复。
- 历史修改可追踪。

### 15.3 第一性原则

不要问：

> 怎么做一个更好的白板？

要问：

> Agent 要怎样才能更稳定地理解人类正在做什么？
>
> 人类要怎样才能更轻松地看懂和纠正 Agent 的理解？
>
> 复杂任务怎样才能从聊天记录变成可持续演化的工作对象？

---

## 16. 关键风险

### 16.1 风险一：概念过大，MVP 失控

「可视化上下文层」听起来很大，容易膨胀成万能工作台。

应对：

- 第一阶段只服务复杂思考型任务。
- 第一版只做 5 类上下文对象。
- 第一版只做 4 种视图。
- 第一版只支持有限 patch ops。
- 不做完整白板。

### 16.2 风险二：用户不理解为什么需要它

普通用户可能会觉得：

> 我直接和 ChatGPT 聊不就行了？

应对：

- 不面向普通轻量问答用户。
- 先服务已经被聊天框折磨的专业用户。
- 用真实任务展示差异，比如产品方案分析、Agent 工作流设计、市场调研整理。
- 让用户 3 分钟内看到「这比聊天框清楚」。

### 16.3 风险三：Agent 输出结构不稳定

Agent 可能不遵守 schema，或者生成错误 patch。

应对：

- 强制 JSON schema。
- patch 先校验再应用。
- 出错时使用 repair prompt。
- 对不稳定 Agent 降级为只读建议。
- MVP 中严格限制对象类型和操作类型。

### 16.4 风险四：变成传统白板竞争

一旦强调画图，就会被放进 Miro、飞书画板、Boardmix、FigJam 的对比里。

应对：

- 产品话术不强调白板。
- 白板只是其中一种 View。
- 核心卖点是 Agent 可读写上下文。
- 强调 context、patch、event、agent run、human correction。

### 16.5 风险五：工程复杂度高

多视图、上下文 schema、patch、Agent 调用、事件日志都可能变复杂。

应对：

- 先从 Card View 开始。
- Canvas View 后置。
- Timeline 先做 Agent Run 简版。
- Table View 只做简单字段映射。
- 不做实时多人协作。
- 不做复杂布局引擎。

---

## 17. 30 天验证计划

### 17.1 验证目标

不要验证「用户喜不喜欢白板」。

要验证：

> 用户是否愿意把真实复杂任务放进 AgentBoard，并认为它比聊天框更适合持续协作。

### 17.2 种子用户

优先找：

- AI 产品经理。
- Agent 开发者。
- 独立开发者。
- AI 咨询顾问。
- 企业 AI 应用负责人。
- 需要做复杂调研和方案推演的创作者。

### 17.3 验证任务

让用户用 AgentBoard 完成这些真实任务：

- 拆一个产品 MVP。
- 分析一个商业机会。
- 设计一个 Agent 工作流。
- 整理一份用户访谈。
- 梳理一个技术架构。
- 对一个方案做风险评审。

### 17.4 核心指标

| 指标 | 目标 |
|---|---|
| 3 分钟 aha | 用户能快速理解「比聊天框清楚」 |
| 二次使用 | 用户第二天愿意继续打开 |
| 真实任务迁移 | 用户愿意放入真实工作内容 |
| 人类编辑率 | 用户会主动修改上下文对象 |
| 点选追问率 | 用户会点某个节点继续问 |
| 付费意愿 | 用户愿意为早期版本付费 |
| 输出复用率 | 用户会导出结果到文档、会议或团队 |

### 17.5 早期收费测试

可以测试：

- ¥99 早鸟一次性体验。
- ¥299/年个人专业版。
- ¥49/月专业版。
- 团队内测 ¥999/团队/月。
- SDK 合作按项目报价。

不要只听用户说喜欢。

要看他是否愿意：

- 用真实工作。
- 第二次回来。
- 改上下文。
- 导出使用。
- 付钱。

---

## 18. 推荐的第一版产品形态

### 18.1 不从「空白白板」开始

不要让用户打开一个空白画布。

空白画布会让用户不知道从哪里开始。

第一版应该从普通聊天开始：

```text
用户输入任务
    ↓
Agent 回答
    ↓
右侧自动生成 Visual Context
```

这样学习成本最低。

### 18.2 初始界面

```text
┌───────────────────┬────────────────────────────┬───────────────────┐
│ Chat              │ Visual Context              │ Inspector          │
│                   │                            │                   │
│ 用户输入           │ Goal / Entity / Risk / Task │ 当前选中对象详情     │
│ Agent 简短回复      │ Card / Canvas / Table       │ 来源 / 状态 / 历史   │
│                   │                            │ 可执行操作          │
└───────────────────┴────────────────────────────┴───────────────────┘
```

### 18.3 用户关键动作

用户可以：

- 正常聊天。
- 点选上下文对象。
- 修改卡片。
- 删除错误理解。
- 标记确认/否定。
- 切换视图。
- 围绕某个对象追问。
- 导出当前上下文。
- 查看 Agent 修改记录。

### 18.4 Agent 关键动作

Agent 可以：

- 新增上下文对象。
- 更新上下文对象。
- 建立关系。
- 标记风险。
- 生成任务。
- 创建视图。
- 总结变化。
- 请求用户确认。
- 根据用户修改继续工作。

---

## 19. 产品愿景

AgentBoard 最终不是一个白板工具。

它更像是：

> **Agent 的上下文操作系统。**

在这个系统里：

- 对话不再只是聊天记录。
- 回答不再只是长文本。
- 文件不再只是附件。
- 工具调用不再只是后台过程。
- Agent 推理不再完全黑箱。
- 用户反馈不再只是继续解释。
- 多 Agent 不再只是互相传长文本。
- 项目上下文不再每次重新开始。

所有工作都沉淀成一份可读、可改、可追踪、可复用的上下文。

这才是 AgentBoard 真正有机会的地方。

---

## 20. 最终判断

新的理解让 AgentBoard 的产品空间变大了。

如果它只是「Agent 白板」，它会被白板品类限制。

如果它是「Agent 可视化上下文层」，它就抓住了下一代 Agent 交互的核心问题：

> **Agent 越强，越不能只靠聊天框。**

聊天框适合发起任务。

但复杂任务需要一个持续演化的上下文对象。

AgentBoard 要做的，就是这个对象的可视化界面和结构化底座。

最小可行路径不是做完整白板，而是做：

> **Chat + Visual Context Panel + Context DSL + Patch Loop**

先让一小群高频使用 Agent 做复杂工作的用户感受到：

> 这不是把回答画得更漂亮。  
> 这是让 Agent 终于有了一张能和人一起工作的桌面。

