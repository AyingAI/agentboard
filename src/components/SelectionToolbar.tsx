import { useRef, useState } from 'react';
import type { BoardGroup, BoardNode, NodeType } from '../types/dsl';
import { useDismissibleLayer } from '../hooks/useDismissibleLayer';

export interface SemanticRoleOption {
  id: string;
  label: string;
  type: NodeType;
  tags: string[];
  style: { fill: string; stroke: string };
}

export const SEMANTIC_ROLES: SemanticRoleOption[] = [
  { id: 'default', label: '普通卡片', type: 'card', tags: [], style: { fill: '#ffffff', stroke: '#8a96a8' } },
  { id: 'concept', label: '💡 概念', type: 'card', tags: ['concept'], style: { fill: '#ffffff', stroke: '#4f74c8' } },
  { id: 'decision', label: '⚖️ 决策', type: 'card', tags: ['decision'], style: { fill: '#f0f8f4', stroke: '#4b9b68' } },
  { id: 'evidence', label: '📌 证据', type: 'card', tags: ['evidence'], style: { fill: '#fffaf0', stroke: '#c9952f' } },
  { id: 'action', label: '🎯 行动', type: 'card', tags: ['action'], style: { fill: '#eef8f9', stroke: '#3b8f9b' } },
  { id: 'risk', label: '⚠️ 风险便签', type: 'note', tags: ['risk'], style: { fill: '#fff4ed', stroke: '#d36b3d' } },
  { id: 'question', label: '❓ 待确认', type: 'note', tags: ['question'], style: { fill: '#f3f7ff', stroke: '#4f74c8' } },
];

interface SelectionToolbarProps {
  nodes: BoardNode[];
  sharedGroup: BoardGroup | null;
  panOffset: { x: number; y: number };
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
  isPending: boolean;
  isAgentConfigured: boolean;
  onAiAction: (prompt: string, label: string, nodeIds: string[]) => void;
  onSetRole: (nodeId: string, role: SemanticRoleOption) => void;
  onToggleGroup: () => void;
  onDeepDive: (nodeId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export default function SelectionToolbar({
  nodes,
  sharedGroup,
  panOffset,
  zoom,
  canvasWidth,
  canvasHeight,
  isPending,
  isAgentConfigured,
  onAiAction,
  onSetRole,
  onToggleGroup,
  onDeepDive,
  onDuplicate,
  onDelete,
}: SelectionToolbarProps) {
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const roleAnchor = useRef<HTMLDivElement>(null);
  useDismissibleLayer({ open: roleMenuOpen, root: roleAnchor, onDismiss: () => setRoleMenuOpen(false) });

  if (!nodes.length) return null;

  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxX = Math.max(...nodes.map(n => n.x + n.width));
  const maxY = Math.max(...nodes.map(n => n.y + n.height));

  const centerX = ((minX + maxX) / 2) * zoom + panOffset.x;
  const screenTop = minY * zoom + panOffset.y;
  const screenBottom = maxY * zoom + panOffset.y;
  const preferredTop = screenTop - 52;
  const belowTop = screenBottom + 12;
  const top = preferredTop >= 8
    ? preferredTop
    : (belowTop + 48 <= canvasHeight - 96 ? belowTop : 10);
  const halfSafe = Math.min(260, Math.max(160, canvasWidth * 0.35));
  const left = canvasWidth > 0
    ? Math.max(halfSafe, Math.min(canvasWidth - halfSafe, centerX))
    : Math.max(180, centerX);

  const ids = nodes.map(n => n.id);
  const single = nodes.length === 1 ? nodes[0] : null;
  const activeRole = single
    ? SEMANTIC_ROLES.find(role => role.tags.length && single.tags?.includes(role.tags[0])) ?? SEMANTIC_ROLES[0]
    : null;

  return (
    <div
      className="selection-toolbar"
      role="toolbar"
      aria-label="选中内容快捷操作"
      style={{ left, top }}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      {single ? (
        <>
          <button
            type="button"
            className="selection-ai-btn"
            disabled={isPending}
            title={isAgentConfigured ? '由 AI 基于此卡片展开细节或补充支撑材料' : '连接 Agent 后可用'}
            onClick={() => onAiAction(
              `请围绕选中卡片「${single.title}」展开细化：补充关键机制、具体例子或可验证的子步骤，并用连线连接到原卡片。保持原有位置附近排布，不要重排整张白板。`,
              `展开细化：${single.title}`,
              ids,
            )}
          >
            ✦ 展开细化
          </button>
          <button
            type="button"
            className="selection-ai-btn"
            disabled={isPending}
            title="从反面挑战假设、识别风险或漏洞"
            onClick={() => onAiAction(
              `请审视选中卡片「${single.title}」的假设与盲点：找出 2–3 个最容易被忽略的风险、反例或前提条件，以暖色风险便签（note，tags: ["risk"]）补充在旁边并连线说明约束关系。`,
              `找风险：${single.title}`,
              ids,
            )}
          >
            ⚡ 找风险
          </button>
          <button
            type="button"
            className="selection-ai-btn"
            disabled={isPending}
            title={single.visual ? '优化当前交互式视觉' : '将卡片转化为可操作的 HTML/SVG/JS 交互可视化'}
            onClick={() => onAiAction(
              single.visual
                ? `请升级选中卡片「${single.title}」的交互式视觉：保留已有用户状态字段，增强参数对比直观性、可视化图表或可操作控件，并保持自包含。`
                : `请将选中卡片「${single.title}」升级为一个可操作的 HTML/SVG/JS 交互式可视化卡片（使用 update_node 更新 visual.html，保留核心结论摘要在 body 中），让用户能通过滑块、选项或步骤切换直观理解并试验其中逻辑。`,
              single.visual ? `升级视觉：${single.title}` : `转为交互视觉：${single.title}`,
              ids,
            )}
          >
            {single.visual ? '✦ 升级视觉' : '📊 交互视觉'}
          </button>
          <span className="selection-toolbar-divider" />
          <div className="selection-role-anchor" ref={roleAnchor}>
            <button
              type="button"
              aria-expanded={roleMenuOpen}
              aria-haspopup="menu"
              onClick={() => setRoleMenuOpen(v => !v)}
              title="切换卡片语义角色与颜色"
            >
              {activeRole?.label ?? '标签'} ▾
            </button>
            {roleMenuOpen ? (
              <div className="selection-role-menu" role="menu">
                {SEMANTIC_ROLES.map(role => (
                  <button
                    key={role.id}
                    type="button"
                    role="menuitem"
                    className={activeRole?.id === role.id ? 'is-active' : ''}
                    onClick={() => {
                      onSetRole(single.id, role);
                      setRoleMenuOpen(false);
                    }}
                  >
                    {role.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="围绕这个节点深挖"
            title="输入具体问题围绕此节点深挖"
            onClick={() => onDeepDive(single.id)}
          >
            深挖
          </button>
        </>
      ) : (
        <>
          <span className="selection-count-badge">已选 {nodes.length} 项</span>
          <button
            type="button"
            className="selection-ai-btn"
            disabled={isPending}
            onClick={() => onAiAction(
              `请对比选中的 ${nodes.length} 个对象（${nodes.map(n => `「${n.title}」`).join('、')}），梳理它们的共同维度、关键差异与取舍条件。建议生成一个可交互的对比矩阵或决策沙盘视觉卡片，并与原卡片连线。`,
              `对比 ${nodes.length} 项差异`,
              ids,
            )}
          >
            ⚖️ 对比差异
          </button>
          <button
            type="button"
            className="selection-ai-btn"
            disabled={isPending}
            onClick={() => onAiAction(
              `请分析选中的 ${nodes.length} 个对象之间的因果、依赖或互补关系，使用 add_edge 为它们建立清晰的连线与关系标签；若发现缺失的关键桥梁节点可一并补充。`,
              `建立关联（${nodes.length} 项）`,
              ids,
            )}
          >
            🔗 建立关联
          </button>
          <button
            type="button"
            className="selection-ai-btn"
            disabled={isPending}
            onClick={() => onAiAction(
              `请将选中的 ${nodes.length} 个对象（${nodes.map(n => `「${n.title}」`).join('、')}）合并提炼成一张结构清晰的核心结论卡片（tags: ["decision"] 或 ["output"]，保留关键依据与可勾选行动清单），并用连线指向它，不要删除原卡片。`,
              `合并提炼（${nodes.length} 项）`,
              ids,
            )}
          >
            📝 合并提炼
          </button>
          <span className="selection-toolbar-divider" />
          <button type="button" onClick={onToggleGroup}>
            {sharedGroup ? '解除编组' : '🗂️ 编为一组'}
          </button>
        </>
      )}
      <button type="button" onClick={onDuplicate} title="复制选中卡片 (⌘D)">
        复制
      </button>
      <button type="button" className="selection-delete-btn" onClick={onDelete} title="删除选中内容 (Delete)">
        删除
      </button>
    </div>
  );
}
