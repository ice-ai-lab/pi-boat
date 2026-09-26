import type { CSSProperties } from 'react';

/** pi-web 底部工具条的按钮规格：32px 高 / 9px 圆角 / 12px 字 / text-muted */
const BAR_BUTTON: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  height: 32,
  padding: '0 8px',
  background: 'none',
  border: 'none',
  borderRadius: 9,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 12,
  flexShrink: 0,
};

/**
 * ComposerToolbar（docs/06 §4.2）：输入卡上方/下方的控制条——模型、思考档位、工具预设、
 * 压缩上下文、会话操作（自动命名 / 导出）。
 * 全部受控：数据与动作由宿主给（web 层装配）。
 */
export interface ComposerToolbarProps {
  modelLabel: string | null;
  thinkingLevel: string | null;
  thinkingLevels: string[];
  onThinkingLevelChange(level: string): void;
  toolPreset: string | null;
  toolPresets: { value: string; label: string }[];
  onToolPresetChange(preset: string): void;
  compacting: boolean;
  onCompact(): void;
  onAbortCompaction(): void;
  onAutoName(): void;
  autoNaming: boolean;
  onExport(): void;
  onOpenStats(): void;
  busy: boolean;
}

export function ComposerToolbar({
  modelLabel,
  thinkingLevel,
  thinkingLevels,
  onThinkingLevelChange,
  toolPreset,
  toolPresets,
  onToolPresetChange,
  compacting,
  onCompact,
  onAbortCompaction,
  onAutoName,
  autoNaming,
  onExport,
  onOpenStats,
  busy,
}: ComposerToolbarProps) {
  const chip = 'composer-bar-button';
  return (
    <div className="flex items-center gap-0.5">
      {modelLabel !== null && (
        <span
          title="当前模型"
          style={{
            ...BAR_BUTTON,
            fontFamily: 'var(--font-mono)',
            color: 'var(--accent)',
          }}
        >
          {modelLabel}
        </span>
      )}
      {thinkingLevels.length > 0 && (
        <select
          value={thinkingLevel ?? ''}
          disabled={busy}
          onChange={(event) => onThinkingLevelChange(event.target.value)}
          title="思考档位"
          style={{ ...BAR_BUTTON, color: 'var(--text-muted)' }}
        >
          {thinkingLevel === null && <option value="">思考档位</option>}
          {thinkingLevels.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      )}
      <select
        value={toolPreset ?? ''}
        disabled={busy}
        onChange={(event) => onToolPresetChange(event.target.value)}
        title="工具预设"
        style={{ ...BAR_BUTTON, color: 'var(--text-muted)' }}
      >
        {toolPreset === null && <option value="">工具预设</option>}
        {toolPresets.map((preset) => (
          <option key={preset.value} value={preset.value}>
            {preset.label}
          </option>
        ))}
      </select>
      {compacting ? (
        <button type="button" onClick={onAbortCompaction} className={chip} style={BAR_BUTTON}>
          停止压缩
        </button>
      ) : (
        <button
          type="button"
          onClick={onCompact}
          disabled={busy}
          className={chip}
          style={BAR_BUTTON}
          title="压缩上下文"
        >
          压缩
        </button>
      )}
      <button
        type="button"
        onClick={onAutoName}
        disabled={autoNaming || busy}
        className={chip}
        style={BAR_BUTTON}
      >
        {autoNaming ? '命名中…' : '自动命名'}
      </button>
      <button type="button" onClick={onExport} className={chip} style={BAR_BUTTON}>
        导出
      </button>
      <button type="button" onClick={onOpenStats} className={chip} style={BAR_BUTTON}>
        统计
      </button>
    </div>
  );
}
