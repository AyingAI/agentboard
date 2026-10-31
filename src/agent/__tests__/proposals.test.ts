import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyBoard } from '../../data/initialBoard';
import { clearPendingProposals, restorePendingProposal } from '../proposals';
import { loadSessions, saveSessions } from '../../storage';
import { patchConflicts } from '../../visuals/patch';
import type { RunState } from '../../types/dsl';

const baseBoard = { ...emptyBoard, nodes: [{ id: 'n', type: 'note' as const, title: 'Before', body: '', x: 0, y: 0, width: 240, height: 120 }] };
const run: RunState = {
  id: 'r', originalUserMessage: 'Rename the note', events: [],
  pendingProposal: { id: 'p', activityId: 'a', baseBoard, patch: { type: 'dsl_patch', summary: 'Rename', ops: [{ op: 'update_node', nodeId: 'n', changes: { title: 'After' } }] } },
};

afterEach(() => vi.unstubAllGlobals());

describe('pending proposal recovery', () => {
  it('retains the patch and its original base board through a storage round trip', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    saveSessions({ activeId: 's', sessions: [{ id: 's', title: 'Review', board: baseBoard, createdAt: 1, updatedAt: 1, runs: { r: run } }] });
    const loaded = loadSessions(emptyBoard);
    const proposal = restorePendingProposal(loaded.sessions[0].runs!);
    expect(proposal?.patch.ops).toEqual(run.pendingProposal!.patch.ops);
    expect(proposal?.risk.requiresConfirmation).toBe(true);
    expect(loaded.sessions[0].board.nodes[0].title).toBe('Before');
    const edited = { ...baseBoard, nodes: [{ ...baseBoard.nodes[0], title: 'My later edit' }] };
    expect(patchConflicts(proposal!.baseBoard, edited, proposal!.patch)).toEqual(['n']);
  });

  it('does not resurrect accepted or rejected proposals after saving again', () => {
    const cleared = clearPendingProposals({ r: run });
    expect(restorePendingProposal(JSON.parse(JSON.stringify(cleared)))).toBeNull();
    expect(cleared.r.originalUserMessage).toBe(run.originalUserMessage);
    expect(run.pendingProposal).toBeDefined();
  });
});
