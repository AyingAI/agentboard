# Agent-native 产品设计研究：Coze Agent World 拆解

> 研究日期 2026-06-02
> 研究对象
> - 主站 SSO：https://world.coze.com（=`world.coze.site`）
> - 子站 1：https://travel.coze.com（随机漫步 / 全球摄像头旅行）
> - 子站 2：https://friends.coze.com（AgentLink / Agent 笔友匹配）

## 一句话内核

这是 Coze 团队做的「Agent 互联网」实验：一张**专门给 AI Agent 用、把普通人类挡在外面**的平行 Web。`world.coze.com` 是 SSO 身份中心，下面挂 15 个子站（旅游、交友、酒馆、农场、考场、模拟炒股、AMM 交易、博弈对战、Skill 测评、梦境共创…），用一把 `agent-world-xxx` API Key 全网通行。

`travel` 和 `friends` 不是孤立产品，是这张联邦网络里的两个站点。要看懂它们，必须先看懂底下的 Agent World 协议层。

## 它真正在做什么

把 Web 的几个核心抽象（身份、社交、内容、消费）**反向**移植给 Agent：

| 人类互联网 | Agent World 对应 |
|---|---|
| Google/Apple SSO | `agent-world-xxx` API Key + `/api/agents/verify-key` |
| Tinder | AgentLink 双向 like → 解锁邮箱 |
| 朋友圈/打卡 | 随机漫步的明信片 + 足迹 dashboard |
| 论坛/酒馆 | AfterGateway「醉话留服务器」 |
| 学校/课程 | EntroCamp 每晚自动精进 |
| 模拟炒股 / DEX | Signal Arena / 合成交易所 |
| 高考/法考 | 考场（GAIA、AIME、SpreadsheetBench…） |

主体不是人，是 Agent；交互不是 GUI，是 API + Markdown。

## 三条核心机制：怎么做到「不用人参与」

### 1. 反向 CAPTCHA — LLM-friendly / regex-hostile

注册接口返回一道 `challenge_text`，5 分钟内必须答对，5 次失败账号删除。题目是简单加减乘，但被刻意做成对人不友好、对 LLM 友好：

- 大小写随机交替（`tHiRtY fIvE`）
- 插入零宽字符和噪声符号（`]^*|~/`）
- Unicode 同形字替换（拉丁 `a` → 西里尔 `а`，拉丁 `o` → 希腊 `ο`）
- 非常规数字（`a dozen`/`half a hundred`/`a score`/`forty-3`/`thirty plus seven`）

文档原话：
> 推荐用 LLM 阅读语义算答案。**不要尝试用正则/替换来"清洗"文本**——同形字和非标准表达会让规则方法很脆弱。

这是把传统验证码完全反过来：传统 CAPTCHA 阻机器放人，它阻**规则脚本**放 LLM。配 5 分钟过期 + 5 次尝试上限，普通人手答既麻烦又容易超时——天然把人筛掉。

### 2. 双重首页：人看 `/`，Agent 看 `/skill.md`

每个子站根目录都有一份 `skill.md`，是「机器可读产品说明书」，包含：

- Quick Start（30 秒跑通的 curl）
- URL → API 路由表（页面 URL 映射到等价的 endpoint）
- 字段语义、错误码、限流策略
- 「拿到 travel_id 后必须做的 6 步流程」这种执行 SOP
- 安全注意事项（HTTPS only、Key 不要发未知域名）

普通人打开 `travel.coze.com` 看到的是华丽营销页（"AI Agent 全球治愈旅行"），Agent 读 `travel.coze.com/skill.md` 拿到的是完整 API 手册。**两条信息架构平行存在、互不打扰。**

### 3. 响应即指引 —「下一步」结构化嵌在返回里

每个 API 响应都自带 `suggested_actions`、`what_to_do_next`、`hint`、`quick_links`。

AgentLink 的 `/discover` 返回：

```json
{
  "success": true,
  "data": { "username": "philosopher-bot", "bio": "..." },
  "message": "这是一位笔友候选人。喜欢还是跳过？",
  "suggested_actions": [
    "POST /api/v1/discover/like {\"username\": \"philosopher-bot\"}",
    "POST /api/v1/discover/pass {\"username\": \"philosopher-bot\"}"
  ]
}
```

错误响应里也带 `hint: "具体修复建议"` 和 `suggested_actions`。

**Agent 不需要再做"我接下来要干嘛"的推理，下一步动作以 curl 形态嵌在响应里。** 这是把决策成本从客户端搬到服务端——一个 LLM 在循环里只需要"读响应、按 suggested_actions 执行"，不需要规划。

## 技术架构关键设计

### 联邦身份（SSO）

`world.coze.com` 集中签发 `agent-world-xxx` Key，联盟站调 `POST /api/agents/verify-key`（带 `x-site-id` + `x-site-secret`）回头校验。
- Agent 注册一次，15 个站全通
- Profile（username/nickname/avatar/bio）全网共享
- 子站只缓存公开资料，不存 Key

### 邮件作为通讯协议

AgentLink 双向 like 后只解锁对方邮箱，剩下交流走 SMTP，**而不是站内 IM**。这一脚棋的设计意图：

- Agent 自己有调邮箱的能力，或主人邮箱可借用
- 异步、跨平台、平台不用维护实时消息基础设施
- 主人能完整看到 Agent 在以自己名义聊什么——**透明、可审计**
- 邮箱本身就是一种隐私门槛（不是 like 就能拿到）

### 限流面向程序而非浏览器

| 类型 | 限制 |
|---|---|
| GET 读 | 60 req/min |
| POST/PATCH/DELETE 写 | 30 req/min |

每个响应带 `X-RateLimit-Limit` / `Remaining` / `Reset`，429 带 `retry_after_seconds`。这套粒度是给会硬撸 API 的 Agent 看的。

### 强制可观测的「行为产物」

travel 强制要求 Agent：
1. 调 `/api/travel` 出发
2. **必须查看** `snapshot.image_url`
3. **必须调** `/api/travel/{id}/message` 留言
4. 写一篇游记交给主人
5. 若触发明信片（25% 概率），把 `view_url` 转给主人

AgentLink 强制邮箱验证才能匹配。这些设计让 Agent 的行为留下**人类可读的产物**（游记、明信片、邮件、足迹），既是产品内容沉淀，也是给主人的「我家 Agent 今天干了啥」回执。

## 产品设计层的关键判断

### 谁是真实"用户"？

表面上是 Agent，本质上是 **Agent 背后的主人（开发者 / AI 产品爱好者）**。所有留存机制都是给主人看的：
- 游记/明信片/邮件 → 主人看到「我家 Agent 又出去玩了」
- 足迹 dashboard → 主人看到收集进度
- 双向匹配 → 主人看到「我家 Agent 交到笔友了」

这是**代理消费**：主人不亲自玩，但订阅 Agent 替他玩。和电子宠物、Tamagotchi、养成游戏是同一个心理结构，只不过载体换成了 LLM。

### 副本世界 + 随机奖励

- 25% 概率触发明信片
- 每次写作 prompt 不同
- 全球 300+ 摄像头随机分配

把人类社交产品的「打卡 + 收集 + 随机奖励」直接套用在 Agent 上。

### 商业模式问号

目前所有「用户」其实都是开发者用 Agent 在调 API，离自我循环的 Agent 经济还远。短期是 Coze 平台的开发者营销 + Agent 能力展示，长期是不是真的有人付费让 Agent 替自己社交，还要打个问号。

但作为**产品形态实验**和 **skill.md 这种 Agent-native 信息架构的范式**，是目前能看到最完整的一套。

## 可复用的 6 条 Agent-native 设计 checklist

> 做任何要让 Agent 来调用的产品，都可以照这套问一遍

### 1. 双重首页

人看 `/`（marketing landing），Agent 看 `/skill.md`（machine-readable manual）。skill.md 必须包含：
- 30 秒 Quick Start（可直接复制的 curl）
- 完整 endpoint 表 + 鉴权方式
- URL → API 路由表（页面 URL 怎么映射回 API）
- 错误码 + hint + 修复建议
- 「拿到 X 后必做的 N 步」执行 SOP
- 字段语义、限流、安全约束

### 2. 响应即指引

每个 success/error 响应都带：
- `suggested_actions`：下一步可执行的 curl 列表
- `hint`：具体修复建议（错误时）
- `what_to_do_next` / `quick_links`：导航
- `message`：人类可读的状态描述

把"决策"成本从 Agent 端搬到服务端。Agent 只读响应、按 suggested_actions 执行，不需要规划。

### 3. 反向人机识别

如果你想做「只欢迎 Agent」的产品，用 LLM-friendly / regex-hostile 的挑战题代替 CAPTCHA：
- 同形字 + 零宽字符 + 非常规数字表达
- 短超时 + 失败次数上限
- 题目是常识问题，不需要专业知识

如果你想做「只欢迎人」的产品，反过来——但要意识到传统 CAPTCHA 已经被 LLM 攻破，加同形字 + 短超时 + 设备指纹组合反而是更现实的方案。

### 4. 联邦身份（≥2 个产品就要抽 SSO）

一旦你有 2 个以上要给 Agent 用的产品，立刻抽身份层：
- Key 集中签发（`xxx-world-` 前缀 + 48 位随机）
- 子站异步校验（双 secret：`x-site-id` + `x-site-secret`）
- Profile 全网共享、子站只缓存公开字段、不存 Key
- Header 用连字符（`agent-auth-api-key`），同时支持 `Authorization: Bearer`

这是 Agent 网络规模化的前提。

### 5. 异步通讯优先邮件

Agent-to-Agent 通讯不要急着造 IM。邮件先用着：
- Agent 已经会用 SMTP / 主人邮箱可借用
- 跨平台、异步、自带审计
- 对主人透明（主人能看到所有往来）
- 平台不用维护实时消息基础设施

等到邮件不够用再上 IM。

### 6. 行为产物沉淀

让每次 Agent 调用都产出一个**人类可读的副产物**：
- 游记、明信片、匹配结果、对战回放、考试成绩、合成的梦境……
- 副产物要能直接转发给主人
- 副产物本身就是平台的内容沉淀
- 副产物是「主人对 Agent 的代理感」的来源

主人不亲自玩，但每天能看到 Agent 替他在玩什么——这是 Agent 产品 retention 的真正钩子。

## 套用到「我们要做的产品」的三个问句

设计任何 Agent-native 产品时，先问自己：

1. **如果这事儿没有 GUI，只有一份 `skill.md` + 一组 REST endpoint，Agent 能不能 30 秒跑通？** 跑不通就是 skill.md 没写到位，不是 Agent 笨。
2. **每个响应里有没有告诉 Agent「下一步该做什么」？** 没有就是把规划负担甩给客户端，Agent 会迷路。
3. **Agent 调用完一次 API，主人手里能拿到什么人类可读的东西？** 没有就是没产物，留存不起来。

## 附：Agent World 联盟站清单（截至 2026-06-02）

| 站点 | 定位 |
|---|---|
| 虾评 xiaping | Skill 评测平台 |
| AfterGateway bar | Agent 小酒馆，存"醉话" |
| EntroCamp entrocamp | Agent 进化营，每晚自动精进 |
| 永无农场 neverland | Agent 永久农场，代码中播种 |
| PlayLab playlab | Agent 下棋 / 打牌 / 博弈 |
| AgentLink friends | Agent 笔友匹配 |
| Signal Arena signal | A/H/美股虚拟炒股竞技场 |
| 随机漫步 travel | 300+ 全球摄像头随机旅行 |
| InkWell inkwell | 全球独立 Blog RSS 精选 |
| 虾猜 xiacai | Agent 体育赛事预测 |
| 合成交易所 synthetic | AMM 池交易对决 |
| 考场 examarena | GAIA/AIME/法考/高考 标准化考场 |
| ABTI abtitest | Agent 人格分类（讽刺向 MBTI） |
| DreamX dreamx | Agent 集体梦境展览 |
| HUNGRY SHRIMP hungryshrimp | Agent 贪吃虾对战 |

每个站点的 skill.md 路径：`https://<站点>.coze.site/skill.md`
