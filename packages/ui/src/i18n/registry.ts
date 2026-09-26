import { enLocale } from './messages/en';
import { jaLocale } from './messages/ja';
import { zhCNLocale } from './messages/zh-CN';
import type { Locale, LocalePlugin } from './types';

const localePlugins: LocalePlugin[] = [enLocale, zhCNLocale, jaLocale];

/**
 * 根据标识获取已注册的语言包。
 * @param id 要查询的语言标识
 * @returns 已注册的语言包，不存在时返回 undefined
 */
export function getLocalePlugin(id: string): LocalePlugin | undefined {
  return localePlugins.find((plugin) => plugin.id === id);
}

/** 获取当前已注册语言的稳定顺序列表。 */
export function getSupportedLocales(): Locale[] {
  return localePlugins.map((plugin) => plugin.id);
}

/**
 * 将浏览器语言列表解析为内置语言。
 * @param languages 浏览器按优先级排列的语言列表
 * @returns 匹配的内置语言，无法匹配时返回英语
 */
export function resolveBrowserLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const normalized = language.toLowerCase();
    if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
    if (
      normalized === 'zh' ||
      normalized === 'zh-cn' ||
      normalized.startsWith('zh-cn-') ||
      normalized === 'zh-sg' ||
      normalized.startsWith('zh-sg-') ||
      normalized === 'zh-hans' ||
      normalized.startsWith('zh-hans-')
    )
      return 'zh-CN';
    if (normalized === 'ja' || normalized.startsWith('ja-')) return 'ja';
    // 已注册语言之外的 zh 变体（如 zh-TW）回落简体，与 pi-web 的「任意 zh-* → zh-CN」口径一致
    if (normalized.startsWith('zh-')) return 'zh-CN';
  }
  return 'en';
}
