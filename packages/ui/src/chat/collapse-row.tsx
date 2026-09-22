import { useId } from 'react';
import { cn } from '../lib/cn';
import { formatDuration } from '../lib/format';
import { Icon } from '../primitives/icon';

/**
 * 折叠行原子（原型 `.disc` / `.disc-head` / `.disc-body`，docs/06 §8.1）。
 * 受控：`open` + `onToggle` 由上层（ThinkingRow / ToolRow / ProcessGroup）决定默认态与
 * 「用户手动展开过不被自动收起覆盖」的规则。
 */
export interface CollapseRowProps {
  /** 左侧标签（ToolTag / 思考标签 / 组标题） */
  tag?: React.ReactNode;
  /** 单行摘要（`.disc-title`，默认等宽） */
  title: React.ReactNode;
  durationMs?: number | undefined;
  open: boolean;
  onToggle: (open: boolean) => void;
  children?: React.ReactNode;
  className?: string;
  /** 折叠体直接给正文（字符串）时省一层结构；需要富内容用 children */
  body?: string;
  /** 组头形态（`.group-disc > .disc-head`） */
  asGroup?: boolean;
}

export function CollapseRow({
  tag,
  title,
  durationMs,
  open,
  onToggle,
  children,
  className,
  body,
  asGroup,
}: CollapseRowProps) {
  const duration = formatDuration(durationMs);
  const panelId = useId();
  return (
    <div
      className={cn(asGroup === true && 'group-disc', 'disc', asGroup === true && 'sq', className)}
    >
      <button
        type="button"
        className="disc-head sq"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(!open)}
      >
        <Icon name="chev-r" size={12} className="chev" />
        {tag}
        <span className={cn('disc-title', typeof title === 'string' ? undefined : 'plain')}>
          {title}
        </span>
        {duration === null ? null : <span className="disc-dur">{duration}</span>}
      </button>
      {open ? (
        <div id={panelId} className="disc-body scrollbar-thin">
          {children ?? body}
        </div>
      ) : null}
    </div>
  );
}

/** `.tag.tool.{bash,read,edit}` + `.tag.err`（docs/06 §7 工具名→色表） */
export interface ToolTagProps {
  toolName: string;
  status?: 'preparing' | 'running' | 'ok' | 'error' | 'stopped';
  className?: string;
}

export function ToolTag({ toolName, status, className }: ToolTagProps) {
  const known = toolName === 'bash' || toolName === 'read' || toolName === 'edit';
  const error = status === 'error';
  return (
    <span className={cn('tag', 'tool', known && toolName, error && 'err', className)}>
      {/* 颜色不得作为唯一状态载体（docs/06 §9.2）：失败同时给图标 */}
      {error ? <Icon name="warn" size={10} className="mr-1" /> : null}
      {toolName}
    </span>
  );
}

/** `.tag.think`（思考行标签） */
export function ThinkTag() {
  return (
    <span className="tag think">
      <Icon name="bulb" size={12} className="mr-1" />
      思考
    </span>
  );
}

/** `.stopped-tag`（abort 之后） */
export function StoppedTag({ label = '已停止' }: { label?: string }) {
  return <span className="stopped-tag">{label}</span>;
}
