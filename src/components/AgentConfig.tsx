import { useEffect, useState } from 'react';
import type { AgentConfig, AgentProvider, BoardDSL } from '../types/dsl';
import type { AgentAdapter, AgentError } from '../agent/types';
import { ClaudeAgentAdapter } from '../agent/claudeAgent';
import { fetchCLIs, LocalCliAdapter } from '../agent/localCliAgent';
import { OpenAIAgentAdapter } from '../agent/openaiAgent';
import { applyPatch } from '../engine/patch';

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

type TestState =
  | { status: 'idle'; message: string; detail?: string }
  | { status: 'running'; message: string; detail?: string }
  | { status: 'success'; message: string; detail?: string }
  | { status: 'error'; message: string; detail?: string };

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
    return new OpenAIAgentAdapter({ apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl });
  }
  return null;
}

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
  const [testState, setTestState] = useState<TestState>({
    status: 'idle',
    message: '尚未测试当前 Agent 的结构化输出能力。',
  });

  useEffect(() => {
    fetchCLIs()
      .then(setClis)
      .catch(() => setClis([]))
      .finally(() => setLoadingClis(false));
  }, []);

  const availableClis = clis.filter((c) => c.available);

  const canRunSchemaTest = Boolean(
    (config.provider === 'local-cli' && config.cliId) ||
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
