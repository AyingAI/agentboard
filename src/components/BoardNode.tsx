import type { BoardNode as BoardNodeType } from '../types/dsl';

interface EditState {
  nodeId: string;
  field: 'title' | 'body';
}

interface BoardNodeProps {
  node: BoardNodeType;
  isSelected: boolean;
  isPrimarySelected: boolean;
  isAgentChanged: boolean;
  editState: EditState | null;
  onPointerDown: (nodeId: string, event: React.PointerEvent) => void;
  onStartEdit: (nodeId: string, field: 'title' | 'body') => void;
  onCommitEdit: (nodeId: string, field: 'title' | 'body', value: string) => void;
  onCancelEdit: () => void;
  onConnectStart: (nodeId: string, side: 'top' | 'right' | 'bottom' | 'left') => void;
  onOpenDeepDive: (nodeId: string) => void;
}

const TAG_LABELS: Record<string, string> = {
  concept: 'CONCEPT',
  module: 'MODULE',
  actor: 'ACTOR',
  input: 'INPUT',
  output: 'OUTPUT',
  decision: 'DECISION',
  risk: 'RISK',
  question: 'QUESTION',
  assumption: 'ASSUMPTION',
  metric: 'METRIC',
  evidence: 'EVIDENCE',
  action: 'ACTION',
};

function tagClassName(tag: string) {
  return `tag-${tag.replace(/[^a-z0-9_-]/gi, '').toLowerCase()}`;
}

const CONNECTION_SIDE_LABELS = {
  top: '上方',
  right: '右侧',
  bottom: '下方',
  left: '左侧',
} as const;

export default function BoardNode({
  node,
  isSelected,
  isPrimarySelected,
  isAgentChanged,
  editState,
  onPointerDown,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onConnectStart,
  onOpenDeepDive,
}: BoardNodeProps) {
  const isEditing = editState?.nodeId === node.id;
  const editingField = editState?.field;
  const semanticTag = node.tags?.find((tag) => TAG_LABELS[tag]) ?? null;
  const tagClasses = node.tags?.map(tagClassName).join(' ') ?? '';
  const kicker = semanticTag
    ? TAG_LABELS[semanticTag]
    : node.type === 'note'
      ? 'NOTE'
      : node.createdBy === 'agent'
        ? 'AGENT'
        : 'USER';

  return (
    <article
      className={`board-node ${node.type} ${tagClasses} ${isSelected ? 'selected' : ''} ${isPrimarySelected ? 'primary-selected' : ''} ${isAgentChanged ? 'agent-changed' : ''}`}
      data-node-id={node.id}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        minHeight: node.height,
        background: node.style?.fill,
        borderColor: node.style?.stroke,
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown(node.id, event);
      }}
    >
      <div className="node-kicker">
        {kicker}
      </div>

      {isPrimarySelected && !isEditing ? (
        <button
          type="button"
          className="node-deep-dive-button"
          title="围绕这个节点深挖"
          aria-label="围绕这个节点深挖"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onOpenDeepDive(node.id);
          }}
        >
          深
        </button>
      ) : null}

      {isEditing && editingField === 'title' ? (
        <input
          className="inline-edit title-inline"
          defaultValue={node.title}
          autoFocus
          onBlur={(e) => onCommitEdit(node.id, 'title', e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitEdit(node.id, 'title', e.currentTarget.value);
            if (e.key === 'Escape') onCancelEdit();
          }}
        />
      ) : (
        <h2 onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(node.id, 'title'); }}>
          {node.title}
        </h2>
      )}

      {isEditing && editingField === 'body' ? (
        <textarea
          className="inline-edit body-inline"
          defaultValue={node.body}
          autoFocus
          rows={3}
          onBlur={(e) => onCommitEdit(node.id, 'body', e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancelEdit();
          }}
        />
      ) : (
        <p onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(node.id, 'body'); }}>
          {node.body}
        </p>
      )}

      {/* Connection handles — drag from any side to another node to create an edge */}
      {isPrimarySelected && (
        <div className="connect-handles">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <button
              key={side}
              type="button"
              className={`connect-handle ${side}`}
              title="拖拽到另一个节点创建连线"
              aria-label={`从${CONNECTION_SIDE_LABELS[side]}连接到另一个节点`}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onConnectStart(node.id, side);
              }}
            />
          ))}
        </div>
      )}
    </article>
  );
}
