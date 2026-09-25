import { cn } from '../utils/cn';

/**
 * SuggestionMenu（docs/06 §4.2）：输入卡上方的候选浮层——`@` 文件提及与 `/` 斜杠命令共用。
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
      className="sq elev-panel scrollbar-thin absolute bottom-[calc(100%+6px)] left-1/2 z-30 max-h-64 w-(--chat-w) max-w-full -translate-x-1/2 overflow-y-auto bg-menu p-1 backdrop-blur-[40px]"
    >
      {title !== undefined && <p className="px-2 py-1 text-[10.5px] text-fg-faint">{title}</p>}
      {items.length === 0 && <p className="px-2 py-1.5 text-[12px] text-fg-faint">{emptyHint}</p>}
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
            'sq flex w-full flex-col gap-0.5 px-2 py-1 text-left',
            index === activeIndex ? 'bg-accent-weak text-accent' : 'text-fg-muted hover:bg-hover',
          )}
        >
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 truncate font-mono text-[12.5px]">{item.label}</span>
            {item.hint !== undefined && (
              <span className="ml-auto shrink-0 text-[10.5px] text-fg-faint">{item.hint}</span>
            )}
          </span>
          {item.description !== undefined && (
            <span className="truncate text-[11px] text-fg-faint">{item.description}</span>
          )}
        </button>
      ))}
    </div>
  );
}
