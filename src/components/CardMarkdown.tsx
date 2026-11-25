import type { MouseEvent, ReactNode } from 'react';
import { extractMaterialUrl, safeHttpUrl } from '../engine/boardBrief';

interface CardMarkdownProps {
  body: string;
  className?: string;
  onDoubleClick?: (event: MouseEvent<HTMLElement>) => void;
  onToggleTask?: (nextBody: string) => void;
}

const INLINE_TOKEN_RE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>()]+)/g;
const CHECKLIST_LINE_RE = /^(\s*[-*+]\s+\[)([ xX])(\][ \t]+)(\S.*)$/;
const UNORDERED_ITEM_RE = /^\s*[-*+]\s+/;
const ORDERED_ITEM_RE = /^\s*\d+[.)、]\s+/;
const HEADING_RE = /^(#{1,3})\s+(.+)$/;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  INLINE_TOKEN_RE.lastIndex = 0;

  while ((match = INLINE_TOKEN_RE.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={key} className="md-code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      const href = linkMatch ? safeHttpUrl(linkMatch[2]) : null;
      if (linkMatch && href) {
        parts.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="md-link"
            onPointerDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        parts.push(token);
      }
    } else {
      const href = safeHttpUrl(token);
      if (href) {
        parts.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="md-link"
            onPointerDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
          >
            {token}
          </a>,
        );
      } else {
        parts.push(token);
      }
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : [text];
}

export function toggleChecklistLine(body: string, lineIndex: number): string {
  const lines = body.split(/(\r?\n)/);
  const targetIndex = lineIndex * 2;
  const target = lines[targetIndex];
  if (typeof target !== 'string') return body;
  const match = CHECKLIST_LINE_RE.exec(target);
  if (!match) return body;
  const nextMark = match[2] === ' ' ? 'x' : ' ';
  lines[targetIndex] = `${match[1]}${nextMark}${match[3]}${match[4]}`;
  return lines.join('');
}

export default function CardMarkdown({ body, className, onDoubleClick, onToggleTask }: CardMarkdownProps) {
  const { text, url } = extractMaterialUrl(body);
  const lines = text ? text.split(/\r?\n/) : [];
  const blocks: ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const headingMatch = HEADING_RE.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(
        <div key={`h-${i}`} className={`md-heading md-h${level}`}>
          {renderInline(headingMatch[2], `h-${i}`)}
        </div>,
      );
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      const start = i;
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote key={`q-${start}`} className="md-quote">
          {quoteLines.map((qLine, idx) => (
            <span key={idx}>
              {renderInline(qLine, `q-${start}-${idx}`)}
              {idx < quoteLines.length - 1 ? <br /> : null}
            </span>
          ))}
        </blockquote>,
      );
      continue;
    }

    const firstTask = CHECKLIST_LINE_RE.exec(line);
    if (firstTask) {
      const tasks: { lineIndex: number; checked: boolean; label: string }[] = [];
      const start = i;
      let taskMatch: RegExpExecArray | null = firstTask;
      do {
        tasks.push({ lineIndex: i, checked: taskMatch[2].toLowerCase() === 'x', label: taskMatch[4] });
        i += 1;
        taskMatch = i < lines.length ? CHECKLIST_LINE_RE.exec(lines[i]) : null;
      } while (taskMatch);
      blocks.push(
        <div key={`t-${start}`} className="md-tasks">
          {tasks.map(task => (
            <label
              key={task.lineIndex}
              className={`md-task${task.checked ? ' is-done' : ''}`}
              onPointerDown={e => e.stopPropagation()}
              onDoubleClick={e => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={task.checked}
                onChange={() => {
                  if (onToggleTask) onToggleTask(toggleChecklistLine(body, task.lineIndex));
                }}
              />
              <span>{renderInline(task.label, `t-${task.lineIndex}`)}</span>
            </label>
          ))}
        </div>,
      );
      continue;
    }

    if (UNORDERED_ITEM_RE.test(line)) {
      const items: { idx: number; text: string }[] = [];
      const start = i;
      while (i < lines.length && UNORDERED_ITEM_RE.test(lines[i]) && !CHECKLIST_LINE_RE.test(lines[i])) {
        items.push({ idx: i, text: lines[i].replace(UNORDERED_ITEM_RE, '') });
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${start}`} className="md-list">
          {items.map(item => (
            <li key={item.idx}>{renderInline(item.text, `ul-${item.idx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (ORDERED_ITEM_RE.test(line)) {
      const items: { idx: number; text: string }[] = [];
      const start = i;
      while (i < lines.length && ORDERED_ITEM_RE.test(lines[i])) {
        items.push({ idx: i, text: lines[i].replace(ORDERED_ITEM_RE, '') });
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${start}`} className="md-list md-ordered">
          {items.map(item => (
            <li key={item.idx}>{renderInline(item.text, `ol-${item.idx}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paraLines = [line];
    const start = i;
    i += 1;
    while (
      i < lines.length
      && lines[i].trim()
      && !HEADING_RE.test(lines[i].trim())
      && !/^\s*>\s?/.test(lines[i])
      && !UNORDERED_ITEM_RE.test(lines[i])
      && !ORDERED_ITEM_RE.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`p-${start}`} className="md-para">
        {paraLines.map((pLine, idx) => (
          <span key={idx}>
            {renderInline(pLine, `p-${start}-${idx}`)}
            {idx < paraLines.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>,
    );
  }

  let hostname = '';
  if (url) {
    try { hostname = new URL(url).hostname.replace(/^www\./, ''); } catch { hostname = url; }
  }

  return (
    <div className={className ? `card-markdown ${className}` : 'card-markdown'} onDoubleClick={onDoubleClick}>
      {blocks.length > 0 ? blocks : url ? null : <p className="md-para" />}
      {url ? (
        <a
          className="card-source-link"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onPointerDown={event => event.stopPropagation()}
          onDoubleClick={event => event.stopPropagation()}
        >
          打开原文 · {hostname} <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </div>
  );
}
