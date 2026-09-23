import { describe, expect, it } from 'vitest';
import { parseDiff } from '../src/chat/diff-view';
import { formatCost, formatDuration, formatTokens } from '../src/lib/format';

/** diff 解析（SDK 现成串 → 行）与数值格式化 */

describe('parseDiff', () => {
  it('解析 +/−/ctx 行与行号；跳过行只保留上下文内容', () => {
    const diff = [
      '+12 const added = 1',
      '-3 const removed = 0',
      ' 4 const ctx = true',
      '   ...',
    ].join('\n');
    expect(parseDiff(diff)).toEqual([
      { kind: 'add', lineNumber: '12', content: 'const added = 1' },
      { kind: 'del', lineNumber: '3', content: 'const removed = 0' },
      { kind: 'ctx', lineNumber: '4', content: 'const ctx = true' },
      { kind: 'ctx', lineNumber: '', content: '...' },
    ]);
  });

  it('空串与尾随换行不产生空行', () => {
    expect(parseDiff('')).toEqual([]);
    expect(parseDiff('+1 a\n')).toHaveLength(1);
  });
});

describe('格式化', () => {
  it('duration', () => {
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(920)).toBe('920ms');
    expect(formatDuration(3_200)).toBe('3.2s');
    expect(formatDuration(72_000)).toBe('1m 12s');
  });

  it('tokens', () => {
    expect(formatTokens(null)).toBeNull();
    expect(formatTokens(755)).toBe('755');
    expect(formatTokens(42_300)).toBe('42.3k');
    expect(formatTokens(1_240_000)).toBe('1.2m');
  });

  it('cost', () => {
    expect(formatCost(undefined)).toBeNull();
    expect(formatCost(0)).toBe('$0');
    expect(formatCost(0.0123)).toBe('$0.0123');
    expect(formatCost(0.1234)).toBe('$0.1234');
    expect(formatCost(1.5)).toBe('$1.50');
  });
});
