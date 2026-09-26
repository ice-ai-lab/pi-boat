import { describe, expect, it } from 'vitest';
import {
  formatRelativeTime,
  formatUpdatedTime,
  interpolateMessage,
  translateMessage,
} from '../src/i18n/format';
import { getLocalePlugin, getSupportedLocales, resolveBrowserLocale } from '../src/i18n/registry';

describe('interpolateMessage', () => {
  it('替换字符串与数字参数', () => {
    expect(interpolateMessage('Hello, {name} ({count})', { name: 'Pi', count: 2 })).toBe(
      'Hello, Pi (2)',
    );
  });
});

describe('translateMessage', () => {
  it('先查当前语言，再回落英语，最后返回 key', () => {
    expect(translateMessage('zh-CN', 'common.ok', { en: { 'common.ok': 'OK' }, 'zh-CN': {} })).toBe(
      'OK',
    );
    expect(translateMessage('zh-CN', 'missing.key', { en: {}, 'zh-CN': {} })).toBe('missing.key');
  });
});

describe('formatRelativeTime / formatUpdatedTime', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('按所选语言输出相对时间（含 ja）', () => {
    expect(formatRelativeTime(new Date('2026-01-01T00:05:00.000Z'), 'en', now)).toBe(
      'in 5 minutes',
    );
    expect(formatRelativeTime(new Date('2025-12-31T23:00:00.000Z'), 'zh-CN', now)).toBe('1小时前');
    expect(formatRelativeTime(new Date('2025-12-31T23:00:00.000Z'), 'ja', now)).toBe('1 時間前');
  });

  it('今天显示时刻，更早显示相对时间', () => {
    const localNow = new Date(2026, 8, 22, 21, 18, 0);
    const today = new Date(2026, 8, 22, 9, 5, 0);
    const earlier = new Date(2026, 8, 19, 21, 18, 0);
    expect(formatUpdatedTime(today.getTime(), 'zh-CN', localNow)).toBe(
      today.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    );
    expect(formatUpdatedTime(earlier.getTime(), 'zh-CN', localNow)).toBe('3天前');
    expect(formatUpdatedTime(earlier.getTime(), 'ja', localNow)).toBe('3 日前');
  });
});

describe('resolveBrowserLocale', () => {
  it('解析浏览器语言优先级并回落英语（含 ja）', () => {
    expect(resolveBrowserLocale(['zh-CN', 'en-US'])).toBe('zh-CN');
    expect(resolveBrowserLocale(['zh', 'en-US'])).toBe('zh-CN');
    expect(resolveBrowserLocale(['zh-Hans', 'zh-TW'])).toBe('zh-CN');
    expect(resolveBrowserLocale(['zh-Hant-HK', 'en-US'])).toBe('zh-CN');
    expect(resolveBrowserLocale(['zh-SG', 'en-US'])).toBe('zh-CN');
    expect(resolveBrowserLocale(['zh-MY', 'en-US'])).toBe('zh-CN');
    expect(resolveBrowserLocale(['zh-TW', 'en-US'])).toBe('zh-CN');
    expect(resolveBrowserLocale(['ja', 'en-US'])).toBe('ja');
    expect(resolveBrowserLocale(['JA-jp', 'en-US'])).toBe('ja');
    expect(resolveBrowserLocale(['en-US', 'zh-CN'])).toBe('en');
    expect(resolveBrowserLocale(['fr-FR', 'ja-JP'])).toBe('ja');
    expect(resolveBrowserLocale(['fr-FR'])).toBe('en');
    expect(resolveBrowserLocale([])).toBe('en');
  });
});

describe('语言包', () => {
  it('只暴露已注册语言', () => {
    expect(getSupportedLocales()).toEqual(['en', 'zh-CN', 'ja']);
    expect(getLocalePlugin('en')?.id).toBe('en');
    expect(getLocalePlugin('ja')?.label).toBe('日本語');
    expect(getLocalePlugin('ja')?.messages['common.language']).toBe('言語');
    expect(getLocalePlugin('zh-CN')?.label).toBe('简体中文');
    expect(getLocalePlugin('missing')).toBeUndefined();
  });

  it('三语 key 集合完全一致，且插值占位符一致', () => {
    const englishMessages: Record<string, string> = getLocalePlugin('en')?.messages ?? {};
    const englishKeys = Object.keys(englishMessages).sort();
    const placeholders = (message: string) =>
      [...message.matchAll(/\{([\w.-]+)\}/g)].map((match) => match[1] ?? '').sort();
    const optionalPlaceholders: Record<string, string[]> = {
      'files.conflictSummary': ['countSuffix'],
    };

    expect(englishKeys.length).toBeGreaterThan(0);
    for (const locale of getSupportedLocales().filter((id) => id !== 'en')) {
      const messages = getLocalePlugin(locale)?.messages ?? {};
      expect(Object.keys(messages).sort(), `${locale} keys`).toEqual(englishKeys);
      for (const key of englishKeys) {
        const optional = optionalPlaceholders[key] ?? [];
        const required = placeholders(englishMessages[key] ?? '').filter(
          (name) => !optional.includes(name),
        );
        const translated = placeholders(messages[key] ?? '').filter(
          (name) => !optional.includes(name),
        );
        expect(translated, `${locale}.${key} placeholders`).toEqual(required);
      }
    }
  });
});
