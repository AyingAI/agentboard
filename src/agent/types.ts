import type { AgentConfig, BoardDSL, DSLPatch, PatchOpType } from '../types/dsl';

/** Input to an agent adapter */
export interface AgentRequest {
  boardState: BoardDSL;
  userMessage: string;
  selectedNodeIds?: string[];
  allowedOps?: PatchOpType[];
}

/** Structured error from agent call */
export interface AgentError {
  code: 'NETWORK_ERROR' | 'AUTH_ERROR' | 'RATE_LIMITED' | 'API_ERROR' | 'PARSE_ERROR';
  message: string;
  /** Raw response text for debugging parse errors */
  rawText?: string;
}

/** Abstract agent adapter — mock and real implementations conform to this */
export interface AgentAdapter {
  readonly name: string;
  /** Generate a DSLPatch from user message + board state.
   *  Throws AgentError on failures; returns a patch to be validated by caller. */
  generatePatch(request: AgentRequest): Promise<DSLPatch>;
}

export type { AgentConfig };
