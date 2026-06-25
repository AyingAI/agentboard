import { INTERACTION_KINDS, type DSLPatch, type InteractionOption, type InteractionRequest } from '../types/dsl';
import type { AgentResponse } from './types';

export function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
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
  const jsonStr = extractJson(text);
  const parsed = JSON.parse(jsonStr) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error('Response is not a JSON object');

  const obj = parsed as Record<string, unknown>;
  if (obj.type === 'dsl_patch') return assertIsDSLPatch(obj);
  if (obj.type === 'interaction_request') return assertIsInteractionRequest(obj);
  throw new Error(`Missing or invalid "type" field: got "${String(obj.type)}"`);
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
