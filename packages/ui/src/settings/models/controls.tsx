import { THINKING_LEVELS, type ThinkingLevel, type ThinkingLevelMap } from '@ice-ai/protocol';
import { useState } from 'react';
import { useI18n } from '../../i18n/i18n-provider';

/** 表单输入统一样式（供 models/ 下的编辑器共用；与既有内联风格一致） */
export const inputStyle = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--border)',
  borderRadius: 5,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 12,
  outline: 'none',
} as const;

/** 秘密输入：单行 + 右侧明/密切换 */
export function SecretInput({
  value,
  onChange,
  placeholder,
  onKeyDown,
}: {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        style={{ ...inputStyle, fontFamily: 'var(--font-mono)', paddingRight: 34 }}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'hide' : 'show'}
        title={visible ? 'hide' : 'show'}
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          padding: 3,
          border: 'none',
          background: 'none',
          color: 'var(--text-dim)',
          cursor: 'pointer',
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden={true}
        >
          {visible ? (
            <>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </>
          ) : (
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

/** 复选能力项（与设计规范的勾选样式一致） */
export function CapabilityCheckbox({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--text)',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: 15, height: 15, accentColor: 'var(--accent)' }}
      />
      {label}
    </label>
  );
}

/** Headers 键值编辑器（provider / model 共用） */
export function HeaderEditor({
  value,
  disabled,
  onChange,
}: {
  value: Record<string, string> | undefined;
  disabled: boolean;
  onChange(next: Record<string, string> | undefined): void;
}) {
  const { t } = useI18n();
  const entries = Object.entries(value ?? {});
  const rename = (index: number, key: string, val: string) => {
    const next = entries.map(([k, v], i): [string, string] => (i === index ? [key, val] : [k, v]));
    onChange(toHeaders(next));
  };
  const remove = (index: number) => {
    onChange(toHeaders(entries.filter((_, i) => i !== index)));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {entries.map(([key, val], index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Header 允许编辑中的空键，不能拿键名当 React key
        <div key={index} style={{ display: 'flex', gap: 6 }}>
          <input
            value={key}
            disabled={disabled}
            placeholder="Header"
            spellCheck={false}
            onChange={(event) => rename(index, event.target.value, val)}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', flex: 1 }}
          />
          <input
            value={val}
            disabled={disabled}
            placeholder="Value"
            spellCheck={false}
            onChange={(event) => rename(index, key, event.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', flex: 2 }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => remove(index)}
            style={iconButtonStyle}
            aria-label={t('i18n.delete')}
            title={t('i18n.delete')}
          >
            ✕
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ ...(value ?? {}), '': '' })}
          style={dashedButtonStyle}
        >
          + Add header
        </button>
      </div>
    </div>
  );
}

function toHeaders(entries: [string, string][]): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  // 保留编辑中的空键（否则刚点「Add header」还没填键名就被过滤掉）；
  // 空键由 serializeDraft 的 pruneEmpty 在落盘前剔除。
  for (const [key, val] of entries) result[key] = val;
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * 思考等级配色（仅本编辑器用）：与模型选择器里的档位视觉区分开，沿用设计规范的多色点。
 */
const THINKING_LEVEL_COLORS: Record<ThinkingLevel, string> = {
  off: '#374151',
  minimal: '#c4c4c4',
  low: '#3b82f6',
  medium: '#c4b5fd',
  high: '#ec4899',
  xhigh: '#f59e0b',
  max: '#ef4444',
};

type ThinkingLevelMode = 'default' | 'disabled' | 'custom';

const MODE_STYLE: Record<ThinkingLevelMode, { background: string; color: string }> = {
  default: { background: 'rgba(59,130,246,0.12)', color: '#2563eb' },
  disabled: { background: 'rgba(120,120,120,0.14)', color: 'var(--text)' },
  custom: { background: 'rgba(16,185,129,0.14)', color: '#059669' },
};

/**
 * 思考等级映射编辑器（对齐 参考实现）：每档一行「色点 + 档位名 + Default/Disabled/Custom 三选段」。
 * 缺键即沿用 provider 默认，所以 Default 就是删除该键，Disabled 写入 null。
 */
export function ThinkingLevelMapEditor({
  value,
  disabled,
  onChange,
}: {
  value: ThinkingLevelMap | undefined;
  disabled: boolean;
  onChange(next: ThinkingLevelMap | undefined): void;
}) {
  const { t } = useI18n();
  const setLevel = (level: ThinkingLevel, next: string | null | undefined) => {
    const merged: ThinkingLevelMap = { ...(value ?? {}) };
    if (next === undefined) {
      delete merged[level];
    } else {
      merged[level] = next;
    }
    onChange(Object.keys(merged).length > 0 ? merged : undefined);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          paddingBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {t('models.thinkingLevelMap')}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {t('models.thinkingLevelHint')}
        </span>
      </div>
      {THINKING_LEVELS.map((level) => {
        const current = value?.[level];
        const mode: ThinkingLevelMode =
          current === null ? 'disabled' : typeof current === 'string' ? 'custom' : 'default';
        return (
          <div
            key={level}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 10,
              minHeight: 44,
              padding: '6px 0',
              borderTop: '1px solid var(--border)',
            }}
          >
            <span
              aria-hidden={true}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: THINKING_LEVEL_COLORS[level],
                flexShrink: 0,
                opacity: mode === 'disabled' ? 0.45 : 1,
              }}
            />
            <span
              style={{
                width: 58,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: mode === 'disabled' ? 'var(--text-dim)' : 'var(--text)',
              }}
            >
              {level}
            </span>
            <SegmentedControl
              value={mode}
              disabled={disabled}
              options={[
                { value: 'default', label: t('models.thinkingLevelDefault') },
                { value: 'disabled', label: t('models.thinkingLevelDisabled') },
                { value: 'custom', label: t('models.thinkingLevelCustom') },
              ]}
              onChange={(next) => {
                if (next === 'default') setLevel(level, undefined);
                else if (next === 'disabled') setLevel(level, null);
                else setLevel(level, typeof current === 'string' ? current : level);
              }}
            />
            {mode === 'custom' && (
              <input
                value={typeof current === 'string' ? current : ''}
                disabled={disabled}
                placeholder={level}
                spellCheck={false}
                onChange={(event) =>
                  setLevel(level, event.target.value === '' ? undefined : event.target.value)
                }
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', flex: 1, height: 30 }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 三选段控件（= 参考实现 的 Default / Disabled / Custom 分段按钮） */
function SegmentedControl({
  value,
  options,
  disabled,
  onChange,
}: {
  value: ThinkingLevelMode;
  options: { value: ThinkingLevelMode; label: string }[];
  disabled: boolean;
  onChange(value: ThinkingLevelMode): void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        flexShrink: 0,
        border: '1px solid var(--border)',
        borderRadius: 7,
        overflow: 'hidden',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const style = MODE_STYLE[option.value];
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            style={{
              minWidth: 78,
              height: 30,
              padding: '0 12px',
              border: 'none',
              borderLeft: index === 0 ? 'none' : '1px solid var(--border)',
              background: selected ? style.background : 'transparent',
              color: selected ? style.color : 'var(--text-muted)',
              fontFamily: 'inherit',
              fontSize: 12,
              fontWeight: selected ? 600 : 400,
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const iconButtonStyle = {
  flexShrink: 0,
  width: 32,
  height: 32,
  border: '1px solid var(--border)',
  borderRadius: 5,
  background: 'var(--bg)',
  color: 'var(--text-dim)',
  cursor: 'pointer',
  fontSize: 12,
} as const;

export const dashedButtonStyle = {
  height: 28,
  padding: '0 10px',
  border: '1px dashed var(--border)',
  borderRadius: 5,
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 11,
} as const;
