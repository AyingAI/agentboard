import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardDSL, BoardNode } from './types/dsl';
import { validateBoard } from './engine/validation';
import { useBoardSessions } from './hooks/useBoardSessions';
import { useBoardState } from './hooks/useBoardState';
import { useAgent } from './hooks/useAgent';
import { useAgentConfig } from './hooks/useAgentConfig';
import { useDrag } from './hooks/useDrag';
import { useCanvasPan } from './hooks/useCanvasPan';
import { useEdgeCreation } from './hooks/useEdgeCreation';
import BoardCanvas from './components/BoardCanvas';
import PromptBar from './components/PromptBar';
import ActivityPanel from './components/ActivityPanel';
import AgentConfigPanel from './components/AgentConfig';

type EditState = {
  nodeId: string;
  field: 'title' | 'body';
};

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function makeActivityId() {
  return `activity_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function makeNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(16).slice(4)}`;
}

function SettingsIcon() {
  return (
    <svg className="settings-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z" />
      <path d="M19.43 13.48c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.05-1.6-1.94-3.36-2.42.97a7.76 7.76 0 0 0-1.7-.98L15.05 4h-3.88l-.37 2.55c-.6.24-1.17.57-1.7.98l-2.42-.97-1.94 3.36 2.05 1.6c-.04.32-.07.65-.07.98s.02.66.07.98l-2.05 1.6 1.94 3.36 2.42-.97c.53.41 1.1.74 1.7.98l.37 2.55h3.88l.37-2.55c.6-.24 1.17-.57 1.7-.98l2.42.97 1.94-3.36-2.05-1.6Z" />
    </svg>
  );
}

export default function App() {
  // ── Board sessions ──
  const {
    sessions,
    activeId,
    activeSession,
    createSession,
    switchSession,
    renameSession,
    deleteSession,
    updateActiveBoard,
    resetBoard: resetActiveBoard,
  } = useBoardSessions();

  const board = activeSession.board;
  const { validationErrors } = useBoardState(board);

  // ── Agent config ──
  const { config, setApiKey, setModel, setProvider, setCliId, setBaseUrl } = useAgentConfig();

  // ── Drag ──
  const getBoard = useCallback(() => board, [board]);
  const { boardRef, handleNodePointerDown } = useDrag(getBoard, updateActiveBoard);

  // ── Canvas pan (Space + drag / middle button) ──
  const { panOffset, isSpaceHeld, isPanning, handleCanvasPointerDown } = useCanvasPan();

  // ── Edge creation ──
  const {
    connectingFrom,
    tempLine,
    startConnection,
    updateConnection,
    finishConnection,
    cancelConnection,
  } = useEdgeCreation(getBoard, updateActiveBoard, boardRef);

  // Handle pointermove on canvas during edge creation
  useEffect(() => {
    if (!connectingFrom) return;
    function onMove(e: PointerEvent) {
      const rect = boardRef.current?.getBoundingClientRect();
      if (rect) {
        updateConnection(e,
          e.clientX - rect.left - panOffset.x,
          e.clientY - rect.top - panOffset.y,
        );
      }
    }
    function onUp() { cancelConnection(); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [connectingFrom, updateConnection, cancelConnection, boardRef, panOffset]);

  // ── Agent ──
  const {
    isPending,
    lastPatch,
    activities,
    providerName,
    submitMessage,
    addActivity,
  } = useAgent(getBoard, updateActiveBoard, config);

  // ── UI state ──
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isActivityOpen, setActivityOpen] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showBoardMenu, setShowBoardMenu] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (editState || editingTitle) return;

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeId) {
        event.preventDefault();
        deleteSelectedNode();
      }
      if (event.key === 'Escape') {
        setSelectedNodeId(null);
        setEditState(null);
        setShowConfig(false);
        setShowBoardMenu(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNodeId, editState, editingTitle]);

  // ── Derived ──
  const workspaceClass = [
    'workspace',
    isActivityOpen ? 'activity-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // ── Node operations ──
  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    updateActiveBoard({
      ...board,
      nodes: board.nodes.filter((n) => n.id !== selectedNodeId),
      edges: board.edges.filter((e) => e.from !== selectedNodeId && e.to !== selectedNodeId),
      groups: board.groups.map((g) => ({
        ...g,
        nodeIds: g.nodeIds.filter((nid) => nid !== selectedNodeId),
      })),
    });
    setSelectedNodeId(null);
  }

  function updateNode(nodeId: string, changes: Partial<BoardNode>) {
    updateActiveBoard({
      ...board,
      nodes: board.nodes.map((node) => (node.id === nodeId ? { ...node, ...changes } : node)),
    });
  }

  function startInlineEdit(nodeId: string, field: 'title' | 'body') {
    setEditState({ nodeId, field });
  }

  function commitInlineEdit(nodeId: string, field: 'title' | 'body', value: string) {
    const trimmed = value.trim();
    if (trimmed) {
      updateNode(nodeId, { [field]: trimmed });
    }
    setEditState(null);
  }

  // ── Canvas: double-click to create new node ──
  function handleCanvasDoubleClick(x: number, y: number) {
    const newId = makeNodeId();
    updateActiveBoard({
      ...board,
      nodes: [
        ...board.nodes,
        {
          id: newId,
          type: 'card',
          x: Math.round(x - 120),
          y: Math.round(y - 25),
          width: 240,
          height: 100,
          title: '新卡片',
          body: '',
          style: { fill: '#ffffff', stroke: '#4f74c8' },
          createdBy: 'user',
        },
      ],
    });
    setSelectedNodeId(newId);
    // Auto-enter title edit mode
    setEditState({ nodeId: newId, field: 'title' });
  }

  // ── Board title editing ──
  function startTitleEdit() {
    setEditingTitle(true);
    setTitleDraft(activeSession.title);
  }

  function commitTitleEdit() {
    const trimmed = titleDraft.trim();
    if (trimmed) {
      renameSession(activeSession.id, trimmed);
    }
    setEditingTitle(false);
  }

  // ── Board operations ──
  function handleReset() {
    resetActiveBoard();
    setSelectedNodeId(null);
    setEditState(null);
    addActivity({
      id: makeActivityId(),
      timestamp: Date.now(),
      kind: 'system',
      summary: '已重置当前白板',
    });
  }

  async function copyDsl() {
    await navigator.clipboard.writeText(JSON.stringify(board, null, 2));
    addActivity({
      id: makeActivityId(),
      timestamp: Date.now(),
      kind: 'system',
      summary: '已复制当前 DSL JSON',
    });
  }

  function handleImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result)) as BoardDSL;
        const errors = validateBoard(imported);
        if (errors.length > 0) {
          addActivity({
            id: makeActivityId(),
            timestamp: Date.now(),
            kind: 'validation_error',
            summary: '导入失败：JSON 未通过 DSL 校验',
            detail: errors.map((e) => e.message).join('\n'),
          });
          return;
        }
        updateActiveBoard(imported);
        setSelectedNodeId(null);
        addActivity({
          id: makeActivityId(),
          timestamp: Date.now(),
          kind: 'system',
          summary: '已导入 DSL JSON',
        });
      } catch (error) {
        addActivity({
          id: makeActivityId(),
          timestamp: Date.now(),
          kind: 'validation_error',
          summary: '导入失败：不是合法 JSON',
          detail: String(error),
        });
      }
    };
    reader.readAsText(file);
  }

  // ── Agent submit ──
  function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed) return;
    submitMessage(trimmed);
    setInput('');
    setActivityOpen(true);
  }

  // ── Render ──
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <div className="product-name">AgentBoard</div>

          {/* Board selector */}
          <div className="board-selector">
            <button
              type="button"
              className="board-selector-trigger"
              onClick={() => setShowBoardMenu((v) => !v)}
            >
              {editingTitle ? (
                <input
                  className="board-title-edit"
                  value={titleDraft}
                  autoFocus
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitTitleEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTitleEdit();
                    if (e.key === 'Escape') setEditingTitle(false);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="current-board-title" onDoubleClick={startTitleEdit}>
                  {activeSession.title}
                </span>
              )}
              <span className="chevron">▾</span>
            </button>

            {showBoardMenu && (
              <div className="board-menu">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`board-menu-item ${s.id === activeId ? 'active' : ''}`}
                    onClick={() => {
                      switchSession(s.id);
                      setShowBoardMenu(false);
                    }}
                  >
                    <span className="board-menu-title">{s.title}</span>
                    <span className="board-menu-meta">
                      {s.board.nodes.length} nodes ·{' '}
                      {new Date(s.updatedAt).toLocaleDateString('zh-CN')}
                    </span>
                    {sessions.length > 1 && (
                      <button
                        type="button"
                        className="board-menu-delete"
                        title="删除白板"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(s.id);
                          if (sessions.length <= 2) setShowBoardMenu(false);
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="new-board-btn ghost small"
            title="新建白板"
            onClick={() => {
              createSession();
              setShowBoardMenu(false);
            }}
          >
            + 新建
          </button>
        </div>

        <div className="topbar-actions">
          <span className="agent-status-pill" title={`当前 AI: ${providerName}`}>
            AI · {providerName}
          </span>
          <button
            type="button"
            className={isActivityOpen ? 'active' : ''}
            onClick={() => setActivityOpen((v) => !v)}
          >
            活动{activities.length > 0 ? ` (${activities.length})` : ''}
          </button>
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={() => setShowConfig(true)}
            title="Agent 设置"
            aria-label="Agent 设置"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <main className={workspaceClass}>
        <section className="canvas-panel">
          <BoardCanvas
            board={board}
            selectedNodeId={selectedNodeId}
            editState={editState}
            boardRef={boardRef}
            isSpaceHeld={isSpaceHeld}
            isPanning={isPanning}
            panOffset={panOffset}
            tempLine={tempLine}
            onPointerDown={(nodeId, event) => {
              // If edge creation is active, finish connection to this node
              if (connectingFrom) {
                finishConnection(nodeId);
                return;
              }
              if (isSpaceHeld) return;
              if (editState?.nodeId === nodeId) return;
              setSelectedNodeId(nodeId);
              handleNodePointerDown(nodeId, event);
            }}
            onCanvasPointerDown={handleCanvasPointerDown}
            onDeselectAll={() => setSelectedNodeId(null)}
            onStartEdit={startInlineEdit}
            onCommitEdit={commitInlineEdit}
            onCancelEdit={() => setEditState(null)}
            onCanvasDoubleClick={handleCanvasDoubleClick}
            onConnectStart={startConnection}
          />

          <PromptBar
            input={input}
            onInputChange={setInput}
            onSubmit={handleSubmit}
            isPending={isPending}
          />
        </section>

        {isActivityOpen ? (
          <ActivityPanel
            activities={activities}
            expandedId={expandedActivityId}
            onToggleExpand={(id) => setExpandedActivityId(id)}
            onClose={() => setActivityOpen(false)}
          />
        ) : null}
      </main>

      {showConfig ? (
        <AgentConfigPanel
          config={config}
          onSetApiKey={setApiKey}
          onSetModel={setModel}
          onSetProvider={setProvider}
          onSetCliId={setCliId}
          onSetBaseUrl={setBaseUrl}
          onClose={() => setShowConfig(false)}
        />
      ) : null}
    </div>
  );
}
