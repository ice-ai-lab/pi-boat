import { useId } from 'react';
import { cn } from '../lib/cn';
import { formatDuration } from '../lib/format';
import { Icon } from '../primitives/icon';

/**
 * 折叠行原子（原型 `.disc` / `.disc-head` / `.disc-body` / `.child-rail`）。
 * 受控：`open` + `onToggle` 由上层（ThinkingRow / ToolRow / ProcessGroup）决定默认态与
 * 「用户手动展开过不被自动收起覆盖」的规则。
 *
 * 与原型一致：展开态是根节点上的 `.open` 类（不是条件渲染）——`.disc-body` 的
 * `display:none` → `.disc.open > .disc-body{display:block}`，`child-rail` 同理。
 */
export interface CollapseRowProps {
  /** 左侧标签（ToolTag / 思考标签） */
  tag?: React.ReactNode;
  /** 单行摘要（`.disc-title` 默认等宽 / 思考行用 `.plain` / 组头用 `.gtitle`） */
  title: React.ReactNode;
  /** 摘要的类名，默认 `disc-title`（等宽） */
  titleClassName?: string;
  durationMs?: number | undefined;
  open: boolean;
  onToggle: (open: boolean) => void;
  children?: React.ReactNode;
  className?: string;
  /** 折叠体直接给正文（字符串）时省一层结构；需要富内容用 children */
  body?: string;
  /** 组头形态（`.group-disc` + `.child-rail`） */
  asGroup?: boolean;
}

export function CollapseRow({
  tag,
  title,
  titleClassName = 'disc-title',
  durationMs,
  open,
  onToggle,
  children,
  className,
  body,
  asGroup = false,
}: CollapseRowProps) {
  const duration = formatDuration(durationMs);
  const panelId = useId();
  return (
    <div className={cn('disc', asGroup && 'group-disc sq', open && 'open', className)}>
      <button
        type="button"
        className="disc-head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(!open)}
      >
        <Icon name="chev-r" size={12} className="chev" />
        {tag}
        <span className={titleClassName}>{title}</span>
        {duration === null ? null : <span className="disc-dur num">{duration}</span>}
      </button>
      <div id={panelId} className={asGroup ? 'child-rail' : 'disc-body'}>
        {children ?? body}
      </div>
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
      {toolName}
    </span>
  );
}

/** `.tag.think`（思考行标签） */
export function ThinkTag() {
  return (
    <span className="tag think">
      <Icon name="bulb" size={12} style={{ marginRight: 3 }} />
      思考
    </span>
  );
}

/** `.stopped-tag`（abort 之后 / 本轮出错） */
export function StoppedTag({ label = '已停止' }: { label?: string }) {
  return <span className="stopped-tag sq">{label}</span>;
}
