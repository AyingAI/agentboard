import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { AgentTaskPolicy, BoardNode, VisualReference } from '../types/dsl';
import { friendlyProvider } from '../agent/liveProgress';
import { useDismissibleLayer } from '../hooks/useDismissibleLayer';

function ComposerIcon({ name }: { name: 'board' | 'selection' | 'arrow' | 'chevron' | 'settings' | 'agent' | 'reference' | 'close' }) {
  const paths = {
    board: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    selection: <><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M2 7V4a2 2 0 0 1 2-2h3m10 0h3a2 2 0 0 1 2 2v3M2 17v3a2 2 0 0 0 2 2h3m10 0h3a2 2 0 0 0 2-2v-3" /></>,
    arrow: <path d="M12 19V5m-6 6 6-6 6 6" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    settings: <><path d="M4 7h8m4 0h4M4 17h3m4 0h9" /><circle cx="14" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
    agent: <><rect x="4" y="4" width="6" height="6" rx="2" /><rect x="14" y="14" width="6" height="6" rx="2" /><path d="M14 7h3v7M7 10v7h7" /></>,
    reference: <path d="M7 4v9a3 3 0 0 0 3 3h10m-4-4 4 4-4 4" />,
    close: <path d="m7 7 10 10M7 17 17 7" />,
  };
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

interface PromptBarProps {
  feedback?: ReactNode;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  onOpenConfig: () => void;
  isPending: boolean;
  isAgentConfigured: boolean;
  providerName: string;
  selectedNodeIds: string[];
  taskPolicy: AgentTaskPolicy;
  onTaskPolicyChange: (policy: AgentTaskPolicy) => void;
  referencedNodes: BoardNode[];
  visualReference: VisualReference | null;
  onClearReference: () => void;
  onClearTargets: () => void;
}

export default function PromptBar({ feedback, input, onInputChange, onSubmit, onCancel, onOpenConfig, isPending, isAgentConfigured, providerName, selectedNodeIds, taskPolicy, onTaskPolicyChange, referencedNodes, visualReference, onClearReference, onClearTargets }: PromptBarProps) {
  const [stopRequested, setStopRequested] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [activated, setActivated] = useState(false);
  const composerRoot = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const permissionRoot = useRef<HTMLDivElement>(null);
  const permissionTrigger = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const permissionsId = useId();
  const expanded = activated || Boolean(input.trim()) || Boolean(visualReference) || showControls;
  useDismissibleLayer({ open: activated && !input.trim() && !visualReference && !showControls, root: composerRoot, onDismiss: () => setActivated(false) });
  useDismissibleLayer({ open: showControls, root: permissionRoot, onDismiss: () => setShowControls(false), returnFocus: permissionTrigger });

  useEffect(() => { if (!isPending) setStopRequested(false); else setShowControls(false); }, [isPending]);
  function resizeInput() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }
  useLayoutEffect(resizeInput, [input, isPending, expanded]);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    let width = textarea.clientWidth;
    const observer = new ResizeObserver(() => { if (width !== textarea.clientWidth) { width = textarea.clientWidth; resizeInput(); } });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (showControls) permissionRoot.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  }, [showControls]);

  const selection = taskPolicy.scope === 'selection';
  const targetLabel = selection ? referencedNodes.length === 1 ? referencedNodes[0].title : `${selectedNodeIds.length} 个选中内容` : '整张画布';
  const detail = visualReference && visualReference.label !== referencedNodes[0]?.title ? visualReference.label : null;

  function stopGeneration(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault(); setStopRequested(true); onCancel?.();
  }
  const stopButton = <button key="stop" type="button" className="stop-button composer-send" aria-label={stopRequested ? '正在停止' : '停止生成'} title="停止当前生成" disabled={stopRequested}
    onClick={stopGeneration}><span className={stopRequested ? 'composer-stopping' : 'composer-stop-mark'} aria-hidden="true" /></button>;

  return <div ref={composerRoot} className={`composer-wrapper composer-v4 ${expanded ? 'is-expanded' : 'is-collapsed'}${isPending ? ' pending' : ''}${input.trim() ? ' has-draft' : ''}${feedback ? ' has-feedback' : ''}`}>
    {feedback ? <div className="composer-feedback">{feedback}</div> : null}
    <form className="prompt-bar message-composer" aria-label="与 Agent 对话" onSubmit={event => { event.preventDefault(); if (!isPending && input.trim()) onSubmit(); }}>
      {detail ? <div className="composer-reference-row"><span className="reference-detail" title={detail}><ComposerIcon name="reference" /><span>引用：{detail}</span><button type="button" onClick={onClearReference} aria-label="取消细节引用"><ComposerIcon name="close" /></button></span></div> : null}
      <textarea ref={textareaRef} value={input} onFocus={() => setActivated(true)} onPointerDown={() => setActivated(true)} onChange={event => onInputChange(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || isPending) return;
          event.preventDefault(); if (input.trim()) onSubmit();
        }}
        aria-label={isPending ? '下一步想法' : '描述你的想法'} aria-describedby={hintId}
        placeholder={isPending ? '先记下下一步想法…' : selection ? `围绕「${targetLabel}」继续讨论…` : '说说你的想法，或选中画布中的内容继续讨论…'} rows={1} />
      {!expanded ? <div className="composer-compact-actions">
        {isPending ? stopButton : <button type="button" className="composer-expand" aria-label="展开输入" aria-expanded={false} onClick={() => { setActivated(true); textareaRef.current?.focus(); }}><ComposerIcon name="chevron" /></button>}
      </div> : null}
      <div className="composer-bottom-row">
        <div className="prompt-context-bar">
          <div className={`prompt-targets ${selection ? 'has-selection' : ''}`}>
            <button type="button" className={`prompt-scope-button ${selection ? 'selection' : ''}`}
              onClick={() => { if (!selectedNodeIds.length) return; const scope = selection ? 'board' : 'selection'; onTaskPolicyChange({ ...taskPolicy, scope, selectedNodeIds: scope === 'selection' ? selectedNodeIds : [] }); }}
              disabled={isPending || !selectedNodeIds.length} title={selectedNodeIds.length ? `讨论「${targetLabel}」；点击切换讨论范围` : '选择画布内容，可以专注讨论'}>
              <ComposerIcon name={selection ? 'selection' : 'board'} /><span className="scope-label">{targetLabel}</span>
              {selectedNodeIds.length ? <ComposerIcon name="chevron" /> : null}
            </button>
            {selection ? <button type="button" className="clear-targets" onClick={onClearTargets} aria-label="取消选中内容" title="回到整张画布"><ComposerIcon name="close" /></button> : null}
          </div>
        </div>
        <div className="composer-utilities">
          {!input.trim() && !visualReference ? <button type="button" className="composer-collapse" aria-label="收起输入" aria-expanded={true} onClick={() => { setShowControls(false); setActivated(false); textareaRef.current?.blur(); }}><ComposerIcon name="chevron" /></button> : null}
          <div className="composer-permission-anchor" ref={permissionRoot}>
            <button ref={permissionTrigger} type="button" className={`prompt-permission-toggle ${showControls ? 'active' : ''}`}
              aria-label="修改权限" aria-expanded={showControls} aria-controls={permissionsId} aria-haspopup="dialog"
              onClick={() => setShowControls(value => !value)} disabled={isPending} title="设置 Agent 的修改权限"><ComposerIcon name="settings" /></button>
            {showControls ? <div className="composer-permission-popover" id={permissionsId} role="dialog" aria-label="Agent 修改权限" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.preventDefault(); }}>
              <div className="composer-permission-heading"><strong>Agent 可以做什么</strong><span>你可以随时调整这次讨论的边界</span></div>
              <div className="prompt-permissions">
                <label><input type="checkbox" checked={taskPolicy.allowExistingEdits} onChange={event => onTaskPolicyChange({ ...taskPolicy, allowExistingEdits: event.target.checked })} /><span><strong>修改现有内容</strong><small>允许改写节点和分组</small></span></label>
                <label><input type="checkbox" checked={taskPolicy.allowDelete} onChange={event => onTaskPolicyChange({ ...taskPolicy, allowDelete: event.target.checked })} /><span><strong>删除内容</strong><small>应用前仍会请你确认</small></span></label>
                <label><input type="checkbox" checked={taskPolicy.allowFullBoardLayout} onChange={event => onTaskPolicyChange({ ...taskPolicy, allowFullBoardLayout: event.target.checked })} /><span><strong>整理全图布局</strong><small>允许移动整张白板</small></span></label>
              </div>
            </div> : null}
          </div>
          {isPending && expanded ? stopButton
            : isPending ? null
            : !isAgentConfigured ? <button key="configure" type="button" className="configure-agent-button composer-connect" onClick={onOpenConfig} aria-label="配置 Agent">连接 Agent <ComposerIcon name="arrow" /></button>
            : <button key="send" type="submit" className="composer-send" disabled={!input.trim()} aria-label="发送" title="发送（Enter）"><ComposerIcon name="arrow" /></button>}
        </div>
      </div>
    </form>
    <div className="composer-footline">
      {isAgentConfigured ? <button type="button" className="composer-agent" onClick={onOpenConfig} disabled={isPending} title="更换 Agent" aria-label={`更换 Agent，当前 ${friendlyProvider(providerName)}`}><ComposerIcon name="agent" /><span>{friendlyProvider(providerName)}</span><ComposerIcon name="chevron" /></button>
        : <span className="composer-agent-empty">选择你熟悉的 Agent，开始共创</span>}
      <span className="composer-hint" id={hintId}>{isPending ? '可先写下一步，完成后再发送' : <><span>↵ 发送</span><span className="composer-hint-divider">·</span><span>Shift + ↵ 换行</span></>}</span>
    </div>
  </div>;
}
