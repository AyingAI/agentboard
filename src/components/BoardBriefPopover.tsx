import { useEffect, useRef, useState } from 'react';
import type { BoardBrief } from '../types/dsl';
import { useDismissibleLayer } from '../hooks/useDismissibleLayer';

interface BoardBriefPopoverProps {
  brief: BoardBrief;
  onSave: (brief: BoardBrief) => void;
}

export default function BoardBriefPopover({ brief, onSave }: BoardBriefPopoverProps) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState(brief.goal ?? '');
  const [constraints, setConstraints] = useState(brief.constraints ?? '');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useDismissibleLayer({ open, root, onDismiss: () => setOpen(false), returnFocus: trigger });

  useEffect(() => {
    if (open) {
      setGoal(brief.goal ?? '');
      setConstraints(brief.constraints ?? '');
    }
  }, [open, brief.goal, brief.constraints]);

  const hasBrief = Boolean(brief.goal?.trim() || brief.constraints?.trim());

  return (
    <div className="brief-popover-anchor" ref={root}>
      <button
        ref={trigger}
        type="button"
        className={`topbar-brief-btn ghost small${hasBrief ? ' has-brief' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(v => !v)}
        title="设定当前白板的核心目标与约束条件，每次与 AI 对话都会自动携带"
      >
        <span className="brief-dot" aria-hidden="true" />
        目标{hasBrief ? ' · 已设' : ''}
      </button>

      {open ? (
        <div
          className="brief-popover"
          role="dialog"
          aria-label="白板目标与约束"
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <div className="brief-popover-header">
            <strong>白板目标与边界约束</strong>
            <span>每次请求 AI 时自动携带，避免反复重复背景。</span>
          </div>
          <form
            className="brief-popover-form"
            onSubmit={e => {
              e.preventDefault();
              onSave({ goal: goal.trim() || undefined, constraints: constraints.trim() || undefined });
              setOpen(false);
            }}
          >
            <label>
              <span>核心目标</span>
              <input
                type="text"
                autoFocus
                maxLength={240}
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder="例如：两周内验证 SaaS 定价并确定 MVP 范围"
              />
            </label>
            <label>
              <span>硬性约束与前提</span>
              <textarea
                rows={3}
                maxLength={1200}
                value={constraints}
                onChange={e => setConstraints(e.target.value)}
                placeholder="例如：2 人团队；预算不超过 2000 元；优先可自助试用方案"
              />
            </label>
            <div className="brief-popover-actions">
              {hasBrief ? (
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => {
                    onSave({});
                    setOpen(false);
                  }}
                >
                  清空
                </button>
              ) : null}
              <button type="submit" className="brief-save-btn">
                保存目标
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
