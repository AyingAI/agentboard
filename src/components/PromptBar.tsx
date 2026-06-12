import { useEffect, useState } from 'react';

interface PromptBarProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export default function PromptBar({
  input,
  onInputChange,
  onSubmit,
  isPending,
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
    <div className={`composer-wrapper${isPending ? ' pending' : ''}`}>
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
          placeholder="向 Agent 描述你的想法…"
          disabled={isPending}
        />
        <div className="prompt-bar-right">
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
    </div>
  );
}
