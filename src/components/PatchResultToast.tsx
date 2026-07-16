import { useEffect } from 'react';
import type { AppliedAgentPatch } from '../hooks/useAgent';

interface PatchResultToastProps {
  result: AppliedAgentPatch;
  onUndo: () => void;
  onDismiss: () => void;
  onOpenActivity: () => void;
}

export default function PatchResultToast({
  result,
  onUndo,
  onDismiss,
  onOpenActivity,
}: PatchResultToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(timer);
  }, [onDismiss, result.id]);

  return (
    <section className="patch-result-toast" aria-live="polite" aria-label="Agent 修改已完成">
      <div className="patch-result-mark" aria-hidden="true">✓</div>
      <div className="patch-result-content">
        <div className="patch-result-kicker">Agent 已完成</div>
        <h2>{result.patch.summary}</h2>
        <p>{result.summary.labels.join(' · ') || '白板已更新'}</p>
      </div>
      <div className="patch-result-actions">
        <button type="button" onClick={onOpenActivity}>查看变更</button>
        <button type="button" className="patch-result-undo" onClick={onUndo}>撤销</button>
        <button type="button" className="patch-result-close" onClick={onDismiss} aria-label="关闭完成提示">×</button>
      </div>
    </section>
  );
}
