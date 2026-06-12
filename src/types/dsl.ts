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

/** DSL Node types */
export type NodeType = 'card' | 'note';

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

/** Patch operation types */
export type PatchOpType =
  | 'add_node'
  | 'update_node'
  | 'delete_node'
  | 'add_edge'
  | 'delete_edge'
  | 'layout';

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

/** Layout operation - hints for automatic layout */
export interface LayoutOp {
  op: 'layout';
  algorithm?: 'horizontal' | 'vertical' | 'dagre';
}

/** Union of all patch operations */
export type PatchOp =
  | AddNodeOp
  | UpdateNodeOp
  | DeleteNodeOp
  | AddEdgeOp
  | DeleteEdgeOp
  | LayoutOp;

/** Stable patch format produced by Agent (or mock) */
export interface DSLPatch {
  type: 'dsl_patch';
  summary: string;
  ops: PatchOp[];
  questions?: string[];
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
export interface ActivityEntry {
  id: string;
  timestamp: number;
  kind: 'agent_patch' | 'validation_error' | 'system';
  summary: string;
  detail?: string;
}

/** Patch application result */
export interface PatchResult {
  applied: boolean;
  errors: ValidationError[];
  appliedOps: number;
}

export type { BoardEdge as Edge };

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

/** A named board session — each session is one conversation */
export interface BoardSession {
  id: string;
  title: string;
  board: BoardDSL;
  createdAt: number;
  updatedAt: number;
}
