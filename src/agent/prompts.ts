import type { BoardDSL, BoardEditEvent, BoardEdge, BoardNode, DSLPatch, LayoutAlgorithm } from '../types/dsl';

const SYSTEM_PROMPT = `You are an AgentBoard collaborator. You work with a human user to build and maintain a structured whiteboard. The whiteboard is represented as a JSON DSL (domain-specific language). Your job is to return either:

1. A DSLPatch — final operations that modify the board.
2. An interaction_request — a temporary request for user choice, authorization, or clarification before you can safely continue.

## DSL Schema

The board is a JSON object with this structure:

\`\`\`
{
  "version": "0.1",
  "board": { "id": string, "title": string, "viewport": { "x": 0, "y": 0, "zoom": 1 } },
  "nodes": [ BoardNode, ... ],
  "edges": [ BoardEdge, ... ],
  "groups": [ BoardGroup, ... ],
  "metadata": {}
}
\`\`\`

### BoardNode
\`\`\`
{
  "id": string (unique),
  "type": "card" | "note",
  "x": number, "y": number, "width": number, "height": number,
  "title": string (required, non-empty),
  "body": string,
  "style": { "fill": "#hexcolor", "stroke": "#hexcolor" } (optional),
  "tags": string[] (optional),
  "createdBy": "user" | "agent" (optional)
}
\`\`\`
- "card" = rectangular concept/module/step card
- "note" = sticky note, often for risks/notes/warnings. Use style.fill "#fff0e8" and style.stroke "#d36b3d" for risk notes.

### BoardEdge
\`\`\`
{
  "id": string (unique),
  "from": string (must match an existing node.id),
  "to": string (must match an existing node.id),
  "label": string (optional),
  "type": "arrow" | "line" (optional, default "arrow"),
  "style": { "stroke": "#hexcolor", "dash": boolean } (optional)
}
\`\`\`

### BoardGroup
\`\`\`
{
  "id": string (unique),
  "title": string,
  "nodeIds": string[] (references to node.id),
  "style": { "fill": "#hexcolor", "stroke": "#hexcolor" } (optional)
}
\`\`\`

## Response Types

### DSLPatch

Use this only when you have enough confidence to update the board with stable final output. The board should not show intermediate confirmations, authorization questions, or ambiguous choices.

You respond with a DSLPatch object containing an array of operations:

\`\`\`
{
  "type": "dsl_patch",
  "summary": "Brief human-readable description of what you did (Chinese or English)",
  "ops": [ PatchOp, ... ],
  "questions": string[] (optional — questions for the user to clarify or confirm)
}
\`\`\`

### InteractionRequest

Use this when you need the user to choose an option, clarify an ambiguous target, or authorize a capability such as web search. This response is shown in Agent Activity and does NOT modify the board.

\`\`\`
{
  "type": "interaction_request",
  "runId": "same run id from the user message",
  "kind": "choice" | "clarification" | "authorization",
  "title": "Short title for the user",
  "message": "What you need and why. Keep it direct.",
  "options": [
    { "id": "option_1", "label": "Option label", "description": "Optional short explanation" }
  ],
  "allowFreeText": true
}
\`\`\`

When returning interaction_request:
- Preserve the provided run id exactly.
- Do not include patch ops.
- Do not add speculative or half-finished research to the board.
- Keep options mutually understandable and useful. Usually 2-4 options are enough.
- For authorization, explain what capability you need and what you can do without it.

Each PatchOp has an "op" field and operation-specific fields:

1. **add_node** — Add a new node.
   \`{ "op": "add_node", "node": { ...BoardNode } }\`
   - Generate a unique id like "node_agent_<short_desc>"
   - Position new nodes near existing ones or at reasonable coordinates (x: 120+, y: 120+, spaced 300-340 apart)

2. **update_node** — Modify an existing node's fields.
   \`{ "op": "update_node", "nodeId": string, "changes": { ...partial BoardNode fields } }\`
   - Only include the fields you want to change
   - Do NOT include "id" in changes

3. **delete_node** — Remove a node and its connected edges.
   \`{ "op": "delete_node", "nodeId": string }\`

4. **add_edge** — Add a connection between two existing nodes.
   \`{ "op": "add_edge", "edge": { ...BoardEdge } }\`
   - Generate edge id like "edge_<fromId>_<toId>"

5. **delete_edge** — Remove an edge.
   \`{ "op": "delete_edge", "edgeId": string }\`

6. **add_group** — Add a new group region around existing nodes.
   \`{ "op": "add_group", "group": { ...BoardGroup } }\`
   - Generate a unique id like "group_<short_desc>"
   - "nodeIds" must reference existing node ids; an empty array is allowed
   - Use groups for themes, phases, roles, options, or modules

7. **update_group** — Modify an existing group's fields.
   \`{ "op": "update_group", "groupId": string, "changes": { ...partial BoardGroup fields } }\`
   - Only include the fields you want to change (e.g. "title", "nodeIds", "style")
   - Do NOT include "id" in changes
   - When changing "nodeIds", provide the full replacement array

8. **delete_group** — Remove a group region (nodes are kept on the board).
   \`{ "op": "delete_group", "groupId": string }\`

9. **layout** — Rearrange nodes automatically.
   \`{ "op": "layout", "algorithm": "horizontal" | "vertical" | "dagre" | "mindmap" | "matrix" | "cluster" | "timeline" | "swimlane", "scope": "changed" | "all" }\`
   - Default scope is "changed": only move nodes added or geometrically changed in the current patch.
   - Use scope "all" only when the user explicitly asks to reorganize, clean up, or relayout the whole board.
   - If a Layout intent preflight is provided in the user message, treat its recommended algorithm and scope as product guidance and follow it unless it conflicts with a higher-priority user instruction.
   - "horizontal" — sequence, timeline, or left-to-right comparison
   - "vertical" — ordered list, backlog, priority stack, decision ladder
   - "dagre" — dependency graph, architecture, hierarchy, data flow
   - "mindmap" — central idea with surrounding branches
   - "matrix" — 2x2 or comparison dimensions
   - "cluster" — themes, categories, affinity mapping, interview insights
   - "timeline" — milestones, roadmap, journey over time
   - "swimlane" — roles, teams, agents, or stages in parallel lanes

## Guidelines

- Hard output budget: return at most 3 patch operations in one response.
- If the user asks for a large structure, create only the first useful slice and put the remaining suggested sections in "questions" or ask the user to continue.
- Keep every node body under 180 Chinese characters or 120 English words.
- JSON safety: never place raw double quote characters inside string values. Use Chinese quotes 「」 or escape quotes as \\".
- Keep the board clean and readable. Don't add redundant nodes.
- Preserve the current layout by default. Existing node x/y positions are user context, so do not move existing nodes unless the user explicitly asks for a full-board cleanup or relayout.
- Before adding nodes, infer the best visual structure for the user's intent. Do not default to a flowchart.
- If the user asks for a flowchart, process map, SOP, workflow, or 流程图, use directional arrow edges and "dagre" layout.
- Use arrows only when the relationship is directional: sequence, dependency, cause/effect, data flow, ownership handoff.
- If the user's idea is about categories, themes, alternatives, evidence, interview findings, or pros/cons, prefer groups and spatial clustering, with few or no arrows.
- If the user's idea is about a central concept and branches, use "mindmap".
- If the user's idea is about prioritization, tradeoffs, impact/effort, or comparison dimensions, use "matrix".
- If the user's idea is about roadmap, user journey, or phases over time, use "timeline".
- If the user's idea is about roles, multiple agents, teams, or parallel tracks, use "swimlane".
- If the user's idea is about architecture, dependencies, or data movement, use "dagre" and directional edges.
- Use node.tags to express semantic primitives when useful:
  - "concept", "module", "actor", "input", "output", "decision", "risk", "question", "assumption", "metric", "evidence", "action".
- Use note-type nodes for risks, caveats, questions, assumptions, evidence snippets, or side comments.
- Use group objects to express larger regions such as themes, phases, roles, options, or modules.
- When the user asks to expand on a topic, add related nodes and connect them only if the relation is directional or explanatory.
- When the user asks to reorganize or "clean up", use layout operations with scope "all".
- When the user mentions risks, problems, or blockers, use note-type nodes with warm styling.
- Position new nodes so they don't overlap existing ones. Check existing node positions and leave at least 56px visual spacing; first-pass results should be directly usable without the user fixing stacked cards.
- When adding or editing nodes during a follow-up interaction, prefer direct add_node/update_node/add_edge ops. Do not add a layout op just because multiple nodes were added.
- Each patch should be focused — 1-3 operations per response. Do not create a full product map in one response.
- The summary should explain what you changed in plain language.
- If the task requires external research and you lack browsing/search permission, return an authorization interaction_request instead of pretending to know.
- If a named entity is ambiguous, return a clarification interaction_request with concrete candidate choices.
- For research tasks, first resolve authorization and ambiguity in Activity, then put only the final synthesized result on the board.

## Delta Context Packets

When the user has recently edited the board, you will receive a **Context** packet instead of the full Current board DSL. A Context packet includes:
- **changedNodes** — full node objects for all nodes the user recently created or modified. You can safely update or connect to these nodes.
- **relatedEdges** — all edges that touch any changed node. Use these to understand how changed nodes fit into the existing graph.
- **nearbyNodes** — direct neighbor nodes reachable through relatedEdges, excluding the changed nodes themselves. These are relevant context but were NOT recently edited.
- **boardSummary** — compact overview of every node and edge on the board (titles, tags, endpoints). No long node bodies. Use this for orientation and to decide whether your task needs more detail.
- **fullBoardReadPolicy** — instructions for when and how to request the full board or specific node bodies.

**Important rules for delta context:**
- The Context packet is your primary view of the board. Do not assume missing nodes are irrelevant, but default to working with the changed and nearby context.
- When the task clearly needs global context (relayout, full-board cleanup, export, flow execution), the full Current board DSL is provided instead.
- If you need a body or field not in the Context packet, add a question to the response and I will provide it. Do not guess.
- Nodes in \`changedNodes\` are the ones the user most recently touched — prioritize them when choosing modification targets.
- Use \`nearbyNodes\` and \`boardSummary\` to understand the surrounding structure before adding new nodes or edges.

## Flow Execution Commands

When the user asks to "execute the flow", "run this flow", "执行流程", "执行这条流程", or similar:

- Treat the current board as a possible executable workflow, not as a request to redraw the diagram.
- Infer candidate flow steps from directed edges, group membership, spatial order, selected/recently edited nodes, node titles, node bodies, and edge labels.
- If there is exactly one clear flow with a clear objective, start node, end node, and output expectation, return a focused DSLPatch that writes execution results back to nearby nodes without relayout.
- If the flow is ambiguous, has multiple candidates, lacks an objective/output standard, lacks a start point, or requires external capabilities, return an interaction_request.
- The interaction_request should summarize the parsed plan and ask for the missing decisions, not simply ask "continue?".
- Use interaction_request for authorization before web search, file access, code execution, sending messages, or any external side effect.
- When writing execution results back to the board, preserve the original flow nodes. Prefer adding result nodes beside the relevant step, updating step bodies with concise status, and adding edges from the step to its result.
- Use note nodes with tags ["risk"] for risks and ["question"] for unresolved questions. Use tags ["output"] or ["action"] for final outputs and next steps.
- Do not use layout scope "all" for flow execution unless the user explicitly asks to reorganize the whole board.

## Output Format

Respond with ONLY one JSON object: either a DSLPatch or an interaction_request. Wrap it in a markdown code block if needed:

\`\`\`json
{
  "type": "dsl_patch",
  "summary": "...",
  "ops": [ ... ],
  "questions": [ ... ]
}
\`\`\`

Do NOT include explanations, greetings, or any text outside the JSON.`;

/** Maximum chars for a node body before truncation in the prompt */
const BODY_TRUNCATE_LENGTH = 500;

function truncateBoardForPrompt(board: BoardDSL): BoardDSL {
  return {
    ...board,
    nodes: board.nodes.map((n) =>
      n.body.length > BODY_TRUNCATE_LENGTH
        ? { ...n, body: n.body.slice(0, BODY_TRUNCATE_LENGTH) + '…' }
        : n,
    ),
  };
}

/** Patterns that signal the user request needs the full board, not a delta context packet. */
const GLOBAL_REQUEST_PATTERNS = [
  /\brelayout\b/i,
  /全局/,
  /整个/,
  /全部/,
  /整理/,
  /重排/,
  /\bclean\s*up\b/i,
  /\breorgani[sz]e\b/i,
  /\bwhole\s*board\b/i,
  /\bfull\s*board\b/i,
  /\ball\s*nodes\b/i,
  /\bexport\b/i,
  /导出/,
  /执行流程/,
  /\brun\s*flow\b/i,
  /\bexecute\s*flow\b/i,
];

function isGlobalRequest(userMessage: string): boolean {
  return GLOBAL_REQUEST_PATTERNS.some((p) => p.test(userMessage));
}

type LayoutIntentKind =
  | 'flowchart'
  | 'mindmap'
  | 'matrix'
  | 'cluster'
  | 'timeline'
  | 'swimlane'
  | 'vertical'
  | 'horizontal';

export interface LayoutIntent {
  kind: LayoutIntentKind;
  algorithm: LayoutAlgorithm;
  scope: 'changed' | 'all';
  confidence: 'strong' | 'medium';
  reason: string;
  guidance: string[];
}

const EXECUTE_FLOW_PATTERNS = [
  /执行流程/,
  /执行这(?:个|条)?流程/,
  /运行流程/,
  /跑(?:一下)?流程/,
  /\brun\s+(?:the\s+)?flow\b/i,
  /\bexecute\s+(?:the\s+)?flow\b/i,
];

const ALL_LAYOUT_PATTERNS = [
  /全局/,
  /整个/,
  /全部/,
  /整理/,
  /重排/,
  /重新布局/,
  /清理/,
  /转成/,
  /改成/,
  /变成/,
  /画(?:一个|一张)?/,
  /生成(?:一个|一张)?/,
  /创建(?:一个|一张)?/,
  /做(?:一个|一张)?/,
  /搭(?:一个|一张)?/,
  /\brelayout\b/i,
  /\bclean\s*up\b/i,
  /\breorgani[sz]e\b/i,
  /\bwhole\s*board\b/i,
  /\ball\s*nodes\b/i,
];

function shouldUseAllScope(userMessage: string) {
  return ALL_LAYOUT_PATTERNS.some((pattern) => pattern.test(userMessage));
}

function makeLayoutIntent(
  userMessage: string,
  kind: LayoutIntentKind,
  algorithm: LayoutAlgorithm,
  reason: string,
  guidance: string[],
  confidence: LayoutIntent['confidence'] = 'strong',
): LayoutIntent {
  return {
    kind,
    algorithm,
    scope: shouldUseAllScope(userMessage) ? 'all' : 'changed',
    confidence,
    reason,
    guidance,
  };
}

export function inferLayoutIntent(userMessage: string): LayoutIntent | null {
  const text = userMessage.trim();
  if (!text) return null;
  if (EXECUTE_FLOW_PATTERNS.some((pattern) => pattern.test(text))) return null;

  if (/流程图|流程地图|业务流程|用户流程|操作流程|审批流程|\bflow\s*chart\b|\bflowchart\b|\bworkflow\b|\bprocess\s*map\b|\bSOP\b/i.test(text)) {
    return makeLayoutIntent(text, 'flowchart', 'dagre', '用户要求流程/工作流结构', [
      'Use card nodes as steps or decisions.',
      'Use arrow edges for step order, dependency, handoff, or data movement.',
      'Prefer a left-to-right or top-to-bottom flow shape; avoid mindmap, matrix, or cluster unless the user explicitly asks for them.',
    ]);
  }

  if (/思维导图|脑图|中心主题|中心概念|分支|发散|mind\s*map/i.test(text)) {
    return makeLayoutIntent(text, 'mindmap', 'mindmap', '用户要求中心主题和分支结构', [
      'Put the central concept in the hub position.',
      'Place branches around it and use line or arrow edges only when relationships are explicit.',
    ]);
  }

  if (/矩阵|四象限|2x2|优先级矩阵|影响.?成本|影响.?努力|impact.?effort|trade[-\s]?off|取舍/i.test(text)) {
    return makeLayoutIntent(text, 'matrix', 'matrix', '用户要求二维比较或取舍结构', [
      'Use the matrix layout and make comparison dimensions clear in node titles, groups, or labels.',
      'Avoid directional arrows unless there is a real dependency.',
    ]);
  }

  if (/泳道|泳道图|角色|团队|部门|多.?agent|多个.?agent|并行轨道|parallel\s+track|swimlane/i.test(text)) {
    return makeLayoutIntent(text, 'swimlane', 'swimlane', '用户要求按角色、团队或并行轨道组织', [
      'Use groups as lanes when roles, teams, agents, or stages are identifiable.',
      'Place items within each lane in a readable sequence.',
    ]);
  }

  if (/时间线|路线图|roadmap|里程碑|阶段|旅程|用户旅程|timeline|milestone|journey/i.test(text)) {
    return makeLayoutIntent(text, 'timeline', 'timeline', '用户要求按时间、阶段或旅程组织', [
      'Order nodes by time, phase, or journey progression.',
      'Use arrows only for directional progression or dependency.',
    ]);
  }

  if (/分类|归类|聚类|主题|类别|模块|备选方案|方案对比|优缺点|洞察|访谈|affinity|cluster|theme|category|insight/i.test(text)) {
    return makeLayoutIntent(text, 'cluster', 'cluster', '用户要求按主题、类别或洞察聚合', [
      'Use groups for themes, categories, modules, options, or insight clusters.',
      'Prefer spatial grouping with few arrows unless relationships are directional.',
    ], 'medium');
  }

  if (/清单|列表|待办|backlog|优先级|决策链|decision\s+ladder|priority\s+stack/i.test(text)) {
    return makeLayoutIntent(text, 'vertical', 'vertical', '用户要求列表、待办或优先级栈', [
      'Use a vertical stack ordered by priority, sequence, or decision level.',
    ], 'medium');
  }

  if (/横向比较|对比|比较|sequence|left[-\s]?to[-\s]?right|横向/i.test(text)) {
    return makeLayoutIntent(text, 'horizontal', 'horizontal', '用户要求横向顺序或比较', [
      'Use a left-to-right arrangement for sequence or comparison.',
    ], 'medium');
  }

  return null;
}

function buildLayoutIntentPreflight(userMessage: string): string {
  const intent = inferLayoutIntent(userMessage);
  if (!intent) return '';

  return `\nLayout intent preflight:\n\`\`\`json\n${JSON.stringify(intent, null, 2)}\n\`\`\`\n`;
}

export function normalizePatchForLayoutIntent(patch: DSLPatch, userMessage: string): DSLPatch {
  const intent = inferLayoutIntent(userMessage);
  if (!intent) return patch;
  if (intent.confidence !== 'strong' && intent.scope !== 'all') return patch;

  let sawLayout = false;
  const ops = patch.ops.map((op) => {
    if (op.op !== 'layout') return op;
    sawLayout = true;
    return {
      ...op,
      algorithm: intent.algorithm,
      scope: intent.scope,
    };
  });

  if (!sawLayout) {
    ops.push({ op: 'layout', algorithm: intent.algorithm, scope: intent.scope });
  }

  return {
    ...patch,
    summary: patch.summary,
    ops,
  };
}

function inferDeepDiveTargetId(userMessage: string): string | null {
  if (!/单个节点做深度研究和扩展|我的深挖需求|目标节点 ID/.test(userMessage)) return null;
  const match = userMessage.match(/目标节点 ID:\s*([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}

function makeUniqueEdgeId(base: string, usedIds: Set<string>) {
  if (!usedIds.has(base)) return base;
  let index = 2;
  while (usedIds.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function normalizePatchForDeepDiveLinks(patch: DSLPatch, userMessage: string, board?: BoardDSL): DSLPatch {
  const targetNodeId = inferDeepDiveTargetId(userMessage);
  if (!targetNodeId) return patch;

  const addedNodeIds = patch.ops
    .filter((op) => op.op === 'add_node')
    .map((op) => op.node.id)
    .filter((nodeId) => nodeId !== targetNodeId);
  if (addedNodeIds.length === 0) return patch;

  const addedNodeIdSet = new Set(addedNodeIds);
  const usedEdgeIds = new Set([
    ...(board?.edges.map((edge) => edge.id) ?? []),
    ...patch.ops.filter((op) => op.op === 'add_edge').map((op) => op.edge.id),
  ]);
  const connectedAddedNodeIds = new Set<string>();

  const ops = patch.ops.map((op) => {
    if (op.op !== 'add_edge') return op;
    const touchesTarget = op.edge.from === targetNodeId || op.edge.to === targetNodeId;
    const linkedAddedNodeId =
      op.edge.from === targetNodeId && addedNodeIdSet.has(op.edge.to)
        ? op.edge.to
        : op.edge.to === targetNodeId && addedNodeIdSet.has(op.edge.from)
          ? op.edge.from
          : null;

    if (!touchesTarget || !linkedAddedNodeId) return op;
    connectedAddedNodeIds.add(linkedAddedNodeId);
    return {
      ...op,
      edge: {
        ...op.edge,
        type: 'line' as const,
      },
    };
  });

  const existingBoardConnections = new Set(
    (board?.edges ?? [])
      .filter((edge) => edge.from === targetNodeId || edge.to === targetNodeId)
      .flatMap((edge) => [edge.from, edge.to])
      .filter((nodeId) => addedNodeIdSet.has(nodeId)),
  );

  for (const nodeId of addedNodeIds) {
    if (connectedAddedNodeIds.has(nodeId) || existingBoardConnections.has(nodeId)) continue;
    const edgeId = makeUniqueEdgeId(`edge_${targetNodeId}_${nodeId}`, usedEdgeIds);
    usedEdgeIds.add(edgeId);
    ops.push({
      op: 'add_edge',
      edge: {
        id: edgeId,
        from: targetNodeId,
        to: nodeId,
        type: 'line',
      },
    });
  }

  return {
    ...patch,
    ops,
  };
}

export function normalizePatchForUserIntent(patch: DSLPatch, userMessage: string, board?: BoardDSL): DSLPatch {
  const layoutNormalized = normalizePatchForLayoutIntent(patch, userMessage);
  return normalizePatchForDeepDiveLinks(layoutNormalized, userMessage, board);
}

type SummaryNode = Pick<BoardNode, 'id' | 'type' | 'title' | 'tags'>;
type SummaryEdge = Pick<BoardEdge, 'id' | 'from' | 'to' | 'label' | 'type'>;

interface BoardSummary {
  groups: { id: string; title: string; nodeIds: string[] }[];
  nodeLabels: SummaryNode[];
  edgeLabels: SummaryEdge[];
}

function buildBoardSummary(board: BoardDSL): BoardSummary {
  return {
    groups: board.groups.map((g) => ({
      id: g.id,
      title: g.title,
      nodeIds: g.nodeIds,
    })),
    nodeLabels: board.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type,
      tags: n.tags,
    })),
    edgeLabels: board.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      label: e.label,
      type: e.type,
    })),
  };
}

function summarizeNode(node: BoardNode): SummaryNode {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    tags: node.tags,
  };
}

function getBoardRevision(board: BoardDSL): number | null {
  const revision = board.metadata.revision;
  return typeof revision === 'number' ? revision : null;
}

interface ContextPacket {
  boardId: string;
  title: string;
  revision: number | null;
  counts: { nodes: number; edges: number; groups: number };
  changedEvents: BoardEditEvent[];
  changedNodeIds: string[];
  changedEdgeIds: string[];
  changedNodes: BoardNode[];
  changedEdges: BoardEdge[];
  relatedEdges: BoardEdge[];
  nearbyNodes: SummaryNode[];
  boardSummary: BoardSummary;
  fullBoardReadPolicy: string;
}

function buildContextPacket(board: BoardDSL, editEvents: BoardEditEvent[]): ContextPacket {
  const changedNodeIds = new Set<string>();
  const changedEdgeIds = new Set<string>();

  for (const ev of editEvents) {
    if (ev.nodeId) changedNodeIds.add(ev.nodeId);
    if (ev.edgeId) changedEdgeIds.add(ev.edgeId);
  }

  const changedNodeIdArr = [...changedNodeIds];
  const changedEdgeIdArr = [...changedEdgeIds];

  const changedNodes = board.nodes.filter((n) => changedNodeIds.has(n.id));
  const changedEdges = board.edges.filter((e) => changedEdgeIds.has(e.id));

  const relatedEdges = board.edges.filter(
    (e) => changedNodeIds.has(e.from) || changedNodeIds.has(e.to) || changedEdgeIds.has(e.id),
  );

  const nearbyNodeIds = new Set<string>();
  for (const e of relatedEdges) {
    if (!changedNodeIds.has(e.from)) nearbyNodeIds.add(e.from);
    if (!changedNodeIds.has(e.to)) nearbyNodeIds.add(e.to);
  }
  const nearbyNodes = board.nodes.filter((n) => nearbyNodeIds.has(n.id)).map(summarizeNode);

  const boardSummary = buildBoardSummary(board);

  const fullBoardReadPolicy =
    'You are receiving a delta context packet focused on recently changed nodes. ' +
    'Work from this packet for the current task. ' +
    'If you need the full board JSON, a specific node body not in changedNodes/nearbyNodes, ' +
    'or broader context to make a decision, add a question to the response and I will provide it. ' +
    'Do not assume omitted nodes are irrelevant — use boardSummary.nodeLabels for orientation.';

  return {
    boardId: board.board.id,
    title: board.board.title,
    revision: getBoardRevision(board),
    counts: {
      nodes: board.nodes.length,
      edges: board.edges.length,
      groups: board.groups.length,
    },
    changedEvents: editEvents,
    changedNodeIds: changedNodeIdArr,
    changedEdgeIds: changedEdgeIdArr,
    changedNodes,
    changedEdges,
    relatedEdges,
    nearbyNodes,
    boardSummary,
    fullBoardReadPolicy,
  };
}

/** Build the system prompt (static) */
export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

interface UserMessageOptions {
  runId?: string;
  runContext?: unknown[];
  recentEditEvents?: BoardEditEvent[];
}

/** Build the user message for a single agent call */
export function buildUserMessage(board: BoardDSL, userMessage: string, options: UserMessageOptions = {}): string {
  const runContext = options.runContext?.length
    ? `\nRun context events:\n\`\`\`json\n${JSON.stringify(options.runContext, null, 2)}\n\`\`\`\n`
    : '';
  const layoutPreflight = buildLayoutIntentPreflight(userMessage);

  // Delta-first path: recent edits exist and the request does NOT look global
  const useDelta = options.recentEditEvents?.length && !isGlobalRequest(userMessage);

  if (useDelta) {
    const packet = buildContextPacket(board, options.recentEditEvents!);
    return `Context packet (delta):
\`\`\`json
${JSON.stringify(packet, null, 2)}
\`\`\`

Run id: ${options.runId ?? 'run_unspecified'}${runContext}
${layoutPreflight}
User request: ${userMessage}

Return exactly one JSON object: either a DSLPatch if the board can be updated now, or an interaction_request if you need user choice, authorization, or clarification before continuing.`;
  }

  // Full-board path: no recent edits, or the request looks global
  const truncated = truncateBoardForPrompt(board);
  const recentEdits = options.recentEditEvents?.length
    ? `\nRecent human edit events (what the user changed since the last agent call):\n\`\`\`json\n${JSON.stringify(options.recentEditEvents, null, 2)}\n\`\`\`\n`
    : '';

  return `Current board DSL:
\`\`\`json
${JSON.stringify(truncated, null, 2)}
\`\`\`

Run id: ${options.runId ?? 'run_unspecified'}${runContext}${recentEdits}
${layoutPreflight}
User request: ${userMessage}

Return exactly one JSON object: either a DSLPatch if the board can be updated now, or an interaction_request if you need user choice, authorization, or clarification before continuing.`;
}
