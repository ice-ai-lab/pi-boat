import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/i18n-provider';

/**
 * ToolPresetMenu（T2-6 的工具预设段）：输入卡内工具行的工具预设按钮 + 上弹面板。
 *
 * 按设计规范 `ChatInput.tsx` 的预设段移植：`[扳手图标] 预设 id` + `position:absolute` 面板
 * （勾选 SVG + 预设描述）。**思考档位不在本组件**——它并进 `ModelSelector` 的二级菜单
 * （原型 §8b「模型 + 推理等级合并控件」），因为收起态只留一个控件。
 *
 * ⚠️ 预设描述里的 count 硬编码对照 protocol `TOOL_PRESET_NAMES`：read-only 4 个
 * （read/grep/find/ls）、default 4 个（read/bash/edit/write）；名单变更须同步
 * （ui 只依赖 protocol 类型，不能运行时引用该表求长度）。
 */

/**
 * 四项预设的短标签（用户 2026-09-30：模式名本地化——仅聊天/只读/默认/全部；含义仍由
 * 右侧描述行承担，替代此前「标签就是预设 id」的口径）。键值域对照 protocol `TOOL_PRESETS`；
 * 未收录的 id 回落调用方给的 `label`。
 */
const TOOL_PRESET_LABEL_KEY: Record<string, string> = {
  'chat-only': 'chat.presetChatOnly',
  'read-only': 'chat.presetReadOnly',
  default: 'chat.presetDefault',
  full: 'chat.presetFull',
};

export interface ToolPresetMenuProps {
  toolPreset: string | null;
  toolPresets: { value: string; label: string }[];
  onToolPresetChange(preset: string): void;
  /** 锁定（会话本轮在跑，切预设会排队到轮末）：不可展开，置灰 */
  disabled?: boolean;
  /**
   * 用户在本会话点过的预设，仅作**收起态按钮文字**的回退：反查不中（扩展塞进工具）时
   * 保持用户的选择、不再闪「自定义」（用户 2026-09-30 定案）。切会话由调用方清空；
   * 下拉里的勾选口径不变，仍按 `toolPreset`（实际生效工具集）反查。
   */
  pickedPreset?: string | null;
}

const TOOL_PRESET_DESC: Record<string, { key: string; count?: number }> = {
  'chat-only': { key: 'chat.chatOnly' },
  'read-only': { key: 'chat.readOnlyTools', count: 4 },
  default: { key: 'chat.builtInTools', count: 4 },
  full: { key: 'chat.allBuiltInTools' },
};

export function ToolPresetMenu({
  toolPreset,
  toolPresets,
  onToolPresetChange,
  disabled = false,
  pickedPreset = null,
}: ToolPresetMenuProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // 点面板外关闭（设计规范 `controlsMenuRef` 的 outside-click）
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 锁定时收起已展开的面板（同 ModelSelector 的 locked 语义）
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  // 按钮文字：反查命中预设 → 本地化短名；反查不中（settings 被改过 / 扩展塞进了工具，
  // 如 web-access 的 web_enable，`presetForToolNames` 返回 null）→ 保持用户点过的
  // `pickedPreset`，不再闪「自定义」（用户 2026-09-30）；都没有 → 回落「自定义」。
  // 按钮仍要有文字，否则只剩一枚扳手图标。下拉勾选口径不同：始终按 toolPreset 反查，
  // 界面勾选与实际生效工具集一致（AGENTS.md：命名不得暗示它做不到的事）。
  const labelValue = toolPreset ?? pickedPreset ?? null;
  const label =
    labelValue !== null && TOOL_PRESET_LABEL_KEY[labelValue] !== undefined
      ? t(TOOL_PRESET_LABEL_KEY[labelValue])
      : (toolPresets.find((preset) => preset.value === labelValue)?.label ??
        t('chat.customToolPreset'));
  if (toolPresets.length === 0) return null;

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {/* 原型 `.cbar`：30px 高 / 10px 圆角 / 5px 间距 */}
      <button
        type="button"
        title={`${t('chat.changeToolPreset')}: ${label}`}
        aria-label={t('chat.changeToolPreset')}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 30,
          padding: '0 10px',
          background: open ? 'var(--bg-hover)' : 'none',
          border: 'none',
          borderRadius: 10,
          color: open ? 'var(--text)' : 'var(--text-muted)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          fontSize: 12,
          whiteSpace: 'nowrap',
          transition: 'background 0.14s, color 0.14s, opacity 0.14s',
        }}
        onMouseEnter={(event) => {
          if (disabled) return;
          event.currentTarget.style.background = 'var(--bg-hover)';
          event.currentTarget.style.color = 'var(--text)';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = open ? 'var(--bg-hover)' : 'none';
          event.currentTarget.style.color = open ? 'var(--text)' : 'var(--text-muted)';
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
          aria-hidden="true"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            right: 0,
            zIndex: 100,
            minWidth: 140,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 -4px 16px rgba(0,0,0,0.10)',
            overflow: 'hidden',
          }}
        >
          {toolPresets.map((preset) => {
            const active = toolPreset === preset.value;
            const desc = TOOL_PRESET_DESC[preset.value];
            // 索引结果接一次局部变量：preset.value 是属性访问，TS 不做元素访问收窄，
            // 两次下标会让 noUncheckedIndexedAccess 推出 string | undefined（build 报 TS2345）
            const labelKey = TOOL_PRESET_LABEL_KEY[preset.value];
            return (
              <button
                key={preset.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setOpen(false);
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
                {active ? (
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
                ) : (
                  <span style={{ width: 10, flexShrink: 0 }} />
                )}
                <span style={{ flex: 1 }}>
                  {labelKey !== undefined ? t(labelKey) : preset.label}
                </span>
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
  );
}
