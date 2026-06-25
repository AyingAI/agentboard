import { describe, expect, it } from 'vitest';
import { extractJson, findAgentResponseJson, parseAgentResponse } from '../response';

function patchJson(summary = 'ok') {
  return JSON.stringify({
    type: 'dsl_patch',
    summary,
    ops: [],
    questions: [],
  });
}

describe('parseAgentResponse', () => {
  it('parses a fenced JSON patch with surrounding prose', () => {
    const response = parseAgentResponse([
      '下面是结构化结果：',
      '```json',
      patchJson('from fenced json'),
      '```',
      '已完成。',
    ].join('\n'));

    expect(response.type).toBe('dsl_patch');
    if (response.type === 'dsl_patch') expect(response.summary).toBe('from fenced json');
  });

  it('skips unrelated JSON objects before the AgentBoard response', () => {
    const response = parseAgentResponse([
      '调试信息：{"note":"not the response"}',
      '最终输出：',
      '```json',
      patchJson('actual patch'),
      '```',
    ].join('\n'));

    expect(response.type).toBe('dsl_patch');
    if (response.type === 'dsl_patch') expect(response.summary).toBe('actual patch');
  });

  it('recovers a balanced JSON object from an unclosed markdown fence', () => {
    const response = parseAgentResponse([
      '```json',
      patchJson('unclosed fence'),
    ].join('\n'));

    expect(response.type).toBe('dsl_patch');
    if (response.type === 'dsl_patch') expect(response.summary).toBe('unclosed fence');
  });

  it('handles braces inside JSON strings while scanning for the response object', () => {
    const response = parseAgentResponse([
      'prefix text',
      JSON.stringify({
        type: 'dsl_patch',
        summary: 'body contains {curly braces}',
        ops: [],
      }),
      'suffix text',
    ].join('\n'));

    expect(response.type).toBe('dsl_patch');
    if (response.type === 'dsl_patch') expect(response.summary).toBe('body contains {curly braces}');
  });
});

describe('extractJson', () => {
  it('returns the first parseable-looking object candidate', () => {
    expect(extractJson(`text\n${patchJson('first')}\nmore`)).toBe(patchJson('first'));
  });
});

describe('findAgentResponseJson', () => {
  it('returns a complete response object from streaming text before the CLI exits', () => {
    const streamedText = [
      '```json',
      patchJson('ready before process exit'),
      '```',
      '\n后续日志还没有结束',
    ].join('\n');

    expect(findAgentResponseJson(streamedText)).toBe(patchJson('ready before process exit'));
  });

  it('returns null while the response JSON is still incomplete', () => {
    expect(findAgentResponseJson('```json\n{"type":"dsl_patch","summary":"partial","ops":[')).toBeNull();
  });
});
