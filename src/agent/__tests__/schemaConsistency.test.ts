import { describe, expect, it } from 'vitest';
import { INTERACTION_KINDS, LAYOUT_ALGORITHMS, NODE_TYPES, PATCH_OP_TYPES } from '../../types/dsl';
import { buildSystemPrompt } from '../prompts';

/**
 * Schema single-source-of-truth guard.
 *
 * The DSL schema lives in two places by necessity: the TypeScript types in
 * `dsl.ts` (consumed by the app) and the plain-text schema in the system prompt
 * (consumed by the Agent). TypeScript cannot check the prompt text, so these
 * tests fail loudly if a new enum value is added to `dsl.ts` but never described
 * to the Agent. Without this, the two definitions drift silently and the Agent
 * gets a wrong contract.
 *
 * If you add a value to one of these arrays, update the system prompt in
 * `prompts.ts` to describe it, then this test passes again.
 */
describe('DSL schema ↔ system prompt consistency', () => {
  const prompt = buildSystemPrompt();

  it('describes every patch operation type', () => {
    for (const op of PATCH_OP_TYPES) {
      expect(prompt, `system prompt is missing patch op "${op}"`).toContain(op);
    }
  });

  it('describes every layout algorithm', () => {
    for (const algo of LAYOUT_ALGORITHMS) {
      expect(prompt, `system prompt is missing layout algorithm "${algo}"`).toContain(algo);
    }
  });

  it('describes every node type', () => {
    for (const type of NODE_TYPES) {
      expect(prompt, `system prompt is missing node type "${type}"`).toContain(`"${type}"`);
    }
  });

  it('describes every interaction kind', () => {
    for (const kind of INTERACTION_KINDS) {
      expect(prompt, `system prompt is missing interaction kind "${kind}"`).toContain(kind);
    }
  });
});
