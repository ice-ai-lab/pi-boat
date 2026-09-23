import type { ProjectInfo } from '@ice-ai/protocol';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../primitives/icon';

/**
 * 文件夹空间切换器（原型 `#wsBtn` + `#wsMenu`）——左侧栏第一件东西。
 *
 * 「文件夹空间」= protocol 的**项目**（ADR-0008：按 git 仓库根归一的 `projectKey`）。
 * 路径用 `direction: rtl` 让省略号落在**左侧**、保留尾部目录名（原型签名细节）。
 */
export interface WorkspaceMenuProps {
  projects: ProjectInfo[];
  /** 当前选中的 `projectKey`；`null` = 尚未确定（首次加载） */
  activeKey: string | null;
  loading?: boolean;
  onSelect: (projectKey: string) => void;
  /** 「自定义路径…」——M1 无系统目录选择器，回调由宿主提供 */
  onSelectCustom?: () => void;
  /** 有运行中会话的 projectKey，用于菜单里的 live 圆点 */
  runningKeys?: readonly string[];
  className?: string;
}

export function WorkspaceMenu({
  projects,
  activeKey,
  loading = false,
  onSelect,
  onSelectCustom,
  runningKeys,
  className,
}: WorkspaceMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const active = projects.find((project) => project.projectKey === activeKey) ?? null;
  const running = new Set(runningKeys ?? []);
  const path = active?.cwd ?? (loading ? '正在读取文件夹空间…' : '未选择文件夹空间');
  /** 按钮上只显示目录名（原型 `.fname`），全路径进 title 与菜单 */
  const fname =
    active === null ? path : (active.cwd.split(/[\\/]/).filter(Boolean).pop() ?? active.cwd);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node) === true) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const select = (projectKey: string): void => {
    setOpen(false);
    onSelect(projectKey);
  };

  return (
    <div ref={rootRef} className={cn('ws-anchor', className)}>
      <button
        type="button"
        className="ws"
        title={active === null ? '切换文件夹空间' : active.cwd}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="folder" size={14} />
        <span className="fname">{fname}</span>
        {active?.branch === undefined ? null : (
          <span className="br">
            <Icon name="fork" size={12} />
            {active.branch}
          </span>
        )}
        <Icon name="chev-d" size={12} className="chev8" />
      </button>
      {open ? (
        <div className="ws-menu" role="menu" style={{ left: 0 }}>
          {projects.map((project) => {
            const on = project.projectKey === activeKey;
            return (
              <button
                key={project.projectKey}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                title={project.cwd}
                className={cn('wi', on && 'on')}
                onClick={() => select(project.projectKey)}
              >
                <Icon name="folder" size={14} />
                <span className="p">{project.cwd}</span>
                {running.has(project.projectKey) ? (
                  <span className="live" title="有运行中的会话" />
                ) : null}
                <span className="chk">
                  <Icon name="check" size={14} />
                </span>
              </button>
            );
          })}
          {projects.length === 0 ? (
            <p style={{ padding: '8px 10px', fontSize: 11.5, color: 'var(--t4)' }}>
              {loading ? '正在读取…' : '还没有历史会话，先在中间填写工作目录'}
            </p>
          ) : null}
          {onSelectCustom === undefined ? null : (
            <>
              <div className="rule" />
              <button
                type="button"
                className="wi"
                onClick={() => {
                  setOpen(false);
                  onSelectCustom();
                }}
              >
                <Icon name="plus" size={14} className="add-ico" />
                <span className="p" style={{ fontFamily: 'var(--font)', color: 'var(--t2)' }}>
                  自定义路径…
                </span>
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
