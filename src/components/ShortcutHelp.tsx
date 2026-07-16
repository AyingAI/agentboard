interface ShortcutHelpProps {
  onClose: () => void;
}

const SHORTCUTS = [
  ['创建卡片', '双击空白处'],
  ['编辑文字', '双击标题或正文'],
  ['框选节点', '拖拽空白处'],
  ['移动画布', 'Space + 拖拽 / 鼠标中键'],
  ['缩放画布', '⌘/Ctrl + 滚轮'],
  ['撤销', '⌘/Ctrl + Z'],
  ['重做', '⌘/Ctrl + Shift + Z / Ctrl + Y'],
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
