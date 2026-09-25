import { cn } from '../utils/cn';

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
  const chip =
    'sq px-1.5 py-0.5 text-[11px] text-fg-subtle hover:bg-hover hover:text-fg disabled:opacity-40';
  return (
    <div className="flex items-center gap-1">
      {modelLabel !== null && (
        <span className="sq bg-accent-weak px-1.5 py-0.5 font-mono text-[10.5px] text-accent">
          {modelLabel}
        </span>
      )}
      {thinkingLevels.length > 0 && (
        <select
          value={thinkingLevel ?? ''}
          disabled={busy}
          onChange={(event) => onThinkingLevelChange(event.target.value)}
          title="思考档位"
          className={cn(chip, 'sq border-line-2 bg-transparent')}
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
        className={cn(chip, 'sq border-line-2 bg-transparent')}
      >
        {toolPreset === null && <option value="">工具预设</option>}
        {toolPresets.map((preset) => (
          <option key={preset.value} value={preset.value}>
            {preset.label}
          </option>
        ))}
      </select>
      {compacting ? (
        <button type="button" onClick={onAbortCompaction} className={chip}>
          停止压缩
        </button>
      ) : (
        <button
          type="button"
          onClick={onCompact}
          disabled={busy}
          className={chip}
          title="压缩上下文"
        >
          压缩
        </button>
      )}
      <button type="button" onClick={onAutoName} disabled={autoNaming || busy} className={chip}>
        {autoNaming ? '命名中…' : '自动命名'}
      </button>
      <button type="button" onClick={onExport} className={chip}>
        导出
      </button>
      <button type="button" onClick={onOpenStats} className={chip}>
        统计
      </button>
    </div>
  );
}
