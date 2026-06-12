import { useEffect, useState } from 'react';

interface PromptBarProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  providerName: string;
  onOpenConfig: () => void;
}

export default function PromptBar({
  input,
  onInputChange,
  onSubmit,
  isPending,
  providerName,
  onOpenConfig,
}: PromptBarProps) {
  const [elapsed, setElapsed] = useState(0);

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

  return (
    <form
      className="prompt-bar"
      onSubmit={(event) => {
        event.preventDefault();
        if (!isPending) onSubmit();
      }}
    >
      <input
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        placeholder="向 Agent 描述你的想法，例如：帮我梳理这个产品的三个核心模块"
        disabled={isPending}
      />
      <div className="prompt-bar-right">
        <span className="provider-badge" title={`当前 Agent: ${providerName}`}>
          {providerName}
        </span>
        <button type="button" className="ghost small config-btn" onClick={onOpenConfig} title="Agent 设置">
          ⚙
        </button>
        <button type="submit" disabled={!input.trim() || isPending}>
          {isPending ? (
            <span className="pending-indicator">
              <span className="dot-pulse" />
              {elapsed > 0 ? ` ${elapsed}s` : ' …'}
            </span>
          ) : (
            '发送'
          )}
        </button>
      </div>
    </form>
  );
}
