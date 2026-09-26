import { cn } from '../utils/cn';

/**
 * SuggestionMenu：输入卡上方的候选浮层——`@` 文件提及与 `/` 斜杠命令共用。
 * 视觉按设计规范 `ChatInput` 的候选浮层：`--bg` 底 + 1px 描边 + 8px 圆角 + 上向落影，
 * 条目 6×8 内边距 / 6px 圆角 / mono 12.5px，选中 `--bg-selected`。
 * 位置固定为「输入卡上方」；键盘交互（↑↓/Tab/Enter/Esc）由 Composer 处理并回传下标。
 */
export interface SuggestionItem {
  /** 主文本（路径 / 命令名） */
  label: string;
  /** 右侧次要信息（目录 / 来源 / 描述） */
  hint?: string;
  /** 次行描述 */
  description?: string;
}

export interface SuggestionMenuProps {
  title?: string;
  items: SuggestionItem[];
  activeIndex: number;
  onPick(index: number): void;
  onHover(index: number): void;
  emptyHint?: string;
}

export function SuggestionMenu({
  title,
  items,
  activeIndex,
  onPick,
  onHover,
  emptyHint = '无匹配项',
}: SuggestionMenuProps) {
  return (
    <div
      role="listbox"
      aria-label={title ?? '候选'}
      className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 max-h-64 w-full max-w-[820px] -translate-x-1/2 overflow-y-auto rounded-[8px] border border-border bg-bg p-1"
      style={{ boxShadow: '0 -6px 20px rgba(0,0,0,0.12)' }}
    >
      {title !== undefined && (
        <p
          style={{
            padding: '4px 8px',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-dim)',
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </p>
      )}
      {items.length === 0 && (
        <p style={{ padding: '6px 8px', fontSize: 12, color: 'var(--text-dim)' }}>{emptyHint}</p>
      )}
      {items.map((item, index) => (
        <button
          // 候选路径/命令名在列表内唯一（同名的目录与文件不会同时出现）
          key={item.label}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onMouseEnter={() => onHover(index)}
          onClick={() => onPick(index)}
          className={cn(
            'flex w-full flex-col gap-0.5 rounded-[6px] px-2 py-1.5 text-left',
            index === activeIndex
              ? 'bg-bg-selected text-text'
              : 'text-text-muted hover:bg-bg-hover',
          )}
        >
          <span className="flex items-baseline gap-2">
            <span
              className="min-w-0 truncate"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
            >
              {item.label}
            </span>
            {item.hint !== undefined && (
              <span
                className="ml-auto shrink-0"
                style={{ fontSize: 10.5, color: 'var(--text-dim)' }}
              >
                {item.hint}
              </span>
            )}
          </span>
          {item.description !== undefined && (
            <span
              className="truncate"
              style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.35 }}
            >
              {item.description}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
