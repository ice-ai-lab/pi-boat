import { useServerHealth } from './health';

const HEALTH_LABEL = { checking: '检测中', up: '连接正常', down: '连接中断' } as const;
const HEALTH_DOT_CLASS = {
  checking: 'bg-fg-faint',
  up: 'bg-success',
  down: 'bg-danger',
} as const;

/**
 * F0 骨架：三栏空壳（docs/08 §4 F0 验收线）。
 * 侧栏内容 F2（项目/会话/文件树）、对话区 F1（EmptyState → 消息流）、右栏 F3（文件页签）填充。
 */
export function WorkspaceLayout() {
  const health = useServerHealth();
  return (
    <div className="app-shell flex h-dvh flex-col bg-surface">
      <header className="hairline-b flex h-12 shrink-0 items-center gap-2 border-line-2 px-3">
        <span aria-hidden className="text-lg">
          🚢
        </span>
        <span className="text-sm font-semibold text-fg">PiBoat</span>
        <span className="ml-1 text-xs text-fg-faint">Web · 一期骨架</span>
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full ${HEALTH_DOT_CLASS[health]}`}
          />
          <span className="text-fg-subtle">{HEALTH_LABEL[health]}</span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hairline-r w-(--sb-w) shrink-0 border-line-2 bg-surface-side p-3">
          <p className="text-xs text-fg-faint">侧栏（F2：项目 / 会话 / 文件树）</p>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center">
          <div className="text-center">
            <p aria-hidden className="mb-3 text-4xl">
              🚢
            </p>
            <h1 className="text-base font-semibold text-fg">PiBoat</h1>
            <p className="mt-1 text-sm text-fg-subtle">
              对话区（F1：EmptyState cwd 输入 → 消息流）
            </p>
          </div>
        </main>
        <aside className="hairline-l w-(--rb-w) shrink-0 border-line-2 bg-surface-side p-3">
          <p className="text-xs text-fg-faint">右栏（F3：文件页签 / 查看器）</p>
        </aside>
      </div>
    </div>
  );
}
