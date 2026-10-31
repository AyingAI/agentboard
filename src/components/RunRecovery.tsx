import type { ActivityEntry } from '../types/dsl';

export default function RunRecovery({ activity, onRetry, onDismiss, onOpenActivity }: { activity: ActivityEntry; onRetry: () => void; onDismiss: () => void; onOpenActivity: () => void }) {
  const cancelled = activity.progressStatus === 'cancelled';
  return <section className={`run-recovery ${cancelled ? 'cancelled' : ''}`} aria-label="生成恢复" role="status">
    <span className="recovery-symbol" aria-hidden="true">{cancelled ? 'Ⅱ' : '!'}</span>
    <div className="recovery-copy"><strong>{cancelled ? '已停止这次生成' : '这次生成没有完成'}</strong>
      <p>{cancelled ? '原来的想法已保留，随时可以再试。' : activity.detail?.split('\n')[0] || '连接暂时遇到问题，请稍后重试。'}</p></div>
    <button type="button" onClick={onOpenActivity} className="recovery-detail">详情</button>
    <button type="button" onClick={onRetry} className="recovery-retry">重新尝试 <span aria-hidden="true">↻</span></button>
    <button type="button" onClick={onDismiss} className="recovery-dismiss" aria-label="关闭生成提示">×</button>
  </section>;
}
