import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BoardDSL, BoardEditEvent, BoardNode, AgentAction, AgentTaskPolicy, DSLPatch, VisualReference } from './types/dsl';
import { useBoardSessions } from './hooks/useBoardSessions';
import { useAgent } from './hooks/useAgent';
import { useAgentConfig } from './hooks/useAgentConfig';
import { buildNodeDeepDivePrompt } from './agent/deepDive';
import { useDrag } from './hooks/useDrag';
import { useDismissibleLayer } from './hooks/useDismissibleLayer';
import { useBoardPresentation } from './hooks/useBoardPresentation';
import CanvasNavigator from './components/CanvasNavigator';
import SectionNavigator from './components/SectionNavigator';
import { composeMeasuredBoard, hasManagedComposition } from './presentation/composition';
import { arrangeMeasuredBoard } from './presentation/layout';
import { inferSpatialPlan, readSpatialPlan, withSpatialPlan } from './presentation/spatialPlan';
import SemanticMap, { type SemanticMapHandle } from './components/SemanticMap';
import MapNodeDetail from './components/MapNodeDetail';
import { canvasReadingSize } from './presentation/viewport';
import { useCanvasPan } from './hooks/useCanvasPan';
import { useEdgeCreation } from './hooks/useEdgeCreation';
import BoardCanvas, { normalizeEdgeLabel } from './components/BoardCanvas';
import PromptBar from './components/PromptBar';
import ActivityPanel from './components/ActivityPanel';
import AgentConfigPanel from './components/AgentConfig';
import AgentRunOverlay from './components/AgentRunOverlay';
import RunRecovery from './components/RunRecovery';
import { friendlyProvider } from './agent/liveProgress';
import './components/experience.css';
import './components/canvasExperience.css';
import InteractionToast from './components/InteractionToast';
import PatchProposalToast from './components/PatchProposalToast';
import PatchResultToast from './components/PatchResultToast';
import CanvasToolbar from './components/CanvasToolbar';
import ShortcutHelp from './components/ShortcutHelp';
import StorageRecoveryToast from './components/StorageRecoveryToast';
import PatchReview from './components/PatchReview';
import './visuals/visuals.css';
import './components/composer.css';
import './components/semanticMap.css';
import { defaultTaskPolicy } from './agent/taskPolicy';
import { fitBoardViewport } from './engine/viewport';
import { boardExportFilename, createBoardExport, parseBoardImport } from './engine/boardTransfer';
import { recordBoardChange, redoBoardChange, undoBoardChange } from './engine/history';

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
    recovery,
    storageError,
    createSession,
    createSessionFromBoard,
    dismissRecovery,
    switchSession,
    renameSession,
    deleteSession,
    updateActiveBoard,
    updateActiveAgentState,
    updateActiveDraft: setInput,
  } = useBoardSessions();

  const board = activeSession.board;
  const [viewChoice, setViewChoice] = useState<{ sessionId: string; mode: 'structure' | 'content' } | null>(null);
  const [mapDetailId, setMapDetailId] = useState<string | null>(null);
  const mapRef = useRef<SemanticMapHandle>(null);
  const structureView = board.nodes.length > 1 && (viewChoice?.sessionId === activeId ? viewChoice.mode === 'structure'
    : !!readSpatialPlan(board) && !(board.metadata['agentboard.presentation'] as { freePlacement?: boolean } | undefined)?.freePlacement
      && (hasManagedComposition(board) || !(board.metadata['agentboard.presentation'] as { composition?: unknown } | undefined)?.composition));

  // ── Agent config ──
  const { config, setApiKey, setModel, setProvider, setCliId, setBaseUrl, setMaxOutputTokens } = useAgentConfig();
  const isAgentConfigured =
    (config.provider === 'local-cli' && Boolean(config.cliId)) ||
    (config.provider === 'claude' && Boolean(config.apiKey)) ||
    (config.provider === 'openai' && Boolean(config.apiKey));

  // ── Transaction history ──
  const currentBoardRef = useRef(board);
  currentBoardRef.current = board;
  const getBoard = useCallback(() => currentBoardRef.current, []);
  const history = activeSession.history;

  const updateBoardWithHistory = useCallback(
    (nextBoard: BoardDSL) => {
      const current = getBoard();
      if (JSON.stringify(current) === JSON.stringify(nextBoard)) return;
      currentBoardRef.current = nextBoard;
      updateActiveBoard(nextBoard, recordBoardChange(activeSession.history, current));
    },
    [activeSession.history, getBoard, updateActiveBoard],
  );

  // ── Canvas pan (Space + drag / middle button) ──
  const {
    panOffset,
    setPanOffset,
    zoom,
    setViewport,
    zoomAt,
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const selectNodes = useCallback((nodeIds: string[], primaryNodeId: string | null = nodeIds[0] ?? null) => {
    const uniqueNodeIds = Array.from(new Set(nodeIds));
    const primary = primaryNodeId && uniqueNodeIds.includes(primaryNodeId)
      ? primaryNodeId
      : uniqueNodeIds[0] ?? null;
    setSelectedNodeIds(uniqueNodeIds);
    setSelectedNodeId(primary);
  }, []);

  const presentationNotifier = useRef<(patch: DSLPatch, before: BoardDSL) => void>(() => {});
  const agentOptions = useMemo(
    () => ({
      getRecentEditEvents,
      sessionId: activeId,
      onAgentPatchApplied: (patch: DSLPatch, before: BoardDSL) => { clearRecentEditEvents(); presentationNotifier.current(patch, before); },
      initialActivities: activeSession.activities ?? [],
      initialRuns: activeSession.runs ?? {},
      onStateChange: updateActiveAgentState,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // intentionally omit activeSession — only used for the initial value; session
    // switches are handled by the resetState effect below.
    [activeId, clearRecentEditEvents, getRecentEditEvents, updateActiveAgentState],
  );

  const { boardRef, handleNodePointerDown } = useDrag(
    getBoard,
    updateActiveBoard,
    { panOffset, zoom },
    setPanOffset,
    ({ nodeId, from, to, moves }) => {
      const current = getBoard();
      const moveMap = new Map(moves.map((move) => [move.nodeId, move]));
      const beforeMove = {
        ...current,
        nodes: current.nodes.map((node) => {
          const move = moveMap.get(node.id);
          return move ? { ...node, x: move.from.x, y: move.from.y } : node;
        }),
      };
      updateActiveBoard(current, recordBoardChange(activeSession.history, beforeMove));
      recordEditEvent({
        type: 'node_moved',
        nodeId: moves.length === 1 ? nodeId : undefined,
        summary: moves.length === 1 ? `移动节点 ${nodeId}` : `移动 ${moves.length} 个节点`,
        details: { from, to, moves },
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
  } = useEdgeCreation(getBoard, updateBoardWithHistory, boardRef);

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
        selectNodes([]);
        setSelectedEdgeId(edgeId);
      }
    },
    [board.edges, cancelConnection, connectingFrom, finishConnection, recordEditEvent, selectNodes],
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
    pendingPatch,
    appliedPatch,
    activities,
    providerName,
    submitMessage,
    retryRun,
    resumeRun,
    applyPendingPatch,
    rejectPendingPatch,
    undoAppliedPatch,
    dismissAppliedPatch,
    reconcilePresentation,
    cancel,
    addActivity,
    resetState: resetAgentState,
  } = useAgent(getBoard, updateBoardWithHistory, config, agentOptions);

  const presentation = useBoardPresentation({
    sessionId: activeId, getBoard, boardRef, setViewport, reconcile: reconcilePresentation,
    commit: next => { currentBoardRef.current = next; updateActiveBoard(next); },
    commitRepair: updateBoardWithHistory,
    suspendViewport: structureView,
  });
  presentationNotifier.current = (patch, before) => {
    presentation.request(patch, before);
    if (patch.presentation?.plan) setViewChoice({ sessionId: activeId, mode: 'structure' });
    else if (patch.presentation?.layout === 'preserve' || patch.ops.some(op => op.op === 'layout')) setViewChoice({ sessionId: activeId, mode: 'content' });
  };
  const showStructure = structureView && !presentation.isSettling;
  const previousStructureView = useRef(structureView);
  useLayoutEffect(() => {
    if (previousStructureView.current && !structureView) presentation.focus();
    previousStructureView.current = structureView;
  }, [structureView, presentation.focus]);
  function focusCanvas(ids?: string[]) {
    if (showStructure) mapRef.current?.focus(ids ?? []);
    else presentation.focus(ids);
  }

  // Reset in-memory agent state when session switches
  const prevActiveIdRef = useRef(activeId);
  useEffect(() => {
    if (prevActiveIdRef.current === activeId) return;
    prevActiveIdRef.current = activeId;
    resetAgentState(activeSession.activities ?? [], activeSession.runs ?? {});
  }, [activeId, activeSession, resetAgentState]);

  // ── UI state ──
  const input = activeSession.draft ?? '';
  const [visualReference, setVisualReference] = useState<VisualReference | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [taskPolicy, setTaskPolicy] = useState<AgentTaskPolicy>(() => defaultTaskPolicy([]));
  const [isActivityOpen, setActivityOpen] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [edgeEditState, setEdgeEditState] = useState<EdgeEditState | null>(null);
  const [deepDiveNodeId, setDeepDiveNodeId] = useState<string | null>(null);
  const [deepDiveInput, setDeepDiveInput] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [showBoardMenu, setShowBoardMenu] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  useEffect(() => { if (!showBoardMenu) setConfirmDeleteId(null); }, [showBoardMenu]);
  const boardSelectorRef = useRef<HTMLDivElement>(null);
  const boardTriggerRef = useRef<HTMLButtonElement>(null);
  useDismissibleLayer({ open: showBoardMenu, root: boardSelectorRef, onDismiss: () => setShowBoardMenu(false), returnFocus: boardTriggerRef });
  useLayoutEffect(() => {
    if (showBoardMenu) boardSelectorRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true });
  }, [showBoardMenu]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const canUndo = Boolean(history?.past.length);
  const canRedo = Boolean(history?.future.length);
  const runningActivity = useMemo(
    () => activities.find((item) => item.kind === 'run_progress' && item.progressStatus === 'running') ?? null,
    [activities],
  );
  const [dismissedRunId, setDismissedRunId] = useState<string | null>(null);
  const latestRun = activities.find(item => item.kind === 'run_progress');
  const recoverableRun = !isPending && latestRun?.id !== dismissedRunId && (latestRun?.progressStatus === 'failed' || latestRun?.progressStatus === 'cancelled') ? latestRun : null;
  const pendingInteractions = useMemo(
    () => activities.filter((item) => item.kind === 'needs_input' && item.interaction && !item.resolvedDecision),
    [activities],
  );
  const pendingInteraction = pendingInteractions[0] ?? null;

  useEffect(() => {
    setMapDetailId(null);
    setVisualReference(null); setReviewOpen(false);
    selectNodes([]); setSelectedEdgeId(null); setEditState(null); setEdgeEditState(null);
    setDeepDiveNodeId(null); setDeepDiveInput(''); setRecentEditEvents([]);
    visualEditRef.current = null;
  }, [activeId, selectNodes]);
  useEffect(() => {
    if (visualReference && (!board.nodes.some(n => n.id === visualReference.nodeId) || !selectedNodeIds.includes(visualReference.nodeId))) setVisualReference(null);
  }, [board.nodes, selectedNodeIds, visualReference]);

  function updateVisualState(nodeId: string, state: Record<string, unknown>) {
    const current = getBoard();
    const node = current.nodes.find(n => n.id === nodeId);
    if (!node?.visual || JSON.stringify(node.visual.state ?? {}) === JSON.stringify(state)) return;
    const next = { ...current, nodes: current.nodes.map(n => n.id === nodeId ? { ...n, visual: { ...node.visual!, state } } : n) };
    currentBoardRef.current = next;
    // Coalesce rapid slider changes into one undo transaction.
    const previous = visualEditRef.current;
    const coalesce = previous?.nodeId === nodeId && Date.now() - previous.at < 1000;
    updateActiveBoard(next, coalesce ? activeSession.history : recordBoardChange(activeSession.history, current));
    visualEditRef.current = { nodeId, at: Date.now() };
    recordEditEvent({ type: 'node_updated', nodeId, summary: `调整视觉「${node.title}」的交互状态`, details: { visualState: state } });
  }
  const visualEditRef = useRef<{ nodeId: string; at: number } | null>(null);

  function referenceVisual(reference: VisualReference) {
    setVisualReference(reference);
    selectNodes([reference.nodeId]);
    setTaskPolicy(current => ({ ...current, scope: 'selection', selectedNodeIds: [reference.nodeId] }));
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.prompt-bar textarea')?.focus(), 0);
  }

  function discussVisual(nodeId: string, text: string) {
    const node = getBoard().nodes.find(n => n.id === nodeId);
    if (!node) return;
    referenceVisual({ nodeId, label: node.title });
    setInput(current => current.trim() ? `${current}\n\n${text}` : text);
  }

  useEffect(() => {
    setTaskPolicy((current) => {
      if (selectedNodeIds.length === 0) {
        return current.scope === 'board' && current.selectedNodeIds.length === 0
          ? current
          : { ...current, scope: 'board', selectedNodeIds: [] };
      }
      return {
        ...current,
        scope: 'selection', selectedNodeIds,
      };
    });
  }, [selectedNodeIds]);

  function undoLastBoardChange() {
    const result = undoBoardChange(activeSession.history, board);
    if (!result) return;
    updateActiveBoard(result.board, result.history);
    selectNodes([]);
    setSelectedEdgeId(null);
    setEditState(null);
    setEdgeEditState(null);
    setDeepDiveNodeId(null);
    addActivity({
      id: makeActivityId(),
      timestamp: Date.now(),
      kind: 'system',
      summary: '已撤销上一步白板修改',
    });
  }

  function redoLastBoardChange() {
    const result = redoBoardChange(activeSession.history, board);
    if (!result) return;
    updateActiveBoard(result.board, result.history);
    selectNodes([]);
    setSelectedEdgeId(null);
    setEditState(null);
    setEdgeEditState(null);
    setDeepDiveNodeId(null);
    addActivity({
      id: makeActivityId(),
      timestamp: Date.now(),
      kind: 'system',
      summary: '已重做白板修改',
    });
  }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement)?.tagName;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (editState || editingTitle || edgeEditState) return;

      if (event.key === '?') {
        event.preventDefault();
        setShowShortcutHelp(true);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoLastBoardChange();
        else undoLastBoardChange();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoLastBoardChange();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && (selectedNodeIds.length > 0 || selectedEdgeId)) {
        event.preventDefault();
        if (selectedNodeIds.length > 0) deleteSelectedNode();
        if (selectedEdgeId) deleteSelectedEdge();
      }
      if (event.key === 'Escape') {
        selectNodes([]);
        setSelectedEdgeId(null);
        setEditState(null);
        setEdgeEditState(null);
        setDeepDiveNodeId(null);
        setShowConfig(false);
        setShowShortcutHelp(false);
        setShowBoardMenu(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedEdgeId, selectedNodeIds, editState, editingTitle, edgeEditState, activeSession.history, board, selectNodes]);

  // ── Derived ──
  const workspaceClass = [
    'workspace',
    isActivityOpen ? 'activity-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // ── Node operations ──
  function deleteSelectedNode() {
    const nodeIds = selectedNodeIds.length > 0
      ? selectedNodeIds
      : selectedNodeId
        ? [selectedNodeId]
        : [];
    if (nodeIds.length === 0) return;
    const nodeIdSet = new Set(nodeIds);
    const removedNodes = board.nodes.filter((node) => nodeIdSet.has(node.id));
    const connectedEdgeCount = board.edges.filter((edge) => nodeIdSet.has(edge.from) || nodeIdSet.has(edge.to)).length;
    updateBoardWithHistory({
      ...board,
      nodes: board.nodes.filter((n) => !nodeIdSet.has(n.id)),
      edges: board.edges.filter((e) => !nodeIdSet.has(e.from) && !nodeIdSet.has(e.to)),
      groups: board.groups.map((g) => ({
        ...g,
        nodeIds: g.nodeIds.filter((nid) => !nodeIdSet.has(nid)),
      })),
    });
    recordEditEvent({
      type: 'node_deleted',
      nodeId: nodeIds.length === 1 ? nodeIds[0] : undefined,
      summary: nodeIds.length === 1
        ? `删除节点 ${removedNodes[0]?.title || nodeIds[0]}`
        : `删除 ${nodeIds.length} 个节点`,
      details: {
        nodeIds,
        titles: removedNodes.map((node) => node.title),
        connectedEdgeCount,
      },
    });
    selectNodes([]);
    if (deepDiveNodeId && nodeIdSet.has(deepDiveNodeId)) setDeepDiveNodeId(null);
  }

  function deleteSelectedEdge() {
    if (!selectedEdgeId) return;
    const removedEdge = board.edges.find((edge) => edge.id === selectedEdgeId);
    updateBoardWithHistory({
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
    updateBoardWithHistory({
      ...board,
      nodes: board.nodes.map((node) => (node.id === nodeId ? { ...node, ...changes } : node)),
    });
  }

  function startInlineEdit(nodeId: string, field: 'title' | 'body') {
    setDeepDiveNodeId(null);
    setEditState({ nodeId, field });
  }

  function commitInlineEdit(nodeId: string, field: 'title' | 'body', value: string) {
    const trimmed = value.trim();
    const previous = board.nodes.find((node) => node.id === nodeId)?.[field] ?? '';
    if ((field === 'body' || trimmed) && trimmed !== previous) {
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
    selectNodes([]);
    setEditState(null);
    setDeepDiveNodeId(null);
    setEdgeEditState({ edgeId });
  }

  function commitEdgeLabelEdit(edgeId: string, value: string) {
    const normalized = normalizeEdgeLabel(value);
    const edge = board.edges.find((e) => e.id === edgeId);
    const fromLabel = edge?.label ?? '';
    const toLabel = normalized ?? '';

    if (fromLabel !== toLabel) {
      updateBoardWithHistory({
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
    updateBoardWithHistory({
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
    selectNodes([newId], newId);
    setSelectedEdgeId(null);
    setDeepDiveNodeId(null);
    // Auto-enter title edit mode
    setEditState({ nodeId: newId, field: 'title' });
  }

  function createNodeAtViewportCenter() {
    if (showStructure) {
      const current = getBoard();
      const anchor = current.nodes.find(node => node.id === selectedNodeId) ?? current.nodes[0];
      const x = anchor ? anchor.x + anchor.width + 64 : 80;
      let y = anchor?.y ?? 80;
      for (let pass = 0; pass <= current.nodes.length; pass++) {
        const occupied = current.nodes.filter(node => x < node.x + node.width + 32 && x + 272 > node.x && y < node.y + node.height + 32 && y + 132 > node.y);
        if (!occupied.length) break;
        y = Math.max(...occupied.map(node => node.y + node.height + 32));
      }
      setViewChoice({ sessionId: activeId, mode: 'content' });
      handleCanvasDoubleClick(x + 120, y + 25);
      const nodes = getBoard().nodes, id = nodes[nodes.length - 1].id;
      requestAnimationFrame(() => presentation.focus([id]));
      return;
    }
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    handleCanvasDoubleClick(
      (rect.width / 2 - panOffset.x) / zoom,
      (rect.height / 2 - panOffset.y) / zoom,
    );
  }

  function fitBoardToViewport() {
    if (showStructure) { mapRef.current?.fit(); return; }
    const rect = boardRef.current ? canvasReadingSize(boardRef.current) : null;
    if (!rect) return;
    setViewport(fitBoardViewport(presentation.getMeasuredBoard(), rect.width, rect.height, 32));
  }

  function organizeBoard() {
    const next = arrangeMeasuredBoard(getBoard(), presentation.getMeasurements());
    updateBoardWithHistory(next);
    setViewChoice({ sessionId: activeId, mode: 'content' });
    requestAnimationFrame(() => presentation.focus());
  }

  function organizeIntelligently() {
    if (isPending || !board.nodes.length) return;
    if (!isAgentConfigured) {
      const next = withSpatialPlan(getBoard(), inferSpatialPlan(getBoard()), 'local');
      updateBoardWithHistory(composeMeasuredBoard(next, presentation.getMeasurements()));
      setViewChoice({ sessionId: activeId, mode: 'structure' });
      return;
    }
    void submitMessage('请理解当前白板的实际内容，为它设计一个帮助理解的空间结构：识别核心问题、结论、比较对象、证据、风险、步骤与依赖。让并列内容可以直接比较，让支持与质疑靠近对应判断，让流程有清楚方向，避免把所有板块排成一条长列。组合空间关系，不修改任何内容、分组、连线或交互代码。只返回 ops: [] 与 presentation.plan。', '根据内容智能布局', {
      scope: 'board', selectedNodeIds: [], allowExistingEdits: false, allowDelete: false, allowFullBoardLayout: true, layoutOnly: true,
    });
  }

  function executeAction(action: AgentAction, sourceIds: string[] = []) {
    if (isPending) return false;
    if (!isAgentConfigured) { setShowConfig(true); return false; }
    const ids = (action.nodeIds?.length ? action.nodeIds : sourceIds).filter(id => getBoard().nodes.some(node => node.id === id));
    const policy = { ...taskPolicy, scope: ids.length ? 'selection' as const : 'board' as const, selectedNodeIds: ids };
    void submitMessage(action.prompt, action.label, policy);
    return true;
  }

  function zoomCanvas(factor: number) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(zoom * factor, { x: rect.width / 2, y: rect.height / 2 });
  }

  function exportCurrentBoard() {
    const payload = createBoardExport(activeSession);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = boardExportFilename(activeSession.title);
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importBoardFile(file: File) {
    try {
      const imported = parseBoardImport(await file.text());
      createSessionFromBoard(imported.board, imported.title);
      setShowBoardMenu(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '无法导入白板文件。');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  async function openVisualExample() {
    const response = await fetch('/examples/compound-lab.agentboard.json');
    if (!response.ok) throw new Error('示例加载失败，请重试。');
    const imported = parseBoardImport(await response.text());
    createSessionFromBoard(imported.board, '复利实验室 · 交互示例');
  }

  // ── Board title editing ──
  function startTitleEdit() {
    setShowBoardMenu(false);
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

  // ── Agent submit ──
  function handleSubmit() {
    if (isPending) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!isAgentConfigured) {
      setShowConfig(true);
      return;
    }
    const reference = visualReference;
    const message = reference
      ? `${trimmed}\n\n用户引用的视觉细节（作为内容上下文）：${JSON.stringify(reference)}\n请结合该节点完整 visual.html 与当前 visual.state 工作；优先更新已有视觉，保留用户状态。`
      : trimmed;
    submitMessage(message, trimmed, taskPolicy);
    setInput('');
  }

  function openNodeDeepDive(nodeId: string) {
    selectNodes([nodeId], nodeId);
    setSelectedEdgeId(null);
    setEditState(null);
    setEdgeEditState(null);
    setDeepDiveNodeId(nodeId);
    setDeepDiveInput((current) => (deepDiveNodeId === nodeId ? current : ''));
  }

  function closeNodeDeepDive() {
    setDeepDiveNodeId(null);
  }

  function handleDeepDiveSubmit() {
    const trimmed = deepDiveInput.trim();
    if (!trimmed || !deepDiveNodeId || isPending) return;
    if (!isAgentConfigured) {
      setShowConfig(true);
      return;
    }
    const targetNode = board.nodes.find((node) => node.id === deepDiveNodeId);
    if (!targetNode) {
      closeNodeDeepDive();
      return;
    }

    submitMessage(buildNodeDeepDivePrompt(targetNode, trimmed), trimmed, {
      ...taskPolicy,
      scope: 'selection',
      selectedNodeIds: [targetNode.id],
    });
    setDeepDiveInput('');
    setDeepDiveNodeId(null);
  }

  // ── Render ──
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <div className="product-name">AgentBoard</div>

          {/* Board selector */}
          <div className="board-selector" ref={boardSelectorRef}>
            <button
              type="button"
              ref={boardTriggerRef}
              className="board-selector-trigger"
              aria-expanded={showBoardMenu}
              aria-controls="board-switcher"
              aria-haspopup="dialog"
              onKeyDown={event => { if (event.key === 'ArrowDown' && !editingTitle) { event.preventDefault(); setShowBoardMenu(true); } }}
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
              <div className="board-menu" id="board-switcher" role="dialog" aria-label="切换白板" onKeyDown={event => {
                event.stopPropagation();
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const choices = Array.from(boardSelectorRef.current?.querySelectorAll<HTMLElement>('[data-board-choice]') ?? []);
                const index = choices.indexOf(document.activeElement as HTMLElement);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
                choices[next]?.focus();
              }}>
                <div className="board-menu-heading"><span>你的白板</span><span>{sessions.length}</span></div>
                <div className="board-menu-list">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    data-board-choice
                    role="button"
                    tabIndex={0}
                    aria-current={s.id === activeId ? 'true' : undefined}
                    className={`board-menu-item ${s.id === activeId ? 'active' : ''}`}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget || event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      switchSession(s.id);
                      setShowBoardMenu(false);
                    }}
                    onClick={() => {
                      switchSession(s.id);
                      setShowBoardMenu(false);
                    }}
                  >
                    <span className="board-menu-title">{s.title}</span>
                    <span className="board-menu-meta">
                      {s.board.nodes.length} 个节点 ·{' '}
                      {new Date(s.updatedAt).toLocaleDateString('zh-CN')}
                    </span>
                    {sessions.length > 1 && (
                      <button
                        type="button"
                        className={`board-menu-delete${confirmDeleteId === s.id ? ' confirming' : ''}`}
                        title={confirmDeleteId === s.id ? `再次点击删除「${s.title}」，此操作无法撤销` : '删除白板'}
                        aria-label={`${confirmDeleteId === s.id ? '确认删除白板' : '删除白板'} ${s.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirmDeleteId !== s.id) {
                            setConfirmDeleteId(s.id);
                            return;
                          }
                          setConfirmDeleteId(null);
                          deleteSession(s.id);
                          if (sessions.length <= 2) setShowBoardMenu(false);
                          else window.requestAnimationFrame(() => {
                            boardSelectorRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true });
                          });
                        }}
                      >
                        {confirmDeleteId === s.id ? '确认删除' : '✕'}
                      </button>
                    )}
                  </div>
                ))}
                </div>
                <div className="board-menu-transfer">
                  <button type="button" onClick={() => { setShowBoardMenu(false); importInputRef.current?.click(); }}>导入白板</button>
                  <button type="button" onClick={() => { setShowBoardMenu(false); exportCurrentBoard(); }}>导出当前白板</button>
                </div>
              </div>
            )}
          </div>

          <input
            ref={importInputRef}
            className="hidden-input"
            type="file"
            accept=".json,.agentboard.json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBoardFile(file);
            }}
          />

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
            AI · {friendlyProvider(providerName)}
          </span>
          <button
            type="button"
            className="topbar-undo-btn"
            disabled={!canUndo}
            onClick={undoLastBoardChange}
            title="撤销上一步白板修改 (⌘Z / Ctrl+Z)"
          >
            撤销
          </button>
          <button
            type="button"
            className="topbar-redo-btn"
            disabled={!canRedo}
            onClick={redoLastBoardChange}
            title="重做白板修改 (⌘⇧Z / Ctrl+Y)"
          >
            重做
          </button>
          <button
            type="button"
            className={`${isActivityOpen ? 'active' : ''} ${pendingInteractions.length > 0 ? 'needs-attention' : ''}`}
            onClick={() => setActivityOpen((v) => !v)}
            title={pendingInteractions.length > 0 ? `${pendingInteractions.length} 个 Agent 请求等待处理` : '查看 Agent 历史'}
          >
            历史{pendingInteractions.length > 0 ? ` · 待确认 ${pendingInteractions.length}` : activities.length > 0 ? ` (${activities.length})` : ''}
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
          <div className="canvas-header">
          <CanvasToolbar
            zoom={zoom}
            hasContent={board.nodes.length > 0}
            onCreateNode={createNodeAtViewportCenter}
            onZoomIn={() => zoomCanvas(1.2)}
            onZoomOut={() => zoomCanvas(1 / 1.2)}
            onResetView={() => { const rect = boardRef.current?.getBoundingClientRect(); if (rect) zoomAt(1, { x: rect.width / 2, y: rect.height / 2 }); }}
            onFitContent={fitBoardToViewport}
            onReadContent={() => {
              if (showStructure && selectedNodeId) { setMapDetailId(selectedNodeId); return; }
              if (showStructure) { setViewChoice({ sessionId: activeId, mode: 'content' }); return; }
              presentation.focus(selectedNodeIds);
            }}
            onOrganize={organizeIntelligently}
            onOrganizeSpacing={organizeBoard}
            isOrganizing={isPending}
            onOpenShortcuts={() => setShowShortcutHelp(true)}
          />
            {board.nodes.length > 1 ? <div className="canvas-view-toggle" aria-label="白板视图"><button type="button" aria-pressed={structureView} onClick={() => setViewChoice({ sessionId: activeId, mode: 'structure' })}>结构</button><button type="button" aria-pressed={!structureView} onClick={() => { setViewChoice({ sessionId: activeId, mode: 'content' }); requestAnimationFrame(() => presentation.focus()); }}>内容</button></div> : null}
            {board.nodes.length ? <CanvasNavigator board={board} selectedId={selectedNodeId} onFocus={id => { selectNodes([id]); focusCanvas([id]); }} /> : null}
          </div>
          {showStructure ? <SemanticMap ref={mapRef} board={board} boardRef={boardRef} zoom={zoom} panOffset={panOffset} selectedIds={selectedNodeIds}
            isSpaceHeld={isSpaceHeld} isPanning={isPanning} setViewport={setViewport} onPointerDown={handleCanvasPointerDown} onWheel={handleCanvasWheel}
            onDeselect={() => { selectNodes([]); setSelectedEdgeId(null); }} onOpen={id => { selectNodes([id]); setSelectedEdgeId(null); setMapDetailId(id); }} /> : <>
          <SectionNavigator board={board} selectedNodeIds={selectedNodeIds} onFocus={ids => { selectNodes([]); focusCanvas(ids); }} />
          <BoardCanvas
            board={board}
            sessionId={activeId}
            onNodesMeasured={presentation.onNodesMeasured}
            onFocusNodes={ids => { selectNodes([]); presentation.focus(ids); }}
            isSettling={presentation.isSettling}
            selectedNodeId={selectedNodeId}
            selectedNodeIds={selectedNodeIds}
            selectedEdgeId={selectedEdgeId}
            deepDiveNodeId={deepDiveNodeId}
            deepDiveInput={deepDiveInput}
            editState={editState}
            edgeEditState={edgeEditState}
            boardRef={boardRef}
            isSpaceHeld={isSpaceHeld}
            isPanning={isPanning}
            isAgentPending={isPending}
            runningActivity={runningActivity}
            highlightedNodeIds={appliedPatch?.summary.affectedNodeIds ?? []}
            highlightedEdgeIds={appliedPatch?.summary.affectedEdgeIds ?? []}
            isAgentConfigured={isAgentConfigured}
            configuredCliId={config.provider === 'local-cli' ? config.cliId : undefined}
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
              const dragNodeIds = selectedNodeIds.includes(nodeId) ? selectedNodeIds : [nodeId];
              selectNodes(dragNodeIds, nodeId);
              setSelectedEdgeId(null);
              if (deepDiveNodeId && deepDiveNodeId !== nodeId) setDeepDiveNodeId(null);
              handleNodePointerDown(nodeId, event, dragNodeIds);
            }}
            onEdgePointerDown={(edgeId, event) => {
              event.stopPropagation();
              setSelectedEdgeId(edgeId);
              selectNodes([]);
              setEditState(null);
              setDeepDiveNodeId(null);
            }}
            onCanvasPointerDown={handleCanvasPointerDown}
            onCanvasWheel={handleCanvasWheel}
            onDeselectAll={() => {
              selectNodes([]);
              setSelectedEdgeId(null);
              setDeepDiveNodeId(null);
            }}
            onStartEdit={startInlineEdit}
            onCommitEdit={commitInlineEdit}
            onCancelEdit={() => setEditState(null)}
            onCanvasDoubleClick={handleCanvasDoubleClick}
            onSelectNodes={(nodeIds, primaryNodeId) => {
              selectNodes(nodeIds, primaryNodeId);
              setSelectedEdgeId(null);
              if (deepDiveNodeId && !nodeIds.includes(deepDiveNodeId)) setDeepDiveNodeId(null);
            }}
            onConnectStart={startConnection}
            onEdgeLabelDoubleClick={startEdgeLabelEdit}
            onCommitEdgeLabel={commitEdgeLabelEdit}
            onCancelEdgeLabel={cancelEdgeLabelEdit}
            onOpenDeepDive={openNodeDeepDive}
            onVisualStateChange={updateVisualState}
            onVisualReference={referenceVisual}
            onVisualAsk={discussVisual}
            onOpenExample={openVisualExample}
            onCloseDeepDive={closeNodeDeepDive}
            onDeepDiveInputChange={setDeepDiveInput}
            onSubmitDeepDive={handleDeepDiveSubmit}
            onConnectCli={(cliId) => {
              setProvider('local-cli');
              setCliId(cliId);
            }}
            onOpenAgentConfig={() => setShowConfig(true)}
            onChooseStarterTask={(prompt) => {
              setInput(prompt);
              window.requestAnimationFrame(() => {
                document.querySelector<HTMLTextAreaElement>('.prompt-bar textarea')?.focus();
              });
            }}
          />
          </>}
          {recovery ? (
            <StorageRecoveryToast
              message={recovery.message}
              onExport={exportCurrentBoard}
              onDismiss={dismissRecovery}
            />
          ) : null}

          {storageError ? <div className="storage-warning" role="alert"><span>{storageError}</span><button type="button" onClick={exportCurrentBoard}>导出白板</button></div> : null}
          <div className="conversation-dock">
          <PromptBar
            key={activeId}
            feedback={runningActivity ? (
            <AgentRunOverlay
              activity={runningActivity}
              onOpenActivity={() => {
                setActivityOpen(true);
                setExpandedActivityId(runningActivity.id);
              }}
            />
          ) : pendingPatch ? (
            <PatchProposalToast
              proposal={pendingPatch}
              onApply={applyPendingPatch}
              onReview={() => setReviewOpen(true)}
              onReject={rejectPendingPatch}
              onOpenActivity={() => {
                setActivityOpen(true);
                setExpandedActivityId(pendingPatch.activityId);
              }}
            />
          ) : appliedPatch ? (
            <PatchResultToast
              result={appliedPatch}
              onUndo={undoAppliedPatch}
              onDismiss={dismissAppliedPatch}
              onAction={action => executeAction(action, appliedPatch.summary.affectedNodeIds)}
              onLocate={() => presentation.focus(appliedPatch.summary.affectedNodeIds)}
              onOpenActivity={() => {
                setActivityOpen(true);
                setExpandedActivityId(appliedPatch.activityId);
              }}
            />
          ) : pendingInteraction ? (
            <InteractionToast
              activity={pendingInteraction}
              onRespond={(runId, decision, activityId) => {
                resumeRun(runId, decision, activityId);
              }}
              onOpenActivity={() => {
                setActivityOpen(true);
                setExpandedActivityId(pendingInteraction.id);
              }}
            />
          ) : recoverableRun ? <RunRecovery activity={recoverableRun}
            onRetry={() => { if (recoverableRun.runId) void retryRun(recoverableRun.runId); }}
            onDismiss={() => setDismissedRunId(recoverableRun.id)}
            onOpenActivity={() => { setActivityOpen(true); setExpandedActivityId(recoverableRun.id); }} /> : null}
            input={input}
            onInputChange={setInput}
            onSubmit={handleSubmit}
            onCancel={cancel}
            onOpenConfig={() => setShowConfig(true)}
            isPending={isPending}
            isAgentConfigured={isAgentConfigured}
            providerName={providerName}
            selectedNodeIds={selectedNodeIds}
            referencedNodes={selectedNodeIds.map(id => board.nodes.find(n => n.id === id)).filter((n): n is BoardNode => Boolean(n))}
            visualReference={visualReference}
            onClearReference={() => setVisualReference(null)}
            onClearTargets={() => { setVisualReference(null); selectNodes([]); }}
            taskPolicy={taskPolicy}
            onTaskPolicyChange={setTaskPolicy}
          />
          </div>
        </section>

        {isActivityOpen ? (
          <ActivityPanel
            activities={activities}
            expandedId={expandedActivityId}
            onToggleExpand={(id) => setExpandedActivityId(id)}
            onRespondToInteraction={(runId, decision, activityId) => {
              resumeRun(runId, decision, activityId);
            }}
            onAction={action => executeAction(action)}
            isPending={isPending}
            onClose={() => setActivityOpen(false)}
          />
        ) : null}
      </main>
      {showStructure && mapDetailId && board.nodes.some(node => node.id === mapDetailId) ? <MapNodeDetail key={`${activeId}-${mapDetailId}`} node={board.nodes.find(node => node.id === mapDetailId)!}
        onClose={() => setMapDetailId(null)} onStateChange={updateVisualState} onReference={referenceVisual} onAsk={discussVisual}
        onDiscuss={() => { selectNodes([mapDetailId]); setMapDetailId(null); requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.prompt-bar textarea')?.focus()); }}
        onShowOnCanvas={() => { const id = mapDetailId; setMapDetailId(null); setViewChoice({ sessionId: activeId, mode: 'content' }); requestAnimationFrame(() => presentation.focus([id])); }} /> : null}
      {reviewOpen && pendingPatch ? <PatchReview proposal={pendingPatch} onClose={() => setReviewOpen(false)}
        onApply={() => { applyPendingPatch(); setReviewOpen(false); }} /> : null}

      {showShortcutHelp ? <ShortcutHelp onClose={() => setShowShortcutHelp(false)} /> : null}

      {showConfig ? (
        <AgentConfigPanel
          config={config}
          onSetApiKey={setApiKey}
          onSetModel={setModel}
          onSetProvider={setProvider}
          onSetCliId={setCliId}
          onSetBaseUrl={setBaseUrl}
          onSetMaxOutputTokens={setMaxOutputTokens}
          onClose={() => setShowConfig(false)}
        />
      ) : null}
    </div>
  );
}
