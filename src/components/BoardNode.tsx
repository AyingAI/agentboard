import type { BoardNode as BoardNodeType } from '../types/dsl';

interface EditState {
  nodeId: string;
  field: 'title' | 'body';
}

interface BoardNodeProps {
  node: BoardNodeType;
  isSelected: boolean;
  editState: EditState | null;
  onPointerDown: (nodeId: string, event: React.PointerEvent) => void;
  onStartEdit: (nodeId: string, field: 'title' | 'body') => void;
  onCommitEdit: (nodeId: string, field: 'title' | 'body', value: string) => void;
  onCancelEdit: () => void;
  onConnectStart: (nodeId: string, side: 'top' | 'right' | 'bottom' | 'left') => void;
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

export default function BoardNode({
  node,
  isSelected,
  editState,
  onPointerDown,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onConnectStart,
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
      className={`board-node ${node.type} ${tagClasses} ${isSelected ? 'selected' : ''}`}
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
      {isSelected && (
        <div className="connect-handles" aria-hidden="true">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <button
              key={side}
              type="button"
              className={`connect-handle ${side}`}
              title="拖拽到另一个节点创建连线"
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
