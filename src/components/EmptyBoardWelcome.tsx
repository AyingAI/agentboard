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
}

export default function EmptyBoardWelcome({
  isAgentConfigured,
  configuredCliId,
  onConnectCli,
  onOpenConfig,
  onChooseTask,
  onCreateCard,
}: EmptyBoardWelcomeProps) {
  const [clis, setClis] = useState<AvailableCli[]>([]);
  const [loading, setLoading] = useState(true);
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
      <h1 id="empty-board-title">你描述目标，Agent 把讨论变成可编辑白板</h1>
      <p className="empty-board-intro">
        先选一个起点。Agent 创建结构后，你可以移动、改写和连接节点，再让它基于你的修改继续完善。
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

      <div className="empty-board-manual">
        想自己开始？
        <button type="button" onClick={onCreateCard}>在画布中央创建卡片</button>
      </div>
    </section>
  );
}
