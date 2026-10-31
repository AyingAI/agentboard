import { useEffect, useMemo, useState } from 'react';
import { fetchCLIs } from '../agent/localCliAgent';
import {
  availableClis,
  recommendedCli,
  STARTER_TASKS,
  type AvailableCli,
} from '../agent/onboarding';

interface EmptyBoardWelcomeProps {
  isAgentConfigured: boolean;
  configuredCliId?: string;
  onConnectCli: (cliId: string) => void;
  onOpenConfig: () => void;
  onChooseTask: (prompt: string) => void;
  onCreateCard: () => void;
  onOpenExample: () => Promise<void>;
}

export default function EmptyBoardWelcome({
  isAgentConfigured,
  configuredCliId,
  onConnectCli,
  onOpenConfig,
  onChooseTask,
  onCreateCard,
  onOpenExample,
}: EmptyBoardWelcomeProps) {
  const [clis, setClis] = useState<AvailableCli[]>([]);
  const [loading, setLoading] = useState(true);
  const [exampleLoading, setExampleLoading] = useState(false);
  const [exampleError, setExampleError] = useState('');
  const detectedClis = useMemo(() => availableClis(clis), [clis]);
  const suggestedCli = useMemo(() => recommendedCli(clis), [clis]);

  useEffect(() => {
    let active = true;
    fetchCLIs()
      .then((items) => {
        if (active) setClis(items);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const connectedCli = configuredCliId
    ? detectedClis.find((cli) => cli.id === configuredCliId)
    : null;

  return (
    <section className="empty-board-welcome" aria-labelledby="empty-board-title">
      <div className="empty-board-eyebrow">从一次真实共创开始</div>
      <h1 id="empty-board-title">和 Agent 一起，把想法变成可操作的内容</h1>
      <p className="empty-board-intro">
        图解、交互推演、可试用的原型——让 Agent 选择表达。你可以直接操作、引用细节，再基于当前状态继续讨论。
      </p>

      {!isAgentConfigured ? (
        <div className="quick-connect-card">
          <div>
            <strong>{loading ? '正在检测本地 Agent…' : suggestedCli ? `检测到 ${suggestedCli.name}` : '未检测到本地 CLI'}</strong>
            <span>
              {suggestedCli
                ? `${suggestedCli.version ? `${suggestedCli.version} · ` : ''}复用本机已有认证和工具能力`
                : '可以打开设置选择 API，或确认开发服务器和 CLI 已正确安装。'}
            </span>
          </div>
          {suggestedCli ? (
            <button type="button" onClick={() => onConnectCli(suggestedCli.id)}>
              使用 {suggestedCli.name}
            </button>
          ) : (
            <button type="button" onClick={onOpenConfig}>打开 Agent 设置</button>
          )}
        </div>
      ) : (
        <div className="quick-connect-status">
          <span className="quick-connect-dot" />
          {connectedCli ? `已选择 ${connectedCli.name}` : 'Agent 已配置，可以开始共创'}
          <button type="button" onClick={onOpenConfig}>更换</button>
        </div>
      )}

      <div className="starter-task-grid">
        {STARTER_TASKS.map((task, index) => (
          <button
            key={task.id}
            type="button"
            className="starter-task"
            onClick={() => onChooseTask(task.prompt)}
          >
            <span className="starter-task-index">0{index + 1}</span>
            <strong>{task.title}</strong>
            <small>{task.description}</small>
            <span className="starter-task-action">填入指令 →</span>
          </button>
        ))}
      </div>

      <div className="visual-example-invitation">
        <button type="button" disabled={exampleLoading} onClick={async () => {
          setExampleLoading(true); setExampleError('');
          try { await onOpenExample(); } catch (error) { setExampleError(error instanceof Error ? error.message : '示例加载失败。'); setExampleLoading(false); }
        }}>{exampleLoading ? '正在打开…' : '先体验一个交互示例 →'}</button>
        <span>真实模型生成 · 无需配置 Agent 即可操作</span>
        {exampleError ? <small role="alert">{exampleError}</small> : null}
      </div>
      <div className="empty-board-manual">
        想自己开始？
        <button type="button" onClick={onCreateCard}>在画布中央创建卡片</button>
      </div>
    </section>
  );
}
