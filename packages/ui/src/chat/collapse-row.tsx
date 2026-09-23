import { useId } from 'react';
import { cn } from '../lib/cn';
import { formatDuration } from '../lib/format';
import { Icon } from '../primitives/icon';

/**
 * 折叠行原子（原型 `.disc` / `.disc-head` / `.disc-body` / `.disc-inner`；组头形态 `.grp`）。
 * 受控：`open` + `onToggle` 由上层（ThinkingRow / ToolRow / ProcessGroup）决定默认态与
 * 「用户手动展开过不被自动收起覆盖」的规则。
 *
 * 与原型一致：展开态是根节点上的 `.open` 类（不是条件渲染）——`.disc-body` 用
 * `grid-template-rows: 0fr → 1fr` 做高度动画，`overflow:hidden` 落在中间 div，
 * 内边距落在 `.disc-inner` / `.grp-kids`（两层缺一不可，否则 0fr 时内边距仍占位）。
 */
export interface CollapseRowProps {
  /** 左侧标签（ToolTag / 思考标签） */
  tag?: React.ReactNode;
  /** 单行摘要（`.disc-title` 默认等宽 / 思考行用 `.plain` / 组头用 `.gtitle`） */
  title: React.ReactNode;
  /** 摘要的类名，默认 `disc-title`（等宽） */
  titleClassName?: string;
  /** 组头元信息（`.gmeta`，如 `· 4 步 · 12.6s`）；仅 asGroup 生效 */
  meta?: React.ReactNode;
  durationMs?: number | undefined;
  open: boolean;
  onToggle: (open: boolean) => void;
  children?: React.ReactNode;
  className?: string;
  /** 折叠体直接给正文（字符串）时省一层结构；需要富内容用 children */
  body?: string;
  /** 组头形态（`.grp` + `.grp-head` + `.grp-body` + `.grp-kids`） */
  asGroup?: boolean;
  /** 执行中徽标（`.run-spin` 旋转弧，置于时长左侧） */
  running?: boolean;
  /** 错误徽标（`.exit-chip`，如 `exit 1`） */
  exitChip?: React.ReactNode;
}

export function CollapseRow({
  tag,
  title,
  titleClassName = 'disc-title',
  meta,
  durationMs,
  open,
  onToggle,
  children,
  className,
  body,
  asGroup = false,
  running = false,
  exitChip,
}: CollapseRowProps) {
  const duration = formatDuration(durationMs);
  const panelId = useId();
  if (asGroup) {
    return (
      <div className={cn('grp', open && 'open', className)}>
        <button
          type="button"
          className="grp-head"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(!open)}
        >
          <Icon name="chev" size={12} className="chev" />
          <span className="gtitle">{title}</span>
          {meta === undefined ? null : <span className="gmeta">{meta}</span>}
        </button>
        <div id={panelId} className="grp-body">
          <div>
            <div className="grp-kids">{children ?? body}</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={cn('disc', open && 'open', className)}>
      <button
        type="button"
        className="disc-head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(!open)}
      >
        <Icon name="chev" size={12} className="chev" />
        {tag}
        <span className={titleClassName}>{title}</span>
        {exitChip}
        {running ? <RunSpin /> : null}
        {duration === null ? null : <span className="disc-dur num">{duration}</span>}
      </button>
      <div id={panelId} className="disc-body">
        <div>
          <div className="disc-inner">{children ?? body}</div>
        </div>
      </div>
    </div>
  );
}

/** `.run-spin`（执行中的旋转弧线，原型同款：16 视框 r=5.4 圆 + `22 12` 虚线段） */
export function RunSpin({ className }: { className?: string }) {
  return (
    <svg className={cn('run-spin', className)} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.4" />
    </svg>
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

/** `.tag.think`（思考行标签；尺寸与间距由原型 `.tag .ico` / `gap:4px` 给） */
export function ThinkTag() {
  return (
    <span className="tag think">
      <Icon name="bulb" />
      思考
    </span>
  );
}

/** `.stopped-tag`（abort 之后 / 本轮出错） */
export function StoppedTag({ label = '已停止' }: { label?: string }) {
  return <span className="stopped-tag sq">{label}</span>;
}
