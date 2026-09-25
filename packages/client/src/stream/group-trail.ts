import type { GroupedTrailItem, ProcessGroupData, TrailItem } from './view-model';

/**
 * groupTrail（docs/05 §6.5，派生函数）：把平铺轨迹收拢为「过程组」。
 * 规则：连续的 thinking/tool 行在最终回答出现后收拢为一个 ProcessGroupData；
 * system 行不参与成组；单条纯 thinking 的短轨迹不强行套组壳。
 * 同一输入两种输出（isLiveTail 控制平铺/成组），天然满足「历史与实时终态一致」。
 */
export function groupTrail(trail: TrailItem[], isLiveTail: boolean): GroupedTrailItem[] {
  if (isLiveTail) return trail;

  const result: GroupedTrailItem[] = [];
  let run: TrailItem[] = [];

  const flush = () => {
    if (run.length === 0) return;
    const toolCount = run.filter((item) => item.kind === 'tool').length;
    if (run.length >= 2 || toolCount > 0) {
      const group: ProcessGroupData = {
        kind: 'group',
        items: run,
        messageCount: run.length,
        toolCallCount: toolCount,
      };
      result.push(group);
    } else {
      result.push(...run);
    }
    run = [];
  };

  for (const item of trail) {
    if (item.kind === 'thinking' || item.kind === 'tool') {
      run.push(item);
    } else {
      flush();
      result.push(item);
    }
  }
  flush();
  return result;
}
