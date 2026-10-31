import type { AgentRunEvent, RunState } from '../types/dsl';

/** Carry human decisions and reply summaries, not copies of all generated code. */
export function conversationEvents(runs: Record<string, RunState>, excludeRunId?: string): AgentRunEvent[] {
  return Object.values(runs).filter(run => run.id !== excludeRunId).flatMap(run => run.events).map(event => {
    if (event.type !== 'agent_patch') return event;
    const patch = event.payload as { summary?: string; ops?: unknown[] };
    return { ...event, payload: { summary: patch.summary, appliedOperations: patch.ops?.length ?? 0 } };
  }).sort((a, b) => a.timestamp - b.timestamp).slice(-60);
}
