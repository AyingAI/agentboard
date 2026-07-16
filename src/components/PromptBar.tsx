import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AgentTaskPolicy } from '../types/dsl';

interface PromptBarProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  onOpenConfig: () => void;
  isPending: boolean;
  isAgentConfigured: boolean;
  providerName: string;
  selectedNodeIds: string[];
  taskPolicy: AgentTaskPolicy;
  onTaskPolicyChange: (policy: AgentTaskPolicy) => void;
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
  selectedNodeIds,
  taskPolicy,
  onTaskPolicyChange,
}: PromptBarProps) {
  const [elapsed, setElapsed] = useState(0);
  const [showControls, setShowControls] = useState(false);
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
      <div className="prompt-context-bar">
        <button
          type="button"
          className={`prompt-scope-button ${taskPolicy.scope === 'selection' ? 'selection' : ''}`}
          onClick={() => {
            if (selectedNodeIds.length === 0) return;
            const nextScope = taskPolicy.scope === 'selection' ? 'board' : 'selection';
            onTaskPolicyChange({
              ...taskPolicy,
              scope: nextScope,
              selectedNodeIds: nextScope === 'selection' ? selectedNodeIds : [],
            });
          }}
          disabled={isPending || selectedNodeIds.length === 0}
          title={selectedNodeIds.length === 0 ? '先在画布中选择节点' : '切换 Agent 作用范围'}
        >
          {taskPolicy.scope === 'selection' ? `作用于 ${selectedNodeIds.length} 个选中节点` : '作用于整张白板'}
        </button>
        <button
          type="button"
          className={`prompt-permission-toggle ${showControls ? 'active' : ''}`}
          onClick={() => setShowControls((value) => !value)}
          disabled={isPending}
        >
          权限
          <span>{Number(taskPolicy.allowExistingEdits) + Number(taskPolicy.allowDelete) + Number(taskPolicy.allowFullBoardLayout)}/3</span>
        </button>
      </div>

      {showControls ? (
        <div className="prompt-permissions" aria-label="Agent 修改权限">
          <label>
            <input
              type="checkbox"
              checked={taskPolicy.allowExistingEdits}
              onChange={(event) => onTaskPolicyChange({ ...taskPolicy, allowExistingEdits: event.target.checked })}
            />
            <span><strong>修改现有内容</strong><small>允许改写节点和分组</small></span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={taskPolicy.allowDelete}
              onChange={(event) => onTaskPolicyChange({ ...taskPolicy, allowDelete: event.target.checked })}
            />
            <span><strong>删除内容</strong><small>仍会在应用前再次确认</small></span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={taskPolicy.allowFullBoardLayout}
              onChange={(event) => onTaskPolicyChange({ ...taskPolicy, allowFullBoardLayout: event.target.checked })}
            />
            <span><strong>全图布局</strong><small>允许移动整张白板</small></span>
          </label>
        </div>
      ) : null}

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
