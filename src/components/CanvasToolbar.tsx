import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDismissibleLayer } from '../hooks/useDismissibleLayer';

interface CanvasToolbarProps {
  zoom: number;
  createLabel?: string;
  hasContent: boolean;
  onCreateNode: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onFitContent: () => void;
  onReadContent: () => void;
  onOrganize: () => void;
  onOrganizeSpacing: () => void;
  onAiInsight?: (prompt: string, label: string) => void;
  isOrganizing: boolean;
  onOpenShortcuts: () => void;
}

const INSIGHT_LENSES = [
  {
    id: 'blindspots',
    label: '🔍 全局找盲点与风险',
    description: '扫描未验证假设、逻辑矛盾与缺失证据',
    prompt: '请以批判性思维审视整张白板：找出最关键的 2–3 个隐含假设、逻辑漏洞或缺失证据，新增暖色风险/待确认便签（tags: ["risk"] 或 ["question"]）并连线指向对应卡片，不要改写或删除我原有的内容。',
  },
  {
    id: 'synthesis',
    label: '🧭 提炼核心结论与行动',
    description: '收敛出一张决策卡和可勾选执行清单',
    prompt: '请综合当前白板的全部信息，提炼一张核心结论卡片（tags: ["decision"]）和一张可执行行动清单卡片（tags: ["action"]，使用 Markdown - [ ] 复选框列出具体步骤），用连线关联关键依据，不要删除原卡片。',
  },
  {
    id: 'sandbox',
    label: '📊 生成全局交互沙盘',
    description: '把关键变量做成可调节的 HTML/SVG/JS 模拟器',
    prompt: '请阅读当前白板的核心问题、变量和方案取舍，创建一张宽 760 的交互式可视化沙盘卡片（visual.html，含可操作控件与直观图表），帮助我在真实调参中理解这些取舍。保留原有卡片不变。',
  },
];

type ToolbarMenu = 'layout' | 'insights';

export default function CanvasToolbar({
  zoom,
  createLabel = '+ 卡片',
  hasContent,
  onCreateNode,
  onZoomIn,
  onZoomOut,
  onResetView,
  onFitContent,
  onReadContent,
  onOrganize,
  onOrganizeSpacing,
  onAiInsight,
  isOrganizing,
  onOpenShortcuts,
}: CanvasToolbarProps) {
  const menuId = useId();
  const layoutButton = useRef<HTMLButtonElement>(null);
  const insightButton = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<ToolbarMenu | null>(null);
  const trigger = menu === 'layout' ? layoutButton : insightButton;
  useDismissibleLayer({ open: menu !== null, root: trigger, popup, onDismiss: () => setMenu(null), returnFocus: trigger });

  useLayoutEffect(() => {
    const button = trigger.current;
    const panel = popup.current;
    if (!menu || !button || !panel) return;

    const placeMenu = () => {
      const bounds = button.getBoundingClientRect();
      const margin = 12;
      const width = Math.min(248, document.documentElement.clientWidth - margin * 2);
      const top = bounds.bottom + 8;
      const left = Math.max(margin, Math.min(bounds.left, document.documentElement.clientWidth - width - margin));
      panel.style.width = `${width}px`;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.maxHeight = `${Math.max(0, document.documentElement.clientHeight - top - margin)}px`;
    };

    placeMenu();
    panel.querySelector('button')?.focus({ preventScroll: true });
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [menu, trigger]);

  function toggleMenu(next: ToolbarMenu) {
    setMenu(current => current === next ? null : next);
  }

  function closeMenu() {
    setMenu(null);
    trigger.current?.focus({ preventScroll: true });
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === 'Tab') {
      closeMenu();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(event.currentTarget.querySelectorAll('button'));
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + offset + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div className="canvas-toolbar" aria-label="画布工具">
      <button type="button" className="canvas-toolbar-create" onClick={onCreateNode}>{createLabel}</button>
      <span className="canvas-toolbar-divider" />
      <button type="button" onClick={onZoomOut} aria-label="缩小画布" title="缩小">−</button>
      <button type="button" className="canvas-zoom-value" onClick={onResetView} title="重置为 100%">
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" onClick={onZoomIn} aria-label="放大画布" title="放大">+</button>
      <button type="button" className="canvas-toolbar-text" onClick={onReadContent} disabled={!hasContent} title="用可读字号查看当前内容">阅读</button>
      <button type="button" className="canvas-toolbar-text" onClick={onFitContent} disabled={!hasContent} title="查看整张画布的结构">总览</button>
      <div className="spatial-layout-actions">
        <button type="button" className="canvas-toolbar-text canvas-organize" onClick={onOrganize} disabled={!hasContent || isOrganizing} title="理解内容关系，重新组织整张白板，支持撤销">智能布局</button>
        <button
          ref={layoutButton}
          type="button"
          className="layout-more-button"
          aria-label="更多布局操作"
          aria-haspopup="menu"
          aria-expanded={menu === 'layout'}
          aria-controls={menu === 'layout' ? menuId : undefined}
          onClick={() => toggleMenu('layout')}
          disabled={!hasContent || isOrganizing}
        >⌄</button>
      </div>
      {onAiInsight ? (
        <button
          ref={insightButton}
          type="button"
          className="canvas-toolbar-text canvas-insight-btn"
          aria-expanded={menu === 'insights'}
          aria-haspopup="menu"
          aria-controls={menu === 'insights' ? menuId : undefined}
          onClick={() => toggleMenu('insights')}
          disabled={!hasContent || isOrganizing}
          title="让 AI 从特定视角主动分析整张白板"
        >
          ✨ AI 洞察 ▾
        </button>
      ) : null}
      <span className="canvas-toolbar-divider" />
      <button type="button" onClick={onOpenShortcuts} aria-label="查看画布快捷键" title="快捷键">?</button>
      {menu && createPortal(
        <div
          id={menuId}
          ref={popup}
          className="layout-actions-popover"
          role="menu"
          aria-label={menu === 'layout' ? '更多布局操作' : 'AI 洞察'}
          onKeyDown={handleMenuKeyDown}
        >
          {menu === 'layout' ? (
            <button type="button" role="menuitem" tabIndex={-1} onClick={() => { closeMenu(); onOrganizeSpacing(); }}>
              仅整理间距
              <small>保留当前组织方式，调整卡片间距</small>
            </button>
          ) : INSIGHT_LENSES.map(lens => (
            <button key={lens.id} type="button" role="menuitem" tabIndex={-1} onClick={() => { closeMenu(); onAiInsight?.(lens.prompt, lens.label); }}>
              {lens.label}
              <small>{lens.description}</small>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
