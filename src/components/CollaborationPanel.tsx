import { useRef, useState } from 'react';
import type { BoardDSL, CollaborationState, Discovery, ImpactItem } from '../types/dsl';
import { dailyLimit, discoveryDecision, hasBudget, isDiscoveryCurrent, projectGoal } from '../agent/discoveries';
import { ExplorationDialog } from './Exploration';
import './collaboration.css';

interface Props {
  board: BoardDSL; state: CollaborationState; enabled: boolean; configured: boolean; busy: boolean;
  current: Discovery[]; impacts: ImpactItem[];
  status: 'idle' | 'working' | 'error'; message: string; jevMessage: string;
  onUpdate: (update: (current: CollaborationState) => CollaborationState) => void;
  onPause: () => void; onRefresh: () => void; onResume: () => void;
  onFocus: (ids: string[]) => void; onSave: (discovery: Discovery) => void; onContinue: (discovery: Discovery) => void;
}

const LABELS = { connection: '新的联系', gap: '值得补证', impact: '变化的影响', next_step: '可以推进了' };
const REVIEW_LABELS = { evidence: '部分结论可能超出资料依据', constraints: '可能不符合你填写的条件', intent: '可能把方案里的选择当成了你的硬性要求', repeated: '可能重复了你已处理的方向' };
const IMPACT_LABELS = { revise: '需要调整', verify: '先核实', keep: '可以沿用' };
const IMPACT_ORDER = ['revise', 'verify', 'keep'] as const;

export default function CollaborationPanel(props: Props) {
  const { board, state, enabled, configured, busy, status, message, current, impacts } = props;
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState('');
  const [constraints, setConstraints] = useState('');
  const [limit, setLimit] = useState(12);
  const [limited, setLimited] = useState(true);
  const [showAutomatic, setShowAutomatic] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const draftCards = useRef(new Map<string, HTMLElement>());
  const previous = state.discoveries.filter(d => !current.includes(d));
  const hasImpact = impacts.some(item => item.status !== 'keep');
  const budgetAvailable = hasBudget(state);
  const canRun = configured && !busy && status !== 'working';

  function editContext(openAutomatic = false) {
    const savedLimit = dailyLimit(state);
    setGoal(projectGoal(board, state));
    setConstraints(state.constraints ?? '');
    setLimited(savedLimit !== null);
    setLimit(savedLimit ?? 12);
    setShowAutomatic(openAutomatic);
    setEditing(true);
  }
  return <section className="collaboration-panel" aria-label="Agent 建议">
      {status === 'working' ? <p className="collaboration-message" role="status">{message}</p> : null}
      {status === 'error' ? <div className="collaboration-controls">
        <p className="collaboration-message error" role="status">{message}</p>
        <button type="button" disabled={!canRun} onClick={props.onRefresh}>重试分析</button>
      </div> : null}
      {hasImpact ? <section className="impact-summary" aria-label="这次变化影响了什么">
        <h3>这次变化影响了什么</h3>
        {IMPACT_ORDER.map(status => {
          const items = impacts.filter(item => item.status === status);
          return items.length ? <details key={`${state.impactReport?.print}:${status}`} className="impact-group" open={status !== 'keep'}>
            <summary><span className={`impact-label ${status}`}>{IMPACT_LABELS[status]}</span><span>{items.length} 项</span></summary>
            <ul>{items.map(item => {
              const title = board.nodes.find(node => node.id === item.nodeId)?.title;
              if (!title) return null;
              const prepared = item.status !== 'keep' ? current.find(d => d.kind === 'impact' && d.nodeIds.includes(item.nodeId)) : undefined;
              return <li key={item.nodeId}>
                <button type="button" className="impact-target" onClick={() => props.onFocus([item.nodeId])}>{title} <span aria-hidden="true">↗</span></button>
                <p>{item.reason}</p>
                <div className="impact-actions">
                  {item.sourceIds.map(id => {
                    const source = board.nodes.find(node => node.id === id);
                    return source ? <button key={id} type="button" onClick={() => props.onFocus([id])}>{source.title} ↗</button> : null;
                  })}
                  {prepared ? <button type="button" className="impact-prepare" onClick={() => {
                    const draft = draftCards.current.get(prepared.id);
                    draft?.focus({ preventScroll: true });
                    draft?.scrollIntoView({ block: 'start' });
                  }}>查看调整草案 ↓</button> : null}
                </div>
              </li>;
            })}</ul>
          </details> : null;
        })}
      </section> : null}
      {!current.length && !hasImpact && status === 'idle' ? <p className="collaboration-message">暂无建议。{configured && enabled ? '白板内容有变化时，Agent 会自动分析。' : ''}</p> : null}
      {current.map(discovery => <article className="discovery" key={discovery.id} tabIndex={-1} ref={element => {
        if (element) draftCards.current.set(discovery.id, element);
        else draftCards.current.delete(discovery.id);
      }}>
        <h3>{discovery.title}</h3>
        {discovery.jevReview?.concerns.length ? <div className="discovery-review"><strong>先核实，再采用</strong>{discovery.jevReview.concerns.map(c => <span key={c}>{REVIEW_LABELS[c]}</span>)}<small>Jev 的复查提示，仍需结合原资料判断。</small></div> : null}
        <p className="discovery-prepared">{discovery.prepared}</p>
        <details className="discovery-evidence"><summary>{LABELS[discovery.kind]} · 查看依据</summary>
          <p>{discovery.reason}</p>
          <div className="discovery-sources" aria-label="相关资料">{discovery.nodeIds.map(id => <button key={id} type="button" onClick={() => props.onFocus([id])}>{board.nodes.find(n => n.id === id)?.title}</button>)}</div>
        </details>
        <div className="discovery-actions"><button type="button" className="discovery-primary" disabled={busy} onClick={() => props.onSave(discovery)}>{discovery.jevReview?.concerns.length ? '保留为待核实' : '保留到白板'}</button>
          <button type="button" disabled={busy || !configured} onClick={() => props.onContinue(discovery)}>{discovery.action.label}</button>
          <button type="button" onClick={() => props.onUpdate(current => ({ ...current, discoveries: current.discoveries.map(d => d.id === discovery.id ? { ...d, status: 'dismissed' } : d) }))}>暂不采用</button></div>
      </article>)}
      {previous.length ? <div className="discovery-history"><button type="button" aria-expanded={showHistory} onClick={() => setShowHistory(value => !value)}>已处理与待复查 · {previous.length}</button>
        {showHistory ? previous.map(d => <div key={d.id}><span>{!isDiscoveryCurrent(d, board, state) ? '依据有变化，需重新分析' : discoveryDecision(d, board) === 'removed' ? '已撤回保留' : d.status === 'saved' ? '已保留' : '暂不采用'}</span><strong>{d.title}</strong>
          <details><summary>查看当时的发现</summary><p>{d.reason}</p><p className="discovery-history-text">{d.prepared}</p></details>
          {discoveryDecision(d, board) === 'removed' && isDiscoveryCurrent(d, board, state) ? <div className="discovery-actions"><button type="button" disabled={busy} onClick={() => props.onSave(d)}>重新保留</button></div> : null}</div>) : null}
      </div> : null}
      <details className="collaboration-settings">
        <summary>白板分析设置</summary>
        <p>目标 · {projectGoal(board, state)}</p>
        {state.constraints ? <p>{state.constraints}</p> : null}
        {state.understanding ? <details><summary>Agent 对任务的理解</summary><p>{state.understanding}</p></details> : null}
        {props.jevMessage ? <p>{props.jevMessage}</p> : null}
        <div className="collaboration-controls">
          <button type="button" onClick={() => editContext()}>目标与条件</button>
          {configured ? <>
            <button type="button" disabled={!canRun} onClick={props.onRefresh}>手动分析一次</button>
            {enabled ? <button type="button" onClick={props.onPause}>暂停自动分析</button>
              : <button type="button" disabled={!canRun || !budgetAvailable} onClick={props.onResume}>启用自动分析</button>}
          </> : null}
        </div>
        {configured && !budgetAvailable ? <div className="collaboration-limit-notice">
          <span>今日已达自动分析上限</span><button type="button" onClick={() => editContext(true)}>调整上限</button>
        </div> : null}
      </details>
    {editing ? <ExplorationDialog title="这次的目标与条件" onClose={() => setEditing(false)}>
      <form className="exploration-form" onSubmit={event => { event.preventDefault(); props.onUpdate(current => ({ ...current, goal: goal.trim(), constraints: constraints.trim(), dailyLimit: limited ? limit : null })); setEditing(false); }}>
        <label>这次想得到什么？<input autoFocus required maxLength={300} value={goal} onChange={event => setGoal(event.target.value)} /></label>
        <label>受众、限制与必须保留的内容 <span>选填</span><textarea rows={4} maxLength={5000} value={constraints} onChange={event => setConstraints(event.target.value)} placeholder="例如：面向第一次接触建筑史的人；活动改为 60 分钟；保留屋架观察。" /></label>
        <details className="collaboration-automatic" open={showAutomatic} onToggle={event => setShowAutomatic(event.currentTarget.open)}>
          <summary>自动分析设置 <span>{limited ? `每天最多 ${limit} 次` : '不限次数'}</span></summary>
          <div>
            <p>白板内容有变化时，自动分析会使用你连接的模型额度。达到上限后，当天仍可手动分析和对话。</p>
            <label className="collaboration-limit-toggle"><input type="checkbox" checked={limited} onChange={event => setLimited(event.target.checked)} /> 限制每日自动分析次数</label>
            {limited ? <label className="collaboration-limit-field">每日次数<input type="number" min={1} max={50} value={limit} onChange={event => setLimit(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} /></label> : null}
          </div>
        </details>
        <div className="exploration-actions"><button type="submit" className="exploration-primary">保存目标与条件</button></div>
      </form>
    </ExplorationDialog> : null}
  </section>;
}
