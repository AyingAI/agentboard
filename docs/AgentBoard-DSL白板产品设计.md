# AgentBoard：基于 DSL 的 Agent-native 白板产品设计

## 0. 一句话结论

这个产品值得单独做。

但它不应该定位成“另一个飞书画板 / Miro / FigJam”，而应该定位成：

**Agent 与人类共同使用的结构化沟通界面。**

核心不是让白板功能更多，而是让人、Agent、多个 Agent 都围绕同一份 DSL 状态协作。人看到的是白板和图形，Agent 读到的是结构化 DSL。

---

## 1. 为什么这个方向成立

现在大部分 Agent 产品仍然以聊天框为中心。聊天框的问题是：

- 信息是线性的，复杂关系很难表达。
- 人类改一个点，Agent 经常需要重新理解整段上下文。
- Agent 之间协作时，互相传长文本，状态不透明。
- 用户看到的是一堆回答，而不是一个可持续编辑的工作对象。

白板 + DSL 的价值，是把“对话”升级成“共同操作一个结构化对象”。

理想协作链路：

```text
人类自然语言 / 人类手动画板
        ↓
Agent 理解和规划
        ↓
DSL 状态
        ↓
前端白板渲染
        ↓
人类编辑 / Agent 继续推理 / 多 Agent 协同修改
```

这时，白板不是简单展示层，而是人和 Agent 的共享外部大脑。

---

## 2. 关于“学习飞书画板”：能复用什么，不能复刻什么

### 2.1 不能做的事

不能、也不应该复刻飞书线上画板的私有源码。

那是飞书产品内部实现，不是我们可以直接拿来复制的资产。即使技术上能观察一些行为，也不应该走侵权或灰色路径。

### 2.2 可以充分学习和复用的东西

我们可以学习的是它公开暴露出来的能力形态：

- 图元模型：frame、rect、text、connector、stickyNote、image、svg。
- 布局模型：horizontal、vertical、none、dagre。
- 尺寸模型：fixed、fit-content、fill-container。
- 连线模型：from、to、anchor、arrow、lineShape。
- 渲染链路：DSL -> layout -> image / OpenAPI raw。
- 质量约束：文字不能溢出、节点不能重叠、连线不能引用不存在节点。

这些不是“抄产品”，而是学习一个成熟白板系统已经验证过的抽象边界。

本地可学习的公开资料包括：

- `@larksuite/whiteboard-cli` 的公开 npm 包说明：它明确支持 DSL JSON / Mermaid -> PNG / OpenAPI。
- 本地 `lark-whiteboard` skill 的 schema、layout、connector、style 参考文档。
- 我们实际生成飞书画板时导出的 OpenAPI raw 结构。

对我们有价值的不是照搬飞书，而是确认一个事实：

**白板可以被抽象成结构化 DSL，并且这种 DSL 可以稳定渲染成可视化对象。**

---

## 3. 产品定位

产品暂定名：**AgentBoard**

定位：

**给人和 Agent 使用的 DSL 白板协作工具。**

它不是替代已有 Agent，不是替代飞书画板，也不是替代 Miro。它只做一件事：

**把人和 Agent 的沟通，从长文本聊天变成围绕同一张结构化白板协作。**

### 3.1 用户看到什么

用户看到的是：

- 白板
- 卡片
- 分组
- 连线
- 便签
- Agent 对白板的可视化修改
- 少量自然语言说明

用户不需要看到 DSL，也不需要学习 DSL。

### 3.2 Agent 看到什么

Agent 看到的是：

- 当前 DSL 状态
- 用户自然语言输入
- 用户对白板的编辑事件
- 可执行的操作 schema
- 需要输出的 DSL patch

Agent 不是“生成一张图”，而是“持续维护一份结构化白板状态”。

---

## 4. 核心产品假设

### 假设 1：复杂协作不适合只靠聊天

产品设计、需求分析、流程梳理、架构讨论、多 Agent 协作，都天然包含空间关系和结构关系。

这些场景里，白板比聊天框更适合作为主界面。

### 假设 2：用户不想学 DSL，但 Agent 需要 DSL

DSL 不应该暴露给普通用户。

用户只需要：

- 说话
- 画图
- 拖拽
- 修改文字
- 点选节点继续追问

系统内部负责把这些动作转成 DSL。

### 假设 3：Agent 外接比内置更适合早期产品

我们不需要取代用户已有的 Agent。

更好的方式是：

- 用户可以接入自己的 Agent。
- 用户可以授权自己的模型 API。
- 用户可以选择 Pi agent、OpenAI、Claude、本地模型或企业内部 Agent。
- AgentBoard 只提供白板状态、DSL 协议、事件流和渲染界面。

这样产品不会卷模型能力，而是提升“人机沟通效率”。

---

## 5. 最小可行产品 MVP

第一版不要做万能白板。

MVP 只验证一个核心闭环：

**人说话或画图 -> Agent 更新 DSL -> 前端渲染白板 -> 人继续编辑 -> Agent 读回结构继续协作。**

### 5.1 第一版只支持 4 类图元

| 图元 | 作用 | 是否 MVP 必须 |
|---|---|---|
| card | 表达一个概念、任务、模块、观点 | 必须 |
| group | 表达分组、阶段、模块边界 | 必须 |
| edge | 表达关系、流程、依赖 | 必须 |
| note | 表达解释、风险、补充说明 | 必须 |

暂时不做复杂画笔、图片、表格、多人光标、复杂图形库。

### 5.2 第一版只支持 6 个操作

```json
[
  "add_node",
  "update_node",
  "delete_node",
  "add_edge",
  "delete_edge",
  "layout"
]
```

再多就容易失控。

### 5.3 第一版核心页面

1. 白板主界面
   - 左侧或底部输入自然语言
   - 中间是可编辑白板
   - 右侧是 Agent 活动记录，但不喧宾夺主
   - 选中卡片后在上下左右显示连接点
   - 从任一连接点拖拽到另一个卡片即可创建连线
   - 连线可以被选中，按 Delete / Backspace 删除

2. Agent 配置页
   - 选择 Agent Provider
   - 填 API Key 或 OAuth 授权
   - 配置 system prompt
   - 测试结构化输出能力

3. DSL 调试面板
   - 不进入普通用户默认界面
   - 不在顶栏暴露 `DSL / 复制 / 导出 / 导入`
   - 仅作为开发者调试、内部验收或显式 debug 模式能力
   - 面向开发者和高级用户
   - 展示当前 DSL、patch、校验错误

产品约束：默认用户界面只保留白板、Agent 输入、活动记录和 Agent 设置。DSL、复制 JSON、导入 JSON、导出 JSON 都属于内部调试/开发者能力，不应直接暴露给普通用户，否则会把产品心智从“Agent 白板协作”拉回“JSON 工具”。

---

## 6. DSL 设计草案

### 6.1 文档级结构

```json
{
  "version": "0.1",
  "board": {
    "id": "board_001",
    "title": "产品方案讨论",
    "viewport": { "x": 0, "y": 0, "zoom": 1 }
  },
  "nodes": [],
  "edges": [],
  "groups": [],
  "metadata": {}
}
```

### 6.2 Node

```json
{
  "id": "node_001",
  "type": "card",
  "x": 100,
  "y": 120,
  "width": 240,
  "height": 120,
  "title": "DSL 中间层",
  "body": "把人的想法变成机器可理解的结构",
  "style": {
    "fill": "#ffffff",
    "stroke": "#8569CB"
  },
  "tags": ["concept"],
  "createdBy": "agent"
}
```

### 6.3 Edge

```json
{
  "id": "edge_001",
  "from": "node_human",
  "to": "node_dsl",
  "label": "表达被结构化",
  "type": "arrow",
  "style": {
    "stroke": "#BBBFC4",
    "dash": false
  }
}
```

### 6.4 Group

```json
{
  "id": "group_001",
  "title": "Agent 侧",
  "nodeIds": ["node_003", "node_004"],
  "style": {
    "fill": "#DFF5E5",
    "stroke": "#509863"
  }
}
```

### 6.5 Patch

Agent 不应该每次返回完整 DSL，而应该返回 patch。

```json
{
  "type": "dsl_patch",
  "summary": "我把你的想法整理成三个模块",
  "ops": [
    {
      "op": "add_node",
      "node": {
        "id": "node_dsl",
        "type": "card",
        "title": "DSL 中间层",
        "body": "承接人和 Agent 的共同理解"
      }
    },
    {
      "op": "add_edge",
      "edge": {
        "from": "node_human",
        "to": "node_dsl"
      }
    }
  ]
}
```

这样可以避免 Agent 每次重画整张图，也更容易做撤销、审计和版本历史。

---

## 7. 前端渲染方式

### 7.1 第一版推荐：HTML + SVG

第一版不建议直接上纯 Canvas。

原因：

- HTML/SVG 更容易做文本编辑。
- 更容易做节点选择、拖拽、hover、右键菜单。
- 更容易调试。
- 更符合 DSL 中的结构化图元。
- 对 MVP 的图元数量足够。

可以采用：

- `HTML div` 渲染 card / group / note。
- `SVG` 渲染 edge / arrow。
- `absolute positioning` 做自由白板。
- 后续再引入自动布局。

### 7.2 为什么不从纯 Canvas 起步

Canvas 的性能很好，但第一版会增加很多成本：

- 文本编辑麻烦。
- 命中检测要自己写。
- 选中框、拖拽、缩放、连线锚点都要自己实现。
- 可访问性和复制粘贴不友好。

AgentBoard 第一版的关键不是“绘图性能”，而是“结构化协作闭环”。

### 7.3 可借鉴飞书画板的渲染思想

飞书画板公开 DSL 给了几个重要启发：

- 图元要少而稳定。
- 布局引擎要和 DSL 分离。
- `fit-content`、`fill-container` 这种尺寸语义非常有用。
- 连线必须是顶层对象，不能藏在子节点里。
- 文本溢出、节点重叠、连线引用错误都应该可校验。
- 自动布局和自由定位要同时存在。

这些原则可以直接影响我们自己的 DSL 设计。

---

## 8. Agent 接入策略

### 8.1 不内置单一 Agent

产品不应该强绑定某个模型或 Agent。

更好的方式是做 Agent connector：

| 接入方式 | 说明 |
|---|---|
| API Key | 用户填自己的模型 API Key |
| OAuth | 用户授权已有 Agent 或企业系统 |
| Webhook | 用户自己的 Agent 服务接收 board state 和返回 patch |
| 本地 Agent | 本地模型或本地工作流接入 |

### 8.2 Agent 输入

每次调用 Agent 时，传入：

```json
{
  "board_state": {},
  "recent_events": [],
  "user_message": "帮我把这个产品方案拆成 MVP",
  "selected_nodes": [],
  "allowed_ops": ["add_node", "update_node", "add_edge", "layout"],
  "response_schema": "dsl_patch"
}
```

### 8.3 Agent 输出

Agent 必须返回结构化结果：

```json
{
  "summary": "我把方案拆成了三层：用户表达、DSL 中间层、Agent 行动。",
  "ops": [],
  "questions": []
}
```

前端展示时，默认展示白板变化，`summary` 只作为短提示。

### 8.4 Agent 质量门槛

不是所有 Agent 都适合接进来。

最低要求：

- 能稳定输出 JSON。
- 能遵守 schema。
- 能根据当前 DSL 做局部修改。
- 能解释 patch 意图。
- 出错时能返回可读错误，而不是乱写图。

如果用户外接的 Agent 不满足这些要求，体验会很差。

---

## 9. Agent 与 Agent 使用白板

这个方向很有价值。

多个 Agent 不应该只互相发长文本，而应该围绕同一张 board 操作。

示例：

| Agent | 职责 | 白板行为 |
|---|---|---|
| Product Agent | 梳理用户价值和场景 | 新增用户、痛点、核心流程 |
| Tech Agent | 拆技术架构 | 新增模块、接口、数据流 |
| Risk Agent | 挑问题 | 给节点打风险标签、补充阻塞点 |
| PM Agent | 收敛 MVP | 合并节点、排序、标优先级 |

Agent 之间的沟通物不是一段段聊天记录，而是一组持续演进的结构化对象。

这会带来一个新能力：

**Agent 工作过程可视化。**

用户能看到 Agent 为什么得出结论，而不是只看到最终答案。

---

## 10. 典型使用场景

### 10.1 产品经理梳理需求

用户说：

“我想做一个 AI 穿搭助手，帮我拆 MVP。”

Agent 直接生成：

- 用户场景
- 输入方式
- 核心流程
- 数据依赖
- MVP 边界
- 风险点

用户直接在白板上改节点，Agent 继续收敛。

### 10.2 多 Agent 方案评审

用户给出一个产品想法。

多个 Agent 分别补充：

- 商业可行性
- 技术可行性
- 用户体验风险
- MVP 优先级

最后在同一张白板上形成结论。

### 10.3 技术架构讨论

用户画一个粗糙系统图。

Agent 识别：

- 服务模块
- 数据流
- 外部依赖
- 风险链路
- 缺失模块

然后自动整理成架构图和任务清单。

### 10.4 会议和访谈整理

把访谈记录丢给 Agent。

Agent 输出：

- 主题聚类
- 用户原话
- 深层需求
- 产品假设
- 待验证问题

这些内容用白板结构承载，比长文档更容易复盘。

---

## 11. 技术架构草案

```text
Frontend
  ├─ Board Renderer
  ├─ Drag / Select / Edit
  ├─ SVG Edge Layer
  ├─ DSL Inspector
  └─ Agent Activity Panel

Core
  ├─ DSL Store
  ├─ Patch Engine
  ├─ Validation Engine
  ├─ Layout Engine
  └─ Version History

Agent Layer
  ├─ Provider Adapter
  ├─ Prompt Builder
  ├─ Schema Guard
  ├─ Patch Validator
  └─ Retry / Repair

Storage
  ├─ Board JSON
  ├─ Event Log
  ├─ Agent Runs
  └─ Export Files
```

### 11.1 核心模块

| 模块 | 作用 |
|---|---|
| DSL Store | 保存当前白板结构 |
| Patch Engine | 应用 Agent 或用户编辑产生的 patch |
| Validation Engine | 检查 schema、引用、重叠、文本溢出 |
| Layout Engine | 自动排列节点 |
| Agent Adapter | 适配不同 Agent |
| Renderer | 把 DSL 渲染成用户看到的白板 |

---

## 12. 开发路线

### Phase 1：本地原型

目标：证明闭环成立。

功能：

- 本地 HTML 页面
- 手写 JSON DSL
- 渲染 card / group / edge / note
- 拖拽节点
- 修改文字
- 导出 DSL

不接 Agent。

### Phase 2：接入一个 Agent

目标：证明“自然语言 -> DSL patch -> 白板变化”成立。

功能：

- 输入自然语言
- 调用 Agent
- Agent 返回 patch
- 前端应用 patch
- patch 校验失败时提示修复

### Phase 3：人编辑后 Agent 读回

目标：证明“白板 -> Agent 理解”成立。

功能：

- 用户拖动、改字、增删节点
- 生成 edit events
- Agent 读取 board state + edit events
- Agent 输出下一步建议或重构

### Phase 4：多 Agent

目标：证明 Agent 与 Agent 通过白板协作。

功能：

- 多个 Agent identity
- 每个 patch 标记 createdBy
- Agent activity timeline
- 节点级评论和建议

---

## 13. 最关键的产品取舍

### 13.1 不做复杂绘图能力

不要一开始追求：

- 钢笔工具
- 自由画笔
- 大量图形库
- 图片处理
- 实时多人协作
- 无限模板市场

这些是传统白板的竞争点，不是 AgentBoard 的第一性价值。

### 13.2 要优先做好结构化协作

必须优先做好：

- DSL 稳定
- patch 稳定
- 可撤销
- 可校验
- Agent 能读懂
- 用户能直接编辑
- 前端渲染清晰

### 13.3 不和现有 Agent 抢位置

AgentBoard 不要说“我是你的超级 Agent”。

更好的定位：

**我是你的 Agent 协作界面。你可以把已有 Agent 接进来，让它们用白板和你协作。**

---

## 14. 风险清单

### 风险 1：DSL 设计太复杂

如果 schema 太大，Agent 容易写错，人也难以调试。

应对：

- MVP schema 极简。
- 每次只允许有限 ops。
- 渲染层和 DSL 层分开迭代。

### 风险 2：Agent 输出不稳定

外接 Agent 可能不遵守 schema。

应对：

- 强制 JSON schema 校验。
- patch 失败不直接应用。
- 提供 repair prompt。
- 对低质量 Agent 降级成只读建议。

### 风险 3：用户不理解为什么不用聊天

如果白板变化不够明显，用户会觉得还不如聊天。

应对：

- 每次 Agent 回复都必须产生可见结构变化。
- 文本说明只做辅助。
- 让用户能直接点选节点追问。

### 风险 4：前端编辑复杂度上升

拖拽、缩放、连线、选中、撤销都会逐渐复杂。

应对：

- 第一版只做卡片和简单连线。
- 不做精细画图。
- 先用 HTML/SVG，避免 Canvas 过早复杂化。

### 风险 5：和现有白板工具差异不清

用户可能问：为什么不用飞书画板、Miro、FigJam？

回答：

它们是人用的白板。AgentBoard 是 Agent-native 白板。核心差异是 Agent 能读写 DSL，并持续维护结构。

---

## 15. 最小 Demo 形态

第一版 Demo 可以非常小：

一个页面：

- 中间白板
- 右下角输入框
- DSL 面板仅作为内部调试能力，不作为默认用户入口

用户输入：

“帮我把 AgentBoard 的 MVP 拆成三个模块。”

Agent 返回 patch。

白板出现：

- 人类输入层
- DSL 中间层
- Agent 执行层
- 三者之间的箭头
- 右侧风险便签

用户拖动其中一个节点，改名为“外接 Agent 层”。

再问：

“基于我刚改的图，继续补充技术架构。”

Agent 读取修改后的 DSL，继续添加模块。

只要这个闭环顺，就已经证明产品价值。

---

## 16. 我的最终判断

这个产品可以单独做，而且方向比“AI 白板工具”更准确。

更准确的定义是：

**Agent-native structured canvas。**

中文可以叫：

**Agent 结构化白板。**

它的核心价值不是画图，而是：

1. 人类用自然方式表达。
2. Agent 用结构化方式理解。
3. 前端把结构渲染成白板。
4. 人类继续直接编辑。
5. Agent 读回编辑后的结构继续工作。
6. 多个 Agent 可以围绕同一个结构协作。

如果做得好，它会比聊天框更适合复杂产品思考、需求分析、架构设计和多 Agent 协作。

下一步不应该先做完整产品，而应该做一个极小原型：

**HTML/SVG 白板 + 简化 DSL + 单 Agent patch。**

先证明“人说一句话，白板结构变化；人改白板，Agent 真能理解”。

这个闭环成立，再继续扩展图元、外接 Agent、版本历史和多 Agent 协作。
