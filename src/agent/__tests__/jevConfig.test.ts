import { afterEach, expect, it, vi } from 'vitest';
import { loadAgentConfig, saveAgentConfig } from '../../storage';
import { normalizeJevConfig } from '../jevConfig';

afterEach(() => vi.unstubAllGlobals());
it.each([
  [{ enabled: true }, false], [{ enabled: false }, false],
  [{ enabled: true, evidenceReview: false }, false],
  [{ enabled: false, evidenceReview: true }, true], [{ enabled: true, evidenceReview: true }, true],
])('migrates legacy authorization %j without expanding data transmission', (legacy, expected) => {
  let saved = JSON.stringify({ provider: 'local-cli', jev: { ...legacy, apiKey: 'test-connection', model: 'custom-model' } });
  vi.stubGlobal('localStorage', { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } });
  const config = loadAgentConfig();
  expect(config.jev).toEqual({ enabled: expected, evidenceReview: expected, apiKey: 'test-connection', model: 'custom-model' });
  expect(loadAgentConfig()).toEqual(config);
  saveAgentConfig(config); expect(loadAgentConfig()).toEqual(config);
  expect(normalizeJevConfig(config.jev)).toEqual(config.jev);
});

it('keeps opt-in and connection when migration persistence is unavailable', () => {
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ provider: 'local-cli', jev: { enabled: false, evidenceReview: true, apiKey: 'test' } }), setItem: () => { throw Error('quota'); } });
  expect(loadAgentConfig().jev?.evidenceReview).toBe(true);
  expect(normalizeJevConfig(undefined)).toBeUndefined();
});
