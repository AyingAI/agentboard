import { useEffect, useRef, useState } from 'react';
import type { AgentConfig } from '../types/dsl';
import { testJev } from '../agent/jev';

type JevConfig = NonNullable<AgentConfig['jev']>;

interface Props {
  value?: JevConfig;
  onChange: (value: JevConfig) => void;
}

export default function JevSettings({ value, onChange }: Props) {
  const jev = value ?? { enabled: false, apiKey: '', model: 'jev-latest' };
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<{ state: 'working' | 'success' | 'error'; text: string }>();
  const request = useRef<AbortController | null>(null);
  const configured = Boolean(jev.apiKey.trim());
  useEffect(() => () => request.current?.abort(), []);

  function updateConnection(patch: Partial<JevConfig>) {
    request.current?.abort();
    setResult(undefined);
    onChange({ ...jev, ...patch });
  }

  async function checkConnection() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setResult({ state: 'working', text: '正在连接…' });
    try {
      const model = await testJev(jev, controller.signal);
      if (!controller.signal.aborted) setResult({ state: 'success', text: `连接成功 · ${model}` });
    } catch (error) {
      if (!controller.signal.aborted) setResult({ state: 'error', text: error instanceof Error ? error.message : '连接失败，请检查密钥和模型' });
    }
  }

  return <section className="jev-settings" aria-labelledby="jev-settings-title">
    <div className="jev-settings-main">
      <div className="jev-settings-header">
        <span className="jev-settings-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5 19 6v5.3c0 4.1-2.7 7-7 9.2-4.3-2.2-7-5.1-7-9.2V6l7-2.5Z"/><path d="m9 11.8 2 2 4-4"/></svg>
        </span>
        <h3 id="jev-settings-title">Jev 复查</h3>
        <span className="jev-optional">选配</span>
        <button className="jev-switch" type="button" role="switch" aria-checked={jev.enabled} aria-label="启用 Jev 复查" onClick={() => {
          onChange({ ...jev, enabled: !jev.enabled });
          if (!jev.enabled && !configured) setExpanded(true);
        }}><span /></button>
      </div>
      <p>资料或条件变了，帮你找出哪些成果需要重看。</p>
    </div>
    <details className="jev-connection" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>
        <span>{configured ? '连接设置' : '配置连接'}</span>
        <small className={configured && jev.enabled ? 'is-enabled' : ''}><i aria-hidden="true" />{configured ? (jev.enabled ? '已启用' : '已关闭') : '待配置'}</small>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="m4.5 6 3.5 3.5L11.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </summary>
      <div className="jev-connection-body">
        <div className="jev-connection-fields">
          <label className="config-field"><span>Jev API 密钥</span><input type="password" autoComplete="off" value={jev.apiKey} onChange={event => updateConnection({ apiKey: event.target.value })} placeholder="填写 TypeSafe 密钥" /></label>
          <label className="config-field"><span>Jev 模型</span><input value={jev.model || ''} onChange={event => updateConnection({ model: event.target.value })} placeholder="jev-latest" /></label>
        </div>
        <div className="jev-connection-test">
          <button type="button" className="config-inline-button" disabled={!configured || result?.state === 'working'} onClick={checkConnection}>{result?.state === 'working' ? '测试中…' : '测试连接'}</button>
          <span className={result?.state} role="status">{result?.text}</span>
        </div>
        <p className="jev-connection-note">启用后会把当前目标、条件和本次复查涉及的内容发送给 TypeSafe。密钥保存在此浏览器。</p>
      </div>
    </details>
  </section>;
}
