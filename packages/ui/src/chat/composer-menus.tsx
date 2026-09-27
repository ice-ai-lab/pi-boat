import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/i18n-provider';

/**
 * ComposerMenus（T2-6）：输入卡下方工具行的右区——思考档位 + 工具预设。
 *
 * 按设计规范 `ChatInput.tsx` 的两段上弹面板移植：button（图标 + 当前值）+ `position:absolute`
 * 面板（勾选 SVG + 档位描述）；流式中两者都不渲染，只留停止与声音。
 */
export interface ComposerMenusProps {
  thinkingLevel: string | null;
  thinkingLevels: string[];
  onThinkingLevelChange(level: string): void;
  toolPreset: string | null;
  toolPresets: { value: string; label: string }[];
  onToolPresetChange(preset: string): void;
  streaming: boolean;
}

/** 档位描述 key（设计规范 `THINKING_LEVEL_DESC_KEYS`） */
const THINKING_DESC_KEYS: Record<string, string> = {
  auto: 'chat.thinkingUseDefault',
  off: 'chat.thinkingOff',
  minimal: 'chat.thinkingMinimal',
  low: 'chat.thinkingLow',
  medium: 'chat.thinkingMedium',
  high: 'chat.thinkingHigh',
  xhigh: 'chat.thinkingXhigh',
  max: 'chat.thinkingMax',
};

/**
 * 预设描述 key。键 = protocol `TOOL_PRESETS` 的值（即菜单项 value）。
 * count 硬编码对照 protocol `TOOL_PRESET_NAMES`：read-only 4 个（read/grep/find/ls）、
 * default 4 个（read/bash/edit/write）；名单变更须同步（ui 只依赖 protocol 类型，
 * 不能运行时引用该表求长度）。
 */
const TOOL_PRESET_DESC: Record<string, { key: string; count?: number }> = {
  'chat-only': { key: 'chat.chatOnly' },
  'read-only': { key: 'chat.readOnlyTools', count: 4 },
  default: { key: 'chat.builtInTools', count: 4 },
  full: { key: 'chat.allBuiltInTools' },
};

const BAR_BUTTON: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  height: 32,
  padding: '8px 12px',
  background: 'none',
  border: 'none',
  borderRadius: 9,
  color: 'var(--text-muted)',
  fontSize: 12,
  transition: 'background 0.12s, color 0.12s',
};

const PANEL: CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 6px)',
  right: 0,
  zIndex: 100,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  boxShadow: '0 -4px 16px rgba(0,0,0,0.10)',
  overflow: 'hidden',
};

const CHECK = (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="var(--accent)"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
    aria-hidden="true"
  >
    <polyline points="1.5 5 4 7.5 8.5 2.5" />
  </svg>
);

export function ComposerMenus({
  thinkingLevel,
  thinkingLevels,
  onThinkingLevelChange,
  toolPreset,
  toolPresets,
  onToolPresetChange,
  streaming,
}: ComposerMenusProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [toolOpen, setToolOpen] = useState(false);

  // 点面板外关闭（设计规范 `controlsMenuRef` 的 outside-click）
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setThinkingOpen(false);
        setToolOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 流式开始时收起面板（设计规范：流式中两段都不渲染）
  useEffect(() => {
    if (!streaming) return;
    setThinkingOpen(false);
    setToolOpen(false);
  }, [streaming]);

  const thinkingLabel = thinkingLevel ?? thinkingLevels[0] ?? '';
  const toolPresetLabel = toolPresets.find((preset) => preset.value === toolPreset)?.label ?? '';

  const button = (
    open: boolean,
    title: string,
    onClick: () => void,
    icon: ReactNode,
    label: string,
  ) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-expanded={open}
      aria-haspopup="listbox"
      onClick={onClick}
      style={{ ...BAR_BUTTON, background: open ? 'var(--bg-hover)' : 'none', cursor: 'pointer' }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--bg-hover)';
        event.currentTarget.style.color = 'var(--text)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = open ? 'var(--bg-hover)' : 'none';
        event.currentTarget.style.color = 'var(--text-muted)';
      }}
    >
      {icon}
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );

  return (
    <div ref={rootRef} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {!streaming && thinkingLevels.length > 0 && (
        <div style={{ position: 'relative' }}>
          {button(
            thinkingOpen,
            t('chat.changeReasoning', { level: thinkingLabel }),
            () => setThinkingOpen((value) => !value),
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9.5 2A5.5 5.5 0 0 0 4 7.5c0 1.7.78 3.21 2 4.21V14a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-2.29c1.22-1 2-2.51 2-4.21A5.5 5.5 0 0 0 9.5 2z" />
              <line x1="7" y1="18" x2="12" y2="18" />
              <line x1="8" y1="21" x2="11" y2="21" />
            </svg>,
            thinkingLabel,
          )}
          {thinkingOpen && (
            <div role="listbox" style={{ ...PANEL, minWidth: 180 }}>
              {thinkingLevels.map((level) => {
                const active = level === thinkingLevel;
                return (
                  <button
                    key={level}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setThinkingOpen(false);
                      if (!active) onThinkingLevelChange(level);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '7px 12px',
                      background: active ? 'var(--bg-selected)' : 'none',
                      border: 'none',
                      color: active ? 'var(--text)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 12,
                      textAlign: 'left',
                      fontWeight: active ? 600 : 400,
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(event) => {
                      if (!active) event.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(event) => {
                      if (!active) event.currentTarget.style.background = 'none';
                    }}
                  >
                    {active ? CHECK : <span style={{ width: 10, flexShrink: 0 }} />}
                    <span style={{ flex: 1 }}>{level}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>
                      {t(THINKING_DESC_KEYS[level] ?? 'chat.thinkingUseDefault')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!streaming && toolPresets.length > 0 && (
        <div style={{ position: 'relative' }}>
          {button(
            toolOpen,
            `${t('chat.changeToolPreset')}: ${toolPresetLabel}`,
            () => setToolOpen((value) => !value),
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>,
            toolPresetLabel,
          )}
          {toolOpen && (
            <div role="listbox" style={{ ...PANEL, minWidth: 140 }}>
              {toolPresets.map((preset) => {
                const active = toolPreset === preset.value;
                const desc = TOOL_PRESET_DESC[preset.value];
                return (
                  <button
                    key={preset.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setToolOpen(false);
                      if (!active) onToolPresetChange(preset.value);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '7px 12px',
                      background: active ? 'var(--bg-selected)' : 'none',
                      border: 'none',
                      color: active ? 'var(--text)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 12,
                      textAlign: 'left',
                      fontWeight: active ? 600 : 400,
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(event) => {
                      if (!active) event.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(event) => {
                      if (!active) event.currentTarget.style.background = 'none';
                    }}
                  >
                    {active ? CHECK : <span style={{ width: 10, flexShrink: 0 }} />}
                    <span style={{ flex: 1 }}>{preset.label}</span>
                    {desc !== undefined && (
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>
                        {t(desc.key, desc.count === undefined ? undefined : { count: desc.count })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
