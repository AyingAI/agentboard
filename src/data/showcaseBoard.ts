import type { BoardDSL } from '../types/dsl';
import { BRIEF_METADATA_KEY } from '../engine/boardBrief';

export interface StarterPrompt {
  id: string;
  tag: string;
  title: string;
  description: string;
  prompt: string;
}

export const STARTER_PROMPTS: StarterPrompt[] = [
  {
    id: 'compare',
    tag: '决策推演',
    title: '产品方案对比与取舍沙盘',
    description: '把多个方向摆在桌面上，用可调节的偏好权重和风险卡片辅助收敛。',
    prompt: '帮我对比三种独立开发产品的切入方向（垂直效率工具、AI 工作流插件、开发者数据面板）。生成一个包含可调权重滑块的交互式对比沙盘，并附上关键假设与风险便签。',
  },
  {
    id: 'mechanism',
    tag: '交互图解',
    title: '把复杂机制做成可操作演示',
    description: '用可视化模拟器替代长段文字解释，调参数就能看到结果如何变化。',
    prompt: '把浏览器 HTTP 缓存策略（Cache-Control、ETag、304 与强缓存）做成一个可交互的模拟器卡片：让我切换不同响应头和用户刷新操作，实时看懂请求走向与耗时差异。',
  },
  {
    id: 'mvp',
    tag: '行动拆解',
    title: '两周验证一个新想法',
    description: '围绕时间与资源约束，拆解阶段里程碑、关键证据与可执行清单。',
    prompt: '我想用两周时间验证「面向上班族的周末轻量徒步路线规划」是否有真实需求。帮我拆解成目标、核心假设、风险便签和本周可执行验证清单（用 Markdown 复选框列出步骤）。',
  },
  {
    id: 'debate',
    tag: '深度论证',
    title: '正反推演与盲点排查',
    description: '将核心判断放在中间，左侧列支持证据，右侧列反例与制约条件。',
    prompt: '我想评估「中小团队是否应该在初期自建 AI Agent 编排框架」。请按核心判断居中、左侧支持证据、右侧风险与反例、下方行动建议的结构铺开画布。',
  },
];

const SHOWCASE_VISUAL_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 20px;
    background: #f8fafd;
    color: #1f2b3d;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
    font-size: 13px;
    line-height: 1.5;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 16px;
  }
  .eyebrow {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #5b79a6;
    text-transform: uppercase;
  }
  h1 {
    margin: 3px 0 4px;
    font-size: 18px;
    font-weight: 700;
    color: #1c2838;
  }
  .sub {
    margin: 0;
    font-size: 12px;
    color: #6b7b91;
  }
  .presets {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .presets button {
    border: 1px solid #d5e0ef;
    background: #fff;
    color: #4c6484;
    border-radius: 7px;
    padding: 5px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .presets button.active {
    border-color: #4f74c8;
    background: #edf3ff;
    color: #2f57a8;
  }
  .grid {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 14px;
  }
  .panel {
    background: #fff;
    border: 1px solid #e1e8f2;
    border-radius: 12px;
    padding: 14px;
  }
  .ctrl { margin-bottom: 13px; }
  .ctrl:last-child { margin-bottom: 0; }
  .ctrl-head {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #52647d;
    margin-bottom: 5px;
  }
  .ctrl-head strong {
    color: #2d4c82;
    font-variant-numeric: tabular-nums;
  }
  input[type=range] {
    width: 100%;
    accent-color: #4f74c8;
    cursor: pointer;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 12px;
  }
  .kpi {
    padding: 10px 11px;
    border-radius: 9px;
    background: #f6f9fe;
    border: 1px solid #e6eef9;
  }
  .kpi span {
    display: block;
    font-size: 11px;
    color: #70829b;
  }
  .kpi strong {
    display: block;
    margin-top: 2px;
    font-size: 17px;
    color: #1f3352;
    font-variant-numeric: tabular-nums;
  }
  .kpi.highlight strong { color: #2d7a53; }
  svg.chart {
    width: 100%;
    height: 140px;
    display: block;
  }
  .footer {
    margin-top: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 11px;
    color: #74849a;
  }
  .ask-btn {
    border: 1px solid #4f74c8;
    background: #4f74c8;
    color: #fff;
    border-radius: 7px;
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .ask-btn:hover { background: #3e62b5; }
  @media (max-width: 640px) {
    .grid { grid-template-columns: 1fr; }
    .kpis { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="eyebrow">Interactive Pricing Sandbox</div>
      <h1>订阅定价与月收入推演器</h1>
      <p class="sub">拖动滑块测试定价与转化假设，状态会自动保存并可引用细节向 AI 追问</p>
    </div>
    <div class="presets">
      <button type="button" data-preset="low">走量低价</button>
      <button type="button" data-preset="balanced">推荐甜点</button>
      <button type="button" data-preset="pro">高客单专业版</button>
    </div>
  </div>

  <div class="grid">
    <section class="panel" aria-label="参数设置">
      <div class="ctrl">
        <div class="ctrl-head"><span>月订阅单价</span><strong id="price-val">¥49</strong></div>
        <input id="price" type="range" min="19" max="299" step="10" value="49" />
      </div>
      <div class="ctrl">
        <div class="ctrl-head"><span>访客付费转化率</span><strong id="conv-val">4.0%</strong></div>
        <input id="conversion" type="range" min="1" max="12" step="0.5" value="4" />
      </div>
      <div class="ctrl">
        <div class="ctrl-head"><span>月新增自然访客</span><strong id="traffic-val">2,500</strong></div>
        <input id="traffic" type="range" min="500" max="10000" step="250" value="2500" />
      </div>
    </section>

    <section class="panel" aria-label="推演结果">
      <div class="kpis">
        <div class="kpi" data-agentboard-id="new-customers"><span>月新增付费</span><strong id="kpi-users">100 人</strong></div>
        <div class="kpi highlight" data-agentboard-id="month-6-mrr"><span>第 6 个月 MRR</span><strong id="kpi-mrr">¥24,500</strong></div>
        <div class="kpi" data-agentboard-id="target-gap"><span>距 ¥30k 目标</span><strong id="kpi-gap">82%</strong></div>
      </div>
      <svg class="chart" id="curve" viewBox="0 0 420 140" role="img" aria-label="6个月MRR增长曲线"></svg>
      <div class="footer">
        <span id="summary-note">假设月留存 92% · 模拟数据仅供定价假设对比</span>
        <button type="button" class="ask-btn" id="ask-agent">把当前参数带给 AI 诊断 ↗</button>
      </div>
    </section>
  </div>

  <script>
    (() => {
      const bridge = window.agentboard;
      const presets = {
        low: { price: 19, conversion: 6.5, traffic: 3500 },
        balanced: { price: 49, conversion: 4, traffic: 2500 },
        pro: { price: 149, conversion: 2, traffic: 1800 }
      };
      const el = id => document.getElementById(id);
      const priceEl = el('price'), convEl = el('conversion'), trafficEl = el('traffic');
      let current = { price: 49, conversion: 4, traffic: 2500 };

      function read(raw) {
        const s = raw || {};
        return {
          price: Number.isFinite(Number(s.price)) ? Number(s.price) : 49,
          conversion: Number.isFinite(Number(s.conversion)) ? Number(s.conversion) : 4,
          traffic: Number.isFinite(Number(s.traffic)) ? Number(s.traffic) : 2500
        };
      }

      function render(state, persist) {
        current = read(state);
        priceEl.value = String(current.price);
        convEl.value = String(current.conversion);
        trafficEl.value = String(current.traffic);
        el('price-val').textContent = '¥' + current.price;
        el('conv-val').textContent = current.conversion.toFixed(1) + '%';
        el('traffic-val').textContent = current.traffic.toLocaleString('zh-CN');

        const monthlyNew = Math.round(current.traffic * (current.conversion / 100));
        const retention = 0.92;
        const points = [];
        let active = 0;
        for (let m = 1; m <= 6; m++) {
          active = Math.round(active * retention + monthlyNew);
          points.push({ m, mrr: active * current.price });
        }
        const m6 = points[5].mrr;
        el('kpi-users').textContent = monthlyNew + ' 人';
        el('kpi-mrr').textContent = '¥' + m6.toLocaleString('zh-CN');
        el('kpi-gap').textContent = Math.min(999, Math.round((m6 / 30000) * 100)) + '%';

        const maxMrr = Math.max(35000, ...points.map(p => p.mrr * 1.15));
        const x = m => 34 + ((m - 1) / 5) * 364;
        const y = v => 116 - (v / maxMrr) * 94;
        const poly = points.map(p => x(p.m).toFixed(1) + ',' + y(p.mrr).toFixed(1)).join(' ');
        const targetY = y(30000).toFixed(1);
        el('curve').innerHTML =
          '<line x1="34" y1="' + targetY + '" x2="398" y2="' + targetY + '" stroke="#98b4d8" stroke-dasharray="4 4" />' +
          '<text x="398" y="' + (Number(targetY) - 4) + '" text-anchor="end" fill="#6783ab" font-size="10">月收目标 ¥30,000</text>' +
          '<polyline fill="none" stroke="#4f74c8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="' + poly + '" />' +
          points.map(p =>
            '<circle cx="' + x(p.m).toFixed(1) + '" cy="' + y(p.mrr).toFixed(1) + '" r="4" fill="#fff" stroke="#4f74c8" stroke-width="2" />' +
            '<text x="' + x(p.m).toFixed(1) + '" y="134" text-anchor="middle" fill="#8595ab" font-size="10">' + p.m + '月</text>'
          ).join('');

        document.querySelectorAll('[data-preset]').forEach(btn => {
          const p = presets[btn.dataset.preset];
          btn.classList.toggle('active', p.price === current.price && p.conversion === current.conversion && p.traffic === current.traffic);
        });
        if (persist && bridge && typeof bridge.setState === 'function') {
          bridge.setState(current);
        }
      }

      [priceEl, convEl, trafficEl].forEach(input => {
        input.addEventListener('input', () => {
          render({ price: Number(priceEl.value), conversion: Number(convEl.value), traffic: Number(trafficEl.value) }, true);
        });
      });

      document.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', () => render(presets[btn.dataset.preset], true));
      });

      el('ask-agent').addEventListener('click', () => {
        if (bridge && typeof bridge.ask === 'function') {
          bridge.ask('基于当前沙盘参数，评估这个定价档位最大的增长瓶颈与转化率验证方法', current);
        }
      });

      const saved = bridge && typeof bridge.getState === 'function' ? bridge.getState() : {};
      render(saved, false);
      if (bridge && typeof bridge.onStateChange === 'function') {
        bridge.onStateChange(next => render(next, false));
      }
    })();
  </script>
</body>
</html>`;

export function createInteractiveShowcaseBoard(): BoardDSL {
  return {
    version: '0.1',
    board: {
      id: `showcase_${Date.now()}`,
      title: '独立产品定价与增长推演 · 交互示例',
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    nodes: [
      {
        id: 'showcase_sandbox',
        type: 'card',
        x: 80,
        y: 80,
        width: 760,
        height: 180,
        title: 'SaaS 定价与月收入推演沙盘',
        body: '自由拖动左侧滑块对比不同定价策略；你也可以点击「引用细节」选中图中的 KPI 指标向 AI 追问。',
        tags: ['concept'],
        createdBy: 'agent',
        visual: {
          html: SHOWCASE_VISUAL_HTML,
          state: { price: 49, conversion: 4, traffic: 2500 },
          height: 390,
        },
      },
      {
        id: 'showcase_risk',
        type: 'note',
        x: 880,
        y: 80,
        width: 320,
        height: 220,
        title: '核心风险与待验证假设',
        body: '- **低价陷阱**：¥19 看似转化率高，但客服与获客成本容易吞噬利润。\n- **留存假设**：沙盘默认 92% 月留存，需用首月真实复购校验。\n- **待确认**：目标用户更在意省时间还是更低单价？',
        style: { fill: '#fff4ed', stroke: '#d36b3d' },
        tags: ['risk'],
        createdBy: 'agent',
      },
      {
        id: 'showcase_evidence',
        type: 'card',
        x: 880,
        y: 340,
        width: 320,
        height: 180,
        title: '早期用户访谈线索',
        body: '已访谈 4 位潜在付费用户：\n- 3 位表示「只要能替代每周 2 小时手工整理，¥49/月可团队直接报销」。\n- 1 位自由职业者倾向一次性买断。',
        tags: ['evidence'],
        createdBy: 'user',
      },
      {
        id: 'showcase_checklist',
        type: 'card',
        x: 880,
        y: 560,
        width: 320,
        height: 190,
        title: '本周最小验证清单',
        body: '- [x] 完成三档定价页面原型\n- [ ] 向 10 位种子用户发送付费意愿测试链接\n- [ ] 记录实际点击「专业版」与「基础版」的比例\n- [ ] 周五复盘后决定主推档位',
        tags: ['action'],
        createdBy: 'user',
      },
    ],
    edges: [
      { id: 'edge_evidence_sandbox', from: 'showcase_evidence', to: 'showcase_sandbox', label: '支撑假设', type: 'arrow' },
      { id: 'edge_risk_sandbox', from: 'showcase_risk', to: 'showcase_sandbox', label: '约束条件', type: 'line', style: { dash: true } },
      { id: 'edge_sandbox_action', from: 'showcase_sandbox', to: 'showcase_checklist', label: '下一步验证', type: 'arrow' },
    ],
    groups: [
      { id: 'group_sandbox', title: '01 · 交互式推演沙盘', nodeIds: ['showcase_sandbox'] },
      { id: 'group_validation', title: '02 · 证据、风险与行动清单', nodeIds: ['showcase_risk', 'showcase_evidence', 'showcase_checklist'] },
    ],
    metadata: {
      [BRIEF_METADATA_KEY]: {
        goal: '在 6 个月内达到 ¥30,000 月经常性收入（MRR），同时控制支持成本',
        constraints: '团队仅 2 人，优先考虑不需要大量人工售前支持的自助定价方案',
      },
    },
  };
}
