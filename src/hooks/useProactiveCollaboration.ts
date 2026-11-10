import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentConfig, BoardDSL, CollaborationState, DiscoveryReview, ImpactItem } from '../types/dsl';
import { buildImpactContext, collaborationEnabled, consumeBudget, dailyLimit, hasBudget, impactProjectContext, mergeDiscoveries, nodePrints, resolveImpactItems, semanticPrint } from '../agent/discoveries';
import { discover } from '../agent/discoveryAgent';
import { evaluateDiscoveries, evaluateImpact } from '../agent/jev';
import { withTimeout } from '../agent/resilience';
import { readExploration } from '../data/exploration';

type Options = {
  sessionId: string; board: BoardDSL; state: CollaborationState; config: AgentConfig;
  configured: boolean; busy: boolean;
  update: (sessionId: string, update: (current: CollaborationState) => CollaborationState) => void;
};

export function useProactiveCollaboration(options: Options) {
  const latest = useRef(options); latest.current = options;
  const controller = useRef<AbortController | null>(null);
  const attempted = useRef('');
  const openedBoards = useRef(new Map<string, string>());
  const feedbackScope = useRef('');
  const manualRequest = useRef<{ sessionId: string; print: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [jevMessage, setJevMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [visible, setVisible] = useState(document.visibilityState !== 'hidden');
  const { sessionId, board, state, configured, busy, config, update } = options;
  const enabled = collaborationEnabled(board, state);
  const print = semanticPrint(board, state);
  const limit = dailyLimit(state);

  useEffect(() => {
    const handle = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, []);

  useEffect(() => {
    const scope = `${sessionId}:${print}`;
    if (feedbackScope.current !== scope) {
      feedbackScope.current = scope;
      setStatus('idle'); setMessage(''); setJevMessage('');
    } else {
      setStatus(current => current === 'working' ? 'idle' : current);
    }
    const queued = manualRequest.current;
    const manual = queued?.sessionId === sessionId && queued.print === print ? queued : null;
    if (queued && !manual) manualRequest.current = null;
    if (!openedBoards.current.has(sessionId)) openedBoards.current.set(sessionId, print);
    // Opening an existing freeform board alone shouldn't send its contents to a model.
    if (!manual && state.enabled === undefined && !readExploration(board) && openedBoards.current.get(sessionId) === print) return;
    const hasContent = board.nodes.some(node => node.visual || node.body.trim() || (node.title.trim() && node.title !== '新卡片'));
    if ((!enabled && !manual) || !configured || busy || !visible || !hasContent) return;
    const attempt = `${sessionId}:${print}:${retry}`;
    if (attempted.current === attempt || (!manual && (state.checkedPrint === print || !hasBudget(state)))) return;
    const abort = new AbortController();
    let finished = false;
    controller.current = abort;
    // Only committed content triggers this effect. Layout, typing and selection do not.
    const timer = setTimeout(async () => {
      if (abort.signal.aborted) return;
      attempted.current = attempt;
      setStatus('working'); setMessage('正在联系已有线索，准备一个可继续的发现…'); setJevMessage('');
      if (!manual) update(sessionId, consumeBudget);
      try {
        const impact = buildImpactContext(board, state);
        const jev = config.jev?.enabled && config.jev.apiKey ? config.jev : undefined;
        let suggestedChecks: ImpactItem[] = [];
        if (impact) {
          setMessage('正在查看这次变化影响了哪些成果…');
          if (jev) {
            const preflight = withTimeout(abort.signal, 2200);
            try {
              suggestedChecks = await evaluateImpact(jev, impact, preflight.signal);
            } catch { /* The main Agent can assess the change without Jev. */ }
            finally { preflight.cleanup(); }
          }
        }
        if (abort.signal.aborted) return;
        const response = await discover(config, board, state, abort.signal, event => {
          if (!abort.signal.aborted && event.type === 'output') setMessage('正在整理发现与依据…');
        }, impact ? { context: impact, suggestedChecks } : undefined);
        let drafts = response.discoveries;
        let reviews: Record<string, DiscoveryReview> | undefined;
        if (jev && drafts.length) {
          try {
            const evaluated = await evaluateDiscoveries(jev, board, state, drafts, abort.signal);
            drafts = evaluated.drafts; reviews = evaluated.reviews;
            if (!abort.signal.aborted) setJevMessage(evaluated.flagged ? `Jev 提示 ${evaluated.flagged} 条候选需要复查${evaluated.flagged < drafts.length ? '，已优先展示其他发现' : '，可以先查看依据'}` : 'Jev 已复查这些候选发现');
          } catch {
            if (!abort.signal.aborted) setJevMessage('Jev 暂时不可用，已保留主 Agent 的全部发现');
          }
        }
        const now = latest.current;
        if (abort.signal.aborted || now.sessionId !== sessionId || semanticPrint(now.board, now.state) !== print) return;
        const items = impact ? resolveImpactItems(impact, response.impacts ?? [], suggestedChecks) : [];
        update(sessionId, current => ({ ...current, understanding: response.understanding, checkedPrint: print, checkedAt: Date.now(),
          checkedNodes: nodePrints(board), checkedContext: impactProjectContext(board, current),
          impactReport: impact ? (items.length ? { print, items } : undefined) : current.impactReport,
          discoveries: mergeDiscoveries(current, drafts, board, reviews) }));
        setMessage(drafts.length ? '发现已准备好，可以随时查看' : items.some(item => item.status !== 'keep') ? '已整理受影响的成果' : '已看过这次变化，暂时没有值得补充的发现');
        setStatus('idle');
      } catch (error) {
        if (abort.signal.aborted) return;
        setStatus('error');
        setMessage(error instanceof Error ? error.message : (error as { message?: string })?.message || '这次分析没有完成，可以稍后重试');
      } finally {
        finished = !abort.signal.aborted;
        if (finished && manual && manualRequest.current === manual) manualRequest.current = null;
        if (controller.current === abort) controller.current = null;
      }
    }, 1800);
    return () => {
      clearTimeout(timer); abort.abort();
      if (controller.current === abort) controller.current = null;
      // An interrupted analysis can resume after the user's foreground work.
      if (!finished && attempted.current === attempt) attempted.current = '';
    };
    // Deliberately independent of budget/feedback updates from the in-flight request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, print, enabled, state.enabled, configured, busy, visible, config, retry, limit, update]);

  const pause = useCallback(() => {
    manualRequest.current = null;
    controller.current?.abort();
    const { sessionId, update } = latest.current;
    update(sessionId, current => ({ ...current, enabled: false }));
    setStatus('idle'); setMessage('主动协作已暂停');
  }, []);

  const refresh = useCallback(() => {
    const { sessionId, board, state } = latest.current;
    manualRequest.current = { sessionId, print: semanticPrint(board, state) };
    setRetry(value => value + 1);
  }, []);

  const resume = useCallback(() => {
    const { sessionId, update } = latest.current;
    update(sessionId, current => ({ ...current, enabled: true }));
    setRetry(value => value + 1);
  }, []);

  /** Foreground Agent results/adopted drafts are already understood; never trigger a self-loop. */
  const acknowledge = useCallback((next: BoardDSL) => {
    const { sessionId, update } = latest.current;
    controller.current?.abort();
    update(sessionId, current => ({ ...current, checkedPrint: semanticPrint(next, current), checkedNodes: nodePrints(next), checkedContext: impactProjectContext(next, current) }));
  }, []);

  return { status, message, jevMessage, enabled, print, pause, refresh, resume, acknowledge };
}
