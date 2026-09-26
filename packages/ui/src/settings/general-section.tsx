import {
  CHAT_CONTENT_FONT_SIZE_DEFAULT,
  CHAT_CONTENT_FONT_SIZE_MAX,
  CHAT_CONTENT_FONT_SIZE_MIN,
  CHAT_CONTENT_WIDTH_DEFAULT,
  CHAT_CONTENT_WIDTH_MAX,
  CHAT_CONTENT_WIDTH_MIN,
  type ChatAppearance,
  type ThemePreference,
} from '@ice-ai/client';
import { useI18n } from '../i18n/i18n-provider';
import { ThemeOptions } from './settings-panel';
import { ConfigButton, ConfigSwitch } from './settings-ui';

/**
 * GeneralSection（T5-3 / T8-4）：逐字移植 pi-web `SettingsPanel.tsx` 的 `GeneralSettings`。
 *
 * 节顺序与 pi-web 一致：外观 → 对话 → (Shell，仅 Windows，属排除域) → 语言。
 * 「项目信任」按 T5-4 移出，改由 `ProjectTrustDialog` 承担；pi-web 的推送 / Web 鉴权两节
 * 属排除域（ADR-0014/0016），不补。
 */
export interface ThemeSetting {
  options: readonly { id: ThemePreference; label: string }[];
  preference: ThemePreference;
  onSelect(preference: ThemePreference, origin?: { x: number; y: number }): void;
}

export interface GeneralSectionProps {
  theme: ThemeSetting;
  chat: ChatAppearance & {
    thinkingExpanded: boolean;
    onThinkingExpandedChange(expanded: boolean): void;
    onWidthChange(width: number): void;
    onFontSizeChange(fontSize: number): void;
  };
}

/** 主题 id → i18n key（pi-web 的 `THEME_OPTIONS[].label` 本身就是 key） */
const THEME_LABEL_KEY: Record<ThemePreference, string> = {
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
  mist: 'settings.themeMist',
  rose: 'settings.themeRose',
  pine: 'settings.themePine',
  auto: 'settings.themeSystem',
};

export function GeneralSection({ theme, chat }: GeneralSectionProps) {
  const { locale, setLocale, supportedLocales, t } = useI18n();

  return (
    <div className="settings-general">
      <h2 className="settings-general-title">{t('settings.general')}</h2>

      <section className="settings-general-section">
        <h3 className="settings-general-heading">{t('settings.appearance')}</h3>
        <ThemeOptions
          ariaLabel={t('settings.appearance')}
          options={theme.options.map((option) => ({
            id: option.id,
            label: t(THEME_LABEL_KEY[option.id]),
          }))}
          preference={theme.preference}
          onSelect={theme.onSelect}
        />
      </section>

      <section className="settings-general-section">
        <h3 className="settings-general-heading">{t('settings.chat')}</h3>
        <div className="settings-chat-options">
          <div className="settings-chat-option settings-chat-switch-option">
            <span>{t('settings.thinkingExpandedDefault')}</span>
            <ConfigSwitch
              checked={chat.thinkingExpanded}
              label={t('settings.thinkingExpandedDefault')}
              onChange={chat.onThinkingExpandedChange}
            />
          </div>
          <div className="settings-chat-option settings-chat-range-option">
            <div className="settings-chat-range-header">
              <label htmlFor="settings-chat-content-width">{t('settings.chatContentWidth')}</label>
              <output htmlFor="settings-chat-content-width">{chat.width}px</output>
              <ConfigButton
                variant="ghost"
                size="small"
                className="settings-chat-reset"
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
            <input
              id="settings-chat-content-width"
              type="range"
              min={CHAT_CONTENT_WIDTH_MIN}
              max={CHAT_CONTENT_WIDTH_MAX}
              step={10}
              value={chat.width}
              onChange={(event) => chat.onWidthChange(Number(event.target.value))}
            />
          </div>
          <div className="settings-chat-option settings-chat-range-option">
            <div className="settings-chat-range-header">
              <label htmlFor="settings-chat-content-font-size">
                {t('settings.chatContentFontSize')}
              </label>
              <output htmlFor="settings-chat-content-font-size">{chat.fontSize}px</output>
              <ConfigButton
                variant="ghost"
                size="small"
                className="settings-chat-reset"
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
            <input
              id="settings-chat-content-font-size"
              type="range"
              min={CHAT_CONTENT_FONT_SIZE_MIN}
              max={CHAT_CONTENT_FONT_SIZE_MAX}
              step={1}
              value={chat.fontSize}
              onChange={(event) => chat.onFontSizeChange(Number(event.target.value))}
            />
          </div>
        </div>
      </section>

      <section className="settings-general-section">
        <h3 className="settings-general-heading">{t('common.language')}</h3>
        <div
          role="radiogroup"
          aria-label={t('common.language')}
          className="settings-language-options"
        >
          {supportedLocales.map((plugin) => {
            const selected = locale === plugin.id;
            return (
              // biome-ignore lint/a11y/useSemanticElements: 逐字照抄 pi-web 的 radiogroup 按钮实现
              <button
                key={plugin.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setLocale(plugin.id)}
                className="settings-language-option"
              >
                <span className="settings-language-radio">
                  {selected && <span className="settings-language-radio-dot" />}
                </span>
                <span className="settings-language-label">{plugin.label}</span>
                <span className="settings-language-code">{plugin.id}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
