import { INTERACTION_KINDS, PATCH_OP_TYPES, PRESENTATION_LAYOUTS, type AgentAction, type DSLPatch, type InteractionOption, type InteractionRequest } from '../types/dsl';
import type { AgentResponse } from './types';
import { visualError } from '../visuals/contract';
import { spatialPlanError } from '../presentation/spatialPlan';

export function extractJson(text: string): string {
  return getJsonCandidates(text)[0] ?? text;
}

function assertIsDSLPatch(obj: Record<string, unknown>): DSLPatch {
  if (typeof obj.summary !== 'string') throw new Error('Missing or invalid "summary" field');
  if (!Array.isArray(obj.ops)) throw new Error('Missing or invalid "ops" array');
  const presentation = obj.presentation as DSLPatch['presentation'];
  if (presentation !== undefined && (!presentation || typeof presentation !== 'object' || !(PRESENTATION_LAYOUTS as readonly string[]).includes(presentation.layout))) throw new Error('Invalid presentation.layout: expected auto or preserve');
  if (presentation?.plan) { const error = spatialPlanError(presentation.plan); if (error) throw new Error(error); }
  if (presentation?.plan && presentation.layout === 'preserve') throw new Error('Use auto for a spatial plan, or preserve for custom coordinates.');
  for (const raw of obj.ops) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid patch operation');
    const op = raw as Record<string, any>;
    if (!(PATCH_OP_TYPES as readonly string[]).includes(op.op)) throw new Error(`Unknown patch operation: ${String(op.op)}`);
    const visual = op.op === 'add_node' ? op.node?.visual : op.op === 'update_node' ? op.changes?.visual : null;
    if (visual != null) {
      const error = visualError(visual);
      if (error) throw new Error(error);
    }
  }
  return {
    type: 'dsl_patch',
    summary: obj.summary,
    ops: obj.ops as DSLPatch['ops'],
    ...(presentation ? { presentation: { layout: presentation.layout, ...(presentation.plan ? { plan: presentation.plan } : {}) } } : {}),
    ...(Array.isArray(obj.actions) ? { actions: obj.actions.filter((action): action is AgentAction => Boolean(action && typeof action === 'object' && typeof action.id === 'string' && action.id.trim() && typeof action.label === 'string' && action.label.trim() && typeof action.prompt === 'string' && action.prompt.trim() && (action.nodeIds === undefined || Array.isArray(action.nodeIds) && action.nodeIds.every((id: unknown) => typeof id === 'string')))) } : {}),
    questions: Array.isArray(obj.questions) ? obj.questions.filter((q): q is string => typeof q === 'string') : [],
  };
}

function assertIsInteractionRequest(obj: Record<string, unknown>): InteractionRequest {
  if (typeof obj.runId !== 'string') throw new Error('Missing or invalid "runId" field');
  if (!(INTERACTION_KINDS as readonly string[]).includes(String(obj.kind))) {
    throw new Error('Missing or invalid "kind" field');
  }
  if (typeof obj.title !== 'string') throw new Error('Missing or invalid "title" field');
  if (typeof obj.message !== 'string') throw new Error('Missing or invalid "message" field');

  return {
    type: 'interaction_request',
    runId: obj.runId,
    kind: obj.kind as InteractionRequest['kind'],
    title: obj.title,
    message: obj.message,
    options: Array.isArray(obj.options) ? (obj.options as InteractionOption[]) : undefined,
    allowFreeText: typeof obj.allowFreeText === 'boolean' ? obj.allowFreeText : true,
  };
}

export function parseAgentResponse(text: string): AgentResponse {
  const errors: string[] = [];

  for (const candidate of getJsonCandidates(text)) {
    try {
      return parseAgentResponseCandidate(candidate);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(errors[0] ?? 'No JSON object found in response');
}

export function findAgentResponseJson(text: string): string | null {
  // Common streaming case: avoid rescanning every JS/CSS brace inside an unfinished JSON string.
  if (/^\s*\{\s*"type"\s*:\s*"(?:dsl_patch|interaction_request)"/.test(text)) {
    try { parseAgentResponseCandidate(text.trim()); return text.trim(); } catch { return null; }
  }
  for (const candidate of getJsonCandidates(text)) {
    try {
      parseAgentResponseCandidate(candidate);
      return candidate;
    } catch {
      // Keep scanning. CLI output can contain unrelated JSON before the response.
    }
  }

  return null;
}

function parseAgentResponseCandidate(candidate: string): AgentResponse {
  const parsed = JSON.parse(candidate) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Response is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.type === 'dsl_patch') return assertIsDSLPatch(obj);
  if (obj.type === 'interaction_request') return assertIsInteractionRequest(obj);
  throw new Error(`Missing or invalid "type" field: got "${String(obj.type)}"`);
}

function getJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const add = (candidate: string) => {
    const trimmed = candidate.trim();
    if (trimmed && !candidates.includes(trimmed)) candidates.push(trimmed);
  };

  const fenceMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fenceMatches) add(match[1]);

  for (const candidate of findBalancedJsonObjects(text)) add(candidate);

  add(text);

  return candidates;
}

function findBalancedJsonObjects(text: string): string[] {
  const objects: string[] = [];

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{') continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          objects.push(text.slice(start, index + 1));
          start = index;
          break;
        }
      }
    }
  }

  return objects;
}

function inferOptions(text: string): InteractionOption[] {
  const options: InteractionOption[] = [];
  const numbered = text.matchAll(/(?:^|\n)\s*(\d+)[.、)]\s*(?:\*\*)?([^\n*]+?)(?:\*\*)?(?:\s*[—-]\s*([^\n]+))?(?=\n|$)/g);
  for (const match of numbered) {
    const label = match[2]?.trim();
    if (!label) continue;
    options.push({
      id: `option_${match[1]}`,
      label,
      description: match[3]?.trim(),
    });
  }
  return options.slice(0, 6);
}

export function fallbackInteractionFromText(text: string, runId: string): InteractionRequest | null {
  const normalized = text.trim();
  if (!normalized) return null;

  const needsChoice =
    /选择|选一个|确认|授权|permission|authorize|which|which one|clarify|clarification|你说的|具体指/i.test(normalized);

  if (!needsChoice) return null;

  const wantsAuthorization = /授权|permission|authorize|WebSearch|搜索权限/i.test(normalized);
  const options = inferOptions(normalized);

  return {
    type: 'interaction_request',
    runId,
    kind: wantsAuthorization ? 'authorization' : options.length > 0 ? 'choice' : 'clarification',
    title: wantsAuthorization ? 'Agent 需要授权或确认' : 'Agent 需要你确认',
    message: normalized.slice(0, 2000),
    options: options.length > 0 ? options : undefined,
    allowFreeText: true,
  };
}
