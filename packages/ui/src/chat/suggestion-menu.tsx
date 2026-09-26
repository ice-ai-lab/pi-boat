import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

/**
 * SuggestionMenu：输入卡上方的候选浮层——`@` 文件提及与 `/` 斜杠命令共用。
 *
 * 视觉按设计规范 `ChatInput` 的候选浮层：`--bg` 底 + 1px 描边 + 8px 圆角 + 上向落影。
 * 两种形态（设计规范 `ChatInput` 各一份）：
 * - `list`（`@` 文件提及）：6×8 内边距 / 6px 圆角 / mono 12.5px 行 + 文件图标，选中 `--bg-selected`；
 * - `grid`（`/` 斜杠命令）：按 `hint`（来源）分组 + `repeat(auto-fit, minmax(220px, 1fr))` 网格，
 *   每条是 58px 高的带描边卡片（active 换 accent 描边），命令名 + 2 行截断描述。
 * 位置固定为「输入卡上方」；键盘交互（↑↓/Tab/Enter/Esc）由 Composer 处理并回传下标。
 */
export interface SuggestionItem {
  /** 主文本（路径 / 命令名） */
  label: string;
  /** 左侧图标（`@` 文件提及用 FileIcon，设计规范同款） */
  icon?: ReactNode;
  /** 右侧次要信息（目录 / 来源）；`grid` 形态下是分组键 */
  hint?: string;
  /** 次行描述 */
  description?: string;
}

export interface SuggestionMenuProps {
  title?: string;
  /** 头部右侧的键位提示（设计规范为 `Tab / Enter`） */
  hint?: string;
  items: SuggestionItem[];
  activeIndex: number;
  onPick(index: number): void;
  onHover(index: number): void;
  emptyHint?: string;
  /** `list`（`@` 文件）/ `grid`（`/` 命令分组网格） */
  variant?: 'list' | 'grid';
}

function groupByHint(
  items: SuggestionItem[],
): { hint: string; entries: { item: SuggestionItem; index: number }[] }[] {
  const groups: { hint: string; entries: { item: SuggestionItem; index: number }[] }[] = [];
  const seen = new Map<string, number>();
  for (const [index, item] of items.entries()) {
    const key = item.hint ?? '';
    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, groups.length);
      groups.push({ hint: key, entries: [{ item, index }] });
    } else {
      groups[existing]?.entries.push({ item, index });
    }
  }
  return groups;
}

export function SuggestionMenu({
  title,
  hint,
  items,
  activeIndex,
  onPick,
  onHover,
  emptyHint = '无匹配项',
  variant = 'list',
}: SuggestionMenuProps) {
  const grid = variant === 'grid';
  const groups = grid ? groupByHint(items) : null;
  return (
    <div
      role="listbox"
      aria-label={title ?? '候选'}
      className={cn(
        'absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-full max-w-[820px] -translate-x-1/2 overflow-y-auto rounded-[8px] border border-border bg-bg',
        grid ? 'max-h-[min(72.8vh,598px)] p-2.5' : 'max-h-64 p-1',
      )}
      style={{ boxShadow: '0 -6px 20px rgba(0,0,0,0.12)' }}
    >
      {title !== undefined && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: grid ? '4px 0 8px' : '4px 8px',
            borderBottom: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--text-dim)',
            flexShrink: 0,
          }}
        >
          <span>{title}</span>
          {hint !== undefined && <span style={{ fontFamily: 'var(--font-mono)' }}>{hint}</span>}
        </div>
      )}
      {items.length === 0 && (
        <p style={{ padding: '6px 8px', fontSize: 12, color: 'var(--text-dim)' }}>{emptyHint}</p>
      )}
      {grid
        ? groups?.map((group) => (
            <section key={group.hint || '·'} style={{ marginBottom: 12 }}>
              {group.hint !== '' && (
                <div
                  style={{
                    position: 'sticky',
                    top: -10,
                    zIndex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '4px 0 6px',
                    background: 'var(--bg)',
                    color: 'var(--text-dim)',
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  <span>{group.hint}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                    {group.entries.length}
                  </span>
                </div>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 8,
                }}
              >
                {group.entries.map(({ item, index }) => {
                  const active = index === activeIndex;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => onHover(index)}
                      onClick={() => onPick(index)}
                      style={{
                        width: '100%',
                        minWidth: 0,
                        minHeight: 58,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        justifyContent: 'center',
                        padding: '9px 10px',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 7,
                        background: active ? 'var(--bg-selected)' : 'var(--bg-panel)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        boxShadow: active
                          ? '0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent)'
                          : 'none',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontFamily: 'var(--font-mono)',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                        }}
                      >
                        {item.label}
                      </span>
                      {item.description !== undefined && (
                        <span
                          style={{
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 2,
                            overflow: 'hidden',
                            fontSize: 11,
                            lineHeight: 1.35,
                            color: 'var(--text-dim)',
                          }}
                        >
                          {item.description}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        : items.map((item, index) => (
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
                {item.icon !== undefined && (
                  <span
                    className="shrink-0"
                    style={{ display: 'flex', alignItems: 'center', alignSelf: 'center' }}
                  >
                    {item.icon}
                  </span>
                )}
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
