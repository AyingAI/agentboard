import { useState } from 'react';
import type { ActivityEntry } from '../types/dsl';
import type { InteractionDecision } from '../hooks/useAgent';

interface InteractionToastProps {
  activity: ActivityEntry;
  onRespond: (runId: string, decision: InteractionDecision, activityId: string) => void;
  onOpenActivity: () => void;
}

export default function InteractionToast({
  activity,
  onRespond,
  onOpenActivity,
}: InteractionToastProps) {
  const [draft, setDraft] = useState('');
  const interaction = activity.interaction;
  if (!interaction || activity.resolvedDecision) return null;

  function respond(decision: InteractionDecision) {
    if (!interaction || activity.resolvedDecision) return;
    onRespond(interaction.runId, decision, activity.id);
    setDraft('');
  }

  const canFreeText = interaction.allowFreeText !== false;

  return (
    <section className="interaction-toast" aria-live="assertive" aria-label="Agent 需要你的选择">
      <div className="interaction-toast-header">
        <div>
          <div className="interaction-toast-kicker">Agent 需要确认</div>
          <h2>{interaction.title}</h2>
        </div>
        <button type="button" className="interaction-toast-activity" onClick={onOpenActivity}>
          查看 Activity
        </button>
      </div>

      <p>{interaction.message}</p>

      {interaction.options?.length ? (
        <div className="interaction-toast-options">
          {interaction.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() =>
                respond({
                  optionId: option.id,
                  message: option.description
                    ? `${option.label}: ${option.description}`
                    : option.label,
                })
              }
            >
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
            </button>
          ))}
        </div>
      ) : null}

      {canFreeText ? (
        <div className="interaction-toast-freeform">
          <textarea
            value={draft}
            placeholder="或者直接补充你的选择、授权范围或说明..."
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="button"
            disabled={!draft.trim()}
            onClick={() => respond({ message: draft.trim() })}
          >
            继续
          </button>
        </div>
      ) : null}
    </section>
  );
}
