import type { ActivityEntry } from '../types/dsl';

export type ActivityView = 'collaboration' | 'diagnostics';

export function isDiagnosticActivity(item: ActivityEntry) {
  return item.channel === 'diagnostic'
    || item.kind === 'run_progress'
    || item.kind === 'validation_error';
}

export function isCollaborationActivity(item: ActivityEntry) {
  if (item.channel === 'diagnostic') return false;
  return item.kind !== 'run_progress';
}

export function activitiesForView(activities: ActivityEntry[], view: ActivityView) {
  return activities.filter(view === 'collaboration' ? isCollaborationActivity : isDiagnosticActivity);
}

export function viewForActivity(item: ActivityEntry): ActivityView {
  return item.kind === 'run_progress' || item.channel === 'diagnostic'
    ? 'diagnostics'
    : 'collaboration';
}
