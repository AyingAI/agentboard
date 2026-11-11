import type { ImpactContext } from '../types/dsl';

type Target = ImpactContext['targets'][number];

/** Blend the established order with local text matches; this only selects content to read. */
export function selectImpactTargets(targets: Target[], changes: ImpactContext['changes'], limit = 6): Target[] {
  if (targets.length <= limit || !changes.length) return targets.slice(0, limit);
  const query = new Set<string>();
  const source = changes.map(change => `${change.title} ${change.body}`).join(' ').slice(0, 2500).toLowerCase();
  for (const word of source.match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (/^[a-z0-9]+$/.test(word)) {
      if (word.length > 2) query.add(word);
      continue;
    }
    for (let size = 2; size <= 5; size++) {
      for (let start = 0; start <= word.length - size; start++) query.add(word.slice(start, start + size));
    }
  }
  const texts = targets.map(target => `${target.title} ${target.body}`.toLowerCase());
  const scores = targets.map(() => 0);
  for (const term of [...query].slice(0, 600)) {
    const matches = texts.map(text => text.includes(term));
    const count = matches.filter(Boolean).length;
    if (!count) continue;
    const weight = Math.log(1 + targets.length / count) * term.length;
    matches.forEach((matches, index) => { if (matches) scores[index] += weight; });
  }
  const ranked = targets.map((target, index) => ({ target, score: scores[index] / Math.sqrt(1 + texts[index].length / 800) }))
    .sort((a, b) => b.score - a.score).filter(item => item.score > 0);
  const changedIds = new Set(changes.map(change => change.id));
  const selected = targets.filter(target => target.sourceIds.some(id => changedIds.has(id))).slice(0, limit);
  const seen = new Set(selected.map(target => target.id));
  for (let index = 0; index < targets.length && selected.length < limit; index++) {
    for (const target of [targets[index], ranked[index]?.target]) {
      if (target && !seen.has(target.id) && selected.length < limit) {
        selected.push(target);
        seen.add(target.id);
      }
    }
  }
  return selected;
}
