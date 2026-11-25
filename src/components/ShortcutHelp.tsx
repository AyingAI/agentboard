interface ShortcutHelpProps {
  onClose: () => void;
}

const SHORTCUTS = [
  ['创建卡片', '双击空白处'],
  ['快速粘贴建卡', '画布上直接 ⌘/Ctrl + V'],
  ['编辑标题 / 正文', '双击卡片文字（正文按 ⌘/Ctrl + ↵ 保存）'],
  ['多选节点', '拖拽框选 / Shift 或 ⌘/Ctrl + 点击'],
  ['全选 / 复制选中', '⌘/Ctrl + A · ⌘/Ctrl + D'],
  ['移动画布', 'Space + 拖拽 / 鼠标中键'],
  ['缩放画布', '⌘/Ctrl + 滚轮'],
  ['撤销 / 重做', '⌘/Ctrl + Z · ⌘/Ctrl + Shift + Z'],
  ['删除选择', 'Delete / Backspace'],
  ['取消当前状态', 'Esc'],
  ['打开快捷键', '?'],
] as const;

export default function ShortcutHelp({ onClose }: ShortcutHelpProps) {
  return (
    <div className="shortcut-help-backdrop" onClick={onClose}>
      <section className="shortcut-help" aria-modal="true" role="dialog" aria-labelledby="shortcut-help-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <div className="shortcut-help-eyebrow">Canvas controls</div>
            <h2 id="shortcut-help-title">画布快捷键</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭快捷键帮助">×</button>
        </header>
        <div className="shortcut-help-list">
          {SHORTCUTS.map(([action, shortcut]) => (
            <div key={action}>
              <span>{action}</span>
              <kbd>{shortcut}</kbd>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
