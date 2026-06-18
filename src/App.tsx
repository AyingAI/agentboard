import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardEditEvent, BoardNode } from './types/dsl';
import { useBoardSessions } from './hooks/useBoardSessions';
import { useAgent } from './hooks/useAgent';
import { useAgentConfig } from './hooks/useAgentConfig';
import { useDrag } from './hooks/useDrag';
import { useCanvasPan } from './hooks/useCanvasPan';
import { useEdgeCreation } from './hooks/useEdgeCreation';
import BoardCanvas, { normalizeEdgeLabel } from './components/BoardCanvas';
import PromptBar from './components/PromptBar';
import ActivityPanel from './components/ActivityPanel';
import AgentConfigPanel from './components/AgentConfig';

type EditState = {
  nodeId: string;
  field: 'title' | 'body';
};

type EdgeEditState = {
  edgeId: string;
};

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
    updateActiveAgentState,
    resetBoard: resetActiveBoard,
  } = useBoardSessions();

  const board = activeSession.board;

  // ── Agent config ──
  const { config, setApiKey, setModel, setProvider, setCliId, setBaseUrl } = useAgentConfig();

  // ── Drag ──
  const getBoard = useCallback(() => board, [board]);

  // ── Canvas pan (Space + drag / middle button) ──
  const {
    panOffset,
    setPanOffset,
    zoom,
    isSpaceHeld,
    isPanning,
    handleCanvasPointerDown,
    handleCanvasWheel,
  } = useCanvasPan();

  const [recentEditEvents, setRecentEditEvents] = useState<BoardEditEvent[]>([]);

  const recordEditEvent = useCallback((event: Omit<BoardEditEvent, 'id' | 'timestamp'>) => {
    const nextEvent: BoardEditEvent = {
      id: `edit_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      timestamp: Date.now(),
      ...event,
    };
    setRecentEditEvents((events) => [...events, nextEvent].slice(-30));
  }, []);

  const getRecentEditEvents = useCallback(() => recentEditEvents, [recentEditEvents]);
  const clearRecentEditEvents = useCallback(() => setRecentEditEvents([]), []);
  const agentOptions = useMemo(
    () => ({
      getRecentEditEvents,
      onAgentPatchApplied: clearRecentEditEvents,
      initialActivities: activeSession.activities ?? [],
      initialRuns: activeSession.runs ?? {},
      onStateChange: updateActiveAgentState,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // intentionally omit activeSession — only used for the initial value; session
    // switches are handled by the resetState effect below.
    [clearRecentEditEvents, getRecentEditEvents, updateActiveAgentState],
  );

  const { boardRef, handleNodePointerDown } = useDrag(
    getBoard,
    updateActiveBoard,
    { panOffset, zoom },
    setPanOffset,
    ({ nodeId, from, to }) => {
      recordEditEvent({
        type: 'node_moved',
        nodeId,
        summary: `移动节点 ${nodeId}`,
        details: { from, to },
      });
    },
  );

  // ── Edge creation ──
  const {
    connectingFrom,
    tempLine,
    startConnection,
    updateConnection,
    finishConnection,
    cancelConnection,
  } = useEdgeCreation(getBoard, updateActiveBoard, boardRef);

  const finishConnectionToNode = useCallback(
    (targetNodeId: string | null) => {
      if (!connectingFrom || !targetNodeId) {
        cancelConnection();
        return;
      }

      const fromNodeId = connectingFrom;
      const edgeId = `edge_${fromNodeId}_${targetNodeId}`;
      const shouldCreateEdge =
        fromNodeId !== targetNodeId &&
        !board.edges.some((edge) => edge.from === fromNodeId && edge.to === targetNodeId);

      finishConnection(targetNodeId);
      if (shouldCreateEdge) {
        recordEditEvent({
          type: 'edge_created',
          edgeId,
          summary: `创建连线 ${fromNodeId} -> ${targetNodeId}`,
          details: {
            from: fromNodeId,
            to: targetNodeId,
          },
        });
        setSelectedNodeId(null);
        setSelectedEdgeId(edgeId);
      }
    },
    [board.edges, cancelConnection, connectingFrom, finishConnection, recordEditEvent],
  );

  const findNodeIdAtClientPoint = useCallback((clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    return element?.closest<HTMLElement>('.board-node[data-node-id]')?.dataset.nodeId ?? null;
  }, []);

  // Handle pointermove on canvas during edge creation
  useEffect(() => {
    if (!connectingFrom) return;
    function onMove(e: PointerEvent) {
      const rect = boardRef.current?.getBoundingClientRect();
      if (rect) {
        updateConnection(e,
          (e.clientX - rect.left - panOffset.x) / zoom,
          (e.clientY - rect.top - panOffset.y) / zoom,
        );
      }
    }
    function onUp(e: PointerEvent) {
      finishConnectionToNode(findNodeIdAtClientPoint(e.clientX, e.clientY));
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [connectingFrom, updateConnection, finishConnectionToNode, findNodeIdAtClientPoint, boardRef, panOffset, zoom]);

  // ── Agent ──
  const {
    isPending,
    lastPatch,
    activities,
    providerName,
    submitMessage,
    resumeRun,
    cancel,
    addActivity,
    resetState: resetAgentState,
  } = useAgent(getBoard, updateActiveBoard, config, agentOptions);

  // Reset in-memory agent state when session switches
  const prevActiveIdRef = useRef(activeId);
  useEffect(() => {
    if (prevActiveIdRef.current === activeId) return;
    prevActiveIdRef.current = activeId;
    resetAgentState(activeSession.activities ?? [], activeSession.runs ?? {});
  }, [activeId, activeSession, resetAgentState]);

  // ── UI state ──
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isActivityOpen, setActivityOpen] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [edgeEditState, setEdgeEditState] = useState<EdgeEditState | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showBoardMenu, setShowBoardMenu] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (editState || editingTitle || edgeEditState) return;

      if ((event.key === 'Delete' || event.key === 'Backspace') && (selectedNodeId || selectedEdgeId)) {
        event.preventDefault();
        if (selectedNodeId) deleteSelectedNode();
        if (selectedEdgeId) deleteSelectedEdge();
      }
      if (event.key === 'Escape') {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setEditState(null);
        setEdgeEditState(null);
        setShowConfig(false);
        setShowBoardMenu(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedEdgeId, selectedNodeId, editState, editingTitle, edgeEditState]);

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
    const removedNode = board.nodes.find((node) => node.id === selectedNodeId);
    const connectedEdgeCount = board.edges.filter((edge) => edge.from === selectedNodeId || edge.to === selectedNodeId).length;
    updateActiveBoard({
      ...board,
      nodes: board.nodes.filter((n) => n.id !== selectedNodeId),
      edges: board.edges.filter((e) => e.from !== selectedNodeId && e.to !== selectedNodeId),
      groups: board.groups.map((g) => ({
        ...g,
        nodeIds: g.nodeIds.filter((nid) => nid !== selectedNodeId),
      })),
    });
    recordEditEvent({
      type: 'node_deleted',
      nodeId: selectedNodeId,
      summary: `删除节点 ${removedNode?.title || selectedNodeId}`,
      details: {
        title: removedNode?.title,
        connectedEdgeCount,
      },
    });
    setSelectedNodeId(null);
  }

  function deleteSelectedEdge() {
    if (!selectedEdgeId) return;
    const removedEdge = board.edges.find((edge) => edge.id === selectedEdgeId);
    updateActiveBoard({
      ...board,
      edges: board.edges.filter((edge) => edge.id !== selectedEdgeId),
    });
    recordEditEvent({
      type: 'edge_deleted',
      edgeId: selectedEdgeId,
      summary: `删除连线 ${selectedEdgeId}`,
      details: {
        from: removedEdge?.from,
        to: removedEdge?.to,
      },
    });
    setSelectedEdgeId(null);
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
    const previous = board.nodes.find((node) => node.id === nodeId)?.[field] ?? '';
    if (trimmed && trimmed !== previous) {
      updateNode(nodeId, { [field]: trimmed });
      recordEditEvent({
        type: 'node_updated',
        nodeId,
        summary: `更新节点 ${field === 'title' ? '标题' : '正文'}`,
        details: {
          field,
          from: previous,
          to: trimmed,
        },
      });
    }
    setEditState(null);
  }

  // ── Edge label editing ──
  function startEdgeLabelEdit(edgeId: string) {
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
    setEditState(null);
    setEdgeEditState({ edgeId });
  }

  function commitEdgeLabelEdit(edgeId: string, value: string) {
    const normalized = normalizeEdgeLabel(value);
    const edge = board.edges.find((e) => e.id === edgeId);
    const fromLabel = edge?.label ?? '';
    const toLabel = normalized ?? '';

    if (fromLabel !== toLabel) {
      updateActiveBoard({
        ...board,
        edges: board.edges.map((e) =>
          e.id === edgeId ? { ...e, label: normalized } : e,
        ),
      });
      recordEditEvent({
        type: 'edge_updated',
        edgeId,
        summary: `${fromLabel ? '更新' : '新增'}连线标签: "${toLabel || '(已清除)'}"`,
        details: { fromLabel, toLabel },
      });
    }
    setEdgeEditState(null);
  }

  function cancelEdgeLabelEdit() {
    setEdgeEditState(null);
  }

  // ── Canvas: double-click to create new node ──
  function handleCanvasDoubleClick(x: number, y: number) {
    const newId = makeNodeId();
    const newNode: BoardNode = {
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
    };
    updateActiveBoard({
      ...board,
      nodes: [
        ...board.nodes,
        newNode,
      ],
    });
    recordEditEvent({
      type: 'node_created',
      nodeId: newId,
      summary: '创建新卡片',
      details: {
        title: newNode.title,
        x: newNode.x,
        y: newNode.y,
      },
    });
    setSelectedNodeId(newId);
    setSelectedEdgeId(null);
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
    recordEditEvent({
      type: 'board_reset',
      summary: '重置当前白板',
      details: {
        previousNodeCount: board.nodes.length,
        previousEdgeCount: board.edges.length,
        previousGroupCount: board.groups.length,
      },
    });
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
            selectedEdgeId={selectedEdgeId}
            editState={editState}
            edgeEditState={edgeEditState}
            boardRef={boardRef}
            isSpaceHeld={isSpaceHeld}
            isPanning={isPanning}
            panOffset={panOffset}
            zoom={zoom}
            tempLine={tempLine}
            onPointerDown={(nodeId, event) => {
              // If edge creation is active, finish connection to this node
              if (connectingFrom) {
                finishConnectionToNode(nodeId);
                return;
              }
              if (isSpaceHeld) return;
              if (editState?.nodeId === nodeId) return;
              setSelectedNodeId(nodeId);
              setSelectedEdgeId(null);
              handleNodePointerDown(nodeId, event);
            }}
            onEdgePointerDown={(edgeId, event) => {
              event.stopPropagation();
              setSelectedEdgeId(edgeId);
              setSelectedNodeId(null);
              setEditState(null);
            }}
            onCanvasPointerDown={handleCanvasPointerDown}
            onCanvasWheel={handleCanvasWheel}
            onDeselectAll={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            onStartEdit={startInlineEdit}
            onCommitEdit={commitInlineEdit}
            onCancelEdit={() => setEditState(null)}
            onCanvasDoubleClick={handleCanvasDoubleClick}
            onConnectStart={startConnection}
            onEdgeLabelDoubleClick={startEdgeLabelEdit}
            onCommitEdgeLabel={commitEdgeLabelEdit}
            onCancelEdgeLabel={cancelEdgeLabelEdit}
          />

          <PromptBar
            input={input}
            onInputChange={setInput}
            onSubmit={handleSubmit}
            onCancel={cancel}
            isPending={isPending}
          />
        </section>

        {isActivityOpen ? (
          <ActivityPanel
            activities={activities}
            expandedId={expandedActivityId}
            onToggleExpand={(id) => setExpandedActivityId(id)}
            onRespondToInteraction={(runId, decision, activityId) => {
              resumeRun(runId, decision, activityId);
              setActivityOpen(true);
            }}
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
