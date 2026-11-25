import { STARTER_PROMPTS } from '../data/showcaseBoard';

interface EmptyBoardWelcomeProps {
  isAgentConfigured: boolean;
  onOpenConfig: () => void;
  onCreateCard: () => void;
  onSelectPrompt: (prompt: string) => void;
  onOpenShowcase: () => void;
}

export default function EmptyBoardWelcome({
  isAgentConfigured,
  onOpenConfig,
  onCreateCard,
  onSelectPrompt,
  onOpenShowcase,
}: EmptyBoardWelcomeProps) {
  return (
    <section className="empty-board-welcome" aria-labelledby="empty-board-title">
      <div className="empty-board-eyebrow">AGENT-NATIVE VISUAL THINKING</div>
      <h1 id="empty-board-title">和 AI 在同一张画布上思考</h1>
      <p className="empty-board-intro">
        写下你想理清的问题、方案取舍或系统机制，让 AI 在画布上生成卡片、关系连线与可操作的 HTML/SVG/JS 交互沙盘。
      </p>

      <div className="welcome-starters">
        {STARTER_PROMPTS.map(starter => (
          <button
            key={starter.id}
            type="button"
            className="welcome-starter-card"
            onClick={() => onSelectPrompt(starter.prompt)}
          >
            <span className="welcome-starter-tag">{starter.tag}</span>
            <strong>{starter.title}</strong>
            <small>{starter.description}</small>
          </button>
        ))}
      </div>

      <div className="empty-board-footer">
        <button type="button" className="welcome-showcase-btn" onClick={onOpenShowcase}>
          ✨ 免配置体验：打开交互式画布示例
        </button>
        <button type="button" className="empty-board-free" onClick={onCreateCard}>
          自由开始，先记一条想法
        </button>
        {!isAgentConfigured ? (
          <span className="welcome-config-hint">
            已有本机 CLI 或 API Key？<button type="button" onClick={onOpenConfig}>连接 Agent</button>
          </span>
        ) : null}
      </div>
    </section>
  );
}
