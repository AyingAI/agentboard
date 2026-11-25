import { describe, expect, it } from 'vitest';
import { availableClis, recommendedCli } from '../onboarding';

describe('agent onboarding helpers', () => {
  const clis = [
    { id: 'missing', name: 'Missing', available: false },
    { id: 'pi', name: 'Pi CLI', available: true, version: '1.0.0' },
    { id: 'codex', name: 'Codex CLI', available: true },
  ];

  it('only offers detected CLIs ordered by priority', () => {
    expect(availableClis(clis).map((cli) => cli.id)).toEqual(['codex', 'pi']);
  });

  it('prefers mainstream installed CLIs when available', () => {
    expect(recommendedCli([{ id: 'claude', name: 'Claude Code', available: true }, ...clis])?.id).toBe('claude');
    expect(recommendedCli([])).toBeNull();
  });

  it('falls back to available CLIs when higher-priority ones are missing', () => {
    expect(recommendedCli([{ id: 'claude', name: 'Claude Code', available: false }, { id: 'pi', name: 'Pi CLI', available: true }])?.id).toBe('pi');
  });
});
