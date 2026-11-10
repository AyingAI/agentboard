import { describe, expect, it } from 'vitest';
import { availableClis, recommendedCli } from '../onboarding';

describe('agent onboarding helpers', () => {
  const clis = [
    { id: 'missing', name: 'Missing', available: false },
    { id: 'pi', name: 'Pi CLI', available: true, version: '1.0.0' },
    { id: 'codex', name: 'Codex CLI', available: true },
  ];

  it('only offers detected CLIs', () => {
    expect(availableClis(clis).map((cli) => cli.id)).toEqual(['pi', 'codex']);
  });

  it('prefers an installed Pi even when Claude was detected first', () => {
    expect(recommendedCli([{ id: 'claude', name: 'Claude Code', available: true }, ...clis])?.id).toBe('pi');
    expect(recommendedCli([])).toBeNull();
  });

  it('falls back to an actually installed tool without offering an unavailable Pi', () => {
    expect(recommendedCli([{ id: 'pi', name: 'Pi CLI', available: false }, { id: 'codex', name: 'Codex CLI', available: true }])?.id).toBe('codex');
  });
});
