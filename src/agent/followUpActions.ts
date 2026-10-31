import type { AgentAction, DSLPatch } from '../types/dsl';

/** Migrate older offers without treating an unanswered factual question as consent. */
export function legacyActions(question: string, index = 0): AgentAction[] {
  const text = question.trim();
  if (!text) return [];
  if (!/要不要我|是否需要我|需要我|我可以|(?:改成|增加|添加|生成|保存|继续|制作|完善|简化|对比|调整|补充)|would you like|should I/i.test(text)) {
    return [{ id: `legacy-choice-${index}`, label: '给出可选方向', prompt: `请针对上一轮的问题给出明确的可选项，使用 interaction_request，先不替我猜测答案：${text}` }];
  }
  const parts: string[] = [];
  let part = '', quote = '';
  const closes: Record<string, string> = { '「': '」', '『': '』', '“': '”', '"': '"', '（': '）', '(': ')' };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) { part += char; if (char === quote) quote = ''; continue; }
    if (closes[char]) { quote = closes[char]; part += char; continue; }
    const separator = text.slice(i).match(/^(?:[，,]\s*)?(?:或者|或是|还是)/);
    if (separator) { parts.push(part); part = ''; i += separator[0].length - 1; }
    else part += char;
  }
  parts.push(part);
  return parts.map((value, branch) => {
    const request = value.trim().replace(/^(?:要不要|是否需要|需要|是否|想不想|希望)(?:我|我们)?/, '').replace(/^我可以/, '').replace(/^[，,\s]+|[？?。！!\s]+$/g, '').replace(/(?:吗|呢)$/, '').trim();
    return { id: `legacy-${index}-${branch}`, label: request, prompt: `请执行这一步：${request}。基于上一轮成果继续，保留已有的交互状态。` };
  }).filter(action => action.label);
}

export function followUpActions(patch: Pick<DSLPatch, 'actions' | 'questions'>): AgentAction[] {
  if (patch.actions?.length) return patch.actions;
  return (patch.questions ?? []).flatMap(legacyActions);
}
