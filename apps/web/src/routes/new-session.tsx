import { newSession } from '@ice-ai/client';
import { getApiClient } from '@ice-ai/client/react';
import { PROTOCOL_VERSION } from '@ice-ai/protocol';
import { Button, EmptyState, Icon } from '@ice-ai/ui';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ConvHeader } from '../components/conv-header';
import { useAppState } from '../lib/app-state';
import { describeApiError } from '../lib/errors';
import { isAbsolutePath, readStoredCwd, storeCwd } from '../lib/prefs';

/**
 * 新会话（hero，原型 `#hero`，docs/06 §11.3 行 1）。
 *
 * **cwd 的来源（2026-09-23 变更）**：左侧栏的「文件夹空间」是主选，hero 的路径输入继承
 * 当前空间的 cwd 并允许手改（M1 无系统目录选择器）。提交后 `adoptCwd` 把能归类到某个
 * 项目的 cwd 反哺回空间选择，列表与建会话的目录因此不会长期劈叉。
 *
 * 首条消息的走法（2026-09-23 端到端验收修正）：这里只建空会话（`ensure_session`，不发消息），
 * 带着首条消息跳转到会话页，由会话页**先建 SSE 再发 prompt**——否则 run 可能跑在订阅之前，
 * 首轮就拿不到流式增量（事件不重放，docs/04 §5.5）。
 * 只有「当前空间 + 首条消息」时连路径输入都不必碰，这与原型的「选择左侧的文件夹空间，
 * 从一次对话开始」是同一条路。
 */
export function NewSessionRoute() {
  const navigate = useNavigate();
  const { workspace, workspaceKey, cwd: workspaceCwd, projectsLoading, adoptCwd } = useAppState();
  const [cwd, setCwd] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 文件夹空间变了才同步输入框（手改 cwd 不会被列表刷新冲掉）
  const syncedKey = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (projectsLoading) return;
    if (syncedKey.current === workspaceKey) return;
    syncedKey.current = workspaceKey;
    setCwd(workspaceCwd ?? readStoredCwd());
  }, [projectsLoading, workspaceKey, workspaceCwd]);

  const start = async (): Promise<void> => {
    const target = cwd.trim();
    if (target === '') {
      setError('请先选择文件夹空间，或填写工作目录');
      return;
    }
    if (!isAbsolutePath(target)) {
      setError('工作目录需要是绝对路径');
      return;
    }
    if (text.trim() === '') {
      setError('请输入第一条消息');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await newSession(getApiClient(), { cwd: target, type: 'ensure_session' });
      storeCwd(target);
      adoptCwd(target);
      navigate(`/session/${ok.sessionId}`, { state: { firstMessage: text.trim() } });
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ConvHeader />
      <EmptyState
        title="起航，驶向未至之境"
        subtitle="选择左侧的文件夹空间，从一次对话开始"
        version={`web v${__APP_VERSION__} · protocol v${PROTOCOL_VERSION}`}
      >
        <div className="flex flex-col gap-3">
          <label className="hairline flex items-center gap-2 rounded-xl border-line-1 bg-surface-raised px-3 py-2 elev-soft-sm">
            <Icon name="folder" size={14} className="flex-none text-fg-subtle" />
            <input
              value={cwd}
              onChange={(event) => setCwd(event.target.value)}
              placeholder="/absolute/path/to/project"
              aria-label="工作目录"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-fg outline-none placeholder:text-fg-faint"
            />
          </label>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void start();
              }
            }}
            rows={3}
            aria-label="第一条消息"
            placeholder="第一条消息…（Enter 发送，Shift+Enter 换行）"
            className="resize-none rounded-[14px] bg-surface-raised p-3 text-[14px] leading-[22px] text-fg outline-none elev-soft-sm placeholder:text-fg-faint"
          />
          <div className="flex items-center gap-3">
            {error === null ? null : <span className="text-[12px] text-danger">{error}</span>}
            <span className="flex-1" />
            <Button variant="primary" className="px-4" disabled={busy} onClick={() => void start()}>
              {busy ? '正在创建…' : '开始对话'}
            </Button>
          </div>
          <p className="text-[11px] text-fg-faint">
            {workspace === null
              ? '还没有历史项目：直接粘贴绝对路径。`~` 不会被展开（shell 语义不属于本输入框）。'
              : `当前文件夹空间：${workspace.projectRoot} · 切换请点左侧栏顶部的空间按钮`}
          </p>
        </div>
      </EmptyState>
    </>
  );
}
