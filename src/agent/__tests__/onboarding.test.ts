import { describe, expect, it } from 'vitest';
import { availableClis, recommendedCli, STARTER_TASKS } from '../onboarding';

describe('agent onboarding helpers', () => {
  const clis = [
    { id: 'missing', name: 'Missing', available: false },
    { id: 'pi', name: 'Pi CLI', available: true, version: '1.0.0' },
    { id: 'codex', name: 'Codex CLI', available: true },
  ];

  it('only offers detected CLIs', () => {
    expect(availableClis(clis).map((cli) => cli.id)).toEqual(['pi', 'codex']);
  });

  it('recommends the first detected CLI', () => {
    expect(recommendedCli(clis)?.id).toBe('pi');
    expect(recommendedCli([])).toBeNull();
  });

  it('provides concrete starter prompts', () => {
    expect(STARTER_TASKS).toHaveLength(3);
    expect(STARTER_TASKS.every((task) => task.prompt.length > task.title.length)).toBe(true);
  });
});
