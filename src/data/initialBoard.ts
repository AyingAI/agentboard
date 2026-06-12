import type { BoardDSL } from '../types/dsl';

export const initialBoard: BoardDSL = {
  version: '0.1',
  board: {
    id: 'board_agentboard_mvp',
    title: 'AgentBoard Phase 1 原型',
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  nodes: [
    {
      id: 'node_human_input',
      type: 'card',
      x: 120,
      y: 120,
      width: 230,
      height: 126,
      title: '人类表达',
      body: '用自然语言描述目标，也可以直接拖拽和改字。',
      style: { fill: '#ffffff', stroke: '#4f74c8' },
      tags: ['input'],
      createdBy: 'user',
    },
    {
      id: 'node_dsl_state',
      type: 'card',
      x: 460,
      y: 120,
      width: 250,
      height: 126,
      title: 'DSL 状态',
      body: 'nodes / edges / groups 组成可校验、可持久化的白板状态。',
      style: { fill: '#ffffff', stroke: '#8569cb' },
      tags: ['core'],
      createdBy: 'agent',
    },
    {
      id: 'node_renderer',
      type: 'card',
      x: 810,
      y: 120,
      width: 250,
      height: 126,
      title: '白板渲染',
      body: 'HTML 渲染节点和分组，SVG 渲染连线。',
      style: { fill: '#ffffff', stroke: '#4f9865' },
      tags: ['renderer'],
      createdBy: 'agent',
    },
    {
      id: 'node_phase_note',
      type: 'note',
      x: 460,
      y: 330,
      width: 260,
      height: 128,
      title: 'Phase 1 边界',
      body: '本阶段只验证本地 DSL 白板闭环，不接真实 Agent API。',
      style: { fill: '#fff5d6', stroke: '#d6a935' },
      tags: ['scope'],
      createdBy: 'agent',
    },
  ],
  edges: [
    {
      id: 'edge_input_to_dsl',
      from: 'node_human_input',
      to: 'node_dsl_state',
      label: '结构化',
      type: 'arrow',
      style: { stroke: '#9aa2b1', dash: false },
    },
    {
      id: 'edge_dsl_to_render',
      from: 'node_dsl_state',
      to: 'node_renderer',
      label: '渲染',
      type: 'arrow',
      style: { stroke: '#9aa2b1', dash: false },
    },
  ],
  groups: [
    {
      id: 'group_core_loop',
      title: '人和 Agent 共享同一份结构化对象',
      nodeIds: ['node_human_input', 'node_dsl_state', 'node_renderer'],
      style: { fill: '#f5f7fb', stroke: '#c7cfdd' },
    },
  ],
  metadata: {
    updatedBy: 'system',
  },
};

/** Empty board template for new sessions — user starts from scratch */
export const emptyBoard: BoardDSL = {
  version: '0.1',
  board: {
    id: 'board_empty',
    title: '新白板',
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  nodes: [],
  edges: [],
  groups: [],
  metadata: {},
};
