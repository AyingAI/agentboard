interface StorageRecoveryToastProps {
  message: string;
  onExport: () => void;
  onDismiss: () => void;
}

export default function StorageRecoveryToast({ message, onExport, onDismiss }: StorageRecoveryToastProps) {
  return (
    <section className="storage-recovery-toast" role="status">
      <div>
        <strong>已恢复本地白板</strong>
        <p>{message} 建议立即导出当前白板作为额外备份。</p>
      </div>
      <button type="button" onClick={onExport}>导出备份</button>
      <button type="button" className="storage-recovery-close" onClick={onDismiss} aria-label="关闭恢复提示">×</button>
    </section>
  );
}
