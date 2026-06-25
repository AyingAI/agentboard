import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface PromptBarProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  onOpenConfig: () => void;
  isPending: boolean;
  isAgentConfigured: boolean;
  providerName: string;
}

export default function PromptBar({
  input,
  onInputChange,
  onSubmit,
  onCancel,
  onOpenConfig,
  isPending,
  isAgentConfigured,
  providerName,
}: PromptBarProps) {
  const [elapsed, setElapsed] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isPending) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000));
    }, 200);
    return () => clearInterval(timer);
  }, [isPending]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }, [input]);

  return (
    <div className={`composer-wrapper${isPending ? ' pending' : ''}`}>
      <form
        className="prompt-bar"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isPending) onSubmit();
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (!isPending && input.trim()) onSubmit();
          }}
          placeholder="向 Agent 描述你的想法，或输入“执行流程”…"
          disabled={isPending}
          rows={1}
        />
        <div className="prompt-bar-right">
          {isPending ? (
            <button
              type="button"
              className="stop-button"
              onClick={() => onCancel?.()}
              title="停止当前请求"
            >
              <span className="pending-indicator">
                <span className="dot-pulse" />
                停止{elapsed > 0 ? ` ${elapsed}s` : ''}
              </span>
            </button>
          ) : !isAgentConfigured ? (
            <button
              type="button"
              className="configure-agent-button"
              onClick={onOpenConfig}
              title={`当前 AI: ${providerName}`}
            >
              配置 Agent
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()}>
              发送
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
