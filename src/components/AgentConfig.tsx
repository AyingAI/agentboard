import { useEffect, useState } from 'react';
import type { AgentConfig, AgentProvider } from '../types/dsl';
import { fetchCLIs } from '../agent/localCliAgent';

interface CliInfo {
  id: string;
  name: string;
  available: boolean;
  version?: string;
}

interface AgentConfigPanelProps {
  config: AgentConfig;
  onSetApiKey: (key: string) => void;
  onSetModel: (model: string) => void;
  onSetProvider: (provider: AgentProvider) => void;
  onSetCliId: (cliId: string) => void;
  onSetBaseUrl: (url: string) => void;
  onClose: () => void;
}

const CLAUDE_MODELS = [
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

const OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'o1', label: 'o1' },
];

export default function AgentConfigPanel({
  config,
  onSetApiKey,
  onSetModel,
  onSetProvider,
  onSetCliId,
  onSetBaseUrl,
  onClose,
}: AgentConfigPanelProps) {
  const [clis, setClis] = useState<CliInfo[]>([]);
  const [loadingClis, setLoadingClis] = useState(true);

  useEffect(() => {
    fetchCLIs()
      .then(setClis)
      .catch(() => setClis([]))
      .finally(() => setLoadingClis(false));
  }, []);

  const availableClis = clis.filter((c) => c.available);

  return (
    <div className="agent-config-overlay" onClick={onClose}>
      <div className="agent-config-panel" onClick={(e) => e.stopPropagation()}>
        <div className="agent-config-header">
          <h2>Agent 设置</h2>
          <button type="button" className="ghost small" onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="config-field">
          <span>Provider</span>
          <select
            value={config.provider}
            onChange={(e) => onSetProvider(e.target.value as AgentProvider)}
          >
            <option value="local-cli" disabled={loadingClis}>
              本地 CLI{loadingClis ? '（检测中…）' : availableClis.length === 0 ? '（未检测到 CLI）' : ''}
            </option>
            <option value="claude">Claude API</option>
            <option value="openai">OpenAI / 兼容 API</option>
          </select>
        </label>

        {config.provider === 'local-cli' && (
          <label className="config-field">
            <span>选择 CLI</span>
            <select
              value={config.cliId || ''}
              onChange={(e) => onSetCliId(e.target.value)}
            >
              <option value="" disabled>
                请选择…
              </option>
              {availableClis.map((cli) => (
                <option key={cli.id} value={cli.id}>
                  {cli.name}{cli.version ? ` (${cli.version})` : ''}
                </option>
              ))}
            </select>
            {!loadingClis && availableClis.length === 0 && (
              <span className="config-hint">
                未检测到本地 CLI。请确认已安装 Claude Code（<code>claude</code>）或 OpenCode（<code>opencode</code>）。
              </span>
            )}
          </label>
        )}

        {config.provider === 'claude' && (
          <>
            <label className="config-field">
              <span>API Key</span>
              <input type="password" value={config.apiKey || ''}
                onChange={(e) => onSetApiKey(e.target.value)} placeholder="sk-ant-api03-..." />
            </label>
            <label className="config-field">
              <span>Model</span>
              <select value={config.model || 'claude-opus-4-20250514'}
                onChange={(e) => onSetModel(e.target.value)}>
                {CLAUDE_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
          </>
        )}

        {config.provider === 'openai' && (
          <>
            <label className="config-field">
              <span>API Key</span>
              <input type="password" value={config.apiKey || ''}
                onChange={(e) => onSetApiKey(e.target.value)} placeholder="sk-..." />
            </label>
            <label className="config-field">
              <span>Model</span>
              <select value={config.model || 'gpt-4o'}
                onChange={(e) => onSetModel(e.target.value)}>
                {OPENAI_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label className="config-field">
              <span>Base URL（可选）</span>
              <input type="text" value={config.baseUrl || ''}
                onChange={(e) => onSetBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1" />
              <span className="config-hint">
                支持任何 OpenAI 兼容 API，如 Ollama、LM Studio、DeepSeek 等。
              </span>
            </label>
          </>
        )}

        <p className="config-note">
          {config.provider === 'local-cli'
            ? '通过本地 CLI 调用 Agent，复用已有配置和认证。'
            : config.provider === 'openai'
              ? '支持 OpenAI 及任何兼容 API（Ollama、DeepSeek、LM Studio 等），填写 Base URL 即可切换。'
              : '使用 Anthropic Claude API，需确保 Key 有 Messages API 权限。'}
        </p>
      </div>
    </div>
  );
}
