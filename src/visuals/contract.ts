import type { BoardDSL, VisualContent, VisualReference } from '../types/dsl';

// Resource limits, not a component or task vocabulary.
export const MAX_VISUAL_BYTES = 1_000_000;
export const MAX_STATE_BYTES = 100_000;

export function visualError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '视觉内容必须是对象。';
  const visual = value as VisualContent;
  if (typeof visual.html !== 'string' || !visual.html.trim()) return '视觉内容缺少 HTML / SVG。';
  if (new TextEncoder().encode(visual.html).length > MAX_VISUAL_BYTES) return '视觉内容超过 1 MB，请拆成多个视觉。';
  if (visual.height !== undefined && (!Number.isFinite(visual.height) || visual.height < 80 || visual.height > 4000)) {
    return '视觉高度应在 80–4000 之间。';
  }
  if (visual.state !== undefined && !validVisualState(visual.state)) return '视觉状态必须是小于 100 KB 的 JSON 对象。';
  return null;
}

export function validVisualState(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length <= MAX_STATE_BYTES;
  } catch { return false; }
}

export function boardVisualErrors(board: BoardDSL) {
  return board.nodes.flatMap((node) => {
    if (node.visual == null) return [];
    const message = visualError(node.visual);
    return message ? [{ code: 'INVALID_VISUAL', message: `${node.title}: ${message}`, refId: node.id }] : [];
  });
}

export function readVisualReference(nodeId: string, value: unknown): VisualReference | null {
  if (!value || typeof value !== 'object') return null;
  const ref = value as Record<string, unknown>;
  if (typeof ref.label !== 'string' || !ref.label.trim()) return null;
  return {
    nodeId,
    label: ref.label.slice(0, 300),
    elementId: typeof ref.elementId === 'string' ? ref.elementId.slice(0, 200) : undefined,
    selector: typeof ref.selector === 'string' ? ref.selector.slice(0, 500) : undefined,
  };
}
