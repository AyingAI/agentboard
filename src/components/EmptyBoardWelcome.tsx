import { ExplorationStart } from './Exploration';
import type { ExplorationKind } from '../data/exploration';

interface EmptyBoardWelcomeProps {
  isAgentConfigured: boolean;
  onOpenConfig: () => void;
  onCreateCard: () => void;
  onStartExploration: (kind: ExplorationKind, question: string, material?: string, example?: boolean) => void;
}

export default function EmptyBoardWelcome({ isAgentConfigured, onOpenConfig, onCreateCard, onStartExploration }: EmptyBoardWelcomeProps) {
  return (
    <section className="empty-board-welcome" aria-labelledby="empty-board-title">
      <h1 id="empty-board-title">今天想弄清楚什么？</h1>
      <p className="empty-board-intro">选一种方式，写下问题、放入资料，和 AI 一起形成提纲或方案。</p>
      <ExplorationStart onStart={onStartExploration} />
      <div className="empty-board-footer">
        <button type="button" className="empty-board-free" onClick={onCreateCard}>自由开始，先记一条想法</button>
        {!isAgentConfigured ? <span>可以先整理资料，需要 AI 时再<button type="button" onClick={onOpenConfig}>连接 Agent</button></span> : null}
      </div>
    </section>
  );
}
