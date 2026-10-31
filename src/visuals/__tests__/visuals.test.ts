import { describe, expect, it } from 'vitest';
import type { BoardDSL, DSLPatch } from '../../types/dsl';
import { visualError, validVisualState, readVisualReference } from '../contract';
import { applyVisualPatch, patchConflicts, preserveVisualState } from '../patch';
import { buildVisualSandbox } from '../sandbox';
import { parseAgentResponse } from '../../agent/response';
import { buildSystemPrompt, buildUserMessage } from '../../agent/prompts';
import { conversationEvents } from '../../agent/conversation';
import { assessPatchRisk } from '../../agent/patchRisk';
import { createBoardExport, parseBoardImport } from '../../engine/boardTransfer';

const node = { id: 'v1', type: 'card' as const, title: 'Simulation', body: 'Summary', x: 100, y: 100, width: 760, height: 120,
  visual: { html: '<input id="weight"><script>window.agentboard.setState({value: 3})</script>', state: { value: 7 }, height: 300 } };
function board(): BoardDSL { return { version: '0.1', board: { id: 'b', title: 'Board', viewport: { x: 0, y: 0, zoom: 1 } }, nodes: [structuredClone(node)], edges: [], groups: [], metadata: {} }; }
function update(): DSLPatch { return { type: 'dsl_patch', summary: 'Improve', ops: [{ op: 'update_node', nodeId: 'v1', changes: { visual: { html: '<h1>Updated</h1>' } } }] }; }

describe('open visual protocol', () => {
  it('accepts arbitrary HTML, SVG and scripts without a component catalog', () => {
    expect(visualError(node.visual)).toBeNull();
    const parsed = parseAgentResponse(JSON.stringify({ type: 'dsl_patch', summary: 'Created', ops: [{ op: 'add_node', node }] }));
    expect(parsed.type).toBe('dsl_patch');
  });
  it('rejects malformed content before applying a patch atomically', () => {
    const patch = update();
    if (patch.ops[0].op === 'update_node') patch.ops[0].changes.visual = { html: '' };
    const current = board();
    const result = applyVisualPatch(current, patch);
    expect(result.board).toBe(current);
    expect(result.result.applied).toBe(false);
    expect(() => parseAgentResponse(JSON.stringify(patch))).toThrow();
  });
  it('validates resource limits and state serialization', () => {
    expect(visualError({ html: '<svg/>', height: -1 })).toBeTruthy();
    expect(validVisualState(null)).toBe(false);
    expect(validVisualState([])).toBe(false);
    expect(validVisualState({ x: 'a'.repeat(100001) })).toBe(false);
    expect(validVisualState({ arbitrary: [1, 2, { enabled: true }] })).toBe(true);
  });
  it('preserves saved user state when the model revises code', () => {
    const patch = preserveVisualState(board(), update());
    const result = applyVisualPatch(board(), patch);
    expect(result.board.nodes[0].visual?.state).toEqual({ value: 7 });
    expect(result.board.nodes[0].visual?.html).toContain('Updated');
  });
  it('allows explicit state reset and removing a visual', () => {
    const patch = update();
    if (patch.ops[0].op === 'update_node') patch.ops[0].changes.visual!.state = {};
    expect(applyVisualPatch(board(), preserveVisualState(board(), patch)).board.nodes[0].visual?.state).toEqual({});
    expect(applyVisualPatch(board(), { ...patch, ops: [{ op: 'update_node', nodeId: 'v1', changes: { visual: null } }] }).board.nodes[0].visual).toBeNull();
  });
  it('requires review when model-authored code changes', () => {
    expect(assessPatchRisk(update()).requiresConfirmation).toBe(true);
  });
  it('detects changes to visual state while a proposal is pending', () => {
    const base = board(), current = board();
    current.nodes[0].visual!.state = { value: 9 };
    expect(patchConflicts(base, current, update())).toEqual(['v1']);
  });
  it('allows unrelated edits without claiming a conflict', () => {
    const base = board(), current = board();
    current.nodes[0].title = 'A human title';
    expect(patchConflicts(base, current, update())).toEqual([]);
  });
  it('exports and imports source and interaction state', () => {
    const value = createBoardExport({ id: 's', title: 'Test', board: board(), createdAt: 1, updatedAt: 2 });
    expect(parseBoardImport(JSON.stringify(value)).board.nodes[0].visual).toEqual(node.visual);
  });
  it('bounds untrusted reference messages', () => {
    expect(readVisualReference('v', { label: 'a'.repeat(500), elementId: 'slider' })?.label).toHaveLength(300);
    expect(readVisualReference('v', { label: 4 })).toBeNull();
  });
  it('rejects unknown host operations while leaving visual content open-ended', () => {
    expect(() => parseAgentResponse(JSON.stringify({ type: 'dsl_patch', summary: 'x', ops: [{ op: 'execute_shell', command: 'x' }] }))).toThrow('Unknown patch operation');
  });
  it('keeps model code out of the trusted runtime document', () => {
    const html = buildVisualSandbox('</script><script>bad()</script>');
    expect(html).not.toContain('</script><script>bad()');
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain('event.source !== parent');
    expect(html).not.toContain('allow-same-origin');
  });
});

describe('model freedom and ongoing context', () => {
  it('describes the actual visual contract and SDK', () => {
    const prompt = buildSystemPrompt();
    for (const name of ['"visual"', '"html"', '"state"', '"height"', 'agentboard.getState', 'agentboard.setState', 'agentboard.ask', 'agentboard.reference']) expect(prompt).toContain(name);
    expect(prompt).not.toContain('at most 3 patch operations');
  });
  it('includes selected visual source and state even with unrelated delta edits', () => {
    const message = buildUserMessage(board(), 'Improve the selected simulation', {
      taskPolicy: { scope: 'selection', selectedNodeIds: ['v1'], allowDelete: false, allowFullBoardLayout: false, allowExistingEdits: true },
      recentEditEvents: [{ id: 'e', type: 'node_moved', timestamp: 1, nodeId: 'other', summary: 'moved' }],
    });
    expect(message).toContain('window.agentboard');
    expect(message).toContain('"value": 7');
  });
  it('carries past user decisions and summaries without repeating generated code', () => {
    const events = conversationEvents({ r: { id: 'r', originalUserMessage: 'Two weeks', events: [
      { type: 'user_message', timestamp: 1, payload: { message: 'Two weeks' } },
      { type: 'agent_patch', timestamp: 2, payload: update() },
    ] } });
    expect(JSON.stringify(events)).toContain('Two weeks');
    expect(JSON.stringify(events)).toContain('Improve');
    expect(JSON.stringify(events)).not.toContain('<h1>Updated');
  });
});
