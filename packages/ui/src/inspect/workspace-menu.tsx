import type { ProjectInfo } from '@ice-ai/protocol';
import { useState } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../primitives/icon';
import { Popover } from '../primitives/popover';

/**
 * 文件夹空间切换器（原型 `#wsBtn` + `#wsMenu`，docs/06 §4.3）——左侧栏第一件东西。
 *
 * 「文件夹空间」= protocol 的**项目**（ADR-0008：按 git 仓库根归一的 `projectKey`），
 * 不是独立实体；本组件只做选择，默认值（最近一次对话的空间）由宿主决定。
 *
 * 视觉细节（原型签名）：路径用 `direction: rtl` 让省略号落在**左侧**、保留尾部目录名；
 * 菜单项右侧的 `chk` 只在选中项出现；`live` 圆点表示该项目有运行中的会话
 * （M1 不提供跨项目运行态，`runningKeys` 由宿主可选传入，见 docs/06 §4.3 注）。
 */
export interface WorkspaceMenuProps {
  projects: ProjectInfo[];
  /** 当前选中的 `projectKey`；`null` = 尚未确定（首次加载） */
  activeKey: string | null;
  loading?: boolean;
  onSelect: (projectKey: string) => void;
  /** 「自定义路径…」——M1 无系统目录选择器，回调由宿主提供（滚回 hero 的 cwd 输入框） */
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
  const active = projects.find((project) => project.projectKey === activeKey) ?? null;
  const running = new Set(runningKeys ?? []);
  const path = active?.cwd ?? (loading ? '正在读取文件夹空间…' : '未选择文件夹空间');

  const select = (projectKey: string): void => {
    setOpen(false);
    onSelect(projectKey);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width={300}
      className="max-h-none"
      bodyClassName="p-1.5"
      trigger={({ toggle, id }) => (
        <button
          type="button"
          id={id}
          aria-haspopup="dialog"
          aria-expanded={open}
          title="切换文件夹空间"
          onClick={toggle}
          className={cn(
            'hairline flex w-full flex-none items-center gap-2 rounded-xl border-line-2 bg-surface-raised px-2.5 py-[7px] text-left transition-colors hover:bg-hover',
            className,
          )}
        >
          <Icon name="folder" size={14} className="flex-none text-fg-subtle" />
          <span
            className="min-w-0 flex-1 truncate font-mono text-[12px] leading-[17px] text-fg"
            style={{ direction: 'rtl', textAlign: 'left' }}
          >
            {path}
          </span>
          <Icon name="chev-d" size={12} className="flex-none text-fg-subtle" />
        </button>
      )}
    >
      <div className="flex flex-col">
        {projects.map((project) => {
          const on = project.projectKey === activeKey;
          return (
            <button
              key={project.projectKey}
              type="button"
              title={project.cwd}
              aria-current={on ? 'true' : undefined}
              onClick={() => select(project.projectKey)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-hover"
            >
              <Icon name="folder" size={14} className="flex-none text-fg-subtle" />
              <span
                className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg"
                style={{ direction: 'rtl', textAlign: 'left' }}
              >
                {project.cwd}
              </span>
              {running.has(project.projectKey) ? (
                <span
                  title="有运行中的会话"
                  className="size-1.5 flex-none rounded-full bg-accent"
                />
              ) : null}
              <Icon
                name="check"
                size={14}
                className={cn('flex-none text-accent', on ? 'opacity-100' : 'opacity-0')}
              />
            </button>
          );
        })}
        {projects.length === 0 ? (
          <p className="px-2.5 py-2 text-[11.5px] text-fg-faint">
            {loading ? '正在读取…' : '还没有历史会话，先在下方填写工作目录'}
          </p>
        ) : null}
        {onSelectCustom === undefined ? null : (
          <>
            <div className="mx-1.5 my-1 h-[0.5px] bg-line-2" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSelectCustom();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-hover"
            >
              <Icon name="plus" size={14} className="flex-none text-fg-subtle" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-fg-muted">自定义路径…</span>
            </button>
          </>
        )}
      </div>
    </Popover>
  );
}
