import { useMemo } from 'react';
import { cn } from '../utils/cn';

/**
 * CodeViewer（docs/06 §4.3）：行号 + 等宽正文。
 * 语法高亮在 F5 接 shiki（ADR-0009）；现在给行号与折行开关，保证大文件也能读。
 * 行数上限：超大文件只渲染前 N 行（避免几万行 DOM 卡死），并提示截断。
 */
export interface CodeViewerProps {
  code: string;
  wrapLines: boolean;
  /** 只渲染前 N 行（默认 5000） */
  maxLines?: number;
  className?: string;
}

const DEFAULT_MAX_LINES = 5000;

export function CodeViewer({
  code,
  wrapLines,
  maxLines = DEFAULT_MAX_LINES,
  className,
}: CodeViewerProps) {
  const { lines, truncated } = useMemo(() => {
    const all = code.split('\n');
    if (all.length <= maxLines) return { lines: all, truncated: false };
    return { lines: all.slice(0, maxLines), truncated: true };
  }, [code, maxLines]);

  return (
    <div className={cn('scrollbar-thin min-h-0 flex-1 overflow-auto', className)}>
      <table className="w-full border-collapse font-mono text-[12.5px] leading-[1.6]">
        <tbody>
          {lines.map((line, index) => (
            // 代码行以行号为身份（文件内容整体替换时才重算）
            // biome-ignore lint/suspicious/noArrayIndexKey: 见上行说明
            <tr key={index} className="align-top">
              <td
                className="select-none border-r border-line-1 pr-3 pl-2 text-right text-[11px] text-fg-faint"
                style={{ width: 1, whiteSpace: 'nowrap' }}
              >
                {index + 1}
              </td>
              <td
                className={cn(
                  'pl-3 pr-4 text-fg',
                  wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre',
                )}
              >
                {line.length === 0 ? ' ' : line}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <p className="px-3 py-2 text-[11.5px] text-fg-faint">
          文件过大，仅显示前 {maxLines.toLocaleString()} 行（完整内容请下载）
        </p>
      )}
    </div>
  );
}
