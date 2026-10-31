import type { ActivityEntry, AgentProgressEvent, LiveRunProgress } from '../types/dsl';

const CLI_NAMES: Record<string, string> = {
  pi: 'Pi', claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode', gemini: 'Gemini',
  agy: 'Antigravity', antigravity: 'Antigravity', qwen: 'Qwen Code', 'cursor-agent': 'Cursor', copilot: 'Copilot', qoder: 'Qoder', kimi: 'Kimi', trae: 'Trae',
};

export function friendlyProvider(name: string) {
  const local = name.match(/^(?:Local:\s*)(.+)$/i);
  return local ? CLI_NAMES[local[1]] || local[1] : name.replace(/ API$/, '');
}

/** Read only complete JSON string values, never execute or render unfinished model code. */
export function draftTitles(text: string): string[] {
  const titles: string[] = [];
  let pendingTitle = false;
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '"') continue;
    const start = index++;
    let escaped = false;
    for (; index < text.length; index++) {
      if (escaped) { escaped = false; continue; }
      if (text[index] === '\\') { escaped = true; continue; }
      if (text[index] === '"') break;
    }
    if (index >= text.length) break;
    let value: string;
    try { value = JSON.parse(text.slice(start, index + 1)); } catch { pendingTitle = false; continue; }
    let next = index + 1;
    while (/\s/.test(text[next] || '') && next < text.length) next++;
    if (text[next] === ':') pendingTitle = value === 'title';
    else if (pendingTitle) {
      const title = value.trim().replace(/\s+/g, ' ').slice(0, 100);
      if (title && !titles.includes(title)) titles.push(title);
      pendingTitle = false;
    }
    // This is only a small UI excerpt; it does not limit the model's output.
    if (titles.length >= 6) break;
  }
  return titles;
}

export function advanceLiveProgress(current: LiveRunProgress, event: AgentProgressEvent, now: number): LiveRunProgress {
  const outputChars = Math.max(current.outputChars, event.outputChars ?? 0);
  const previewTitles = event.previewTitles?.length ? event.previewTitles : current.previewTitles;
  let label = event.type === 'heartbeat' ? '' : event.message;
  if (event.type === 'output') label = previewTitles.length && previewTitles.join('|') !== current.previewTitles.join('|')
    ? `正在构建「${previewTitles[previewTitles.length - 1]}」` : current.outputChars ? '' : '已开始生成内容';
  const events = label && label !== current.events[current.events.length - 1]?.label
    ? [...current.events, { label, timestamp: now }].slice(-5) : current.events;
  return {
    ...current, lastSignalAt: now,
    retryAttempt: event.type === 'connected' ? undefined : current.retryAttempt,
    lastContentAt: outputChars > current.outputChars ? now : current.lastContentAt,
    outputChars, previewTitles, events,
    toolCount: current.toolCount + (event.type === 'tool' ? 1 : 0),
    latestTool: event.type === 'tool' ? event.message : current.latestTool,
  };
}

export function runPresentation(activity: ActivityEntry, now: number) {
  const live = activity.live;
  const elapsed = Math.max(0, now - (activity.startedAt ?? now));
  const step = activity.progressSteps?.find(step => step.status === 'active')?.id ?? 'call';
  const phase = step === 'context' ? 0 : step === 'call' ? 1 : 2;
  const signalAge = live?.lastSignalAt ? Math.max(0, now - live.lastSignalAt) : null;
  const receiving = Boolean(live?.lastContentAt && now - live.lastContentAt < 8000);
  const title = live?.retryAttempt ? '正在重新连接' : phase === 0 ? '正在读懂你的想法' : phase === 2 ? '正在整理到画布' : live?.outputChars
    ? '内容正在成形' : live?.latestTool ? '正在查找与探索' : '正在展开你的想法';
  const connection = live?.retryAttempt ? '重新连接中' : receiving ? '正在接收内容' : signalAge !== null && signalAge < 18000
    ? '连接保持中' : signalAge === null && elapsed < 15000 ? '正在连接' : '等待下一次反馈';
  const hint = live?.retryAttempt ? '刚才的连接遇到问题，正在重试。你的想法已保留。' : phase === 2 ? '完整内容已返回，正在检查并准备呈现。'
    : elapsed > 60000 && !live?.outputChars ? '这次需要多一点时间。还没有收到可展示的内容，你可以先写下下一步。'
    : elapsed > 25000 && !live?.outputChars ? '暂时还没有可展示的内容。你可以继续查看画布，或先写下下一步。'
    : live?.outputChars ? '这里展示的是生成中的内容线索，完整结果准备好后会放到画布。'
    : '你可以继续查看画布，或先写下下一步想法。';
  return { title, connection, hint, phase, elapsed, receiving, signalAge };
}

export function elapsedLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** A browser reload cannot reattach an old request; offer recovery instead of an orphan spinner. */
export function restoreRunActivities(items: ActivityEntry[]): ActivityEntry[] {
  return items.map(item => item.kind === 'run_progress' && item.progressStatus === 'running' ? {
    ...item, progressStatus: 'failed', completedAt: Date.now(), summary: '上次生成的连接已中断',
    detail: '页面重新载入或白板切换后，尚未返回的结果没有应用。原始指令已保留，可以重新尝试。',
    progressSteps: item.progressSteps?.map(step => step.status === 'active' ? { ...step, status: 'error' } : step),
  } : item);
}
