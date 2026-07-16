// ── AgentBoard DSL Type Definitions ──

/** Board-level viewport state */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** Board-level document metadata */
export interface BoardMeta {
  id: string;
  title: string;
  viewport: Viewport;
}

/** Node style */
export interface NodeStyle {
  fill?: string;
  stroke?: string;
}

/** Edge style */
export interface EdgeStyle {
  stroke?: string;
  dash?: boolean;
}

/** DSL Node types — single source of truth (array drives the type) */
export const NODE_TYPES = ['card', 'note'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/** Single node on the board */
export interface BoardNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  body: string;
  style?: NodeStyle;
  tags?: string[];
  createdBy?: 'user' | 'agent';
}

/** Visual grouping boundary */
export interface BoardGroup {
  id: string;
  title: string;
  nodeIds: string[];
  style?: NodeStyle;
}

/** Single edge on the board */
export interface BoardEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  type?: 'arrow' | 'line';
  style?: EdgeStyle;
}

/** Top-level DSL document */
export interface BoardDSL {
  version: string;
  board: BoardMeta;
  nodes: BoardNode[];
  edges: BoardEdge[];
  groups: BoardGroup[];
  metadata: Record<string, unknown>;
}

/** Patch operation types — single source of truth (array drives the type) */
export const PATCH_OP_TYPES = [
  'add_node',
  'update_node',
  'delete_node',
  'add_edge',
  'delete_edge',
  'add_group',
  'update_group',
  'delete_group',
  'layout',
] as const;
export type PatchOpType = (typeof PATCH_OP_TYPES)[number];

/** Layout patterns supported by the local layout engine — single source of truth */
export const LAYOUT_ALGORITHMS = [
  'horizontal',
  'vertical',
  'dagre',
  'mindmap',
  'matrix',
  'cluster',
  'timeline',
  'swimlane',
] as const;
export type LayoutAlgorithm = (typeof LAYOUT_ALGORITHMS)[number];

/** Add node operation */
export interface AddNodeOp {
  op: 'add_node';
  node: BoardNode;
}

/** Update node operation - only the fields to change + id */
export interface UpdateNodeOp {
  op: 'update_node';
  nodeId: string;
  changes: Partial<Omit<BoardNode, 'id'>>;
}

/** Delete node operation */
export interface DeleteNodeOp {
  op: 'delete_node';
  nodeId: string;
}

/** Add edge operation */
export interface AddEdgeOp {
  op: 'add_edge';
  edge: BoardEdge;
}

/** Delete edge operation */
export interface DeleteEdgeOp {
  op: 'delete_edge';
  edgeId: string;
}

/** Add group operation */
export interface AddGroupOp {
  op: 'add_group';
  group: BoardGroup;
}

/** Update group operation - only the fields to change + id */
export interface UpdateGroupOp {
  op: 'update_group';
  groupId: string;
  changes: Partial<Omit<BoardGroup, 'id'>>;
}

/** Delete group operation */
export interface DeleteGroupOp {
  op: 'delete_group';
  groupId: string;
}

/** Layout operation - hints for automatic layout */
export interface LayoutOp {
  op: 'layout';
  algorithm?: LayoutAlgorithm;
  /** Default is "changed"; use "all" only for an explicit full-board relayout. */
  scope?: 'changed' | 'all';
}

/** Union of all patch operations */
export type PatchOp =
  | AddNodeOp
  | UpdateNodeOp
  | DeleteNodeOp
  | AddEdgeOp
  | DeleteEdgeOp
  | AddGroupOp
  | UpdateGroupOp
  | DeleteGroupOp
  | LayoutOp;

/** Stable patch format produced by Agent (or mock) */
export interface DSLPatch {
  type: 'dsl_patch';
  summary: string;
  ops: PatchOp[];
  questions?: string[];
}

export interface InteractionOption {
  id: string;
  label: string;
  description?: string;
}

/** Interaction request kinds — single source of truth (array drives the type) */
export const INTERACTION_KINDS = ['choice', 'clarification', 'authorization'] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export interface InteractionRequest {
  type: 'interaction_request';
  runId: string;
  kind: InteractionKind;
  title: string;
  message: string;
  options?: InteractionOption[];
  allowFreeText?: boolean;
}

/** Validation error */
export interface ValidationError {
  code: string;
  message: string;
  /** For patch ops: which op index failed */
  opIndex?: number;
  /** For node/edge: which id */
  refId?: string;
}

/** Activity log entry */
export type ActivityProgressStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type ActivityProgressStepStatus = 'pending' | 'active' | 'done' | 'error';

export interface ActivityProgressStep {
  id: string;
  label: string;
  status: ActivityProgressStepStatus;
  detail?: string;
  timestamp?: number;
}

export interface ActivityEntry {
  id: string;
  timestamp: number;
  kind: 'user_message' | 'agent_patch' | 'validation_error' | 'system' | 'needs_input' | 'run_progress';
  summary: string;
  detail?: string;
  runId?: string;
  startedAt?: number;
  completedAt?: number;
  progressStatus?: ActivityProgressStatus;
  progressSteps?: ActivityProgressStep[];
  interaction?: InteractionRequest;
  resolvedDecision?: {
    optionId?: string;
    message?: string;
  };
  /** Separates user-facing collaboration history from low-level execution diagnostics. */
  channel?: 'collaboration' | 'diagnostic';
}

/** Patch application result */
export interface PatchResult {
  applied: boolean;
  errors: ValidationError[];
  appliedOps: number;
}

export type { BoardEdge as Edge };

// ── Human edit event types ──

/** Kinds of human edits recorded on the board for agent context */
export type BoardEditEventType =
  | 'node_created'
  | 'node_updated'
  | 'node_deleted'
  | 'node_moved'
  | 'edge_created'
  | 'edge_deleted'
  | 'edge_updated'
  | 'board_reset'
  | 'board_imported';

/**
 * A lightweight record of a human edit to the board, captured so the Agent can
 * understand what the user changed since the previous agent call.
 */
export interface BoardEditEvent {
  id: string;
  type: BoardEditEventType;
  timestamp: number;
  /** Affected node, when applicable */
  nodeId?: string;
  /** Affected edge, when applicable */
  edgeId?: string;
  /** Affected group, when applicable */
  groupId?: string;
  /** Short human-readable description of the edit */
  summary: string;
  /** Small structured payload with edit-specific details */
  details?: Record<string, unknown>;
}

// ── Agent configuration types ──

export type AgentProvider = 'local-cli' | 'claude' | 'openai';

export interface AgentConfig {
  provider: AgentProvider;
  apiKey?: string;
  model?: string;
  /** CLI id when provider is 'local-cli' (e.g. 'claude', 'opencode') */
  cliId?: string;
  /** Custom base URL for OpenAI/OpenAI-compatible APIs */
  baseUrl?: string;
}

// ── Board session types ──

export interface AgentTaskPolicy {
  scope: 'board' | 'selection';
  selectedNodeIds: string[];
  allowExistingEdits: boolean;
  allowDelete: boolean;
  allowFullBoardLayout: boolean;
}

/** A single event in a run's history — persisted for resumability across refreshes */
export interface AgentRunEvent {
  type: 'user_message' | 'agent_interaction_request' | 'user_decision' | 'agent_patch';
  timestamp: number;
  payload: unknown;
}

/** A single run's accumulated event context */
export interface RunState {
  id: string;
  originalUserMessage: string;
  events: AgentRunEvent[];
  taskPolicy?: AgentTaskPolicy;
}

export interface BoardHistory {
  past: BoardDSL[];
  future: BoardDSL[];
}

/** A named board session — each session is one conversation */
export interface BoardSession {
  id: string;
  title: string;
  board: BoardDSL;
  /** Agent activity log — persisted so history survives page refresh */
  activities?: ActivityEntry[];
  /** Run context map — persisted so interaction_request resumeRun survives refresh */
  runs?: Record<string, RunState>;
  /** Transaction-level board history, persisted for undo/redo across refreshes. */
  history?: BoardHistory;
  createdAt: number;
  updatedAt: number;
}
