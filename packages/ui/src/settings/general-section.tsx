import {
  CHAT_CONTENT_FONT_SIZE_DEFAULT,
  CHAT_CONTENT_FONT_SIZE_MAX,
  CHAT_CONTENT_FONT_SIZE_MIN,
  CHAT_CONTENT_WIDTH_DEFAULT,
  CHAT_CONTENT_WIDTH_MAX,
  CHAT_CONTENT_WIDTH_MIN,
  type ChatAppearance,
} from '@ice-ai/client';
import { useI18n } from '../i18n/i18n-provider';
import styles from './settings-panel.module.css';
import { ConfigButton } from './settings-ui';

/**
 * GeneralSection（T5-3 / T8-4）：按设计规范 的 `GeneralSettings`。
 *
 * 节顺序：对话 → 语言（外观已精简为三态循环切换，入口移到侧栏品牌行）。
 * 「项目信任」按 T5-4 移出，改由 `ProjectTrustDialog` 承担；设计规范的推送 / Web 鉴权两节
 * 属排除域（ADR-0014/0016），不补。
 */
export interface GeneralSectionProps {
  chat: ChatAppearance & {
    onWidthChange(width: number): void;
    onFontSizeChange(fontSize: number): void;
  };
}

export function GeneralSection({ chat }: GeneralSectionProps) {
  const { locale, setLocale, supportedLocales, t } = useI18n();

  return (
    <div className={styles.general}>
      <h2 className={styles.generalTitle}>{t('settings.general')}</h2>
      <p className={styles.generalLead}>{t('settings.generalDescription')}</p>

      <section className={styles.generalSection}>
        <h3 className={styles.generalHeading}>{t('settings.chat')}</h3>
        <div className={styles.list}>
          <div className={styles.setRow}>
            <div className={styles.rowText}>
              <label className={styles.rowTitle} htmlFor="settings-chat-content-width">
                {t('settings.chatContentWidth')}
              </label>
              <div className={styles.rowDesc}>{t('settings.chatContentWidthDescription')}</div>
            </div>
            <div className={styles.slider}>
              <input
                id="settings-chat-content-width"
                type="range"
                min={CHAT_CONTENT_WIDTH_MIN}
                max={CHAT_CONTENT_WIDTH_MAX}
                step={10}
                value={chat.width}
                onChange={(event) => chat.onWidthChange(Number(event.target.value))}
              />
              <output htmlFor="settings-chat-content-width">{chat.width}px</output>
              <ConfigButton
                variant="ghost"
                size="small"
                className={styles.resetButton}
                title={t('settings.resetChatContentWidth')}
                aria-label={t('settings.resetChatContentWidth')}
                disabled={chat.width === CHAT_CONTENT_WIDTH_DEFAULT}
                onClick={() => chat.onWidthChange(CHAT_CONTENT_WIDTH_DEFAULT)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />
                </svg>
              </ConfigButton>
            </div>
          </div>

          <div className={styles.setRow}>
            <div className={styles.rowText}>
              <label className={styles.rowTitle} htmlFor="settings-chat-content-font-size">
                {t('settings.chatContentFontSize')}
              </label>
              <div className={styles.rowDesc}>{t('settings.chatContentFontSizeDescription')}</div>
            </div>
            <div className={styles.slider}>
              <input
                id="settings-chat-content-font-size"
                type="range"
                min={CHAT_CONTENT_FONT_SIZE_MIN}
                max={CHAT_CONTENT_FONT_SIZE_MAX}
                step={1}
                value={chat.fontSize}
                onChange={(event) => chat.onFontSizeChange(Number(event.target.value))}
              />
              <output htmlFor="settings-chat-content-font-size">{chat.fontSize}px</output>
              <ConfigButton
                variant="ghost"
                size="small"
                className={styles.resetButton}
                title={t('settings.resetChatContentFontSize')}
                aria-label={t('settings.resetChatContentFontSize')}
                disabled={chat.fontSize === CHAT_CONTENT_FONT_SIZE_DEFAULT}
                onClick={() => chat.onFontSizeChange(CHAT_CONTENT_FONT_SIZE_DEFAULT)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />
                </svg>
              </ConfigButton>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.generalSection}>
        <h3 className={styles.generalHeading}>{t('common.language')}</h3>
        <div role="radiogroup" aria-label={t('common.language')} className={styles.list}>
          {supportedLocales.map((plugin) => {
            const selected = locale === plugin.id;
            return (
              // biome-ignore lint/a11y/useSemanticElements: 按设计规范的 radiogroup 按钮实现
              <button
                key={plugin.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setLocale(plugin.id)}
                className={styles.languageOption}
              >
                <span className={styles.languageRadio}>
                  {selected && <span className={styles.languageRadioDot} />}
                </span>
                <span className={styles.languageLabel}>{plugin.label}</span>
                <span className={styles.languageCode}>{plugin.id}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
