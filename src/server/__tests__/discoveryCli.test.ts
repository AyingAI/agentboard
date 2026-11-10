import { describe, expect, it } from 'vitest';
import { discoveryCliArgs, findDiscoveryJson } from '../discoveryCli';

describe('background CLI execution', () => {
  it('uses narrower execution profiles without changing normal agent tasks', () => {
    expect(discoveryCliArgs('codex')).toContain('read-only');
    expect(discoveryCliArgs('codex')).not.toContain('workspace-write');
    expect(discoveryCliArgs('pi')).toContain('--no-tools');
    expect(discoveryCliArgs('claude')).toContain('--strict-mcp-config');
    expect(discoveryCliArgs('unknown')).toBeNull();
  });
  it('recognizes finished discoveries without treating a patch as one', () => {
    const json = JSON.stringify({ type: 'discovery', understanding: '理解', discoveries: [] });
    expect(findDiscoveryJson('```json\n' + json + '\n```')).toBe(json);
    expect(findDiscoveryJson('{"type":"discovery",')).toBeNull();
    expect(findDiscoveryJson('{"type":"dsl_patch","ops":[]}')).toBeNull();
  });
});
