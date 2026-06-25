import { INTERACTION_KINDS, type DSLPatch, type InteractionOption, type InteractionRequest } from '../types/dsl';
import type { AgentResponse } from './types';

export function extractJson(text: string): string {
  return getJsonCandidates(text)[0] ?? text;
}

function assertIsDSLPatch(obj: Record<string, unknown>): DSLPatch {
  if (typeof obj.summary !== 'string') throw new Error('Missing or invalid "summary" field');
  if (!Array.isArray(obj.ops)) throw new Error('Missing or invalid "ops" array');
  return {
    type: 'dsl_patch',
    summary: obj.summary,
    ops: obj.ops as DSLPatch['ops'],
    questions: Array.isArray(obj.questions) ? (obj.questions as string[]) : [],
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
