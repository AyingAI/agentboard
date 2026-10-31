import type { RunState } from '../types/dsl';
import { assessPatchRisk } from './patchRisk';

/** A proposal is kept separate from applied agent_patch conversation events. */
export function restorePendingProposal(runs: Record<string, RunState>) {
  const run = Object.values(runs).reverse().find(run => run.pendingProposal);
  if (!run?.pendingProposal) return null;
  return { ...run.pendingProposal, runId: run.id, risk: assessPatchRisk(run.pendingProposal.patch) };
}

export function clearPendingProposals(runs: Record<string, RunState>): Record<string, RunState> {
  return Object.fromEntries(Object.entries(runs).map(([id, run]) => {
    const { pendingProposal: _proposal, ...rest } = run;
    return [id, rest];
  }));
}
