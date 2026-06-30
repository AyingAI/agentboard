# AgentBoard

**Agent-native structured canvas** — a local-first whiteboard where humans and AI agents collaborate on the same structured board state.

[中文说明](./README.md)

![status](https://img.shields.io/badge/status-prototype-blue)
![license](https://img.shields.io/badge/license-MIT-green)

AgentBoard turns a conversation with an agent into an editable canvas. The user can ask for a product breakdown, workflow, architecture map, or decision tree; the agent responds with structured board operations; the user can then move cards, edit text, create connections, and continue the conversation from the updated board.

## What It Does

- Creates editable cards, notes, groups, and edges from natural language.
- Stores the board as a structured `BoardDSL`, not as a flat image.
- Applies agent output through validated `DSLPatch` operations.
- Lets agents read recent human edits through a delta-first context packet instead of always receiving the full board.
- Supports local CLI agents such as Claude Code, OpenCode, Pi CLI, Codex CLI, Gemini CLI, Antigravity, Qwen Code, Cursor Agent, GitHub Copilot CLI, Qoder, Kimi, and Trae through a Vite dev-server bridge.
- Supports Claude API and OpenAI-compatible APIs.
- Persists sessions and agent settings locally in `localStorage`.

## Why It Exists

Most agent products lose context in a long chat transcript. AgentBoard uses the canvas itself as shared external memory:

```txt
Human intent
  -> agent plans structured board changes
  -> AgentBoard validates and applies a DSLPatch
  -> human edits the visible canvas
  -> agent reads the updated structure and recent edits
```

The important part is not "AI draws a diagram"; it is that both the human and the agent keep working on the same structured object.

## Quick Start

```bash
git clone https://github.com/AyingAI/agentboard.git
cd agentboard
npm install
npm run dev
```

Open `http://localhost:5173`.

Then choose an agent provider from the settings panel:

- **Local CLI**: auto-detects supported local CLIs such as Claude Code, OpenCode, Pi CLI, Codex CLI, Gemini CLI, Antigravity, Qwen Code, Cursor Agent, GitHub Copilot CLI, Qoder, Kimi, and Trae.
- **Claude API**: use an Anthropic API key.
- **OpenAI-compatible API**: use OpenAI or a compatible base URL.

API keys are stored only in browser `localStorage`. Do not commit secrets into the repository.

## Canvas Basics

| Action | Interaction |
| --- | --- |
| Create card | Double-click empty canvas |
| Move card | Drag |
| Edit card text | Double-click title or body |
| Create edge | Select a node, drag a connector handle to another node |
| Edit edge label | Select or double-click the edge label |
| Delete selection | Delete or Backspace |
| Pan canvas | Space + drag, or middle mouse drag |

## Core Protocol

AgentBoard is built around a small board protocol.

### `BoardDSL`

`BoardDSL` is the source of truth for the visible board:

```ts
type BoardDSL = {
  version: string;
  board: { id: string; title: string; viewport: { x: number; y: number; zoom: number } };
  nodes: BoardNode[];
  edges: BoardEdge[];
  groups: BoardGroup[];
  metadata: Record<string, unknown>;
};
```

### `DSLPatch`

Agents do not mutate the board directly. They return a patch:

```ts
type DSLPatch = {
  type: 'dsl_patch';
  summary: string;
  ops: PatchOp[];
  questions?: string[];
};
```

Supported operations include `add_node`, `update_node`, `delete_node`, `add_edge`, `delete_edge`, `add_group`, `update_group`, `delete_group`, and `layout`.

Every patch is validated before it is applied. Invalid references, duplicate IDs, invalid geometry, or schema mismatches fail atomically.

### Delta Context Packets

When the user edits the board and then calls an agent again, AgentBoard sends a compact delta context by default:

- changed edit events
- changed node IDs and edge IDs
- full objects for changed nodes
- edges related to changed nodes
- lightweight nearby node summaries
- compact board summary

Global tasks such as full-board cleanup, export, or flow execution still receive full board context.

## Architecture

```txt
React app
  ├── BoardDSL state
  ├── patch engine
  ├── validation engine
  ├── canvas renderer
  └── agent adapters
        ├── local CLI bridge
        ├── Claude API
        └── OpenAI-compatible API
```

Project layout:

```txt
src/
  types/dsl.ts           # protocol and shared types
  engine/                # patch application and validation
  agent/                 # adapters, prompts, parsing, resilience
  hooks/                 # React state, dragging, panning, sessions
  components/            # canvas and UI components
  data/                  # initial board templates
  storage.ts             # localStorage persistence
agentBridgePlugin.ts     # Vite middleware for local CLI execution
```

## Development

```bash
npm run dev        # start Vite dev server
npm run typecheck  # TypeScript validation
npm run test       # Vitest suite
npm run build      # production build
```

## Current Status

AgentBoard is a prototype. It is useful for experimenting with structured agent collaboration, but it is not yet a hosted multi-user product.

Current boundaries:

- Local-first storage only.
- No server-backed account, permission, or sync model.
- Local CLI bridge runs only in the Vite development server.
- External side effects should stay explicit and user-authorized.

## Contributing

Issues and pull requests are welcome. Before submitting changes, run:

```bash
npm run typecheck
npm run test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

MIT. See [LICENSE](LICENSE).
