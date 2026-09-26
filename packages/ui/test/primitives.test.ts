// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buttonStyles } from '../src/primitives/button';
import { isDismissTarget } from '../src/primitives/popover';
import { clampTextareaHeight } from '../src/primitives/textarea';
import { TOAST_MAX_VISIBLE, type ToastItem, toastQueueReducer } from '../src/primitives/toast';
import { cn } from '../src/utils/cn';

describe('toastQueueReducer', () => {
  const item = (i: number): ToastItem => ({ id: `t${i}`, message: `m${i}` });

  it('按序追加并在超限时挤掉最旧的（封顶 5）', () => {
    let queue: ToastItem[] = [];
    for (let i = 0; i < 7; i++) {
      queue = toastQueueReducer(queue, { type: 'add', toast: item(i) });
    }
    expect(queue.length).toBe(TOAST_MAX_VISIBLE);
    expect(queue.map((t) => t.id)).toEqual(['t2', 't3', 't4', 't5', 't6']);
  });

  it('dismiss 按 id 移除，不动其他项', () => {
    const queue = [item(0), item(1)];
    expect(toastQueueReducer(queue, { type: 'dismiss', id: 't0' })).toEqual([item(1)]);
  });
});

describe('buttonStyles', () => {
  it('五个语义变体产出互异的类组合', () => {
    const variants = ['primary', 'ghost', 'chip', 'pill', 'menu-item'] as const;
    const classes = variants.map((variant) => buttonStyles({ variant }));
    expect(new Set(classes).size).toBe(variants.length);
  });

  it('默认 ghost / md', () => {
    expect(buttonStyles()).toContain('text-text-muted');
    expect(buttonStyles({ variant: 'primary' })).toContain('bg-accent');
  });
});

describe('isDismissTarget', () => {
  it('target 为 null 时不算关闭目标', () => {
    expect(isDismissTarget(null, null)).toBe(false);
  });

  it('容器外命中 → 关闭', () => {
    const container = document.createElement('div');
    const outside = document.createElement('div');
    document.body.append(container, outside);
    expect(isDismissTarget(outside, container)).toBe(true);
  });

  it('容器内普通元素 → 不关；带 [data-x] 的元素 → 关', () => {
    const container = document.createElement('div');
    const plain = document.createElement('button');
    const closer = document.createElement('button');
    closer.setAttribute('data-x', '');
    container.append(plain, closer);
    expect(isDismissTarget(plain, container)).toBe(false);
    expect(isDismissTarget(closer, container)).toBe(true);
  });
});

describe('clampTextareaHeight', () => {
  it('夹在 [24, 200]', () => {
    expect(clampTextareaHeight(10)).toBe(24);
    expect(clampTextareaHeight(80)).toBe(80);
    expect(clampTextareaHeight(400)).toBe(200);
  });
});

describe('cn', () => {
  it('tailwind 冲突类后者胜，非冲突类保留', () => {
    expect(cn('h-8 w-8', 'w-10')).toBe('h-8 w-10');
  });
});
