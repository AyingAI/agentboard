import { useEffect, useRef, useState } from 'react';
import type { AgentConfig, AgentProvider, BoardDSL, LocalCliInfo } from '../types/dsl';
import type { AgentAdapter, AgentError } from '../agent/types';
import { ClaudeAgentAdapter } from '../agent/claudeAgent';
import { fetchCLIs, LocalCliAdapter } from '../agent/localCliAgent';
import { OpenAIAgentAdapter } from '../agent/openaiAgent';
import { applyPatch } from '../engine/patch';
import SettingsSelect from './SettingsSelect';
import './settings.css';

type ModelOption = {
  value: string;
  label: string;
};

interface AgentConfigPanelProps {
  config: AgentConfig;
  onSetApiKey: (key: string) => void;
  onSetModel: (model: string) => void;
  onSetProvider: (provider: AgentProvider) => void;
  onSetCliId: (cliId: string) => void;
  onSetBaseUrl: (url: string) => void;
  onSetMaxOutputTokens: (value: number) => void;
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

const DEFAULT_CLAUDE_BASE_URL = 'https://api.anthropic.com/v1';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

type TestState =
  | { status: 'idle'; message: string; detail?: string }
  | { status: 'running'; message: string; detail?: string }
  | { status: 'success'; message: string; detail?: string }
  | { status: 'error'; message: string; detail?: string };

type ModelFetchState =
  | { status: 'idle'; message?: string }
  | { status: 'running'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

const SCHEMA_TEST_BOARD: BoardDSL = {
  version: '0.1',
  board: { id: 'board_schema_test', title: 'Agent schema test', viewport: { x: 0, y: 0, zoom: 1 } },
  nodes: [
    {
      id: 'node_existing',
      type: 'card',
      x: 120,
      y: 120,
      width: 240,
      height: 100,
      title: 'Existing node',
      body: 'Use this board only for an output schema test.',
    },
  ],
  edges: [],
  groups: [],
  metadata: {},
};

function createAdapter(config: AgentConfig): AgentAdapter | null {
  if (config.provider === 'local-cli' && config.cliId) {
    return new LocalCliAdapter(config.cliId);
  }
  if (config.provider === 'claude' && config.apiKey) {
    return new ClaudeAgentAdapter(config);
  }
  if (config.provider === 'openai' && config.apiKey) {
    return new OpenAIAgentAdapter({ apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl, maxOutputTokens: config.maxOutputTokens });
  }
  return null;
}

function normalizeApiBaseUrl(rawUrl: string | undefined, defaultUrl: string) {
  const value = (rawUrl || defaultUrl).trim().replace(/\/+$/, '');
  if (/\/v\d+$/i.test(value)) return value;
  return `${value}/v1`;
}

function modelSourceKey(provider: AgentProvider, baseUrl: string | undefined) {
  if (provider === 'claude') return `${provider}:${normalizeApiBaseUrl(baseUrl, DEFAULT_CLAUDE_BASE_URL)}`;
  if (provider === 'openai') return `${provider}:${normalizeApiBaseUrl(baseUrl, DEFAULT_OPENAI_BASE_URL)}`;
  return provider;
}

function extractModelOptions(body: unknown): ModelOption[] {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];

  const options = data
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id : '';
      if (!id) return null;
      const displayName = typeof record.display_name === 'string'
        ? record.display_name
        : typeof record.name === 'string'
          ? record.name
          : id;
      return { value: id, label: displayName };
    })
    .filter((option): option is ModelOption => Boolean(option));

  return Array.from(new Map(options.map((option) => [option.value, option])).values())
    .sort((a, b) => a.label.localeCompare(b.label));
}

function modelOptionsWithCurrent(options: ModelOption[], currentModel: string | undefined) {
  if (!currentModel || options.some((option) => option.value === currentModel)) return options;
  return [{ value: currentModel, label: currentModel }, ...options];
}

export default function AgentConfigPanel({
  config,
  onSetApiKey,
  onSetModel,
  onSetProvider,
  onSetCliId,
  onSetBaseUrl,
  onSetMaxOutputTokens,
  onClose,
}: AgentConfigPanelProps) {
  const [clis, setClis] = useState<LocalCliInfo[]>([]);
  const [loadingClis, setLoadingClis] = useState(true);
  const [cliError, setCliError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const [testState, setTestState] = useState<TestState>({
    status: 'idle',
    message: '尚未测试当前 Agent 的结构化输出能力。',
  });
  const [modelsBySource, setModelsBySource] = useState<Record<string, ModelOption[]>>({});
  const [modelFetchState, setModelFetchState] = useState<ModelFetchState>({ status: 'idle' });

  useEffect(() => {
    let active = true;
    fetchCLIs(false, true)
      .then(items => { if (active) setClis(items); })
      .catch(() => { if (active) setCliError('无法读取本地 CLI，请确认本地服务正在运行后重试。'); })
      .finally(() => { if (active) setLoadingClis(false); });
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { active = false; previous?.focus(); };
  }, []);

  async function refreshClis() {
    setLoadingClis(true); setCliError('');
    try { setClis(await fetchCLIs(true, true)); }
    catch { setCliError('重新检测失败，请检查本地服务后重试。'); }
    finally { setLoadingClis(false); }
  }

  useEffect(() => {
    setModelFetchState({ status: 'idle' });
  }, [config.provider, config.baseUrl, config.apiKey]);

  const availableClis = clis.filter((c) => c.available);
  const selectedCli = availableClis.find(cli => cli.id === config.cliId);
  const cliOptions = availableClis.map(cli => ({
    value: cli.id, label: cli.name,
    badge: cli.version?.match(/\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?/)?.[0],
    description: (cli.installations?.length ?? 0) > 1 ? `发现 ${cli.installations!.length} 份安装 · ${cli.version ? '已选择可识别的较新版本' : '按终端路径选择'}` : '沿用本机登录与配置',
  }));
  if (config.cliId && !selectedCli && !loadingClis) cliOptions.unshift({ value: config.cliId, label: `${config.cliId} · 当前未找到`, badge: undefined, description: '请重新检测或选择其他工具' });
  const currentModelSourceKey = modelSourceKey(config.provider, config.baseUrl);
  const fetchedModelOptions = modelsBySource[currentModelSourceKey] ?? [];
  const defaultModelOptions = config.provider === 'claude' ? CLAUDE_MODELS : OPENAI_MODELS;
  const apiModelOptions = modelOptionsWithCurrent(
    fetchedModelOptions.length > 0 ? fetchedModelOptions : defaultModelOptions,
    config.model,
  );

  const canRunSchemaTest = Boolean(
    (config.provider === 'local-cli' && selectedCli) ||
    (config.provider === 'claude' && config.apiKey) ||
    (config.provider === 'openai' && config.apiKey),
  );

  async function runSchemaTest() {
    const adapter = createAdapter(config);
    if (!adapter) {
      setTestState({
        status: 'error',
        message: '当前 Agent 未配置完整，无法测试。',
      });
      return;
    }

    setTestState({ status: 'running', message: '正在请求 Agent 返回结构化结果…' });
    try {
      const response = await adapter.generateResponse({
        boardState: SCHEMA_TEST_BOARD,
        userMessage: [
          'This is an AgentBoard schema test.',
          'Return one valid DSLPatch only.',
          'Add exactly one note node with id "node_schema_test", title "Schema test", and body "Structured output works."',
          'Do not ask a question unless you absolutely cannot produce a patch.',
        ].join('\n'),
        runId: 'run_schema_test',
        allowedOps: ['add_node'],
      });

      if (response.type === 'interaction_request') {
        setTestState({
          status: 'success',
          message: '结构化响应通过：Agent 返回了 interaction_request。',
          detail: response.message,
        });
        return;
      }

      const { result } = applyPatch(SCHEMA_TEST_BOARD, response);
      if (!result.applied) {
        setTestState({
          status: 'error',
          message: 'Agent 返回了 JSON，但 patch 未通过校验。',
          detail: result.errors.map((error) => error.message).join('\n'),
        });
        return;
      }

      setTestState({
        status: 'success',
        message: '结构化输出通过：JSON 解析、patch 校验和临时应用都成功。',
        detail: response.summary,
      });
    } catch (error) {
      const agentError = error as AgentError;
      setTestState({
        status: 'error',
        message: agentError.message || '结构化输出测试失败。',
        detail: agentError.rawText,
      });
    }
  }

  async function fetchApiModels() {
    if (config.provider !== 'claude' && config.provider !== 'openai') return;
    if (!config.apiKey) {
      setModelFetchState({ status: 'error', message: '请先填写 API Key。' });
      return;
    }

    const baseUrl = config.provider === 'claude'
      ? normalizeApiBaseUrl(config.baseUrl, DEFAULT_CLAUDE_BASE_URL)
      : normalizeApiBaseUrl(config.baseUrl, DEFAULT_OPENAI_BASE_URL);
    const endpoint = `${baseUrl}/models`;
    const headers: Record<string, string> = config.provider === 'claude'
      ? {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        }
      : {
          'Authorization': `Bearer ${config.apiKey}`,
        };

    setModelFetchState({ status: 'running', message: '正在获取模型列表…' });
    try {
      const response = await fetch(endpoint, { headers });
      if (!response.ok) {
        setModelFetchState({ status: 'error', message: `获取失败：API 返回 ${response.status}。` });
        return;
      }

      const body = await response.json();
      const models = extractModelOptions(body);
      if (models.length === 0) {
        setModelFetchState({ status: 'error', message: '没有从 API 响应中找到可选模型。' });
        return;
      }

      setModelsBySource((prev) => ({ ...prev, [currentModelSourceKey]: models }));
      if (!config.model || !models.some((model) => model.value === config.model)) {
        onSetModel(models[0].value);
      }
      setModelFetchState({ status: 'success', message: `已获取 ${models.length} 个模型。` });
    } catch {
      setModelFetchState({ status: 'error', message: '无法连接模型接口，请检查 API Key、Base URL 或网络。' });
    }
  }

  return (
    <div className="agent-config-overlay" onClick={onClose}>
      <div ref={panelRef} className="agent-config-panel" role="dialog" aria-modal="true" aria-labelledby="agent-config-title" onClick={(e) => e.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
          if (event.key === 'Tab') {
            const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary') || []).filter(item => item.offsetParent !== null);
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); items[0]?.focus(); }
          }
        }}>
        <div className="agent-config-header">
          <h2 id="agent-config-title">Agent 设置</h2>
          <button type="button" className="ghost small" onClick={onClose} aria-label="关闭 Agent 设置">
            ✕
          </button>
        </div>

        <label className="config-field">
          <span>连接方式</span>
          <SettingsSelect label="连接方式" value={config.provider} onChange={value => onSetProvider(value as AgentProvider)} options={[
            { value: 'local-cli', label: '本地 CLI', badge: '推荐', description: '沿用本机的模型、登录与工具配置' },
            { value: 'claude', label: 'Claude API', description: '连接 Anthropic 或兼容服务' },
            { value: 'openai', label: 'OpenAI / 兼容 API', description: '使用你选择的模型与服务地址' },
          ]} />
        </label>

        <section className={`provider-recommendation ${config.provider === 'local-cli' ? 'selected' : ''}`}>
          <strong>{config.provider === 'local-cli' ? '当前为推荐模式' : '推荐优先使用本地 CLI'}</strong>
          <p>
            {config.provider === 'local-cli' ? '复用本机已有的模型、认证和工具。检测到多份安装时，优先使用可识别的较新版本。' : '直接连接模型服务。你可以选择模型、调整输出空间，并让它自由生成交互视觉。'}
          </p>
        </section>

        {config.provider === 'local-cli' && (
          <div className="config-field">
            <div className="config-field-heading"><span>选择 CLI</span>
              <button type="button" className="cli-refresh" disabled={loadingClis} onClick={refreshClis}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 6A5 5 0 1 0 13 10M13 2v4H9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {loadingClis ? '正在检测…' : '重新检测'}
              </button>
            </div>
            <SettingsSelect label="选择 CLI" value={config.cliId || ''} onChange={onSetCliId} options={cliOptions} placeholder={loadingClis ? '正在查找本机的 Agent…' : '选择一个本地 Agent'} disabled={loadingClis} />
            {cliError ? <span className="config-hint error" role="alert">{cliError}</span> : !loadingClis && availableClis.length ? <span className="cli-detection-note">已检测到 {availableClis.length} 个工具 · 升级或安装后可重新检测</span> : null}
            {selectedCli?.path ? <details className="cli-installation-details" key={selectedCli.id}>
              <summary>查看实际使用的路径{(selectedCli.installations?.length ?? 0) > 1 ? ` · ${selectedCli.installations!.length} 份安装` : ''}</summary>
              <code>{selectedCli.path}</code>
              {selectedCli.installations?.filter(item => item.path !== selectedCli.path).map(item => <div key={item.path} className="cli-installation-alternative">其他安装 · {item.version || '版本未能读取'}<code>{item.path}</code></div>)}
            </details> : null}
            {!loadingClis && !cliError && availableClis.length === 0 && (
              <span className="config-hint">
                未检测到受支持的本地 CLI。当前支持 Claude Code、OpenCode、Pi CLI、Codex CLI、Gemini CLI、Antigravity、Qwen Code、Cursor Agent、GitHub Copilot CLI、Qoder、Kimi 和 Trae。
              </span>
            )}
          </div>
        )}

        {config.provider === 'claude' && (
          <>
            <label className="config-field">
              <span>API Key</span>
              <input type="password" value={config.apiKey || ''}
                onChange={(e) => onSetApiKey(e.target.value)} placeholder="sk-ant-api03-..." />
            </label>
            <label className="config-field">
              <span>Base URL</span>
              <input type="text" value={config.baseUrl || ''}
                onChange={(e) => onSetBaseUrl(e.target.value)}
                placeholder={DEFAULT_CLAUDE_BASE_URL} />
            </label>
            <div className="config-field">
              <div className="config-field-heading">
                <span>模型</span>
                <button
                  type="button"
                  className="config-inline-button"
                  onClick={fetchApiModels}
                  disabled={!config.apiKey || modelFetchState.status === 'running'}
                >
                  {modelFetchState.status === 'running' ? '获取中…' : '获取模型'}
                </button>
              </div>
              <SettingsSelect label="Claude 模型" value={config.model || 'claude-opus-4-20250514'} onChange={onSetModel} options={apiModelOptions.map(model => ({ value: model.value, label: model.label }))} searchable />
              {modelFetchState.message ? (
                <span className={`config-hint ${modelFetchState.status}`}>{modelFetchState.message}</span>
              ) : null}
            </div>
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
              <span>Base URL</span>
              <input type="text" value={config.baseUrl || ''}
                onChange={(e) => onSetBaseUrl(e.target.value)}
                placeholder={DEFAULT_OPENAI_BASE_URL} />
              <span className="config-hint">
                支持任何 OpenAI 兼容 API，如 Ollama、LM Studio、DeepSeek 等。
              </span>
            </label>
            <div className="config-field">
              <div className="config-field-heading">
                <span>模型</span>
                <button
                  type="button"
                  className="config-inline-button"
                  onClick={fetchApiModels}
                  disabled={!config.apiKey || modelFetchState.status === 'running'}
                >
                  {modelFetchState.status === 'running' ? '获取中…' : '获取模型'}
                </button>
              </div>
              <SettingsSelect label="OpenAI 模型" value={config.model || 'gpt-4o'} onChange={onSetModel} options={apiModelOptions.map(model => ({ value: model.value, label: model.label }))} searchable />
              {modelFetchState.message ? (
                <span className={`config-hint ${modelFetchState.status}`}>{modelFetchState.message}</span>
              ) : null}
            </div>
          </>
        )}

        {config.provider !== 'local-cli' ? <>
          <label className="config-field"><span>自定义模型 ID（也可以从上方列表选择）</span>
            <input type="text" value={config.model || ''} onChange={event => onSetModel(event.target.value)} placeholder="填写你的服务支持的模型 ID" />
          </label>
          <details className="config-field"><summary>生成设置</summary>
            <label><span>最大输出 tokens</span><input aria-label="最大输出 tokens" type="number" min={1024} max={131072} step={1024}
              value={config.maxOutputTokens || 16384} onChange={event => { const value = Number(event.target.value); if (value >= 1024 && value <= 131072) onSetMaxOutputTokens(value); }} /></label>
            <span className="config-hint">复杂交互视觉需要更多输出空间，请按所选模型支持的上限调整。</span>
          </details>
        </> : null}
        <p className="config-note">
          {config.provider === 'local-cli'
            ? '通过本地 CLI 调用 Agent，复用已有配置和认证。'
            : config.provider === 'openai'
              ? '支持 OpenAI 及任何兼容 API（Ollama、DeepSeek、LM Studio 等），填写 Base URL 即可切换。'
              : '使用 Anthropic Claude API，需确保 Key 有 Messages API 权限。'}
        </p>

        <section className="config-test">
          <div>
            <h3>结构化输出测试</h3>
            <p className={`config-test-message ${testState.status}`}>
              {testState.message}
            </p>
            {testState.detail ? <pre>{testState.detail}</pre> : null}
          </div>
          <button
            type="button"
            onClick={runSchemaTest}
            disabled={!canRunSchemaTest || testState.status === 'running'}
          >
            {testState.status === 'running' ? '测试中…' : '测试'}
          </button>
        </section>
      </div>
    </div>
  );
}
