import { describe, expect, it } from 'vitest';
import type { ActivityEntry } from '../../types/dsl';
import { activitiesForView, viewForActivity } from '../activityViews';

function activity(kind: ActivityEntry['kind'], channel?: ActivityEntry['channel']): ActivityEntry {
  return { id: `${kind}_${channel ?? 'default'}`, timestamp: 1, kind, summary: kind, channel };
}

describe('activity views', () => {
  const items = [
    activity('user_message'),
    activity('agent_patch'),
    activity('needs_input'),
    activity('system'),
    activity('system', 'diagnostic'),
    activity('run_progress'),
    activity('validation_error'),
  ];

  it('keeps the default collaboration view focused on the human-Agent exchange', () => {
    expect(activitiesForView(items, 'collaboration').map((item) => item.kind)).toEqual([
      'user_message',
      'agent_patch',
      'needs_input',
      'system',
      'validation_error',
    ]);
  });

  it('puts progress, errors, and diagnostic system events in diagnostics', () => {
    expect(activitiesForView(items, 'diagnostics').map((item) => item.kind)).toEqual([
      'system',
      'run_progress',
      'validation_error',
    ]);
  });

  it('routes direct links to the view containing the activity', () => {
    expect(viewForActivity(activity('run_progress'))).toBe('diagnostics');
    expect(viewForActivity(activity('agent_patch'))).toBe('collaboration');
  });
});
