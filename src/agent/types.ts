import type { AgentConfig, AgentTaskPolicy, BoardDSL, BoardEditEvent, DSLPatch, InteractionRequest, PatchOpType, AgentRunEvent, RunState } from '../types/dsl';

export type AgentProgressEventType = 'connected' | 'working' | 'tool' | 'output' | 'heartbeat';

export interface AgentProgressEvent {
  type: AgentProgressEventType;
  message: string;
  detail?: string;
  elapsedMs?: number;
  outputChars?: number;
}

/** Input to an agent adapter */
export interface AgentRequest {
  boardState: BoardDSL;
  userMessage: string;
  selectedNodeIds?: string[];
  taskPolicy?: AgentTaskPolicy;
  allowedOps?: PatchOpType[];
  runId?: string;
  runContext?: AgentRunEvent[];
  /** Recent human edits to the board since the last agent call */
  recentEditEvents?: BoardEditEvent[];
  /** Abort signal to cancel an in-flight call (user pressed stop, timeout). */
  signal?: AbortSignal;
  /** User-facing execution events. Never includes hidden reasoning or raw tool inputs. */
  onProgress?: (event: AgentProgressEvent) => void;
}

export type AgentResponse = DSLPatch | InteractionRequest;

/** Structured error from agent call */
export interface AgentError {
  code: 'NETWORK_ERROR' | 'STREAM_ERROR' | 'AUTH_ERROR' | 'RATE_LIMITED' | 'API_ERROR' | 'PARSE_ERROR' | 'TIMEOUT' | 'ABORTED';
  message: string;
  /** Raw response text for debugging parse errors */
  rawText?: string;
  /** Whether retrying may succeed. Defaults inferred from code when omitted. */
  retryable?: boolean;
}

/** Abstract agent adapter — mock and real implementations conform to this */
export interface AgentAdapter {
  readonly name: string;
  generateResponse(request: AgentRequest): Promise<AgentResponse>;
}

// Re-export shared types so callers can import from one place
export type { AgentConfig, AgentRunEvent, RunState };
