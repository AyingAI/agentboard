import type { BoardDSL, DSLPatch, ValidationError } from '../types/dsl';

interface InspectorPanelProps {
  board: BoardDSL;
  lastPatch: DSLPatch | null;
  validationErrors: ValidationError[];
  onCopy: () => void;
  onClose: () => void;
}

export default function InspectorPanel({
  board,
  lastPatch,
  validationErrors,
  onCopy,
  onClose,
}: InspectorPanelProps) {
  return (
    <aside className="inspector-panel">
      <div className="inspector-header">
        <h1>DSL Inspector</h1>
        <button type="button" onClick={onCopy}>
          复制
        </button>
      </div>

      <section>
        <h2>Validation</h2>
        {validationErrors.length === 0 ? (
          <p className="ok-state">当前 DSL 通过校验</p>
        ) : (
          <ul className="error-list">
            {validationErrors.map((error, index) => (
              <li key={`${error.code}_${index}`}>{error.message}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Last Patch</h2>
        <pre>
          {lastPatch ? JSON.stringify(lastPatch, null, 2) : '尚未运行 patch'}
        </pre>
      </section>

      <section>
        <h2>Board DSL</h2>
        <pre>{JSON.stringify(board, null, 2)}</pre>
      </section>
    </aside>
  );
}
