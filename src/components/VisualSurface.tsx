import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VisualContent, VisualReference } from '../types/dsl';
import { buildVisualSandbox } from '../visuals/sandbox';
import { readVisualReference, validVisualState, visualError } from '../visuals/contract';

interface Props {
  preview?: boolean;
  nodeId: string;
  title: string;
  visual: VisualContent;
  onStateChange: (nodeId: string, state: Record<string, unknown>) => void;
  onReference: (reference: VisualReference) => void;
  onAsk: (nodeId: string, text: string) => void;
}

export default function VisualSurface(props: Props) {
  const { nodeId, title, visual } = props;
  const [expanded, setExpanded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const lastState = useRef('');
  const channel = useMemo(() => crypto.randomUUID(), [nodeId, visual.html, generation, expanded]);
  const srcDoc = useMemo(() => buildVisualSandbox(channel), [channel]);
  const contractError = visualError(visual);

  function post(message: Record<string, unknown>) {
    iframeRef.current?.contentWindow?.postMessage({ channel, ...message }, '*');
  }

  function initialize() {
    lastState.current = JSON.stringify(latest.current.visual.state ?? {});
    post({ type: 'init', html: latest.current.visual.html, state: latest.current.visual.state ?? {} });
  }

  useEffect(() => {
    setError(null); setStatus('loading'); setPicking(false);
    const timer = window.setTimeout(() => {
      setError('视觉加载较久，可以重新运行，或引用此视觉让 Agent 修复。');
    }, 15000);
    function receive(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow || event.data?.channel !== channel) return;
      const msg = event.data;
      if (msg.type === 'rendered') { clearTimeout(timer); setStatus('ready'); }
      if (msg.type === 'error') { clearTimeout(timer); setError(String(msg.message).slice(0, 500)); }
      if (msg.type === 'state' && validVisualState(msg.state)) {
        const encoded = JSON.stringify(msg.state);
        if (encoded !== lastState.current) {
          lastState.current = encoded;
          latest.current.onStateChange(nodeId, msg.state);
        }
      }
      if (msg.type === 'reference') {
        const ref = readVisualReference(nodeId, msg.reference);
        if (ref) { setPicking(false); latest.current.onReference(ref); }
      }
      if (msg.type === 'ask' && typeof msg.text === 'string' && msg.text.trim()) {
        // Only draft a request. Arbitrary generated JS cannot submit a privileged agent run.
        let context = '';
        try { context = msg.context == null ? '' : JSON.stringify(msg.context).slice(0, 3000); } catch { /* Unserializable content is not needed to draft the question. */ }
        latest.current.onAsk(nodeId, `${msg.text.slice(0, 4000)}${context ? `\n交互上下文：${context}` : ''}`);
        setExpanded(false);
      }
    }
    window.addEventListener('message', receive);
    return () => { clearTimeout(timer); window.removeEventListener('message', receive); };
  }, [channel, nodeId]);

  useEffect(() => {
    const encoded = JSON.stringify(visual.state ?? {});
    if (encoded !== lastState.current && status === 'ready') {
      lastState.current = encoded;
      post({ type: 'restore', state: visual.state ?? {} });
    }
  }, [visual.state, status, channel]);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement as HTMLElement | null;
    const close = document.querySelector<HTMLButtonElement>('.visual-expanded .visual-close');
    close?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); setExpanded(false); }
      if (event.key === 'Tab') {
        const controls = Array.from(document.querySelectorAll<HTMLElement>('.visual-expanded button,.visual-expanded iframe'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    window.addEventListener('keydown', keydown, true);
    return () => { window.removeEventListener('keydown', keydown, true); previous?.focus(); };
  }, [expanded]);

  const surface = (
    <section className={`visual-surface${expanded ? ' visual-expanded' : ''}`}
      role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined} aria-label={title}
      onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}>
      <div className="visual-tools">
        <span className="visual-status"><i className={status} />{expanded ? title : '可交互视觉'}</span>
        <div>
          {!props.preview ? <><button type="button" className={picking ? 'active' : ''} aria-pressed={picking}
            onClick={() => { post({ type: 'pick', active: !picking }); setPicking(!picking); }}>
            {picking ? '点击图中要讨论的元素' : '引用细节'}
          </button>
          <button type="button" onClick={() => latest.current.onAsk(nodeId, '请基于这个视觉的当前状态继续分析。')}>与 Agent 讨论</button></> : null}
          {expanded
            ? <button type="button" className="visual-close" onClick={() => setExpanded(false)}>收起</button>
            : <button type="button" onClick={() => setExpanded(true)}>展开</button>}
        </div>
      </div>
      {contractError ? <div className="visual-error" role="alert">{contractError}</div> : (
        <div className={`visual-frame${status === 'loading' && !error ? ' is-loading' : ''}`} aria-busy={status === 'loading'}>
          <iframe ref={iframeRef} title={`${title} · 交互内容`} srcDoc={srcDoc}
            sandbox="allow-scripts" referrerPolicy="no-referrer" tabIndex={status === 'loading' ? -1 : 0}
            allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
            onLoad={initialize} style={{ height: expanded ? undefined : (visual.height ?? 420) }} />
          {status === 'loading' && !error ? <div className="visual-loading" role="status"><span aria-hidden="true" />正在准备交互内容</div> : null}
        </div>
      )}
      {error ? <div className="visual-error" role="status">
        <span>{error}</span>
        <button type="button" onClick={() => setGeneration(n => n + 1)}>重新运行</button>
        <button type="button" onClick={() => latest.current.onAsk(nodeId, `请修复此视觉的运行问题：${error}`)}>让 Agent 修复</button>
      </div> : <div className="visual-footnote">{status === 'loading' ? '正在运行视觉…' : props.preview ? '预览中的操作不会修改白板' : '直接操作 · 状态自动保存 · 引用细节后可继续追问'}</div>}
    </section>
  );

  return expanded ? <>
    <button type="button" className="visual-open-placeholder" onClick={() => setExpanded(false)}>视觉已展开 · 点击回到画布</button>
    {createPortal(<div className="visual-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) setExpanded(false); }}>{surface}</div>, document.body)}
  </> : surface;
}
