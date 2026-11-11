import type { AgentConfig } from '../types/dsl';

/** Only the explicit evidence opt-in authorizes sending draft/source fragments. */
export function normalizeJevConfig(value: AgentConfig['jev']): AgentConfig['jev'] {
  if (!value || typeof value !== 'object') return undefined;
  const evidenceReview = value.evidenceReview === true;
  return { ...value, apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
    enabled: evidenceReview, evidenceReview };
}
