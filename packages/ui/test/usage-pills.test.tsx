// @vitest-environment jsdom
import type { FxRatesResponse, Usage } from '@ice-ai/protocol';
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { UsageLine } from '../src/chat/usage-pills';
import { CurrencyProvider, formatMoney } from '../src/currency/currency-provider';
import { I18nProvider } from '../src/i18n/i18n-provider';

// 本仓没有 testing-library，React 19 的 act() 需要这个开关才会真正刷新 effect
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 每轮用量胶囊行（usage-pills.tsx）：锁明细卡的**口径**而不是样式——
 * 输入侧合计 = 未缓存输入 + 缓存命中 + 缓存写入；输出拆思考（reasoning）/回复；
 * 命中率 = cacheRead / (input + cacheRead + cacheWrite)，与 SessionInfoPopover 同口径。
 * 胶囊行数字本身（轮内累计）由 client 的 stream.test.ts 锁。
 */
const USAGE: Usage = {
  input: 100,
  output: 50,
  cacheRead: 200,
  cacheWrite: 25,
  reasoning: 20,
  totalTokens: 375,
  cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
};

async function renderAndWait(element: ReactElement, done: (container: HTMLElement) => boolean) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  for (let attempt = 0; attempt < 150 && !done(container); attempt++) {
    await act(async () => {
      root.render(element);
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
  }
  return {
    container,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function textOf(container: HTMLElement): string {
  return container.textContent ?? '';
}

describe('UsageLine 胶囊行', () => {
  it('胶囊：Tokens 用 SDK totalTokens，费用与耗时按传入值展示', async () => {
    const { container, unmount } = await renderAndWait(
      <I18nProvider>
        <UsageLine usage={USAGE} durationMs={548_000} />
      </I18nProvider>,
      (node) => textOf(node).length > 0,
    );
    const text = textOf(container);
    expect(text).toContain('375'); // totalTokens
    expect(text).toContain('$0.003'); // < 0.01 给 4 位小数（Intl 去尾零）
    expect(text).toContain('9m 8s');
    await unmount();
  });

  it('无耗时不渲染耗时胶囊（旧数据没有 endedAt）', async () => {
    const { container, unmount } = await renderAndWait(
      <I18nProvider>
        <UsageLine usage={USAGE} durationMs={null} />
      </I18nProvider>,
      (node) => textOf(node).length > 0,
    );
    expect(textOf(container)).not.toContain('m 8s');
    await unmount();
  });

  it('ⓘ 浮层：输入侧合计 / 命中未命中写入 / 思考与回复 / 命中率', async () => {
    let opened = false;
    const { container, unmount } = await renderAndWait(
      <I18nProvider>
        <UsageLine usage={USAGE} durationMs={null} />
      </I18nProvider>,
      () => opened,
    );
    const button = container.querySelectorAll('button[aria-expanded]')[1]; // 第二枚 = Tokens（第一枚是费用）
    expect(button).not.toBeNull();
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
    opened = true;
    const text = textOf(container);
    // 输入 = 100 + 200 + 25；明细三项各自成行
    expect(text).toContain('Token usage breakdown');
    expect(text).toContain('375'); // Total
    expect(text).toContain('325'); // Input = input + cacheRead + cacheWrite
    expect(text).toContain('200'); // Cache hit
    expect(text).toContain('100'); // Cache miss
    expect(text).toContain('25'); // Cache write
    // 输出 = 50 拆思考 20 / 回复 30
    expect(text).toContain('Thinking');
    expect(text).toContain('30');
    // 命中率 = 200 / 325 = 61.5%
    expect(text).toContain('61.5%');
    await unmount();
  });

  it('点击费用胶囊 → 口径弹窗：估算说明（USD 态无汇率行）', async () => {
    const { container, unmount } = await renderAndWait(
      <I18nProvider>
        <UsageLine usage={USAGE} durationMs={null} />
      </I18nProvider>,
      (node) => textOf(node).length > 0,
    );
    // 第一枚带 aria-expanded 的胶囊 = 费用（Tokens 在后）
    const pill = container.querySelector('button[aria-expanded]');
    expect(pill).not.toBeNull();
    await act(async () => {
      pill?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
    const text = textOf(container);
    expect(text).toContain('About this cost');
    expect(text).toContain('USD estimate at model catalog prices');
    // 未换算（USD）：不出现 USD 原值/汇率行
    expect(text).not.toContain('Catalog price (USD)');
    await unmount();
  });
});

describe('费用换算（formatMoney / CurrencyProvider）', () => {
  const RATES: FxRatesResponse = { base: 'USD', date: '2026-10-02', rates: { CNY: 7.1 } };
  const usd = (n: number): string => formatMoney(n, { currency: 'USD', rates: null }, 'en');

  it('formatMoney：非 USD 按汇率换算；无汇率 / USD 原样', () => {
    expect(usd(0.003)).toContain('$');
    expect(formatMoney(1, { currency: 'CNY', rates: RATES }, 'en')).toContain('7.10');
    // 无汇率（离线 / 上游挂）：静默回落 USD，不编换算值
    expect(formatMoney(1, { currency: 'CNY', rates: null }, 'en')).toContain('$');
  });

  it('选中非 USD：费用胶囊换算并附汇率来源提示；取数失败回落 USD', async () => {
    window.localStorage.setItem('pi-currency', 'CNY');
    try {
      const { container, unmount } = await renderAndWait(
        <CurrencyProvider fetchRates={() => Promise.resolve(RATES)}>
          <I18nProvider>
            <UsageLine usage={USAGE} durationMs={null} />
          </I18nProvider>
        </CurrencyProvider>,
        (node) => textOf(node).includes('¥'), // 汇率到位后费用变 ¥
      );
      expect(textOf(container)).toContain('¥0.02'); // 0.003 × 7.1 = 0.0213 → 2 位小数
      // 点击费用胶囊：口径弹窗含估算说明 + USD 原值 + 汇率来源
      const costPill = container.querySelector('button[aria-expanded]');
      expect(costPill).not.toBeNull();
      await act(async () => {
        costPill?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
      });
      const popText = textOf(container);
      expect(popText).toContain('Catalog price (USD)');
      expect(popText).toContain('$0.003');
      expect(popText).toContain('ECB 2026-10-02');
      await unmount();

      // 取数失败：回落 USD 显示，不阻塞渲染
      const fallback = await renderAndWait(
        <CurrencyProvider fetchRates={() => Promise.reject(new Error('offline'))}>
          <I18nProvider>
            <UsageLine usage={USAGE} durationMs={null} />
          </I18nProvider>
        </CurrencyProvider>,
        (node) => textOf(node).length > 0,
      );
      expect(textOf(fallback.container)).toContain('$');
      // 点击费用胶囊：明示「汇率不可用，按 USD 显示」，不让用户猜
      const fallbackPill = fallback.container.querySelector('button[aria-expanded]');
      await act(async () => {
        fallbackPill?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
      });
      expect(textOf(fallback.container)).toContain('Rates unavailable — showing USD');
      await fallback.unmount();
    } finally {
      window.localStorage.removeItem('pi-currency');
    }
  });
});
