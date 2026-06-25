# Contributing

Thanks for your interest in AgentBoard.

## Development Setup

```bash
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm run typecheck
npm run test
npm run build
```

## Contribution Scope

Good first contribution areas:

- Board interaction fixes.
- Patch validation improvements.
- Agent adapter reliability.
- Prompt/schema consistency tests.
- Accessibility and keyboard interaction improvements.
- Small documentation improvements in public README-style files.

Please do not submit private planning notes, generated local artifacts, `.env` files, API keys, or local screenshots unless they are explicitly needed for a public issue.

## Protocol Changes

`src/types/dsl.ts` is the source of truth for the board protocol. If you change protocol fields, update:

- `src/agent/prompts.ts`
- relevant validation in `src/engine/validation.ts`
- tests under `src/**/__tests__`

Protocol drift between TypeScript types and the agent prompt is treated as a bug.

## Pull Request Notes

In your PR description, include:

- what changed
- why it changed
- how you validated it
- any remaining limitations or follow-up work
