// biome-ignore-all lint/suspicious/noArrayIndexKey: diff 行由 SDK 生成的展示串按行切出，行序即身份
import { cn } from '../lib/cn';

/**
 * diff 展示（原型 `.diff`：行 = `.dl.{add,del,ctx}`，行内 `.ln` 行号 / `.sg` 加减号 / `.tx` 内容）。
 *
 * **不在前端算 diff**：SDK 的 edit 工具已生成带行号的展示串
 * （`+<行号> 文本` / `-<行号> 文本` / ` <行号> 文本`，另含 ` <pad> ...` 跳过行），
 * 这里只是按行切前缀渲染。解析失败退化为不展示（调用方不传 diff）。
 */
export interface DiffLine {
  kind: 'add' | 'del' | 'ctx';
  lineNumber: string;
  content: string;
}

export function parseDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const raw of diff.split('\n')) {
    if (raw === '') continue;
    const prefix = raw[0];
    const kind: DiffLine['kind'] = prefix === '+' ? 'add' : prefix === '-' ? 'del' : 'ctx';
    const rest = kind === 'ctx' && prefix !== ' ' ? raw : raw.slice(1);
    const match = /^\s*(\d*)\s(.*)$/.exec(rest);
    lines.push({
      kind,
      lineNumber: match?.[1] ?? '',
      content: match?.[2] ?? rest,
    });
  }
  return lines;
}

const SIGN: Record<DiffLine['kind'], string> = { add: '+', del: '-', ctx: ' ' };

export interface DiffViewProps {
  diff: string;
  className?: string;
}

export function DiffView({ diff, className }: DiffViewProps) {
  const lines = parseDiff(diff);
  if (lines.length === 0) return null;
  return (
    <div className={cn('diff', className)}>
      {lines.map((line, index) => (
        <div className={cn('dl', line.kind)} key={index}>
          <span className="ln num">{line.lineNumber}</span>
          <span className="sg">{SIGN[line.kind]}</span>
          <span className="tx">{line.content}</span>
        </div>
      ))}
    </div>
  );
}
