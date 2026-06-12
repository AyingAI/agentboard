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
  onConnectStart: (nodeId: string, x: number, y: number) => void;
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

  return (
    <article
      className={`board-node ${node.type} ${isSelected ? 'selected' : ''}`}
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
        {node.type === 'note' ? 'NOTE' : node.createdBy === 'agent' ? 'AGENT' : 'USER'}
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

      {/* Connection handle — drag to another node to create an edge */}
      {isSelected && (
        <div
          className="connect-handle"
          title="拖拽到另一个节点创建连线"
          onPointerDown={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget.parentElement as HTMLElement)?.getBoundingClientRect();
            if (rect) {
              const cx = rect.left + rect.width / 2;
              const cy = rect.bottom;
              onConnectStart(node.id, cx, cy);
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" fill="#4f74c8" stroke="#fff" strokeWidth="2" />
            <path d="M8 4v8M4 8h8" stroke="#fff" strokeWidth="1.5" />
          </svg>
        </div>
      )}
    </article>
  );
}
