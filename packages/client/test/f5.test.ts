// @vitest-environment jsdom

import type { SlashCommandInfo } from '@ice-ai/protocol';
import { describe, expect, it } from 'vitest';
import { EMPTY_CURSOR, historyNext, historyPrev, pushHistory } from '../src/input/input-history';
import {
  applySlashInsertion,
  extractSlashQuery,
  filterSlashCommands,
  parseSlashSubmission,
} from '../src/input/slash-commands';
import type { Turn } from '../src/stream/view-model';
import {
  activeRange,
  buildMinimapBars,
  scrollTopForBar,
  turnTone,
} from '../src/view-models/minimap';
import {
  contextPercent,
  formatCost,
  formatDurationMs,
  formatTokens,
  summarizeStats,
} from '../src/view-models/session-stats';
import {
  applyTheme,
  isDarkTheme,
  isThemePreference,
  resolveTheme,
  THEME_OPTIONS,
  themeLabel,
} from '../src/view-models/theme';
import {
  allWrittenFiles,
  extractTurnWrittenFiles,
  shortPath,
} from '../src/view-models/turn-written-files';

const command = (
  name: string,
  source: SlashCommandInfo['source'] = 'extension',
): SlashCommandInfo => ({ name, source, sourceInfo: {} }) as SlashCommandInfo;

describe('斜杠命令：匹配与插入', () => {
  it('只在行首/空白后触发（句子中间不算命令）', () => {
    expect(extractSlashQuery('/co')).toEqual({ start: 0, query: 'co', name: 'co', hasArgs: false });
    expect(extractSlashQuery('看 /co')).toEqual({
      start: 2,
      query: 'co',
      name: 'co',
      hasArgs: false,
    });
    expect(extractSlashQuery('a/b')).toBeNull();
    expect(extractSlashQuery('路径 /usr/bin')).toEqual({
      start: 3,
      query: 'usr/bin',
      name: 'usr/bin',
      hasArgs: false,
    });
  });

  it('已进入参数区（含空格）不再给候选', () => {
    const match = extractSlashQuery('/compact 请压缩');
    expect(match?.hasArgs).toBe(true);
    expect(filterSlashCommands([command('compact')], 'compact')).toHaveLength(1);
  });

  it('过滤：前缀优先，再子串，按名排序', () => {
    const commands = [command('zzz'), command('compact'), command('recompact'), command('c-b')];
    const hits = filterSlashCommands(commands, 'comp').map((c) => c.name);
    expect(hits).toEqual(['compact', 'recompact']);
  });

  it('插入：整段 token 替换为 `/name `（便于继续输参数）', () => {
    const match = extractSlashQuery('/co');
    const result = applySlashInsertion('/co 剩余文本', match!, 'compact');
    expect(result.text).toBe('/compact  剩余文本');
    expect(result.caret).toBe('/compact '.length);
  });

  it('提交解析：/name args；非命令返回 null', () => {
    expect(parseSlashSubmission('/compact 请压缩')).toEqual({ name: 'compact', args: '请压缩' });
    expect(parseSlashSubmission('/name')).toEqual({ name: 'name', args: '' });
    expect(parseSlashSubmission('普通消息')).toBeNull();
  });
});

describe('输入历史：游标行为', () => {
  it('push 去重、忽略空白、保留顺序', () => {
    expect(pushHistory([], '  ')).toEqual([]);
    expect(pushHistory(['a'], 'a')).toEqual(['a']);
    expect(pushHistory(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('↑ 首次进入记住草稿；↑↓ 往返恢复草稿', () => {
    const history = ['one', 'two'];
    const first = historyPrev(history, EMPTY_CURSOR, '草稿');
    expect(first.value).toBe('two');
    const second = historyPrev(history, first.cursor, '');
    expect(second.value).toBe('one');
    const back = historyNext(history, second.cursor, '');
    expect(back.value).toBe('two');
    const restored = historyNext(history, back.cursor, '');
    expect(restored.value).toBe('草稿');
    expect(restored.cursor).toEqual(EMPTY_CURSOR);
  });

  it('空历史时不动', () => {
    expect(historyPrev([], EMPTY_CURSOR, 'x').value).toBe('x');
    expect(historyNext([], EMPTY_CURSOR, 'x').value).toBe('x');
  });
});

describe('minimap：几何与语义色', () => {
  const turn = (status: Turn['status'], text = 'hi'): Turn => ({
    id: `t-${status}-${text}`,
    user: { text, at: 0 },
    trail: [],
    final: null,
    usage: null,
    model: null,
    status,
  });

  it('tone 映射', () => {
    expect(turnTone(turn('error'))).toBe('error');
    expect(turnTone(turn('stopped'))).toBe('stopped');
    expect(turnTone(turn('streaming'))).toBe('streaming');
    expect(turnTone(turn('done'))).toBe('normal');
  });

  it('视口区间与 active 标记', () => {
    const turns = Array.from({ length: 10 }, (_, index) => turn('done', `t${index}`));
    expect(activeRange(0, 100, 1000, 10)).toEqual({ start: 0, end: 1 });
    const bars = buildMinimapBars(turns, 500, 100, 1000);
    expect(bars.filter((bar) => bar.active).length).toBe(1);
    expect(bars[0]?.preview).toBe('t0');
  });

  it('点击定位受上下界夹取', () => {
    expect(scrollTopForBar(0, 10, 1000, 100)).toBe(0);
    expect(scrollTopForBar(5, 10, 1000, 100)).toBe(500);
    expect(scrollTopForBar(10, 10, 1000, 100)).toBe(900);
  });
});

describe('统计：格式化与汇总', () => {
  it('token / 花费 / 时长格式化', () => {
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(12_345)).toBe('12k');
    expect(formatTokens(2_500_000)).toBe('2.50M');
    expect(formatCost(0)).toBe('$0');
    expect(formatCost(0.0042)).toBe('$0.0042');
    expect(formatCost(1.239)).toBe('$1.24');
    expect(formatDurationMs(500)).toBe('500ms');
    expect(formatDurationMs(12_500)).toBe('12.5s');
    expect(formatDurationMs(125_000)).toBe('2m5s');
  });

  it('上下文百分比：缺窗口/缺 tokens → null', () => {
    expect(contextPercent(null)).toBeNull();
    expect(contextPercent({ contextWindow: 0, tokens: 10 } as never)).toBeNull();
    expect(contextPercent({ contextWindow: 1000, tokens: 250 } as never)).toBe(25);
  });

  it('汇总：perf 缺席时为 null（冷会话不显示 0）', () => {
    const summary = summarizeStats({
      sessionFile: undefined,
      sessionId: 's',
      userMessages: 1,
      assistantMessages: 1,
      toolCalls: 2,
      toolResults: 2,
      totalMessages: 4,
      tokens: { input: 100, output: 20, cacheRead: 5, cacheWrite: 0, total: 120 },
      cost: 0.01,
    } as never);
    expect(summary.input).toBe(100);
    expect(summary.cost).toBe(0.01);
    expect(summary.rounds).toBeNull();
    expect(summary.tokensPerSecond).toBeNull();
  });
});

describe('本轮改动文件', () => {
  const turnWith = (tools: { name: string; argsText: string }[]): Turn => ({
    id: 't1',
    user: { text: 'x', at: 0 },
    trail: tools.map((tool, index) => ({
      kind: 'tool' as const,
      toolCallId: `c${index}`,
      toolName: tool.name,
      title: '',
      argsText: tool.argsText,
      status: 'ok' as const,
      output: null,
      isError: false,
    })),
    final: null,
    usage: null,
    model: null,
    status: 'done',
  });

  it('只认写类工具；流式半截 JSON 也能抽路径；去重', () => {
    const turns = [
      turnWith([
        { name: 'read', argsText: '{"file_path":"/a/read.ts"}' },
        { name: 'edit', argsText: '{"file_path":"/a/edited.ts"}' },
        { name: 'write', argsText: '{"file_path":"/a/edited.ts"}' },
        { name: 'write', argsText: '{"file_path":"/a/streaming.ts' },
      ]),
    ];
    const groups = extractTurnWrittenFiles(turns);
    expect(groups[0]?.paths).toEqual(['/a/edited.ts', '/a/streaming.ts']);
    expect(allWrittenFiles(turns)).toEqual(['/a/edited.ts', '/a/streaming.ts']);
  });

  it('相对路径展示', () => {
    expect(shortPath('/repo/src/a.ts', '/repo')).toBe('src/a.ts');
    expect(shortPath('/other/a.ts', '/repo')).toBe('/other/a.ts');
    expect(shortPath('/repo/src/a.ts', null)).toBe('/repo/src/a.ts');
  });
});

describe('主题', () => {
  it('偏好是调色板 id（与 pi-web THEME_OPTIONS 同序）', () => {
    expect(THEME_OPTIONS.map((option) => option.id)).toEqual([
      'light',
      'dark',
      'mist',
      'rose',
      'pine',
      'auto',
    ]);
    expect(isThemePreference('mist')).toBe(true);
    expect(isThemePreference('system')).toBe(false);
  });

  it('auto 跟随系统；其余原样', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('pine', false)).toBe('pine');
  });

  it('dark 与 pine 都算暗色', () => {
    expect(isDarkTheme('dark')).toBe(true);
    expect(isDarkTheme('pine')).toBe(true);
    expect(isDarkTheme('mist')).toBe(false);
  });

  it('标签取自 pi-web zh-CN', () => {
    expect(themeLabel('auto')).toBe('跟随系统');
    expect(themeLabel('mist')).toBe('雾青');
    expect(themeLabel('pine')).toBe('松夜');
  });

  it('applyTheme 写 data-theme 与 dark class', () => {
    const root = document.createElement('div');
    applyTheme('dark', root);
    expect(root.dataset['theme']).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
    applyTheme('pine', root);
    expect(root.dataset['theme']).toBe('pine');
    expect(root.classList.contains('dark')).toBe(true);
    applyTheme('light', root);
    expect(root.classList.contains('dark')).toBe(false);
  });
});
