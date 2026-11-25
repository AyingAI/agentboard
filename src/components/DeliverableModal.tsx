import { useEffect, useId, useRef, useState } from 'react';
import type { BoardDSL } from '../types/dsl';
import { markdownExportFilename, synthesizeBoardMarkdown } from '../engine/boardMarkdown';

interface DeliverableModalProps {
  board: BoardDSL;
  boardTitle: string;
  selectedNodeIds: string[];
  isAgentConfigured: boolean;
  isPending: boolean;
  onClose: () => void;
  onExportJson: () => void;
  onSynthesizeWithAi: (prompt: string, label: string, nodeIds: string[]) => void;
}

export default function DeliverableModal({
  board,
  boardTitle,
  selectedNodeIds,
  isAgentConfigured,
  isPending,
  onClose,
  onExportJson,
  onSynthesizeWithAi,
}: DeliverableModalProps) {
  const hasSelection = selectedNodeIds.length > 0 && selectedNodeIds.length < board.nodes.length;
  const [scope, setScope] = useState<'board' | 'selection'>('board');
  const [drafts, setDrafts] = useState(() => ({
    board: synthesizeBoardMarkdown(board),
    selection: hasSelection ? synthesizeBoardMarkdown(board, selectedNodeIds) : '',
  }));
  const [status, setStatus] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scopeName = useId();
  const titleId = useId();

  const text = scope === 'selection' && hasSelection ? drafts.selection : drafts.board;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      previous?.focus();
    };
  }, [onClose]);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('已复制到剪贴板');
    } catch {
      textareaRef.current?.focus();
      textareaRef.current?.select();
      setStatus('已全选文本，请按 ⌘C / Ctrl+C 复制');
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = markdownExportFilename(boardTitle);
    link.click();
    URL.revokeObjectURL(url);
    setStatus('已开始下载 .md 文件');
  }

  return (
    <div className="deliverable-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="deliverable-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={e => e.stopPropagation()}
      >
        <header className="deliverable-header">
          <div>
            <small>从白板带走结构化成果</small>
            <h2 id={titleId}>导出 Markdown 文档</h2>
          </div>
          <button type="button" className="ghost small" onClick={onClose} aria-label="关闭导出文档">
            ×
          </button>
        </header>

        {hasSelection ? (
          <fieldset className="deliverable-scope">
            <legend>导出范围</legend>
            <label>
              <input
                type="radio"
                name={scopeName}
                checked={scope === 'board'}
                onChange={() => { setScope('board'); setStatus(''); }}
              />
              整张白板（{board.nodes.length} 项）
            </label>
            <label>
              <input
                type="radio"
                name={scopeName}
                checked={scope === 'selection'}
                onChange={() => { setScope('selection'); setStatus(''); }}
              />
              当前选中（{selectedNodeIds.length} 项）
            </label>
          </fieldset>
        ) : null}

        <p className="deliverable-note">
          已按分区、语义角色、交互状态与连线关系整理为 Markdown，可直接微调后复制或下载。
        </p>

        <textarea
          ref={textareaRef}
          className="deliverable-textarea"
          aria-label="Markdown 文档内容"
          rows={14}
          value={text}
          onChange={e => {
            const val = e.target.value;
            setDrafts(prev => ({ ...prev, [scope]: val }));
            setStatus('');
          }}
        />

        <footer className="deliverable-footer">
          <div className="deliverable-left-actions">
            <button type="button" className="ghost small" onClick={onExportJson}>
              备份 .agentboard.json
            </button>
            {isAgentConfigured ? (
              <button
                type="button"
                className="ghost small"
                disabled={isPending}
                onClick={() => {
                  const targetIds = scope === 'selection' && hasSelection ? selectedNodeIds : [];
                  onSynthesizeWithAi(
                    '请基于当前白板（或选中范围）的目标、证据、风险与交互状态，提炼并生成一张可直接对外沟通的完整方案总结卡片（type: "card", tags: ["output"]），包含结论、依据和下一步行动清单。',
                    'AI 提炼方案卡',
                    targetIds,
                  );
                  onClose();
                }}
              >
                ✦ 让 AI 提炼方案卡
              </button>
            ) : null}
          </div>
          <div className="deliverable-right-actions">
            {status ? <span className="deliverable-status" role="status">{status}</span> : null}
            <button type="button" onClick={downloadMarkdown} disabled={!text.trim()}>
              下载 .md
            </button>
            <button type="button" className="deliverable-primary" onClick={() => void copyMarkdown()} disabled={!text.trim()}>
              复制 Markdown
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
