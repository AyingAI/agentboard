import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { BoardNode } from '../types/dsl';
import { EXPLORATIONS, sourceLink, splitMaterial, type ExplorationKind } from '../data/exploration';
import './exploration.css';

export function ExplorationDialog({ title, children, onClose, suspended = false }: {
  title: string; children: ReactNode; onClose: () => void; suspended?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || suspended) return;
    dialog.showModal();
    return () => dialog.close();
  }, [suspended]);
  return <dialog ref={ref} className="exploration-dialog" aria-modal={suspended ? undefined : true} aria-labelledby={headingId}
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <div className="exploration-dialog-heading">
      <h2 id={headingId}>{title}</h2>
      <button type="button" aria-label="关闭" onClick={onClose}>×</button>
    </div>
    {children}
  </dialog>;
}

export function ExplorationStart({ onStart }: {
  onStart: (kind: ExplorationKind, question: string, material?: string, example?: boolean) => void;
}) {
  const [kind, setKind] = useState<ExplorationKind | null>(null);
  const [question, setQuestion] = useState('');
  const [material, setMaterial] = useState('');
  const task = kind ? EXPLORATIONS[kind] : null;
  return <>
    <div className="exploration-entries">
      {(Object.keys(EXPLORATIONS) as ExplorationKind[]).map(id => (
        <div key={id} className="exploration-entry">
          <button type="button" className="exploration-entry-start" onClick={() => { setKind(id); setQuestion(''); setMaterial(''); }}>
            <span className="exploration-entry-label">{EXPLORATIONS[id].label}</span>
            <strong>{EXPLORATIONS[id].title}<span aria-hidden="true">↗</span></strong>
            <small>{EXPLORATIONS[id].description}</small>
          </button>
          <button type="button" className="exploration-example" onClick={() => onStart(id, '', '', true)}>查看{EXPLORATIONS[id].label}示例</button>
        </div>
      ))}
    </div>
    {kind && task ? <ExplorationDialog title={task.title} onClose={() => setKind(null)}>
      <form className="exploration-form" onSubmit={event => {
        event.preventDefault();
        if (question.trim()) onStart(kind, question, material);
      }}>
        <label>{task.question}<input autoFocus required value={question} maxLength={140} placeholder={task.placeholder} onChange={event => setQuestion(event.target.value)} /></label>
        <label>第一条资料 <span>选填</span><textarea value={material} placeholder="粘贴链接、摘录，或记下一个想法" rows={3} onChange={event => setMaterial(event.target.value)} /></label>
        <p>白板保存在此浏览器。连接 Agent 后，加入材料或改变条件会自动分析、准备发现，可以随时暂停。</p>
        <div className="exploration-actions"><button type="submit" className="exploration-primary" disabled={!question.trim()}>创建我的白板</button></div>
      </form>
    </ExplorationDialog> : null}
  </>;
}

export function MaterialDialog({ onClose, onSave }: {
  onClose: () => void; onSave: (text: string, title: string, url: string) => void;
}) {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const validUrl = !url.trim() || Boolean(sourceLink(url.trim()));
  return <ExplorationDialog title="添加资料" onClose={onClose}>
    <form className="exploration-form" onSubmit={event => {
      event.preventDefault();
      if ((text.trim() || url.trim()) && validUrl) onSave(text, title, url);
    }}>
      <label>链接、摘录或笔记<textarea autoFocus value={text} onChange={event => setText(event.target.value)} placeholder="粘贴一条链接，或写下你发现的线索" rows={4} /></label>
      <label>标题 <span>选填</span><input value={title} maxLength={140} onChange={event => setTitle(event.target.value)} /></label>
      <label>原文链接 <span>摘录有出处时可补充</span><input value={url} onChange={event => setUrl(event.target.value)} inputMode="url" placeholder="https://" aria-invalid={!validUrl} /></label>
      {validUrl ? <p>只粘贴链接也可以保存，方便之后打开原文。</p> : <p role="alert">请输入以 http:// 或 https:// 开头的有效链接。</p>}
      <div className="exploration-actions"><button type="submit" className="exploration-primary" disabled={!(text.trim() || url.trim()) || !validUrl}>保存到白板</button></div>
    </form>
  </ExplorationDialog>;
}

export function DiscussionDialog({ nodes, selectedIds, onClose, onSend, onConnect, configured, suspended, busy }: {
  nodes: BoardNode[]; selectedIds: string[]; onClose: () => void;
  onSend: (ids: string[], question: string) => void; onConnect: () => void;
  configured: boolean; suspended: boolean; busy: boolean;
}) {
  const [ids, setIds] = useState(selectedIds);
  const [question, setQuestion] = useState('');
  const targets = nodes.filter(node => ids.includes(node.id));
  const suggestion = targets.length > 1
    ? '这些线索之间有哪些联系、差异或矛盾？哪一个新问题值得追查？'
    : '沿着这条线索，有哪些值得追查的方向？还需要什么资料？';
  return <ExplorationDialog title="继续探索" onClose={onClose} suspended={suspended}>
    <form className="exploration-form" onSubmit={event => {
      event.preventDefault();
      if (!targets.length || busy) return;
      if (!configured) { onConnect(); return; }
      onSend(targets.map(node => node.id), question.trim() || suggestion);
    }}>
      <fieldset className="exploration-targets">
        <legend>选取要讨论的线索</legend>
        {nodes.map(node => <label key={node.id}><input type="checkbox" checked={ids.includes(node.id)} onChange={event => {
          setIds(event.target.checked ? [...ids, node.id] : ids.filter(id => id !== node.id));
        }} /><span>{node.title}</span></label>)}
      </fieldset>
      <label>想继续问什么？<textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder={suggestion} rows={3} /></label>
      <p>{busy ? '请先完成当前讨论或处理已有提案。' : targets.length ? `已选 ${targets.length} 条。新增的建议由你决定是否保存。` : '选一条可以展开，选多条可以比较。'}</p>
      <div className="exploration-actions"><button type="submit" className="exploration-primary" disabled={!targets.length || busy}>{configured ? '发送给 Agent' : '连接 Agent'}</button></div>
    </form>
  </ExplorationDialog>;
}

export function DraftDialog({ title, boardDraft, selectedDraft, selectionCount, onClose }: {
  title: string; boardDraft: string; selectedDraft?: string; selectionCount: number; onClose: () => void;
}) {
  const [scope, setScope] = useState<'board' | 'selection'>('board');
  const [drafts, setDrafts] = useState({ board: boardDraft, selection: selectedDraft ?? '' });
  const [status, setStatus] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const scopeName = useId();
  const draft = drafts[scope];
  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setStatus('已复制到剪贴板');
    } catch {
      textarea.current?.focus();
      textarea.current?.select();
      setStatus('已选中文本，请使用设备的复制快捷键');
    }
  }
  return <ExplorationDialog title={title} onClose={onClose}>
    <div className="exploration-form">
      {selectedDraft ? <fieldset className="exploration-targets exploration-draft-scope">
        <legend>整理范围</legend>
        <label><input type="radio" name={scopeName} checked={scope === 'board'} onChange={() => { setScope('board'); setStatus(''); }} />整张白板</label>
        <label><input type="radio" name={scopeName} checked={scope === 'selection'} onChange={() => { setScope('selection'); setStatus(''); }} />选中的 {selectionCount} 条内容及关联资料</label>
      </fieldset> : null}
      <p>可以先编辑，再复制到文档。</p>
      <textarea ref={textarea} aria-label={title} rows={12} value={draft} onChange={event => {
        const value = event.target.value;
        setDrafts(current => ({ ...current, [scope]: value })); setStatus('');
      }} />
      <div className="exploration-actions"><span role="status">{status}</span><button type="button" className="exploration-primary" disabled={!draft.trim()} onClick={() => void copy()}>复制 Markdown</button></div>
    </div>
  </ExplorationDialog>;
}

export function CardMaterial({ body, className, onDoubleClick }: {
  body: string; className?: string; onDoubleClick?: (event: React.MouseEvent<HTMLParagraphElement>) => void;
}) {
  const { text, url } = splitMaterial(body);
  return <>
    <p className={className} onDoubleClick={onDoubleClick}>{text || (url ? '已保存链接' : '')}</p>
    {url ? <a className="exploration-source" href={url} target="_blank" rel="noopener noreferrer" onPointerDown={event => event.stopPropagation()}>打开原文 <span aria-hidden="true">↗</span></a> : null}
  </>;
}
