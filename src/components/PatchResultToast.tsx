import { useEffect, useState } from 'react';
import type { AppliedAgentPatch } from '../hooks/useAgent';
import type { AgentAction } from '../types/dsl';
import { followUpActions } from '../agent/followUpActions';

interface PatchResultToastProps {
  result: AppliedAgentPatch;
  onUndo: () => void;
  onDismiss: () => void;
  onOpenActivity: () => void;
  onAction: (action: AgentAction) => boolean;
  onLocate: () => void;
}

export default function PatchResultToast({ result, onUndo, onDismiss, onOpenActivity, onAction, onLocate }: PatchResultToastProps) {
  const [expanded, setExpanded] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const actions = followUpActions(result.patch);
  useEffect(() => { setExpanded(false); setSubmitted(false); }, [result.id]);
  useEffect(() => {
    if (!result.patch.ops.length || actions.length) return;
    const timer = window.setTimeout(onDismiss, 12000);
    return () => window.clearTimeout(timer);
  }, [onDismiss, result.id]);
  const summary = result.patch.summary.replace(/\*\*/g, '').trim();
  return <section className="patch-result-toast" aria-label="Agent 修改已完成">
    <div className="result-topline"><span className="result-done"><span aria-hidden="true">✓</span>{result.patch.ops.length ? '画布已更新' : 'Agent 的回复'}</span>
      <div className="result-utilities">
        {result.patch.ops.length ? <button type="button" onClick={onLocate}>定位结果 <span aria-hidden="true">↗</span></button> : null}
        <button type="button" onClick={onOpenActivity}>记录</button>
        {result.patch.ops.length ? <button type="button" onClick={onUndo}>撤销</button> : null}
        <button type="button" onClick={onDismiss} aria-label="关闭完成提示" className="result-dismiss">×</button>
      </div>
    </div>
    <div className="patch-result-content">
      <h2 className={expanded ? 'expanded' : ''} aria-live="polite">{summary}</h2>
      {summary.length > 130 || summary.includes('\n') ? <button type="button" className="result-expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起说明' : '展开说明'} <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span></button> : null}
      {actions.length ? <div className="result-next-steps"><span>接下来</span><div className="reply-followups" aria-label="可直接执行的下一步">
        {actions.map((action, index) => <button type="button" key={`${action.id}-${index}`} disabled={submitted} title={action.prompt} onClick={event => { event.preventDefault(); if (submitted) return; if (onAction(action)) setSubmitted(true); }}><span>{action.label}</span><span aria-hidden="true">↗</span></button>)}
      </div></div> : null}
    </div>
  </section>;
}
