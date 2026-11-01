# Changelog

## 0.3.7 — 2026-11-01

**Layout now helps explain content.** This release includes the automatic composition work recorded under 0.3.6, which was a development milestone rather than a separate GitHub release.

- Replace the main organize action with model-assisted “智能布局”. It reads titles, complete bodies, visible visual text, current state, groups, existing edges and measured sizes, then proposes a composable spatial plan. An explicit layout-only task can return a plan without content operations; host policy rejects additions, rewrites and deletions, and conflict detection protects edits made while planning.
- Add optional `presentation.plan` to the shared patch contract: a public description and recursively composed node/group references in rows, columns and orbits. Models can express comparisons, arguments, hierarchies and multi-stage structures without a fixed whole-board template. Keep custom coordinates through `layout: "preserve"`.
- Use the same semantic structure for measured full-content geometry and a compact structure view. New multi-part generations can provide the plan in the same response. Complex new boards without one get a local fallback based on explicit groups, tags and relationships; the interface distinguishes that source from an agent-authored plan.
- Add structure/content view controls, scale-aware map labels, relationship routing, region headings, content search/focus and responsive framing. Readable structure no longer requires rendering every long card as a vertical document.
- Open original content in a focused detail dialog, with working visuals, preserved state, element references and direct discussion. Return to the map or locate the node in the editable content canvas. Keep the spacing-only command in the layout menu.
- Include semantic layout changes in the original undo transaction, retain drafts, preserve manual placement, and avoid stale plans or old map structures overriding explicit spatial layouts. Add unit/browser coverage for comparisons, arguments, flows, state restoration, permissions, reloads and concurrent edits; verify one real Pi spatial-planning call against a previously generated board.
- Wait for the sandbox's revealed frame to finish painting before enabling interaction, preventing occasional lost first clicks immediately after external scripts load.
- Update both READMEs with the new structure/content workflow, smart-layout and spacing controls, spatial protocol, public interface example and opt-in live tests. Release validation: 238 unit tests passed, 58 browser tests passed, 4 live CLI tests skipped by default, production build passed; one separate real Pi spatial-planning call passed.

## 0.3.6 — 2026-11-01

- Add automatic section composition after DOM measurement: arrange large visuals beside their supporting notes, pack small cards in reading rows, align sections within a bounded page width, and leave actual-height clearance between sections.
- Use directional layers for flow boards, including branches and deterministic cycle handling. Honor explicit mindmap, matrix, timeline, swimlane, horizontal and vertical layouts using measured dimensions, including changed-only layout hints in a generation patch.
- Let models retain arbitrary spatial meaning through optional `presentation: { layout: "preserve" }`, beyond named algorithms. This retains coordinates with collision clearance and does not broaden modification permissions.
- Reflow automatically composed boards as content grows, keeping their established page width across follow-ups. Manual dragging/resizing opts out of global reflow; subsequent additions preserve existing positions. Keep model HTML, visual state, group membership and edge meaning intact.
- Repair clearly sparse legacy group staircases once with an undo entry. Explicit “整理布局” now recomposes the board instead of only pushing collisions downward. Agent presentation corrections remain in the agent's original undo transaction.
- Add numbered section headings and a section reading bar. At overview scale, show readable section labels in screen coordinates; clicking a label returns to the section's reading view.
- Add geometry and browser regression coverage for mixed visual boards, measured content growth, branching flows, explicit spatial intent, manual placements, reloads and undo, plus an opt-in real CLI composition check.

The 0.3.0–0.3.4 entries below record development milestones included in v0.3.5, rather than separate GitHub releases.

## 0.3.5 — 2026-10-31

**Core addition: open, interactive visualization on the canvas.** Agents can generate HTML, SVG and JavaScript diagrams, charts, explanations, simulations and runnable prototypes. Users can operate the results and keep refining them with the agent.

- Add an isolated visual runtime on card/note nodes with persistent interaction state and automatic restoration of native controls.
- Reference visual details and discuss the current source, parameters and selected element with an agent. Review revisions before applying them, preserving user state and detecting conflicting later edits.
- Let models choose visual expression without a fixed component catalog, alongside ordinary cards, notes, groups and edges. Include an interactive example that works before an agent is configured.
- Float the composer over the center of a full-height canvas. Start with a compact strip, expand on click or focus, collapse empty input on dismissal, and keep the stop action available in either state. Explicit framing reserves the dock's measured height.
- Preserve separate drafts per board and across refreshes; clear selection, visual reference and recent human-edit context when switching boards. Debounce draft storage and flush before leaving the page.
- Persist unaccepted modification proposals with their base board so review survives reloads and board switches. Keep conflict checks when accepting and remove saved proposals after acceptance or rejection.
- Enforce selected-node scope for group and edge operations. Require review for edge deletion and group rewrites.
- Validate imported and stored geometry, labels, tags and structural records before rendering. Recover missing or invalid primary storage from backups without replacing a good backup with corrupt data; allow primary saving when backup writes fail.
- Keep renamed board metadata consistent and allow clearing a card's body. Add source, assumption and decision-rule consistency guidance to agent responses.
- Confirm board deletion in the title menu by changing the delete button in place. Closing the menu cancels the confirmation; native confirmation dialogs are no longer used.
- Preserve complete body text for selected nodes instead of truncating the target of a follow-up question.
- Remove unused inspector/validation modules and stale debug state. Retain regression tests; keep generated verification artifacts out of release source.
- Refresh the Chinese and English README with setup, actual interface labels, storage boundaries, protocol examples and test instructions.

## 0.3.4 — 2026-10-31

- Dismiss the board switcher on outside pointer, wheel and focus actions, window blur, or Escape. Preserve the outside action and its focus; Escape returns focus to the trigger and preserves canvas selection. Pointer movement alone keeps the menu open.
- Improve switcher keyboard opening/navigation, selected states, list scrolling and transfer actions.
- Redesign the composer with a spacious input, a quiet context footer, consistent SVG controls, an arrow send button and a separate agent/keyboard hint line. Preserve keyboard sending, Chinese IME handling, next-step drafts and stop behavior.
- Move modification permissions into a compact popover with the same dismissal behavior. Keyboard interactions inside it cannot accidentally submit the draft.
- Adapt input height when its width changes and fit the composer/popover to compact windows. Keep the conversation area separate from canvas content.

## 0.3.3 — 2026-10-31

- Added executable `actions` to agent replies: separate labels, exact prompts and optional node targets. A host button click submits the chosen action directly while preserving the user's independent draft. Older combined offers are split when possible; unanswered factual questions request choices instead of inventing answers.
- Reserved separate space for canvas tools and the conversation dock so feedback and input never cover canvas content. Long completion explanations expand on demand.
- Measure actual card heights and resolve collisions within and between groups, retaining model placement intent and keeping unrelated existing objects anchored. Presentation corrections remain in the original undo transaction.
- Default large boards to a readable first region; provide full overview, searchable content navigation, next/previous targets, wheel panning and explicit layout repair.
- Refined selection context, permissions, action buttons and card states. Selecting content establishes its discussion scope, with a clear return to whole-board scope.
- Removed runtime keyword rules that fabricated layout operations or upgraded their scope; creating a checklist no longer becomes an unauthorized whole-board rearrangement.
- Track intrinsic content minimums separately from measured geometry, allowing shortened text or visuals to shrink on later revisions.
- Added action-contract, legacy compatibility, layout and browser regression coverage. Verified two real Pi calls: generate explicit options, click one, add a validation checklist, preserve the independent draft.

## 0.3.2 — 2026-10-31

- Unified running, completed, confirmation and recovery feedback with the composer, with one stop action and an editable next-step draft.
- Stream sanitized Pi, Claude Code and Codex CLI events, plus visible text from OpenAI-compatible and Anthropic SSE responses. Show actual content titles, received characters, tool activity and connection freshness.
- Added a calm empty-canvas working state, restrained motion, reduced-motion support and honest long-wait messaging without percentages or invented ETA.
- Preserve drafts through completion, cancellation and retries. Recover interrupted page/session records without leaving an orphan running indicator.
- Refined canvas contrast, starter cards, focus states, history details and responsive layouts. The composer stays within the canvas when history is open.
- Extended the API response timeout to ten minutes while preserving cancellation, and kept conversational replies free of inferred layout changes.
- Verified a real Pi CLI 1.4.0 stream and added coverage for split UTF-8/SSE frames, interrupted responses, private-event filtering, long waits, stop/retry and compact viewports.

## 0.3.1 — 2026-10-31

- Replaced native settings dropdowns with consistent menus, version badges, selected states, keyboard navigation and searchable model choices.
- Discover CLI installations across terminal PATH, common global directories and Node version managers; compare versions and deduplicate symlinks.
- Refresh discovery from settings without restarting the server. Display the executable path and additional installations.
- Start the exact discovered executable with its runtime PATH, and refresh discovery before each run to pick up local upgrades.
- Verified the installed Pi CLI 1.4.0 with a real connection smoke test. Added discovery and settings interaction regression coverage.

## 0.3.0 — 2026-10-30

- Open HTML/SVG/JavaScript visuals on existing canvas nodes, with expand, error recovery and element references.
- Persisted interaction state, including automatic native input restoration and an SDK for model-defined state and follow-ups.
- Full source and focused selection context for visual refinement; recent conversation history across runs.
- Before/after review for model edits, state preservation across code updates, conflict detection and undo.
- Removed the three-operation prompt limit and surfaced follow-up suggestions and conversational replies.
- Configurable API output budget, custom model IDs, default API endpoints and cancellation through response-body loading.
- Updated Codex CLI invocation for current non-interactive argument handling.
- Browser integration tests and an opt-in live CLI test alongside the existing unit suite.

Existing boards remain compatible. Visuals use an optional field on card/note nodes; the established patch and validation engines remain intact.

## Validation

```bash
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Browser tests use Chrome on macOS, or Playwright Chromium elsewhere (`npx playwright install chromium` when needed). The ordinary integration suite uses explicit test responses. To also exercise an installed, authenticated real CLI:

```bash
AGENTBOARD_LIVE_CLI=codex npm run test:e2e -- e2e/live-agent.spec.ts --workers=1
```

The live test generates a visual, changes a parameter, asks the agent to revise it, reviews the change and verifies state after reload. It uses model quota. Its local screenshots and generated board are written under ignored `docs/verification/`.

To verify direct next-step actions with a real installed CLI:

```bash
AGENTBOARD_LIVE_ACTIONS=pi npm run test:e2e -- e2e/live-actions.spec.ts --workers=1
```

To verify measured composition or content-aware spatial planning with a real CLI:

```bash
AGENTBOARD_LIVE_COMPOSITION=pi npm run test:e2e -- e2e/board-composition.spec.ts -g "a real CLI" --workers=1
AGENTBOARD_LIVE_SPATIAL=pi npm run test:e2e -- e2e/semantic-layout.spec.ts -g "real CLI" --workers=1
```
