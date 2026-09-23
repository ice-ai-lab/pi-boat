import { newSession } from '@ice-ai/client';
import { getApiClient } from '@ice-ai/client/react';
import { PROTOCOL_VERSION } from '@ice-ai/protocol';
import { EmptyState, Icon, Textarea } from '@ice-ai/ui';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ConvHeader, HeaderTools, type PopName } from '../components/conv-header';
import { useAppState } from '../lib/app-state';
import { describeApiError } from '../lib/errors';
import { isAbsolutePath, readStoredCwd, storeCwd } from '../lib/prefs';

/**
 * 新会话（hero，原型 `.hero` + `#heroSlot`）。
 *
 * 首条消息的走法：只建空会话（`ensure_session`），带着首条消息跳转到会话页，
 * 由会话页**先建 SSE 再发 prompt**——否则 run 可能跑在订阅之前（事件不重放）。
 * `cwd` 继承当前文件夹空间，允许手改（M1 无系统目录选择器）。
 */
export function NewSessionRoute() {
  const navigate = useNavigate();
  const { workspace, workspaceKey, cwd: workspaceCwd, projectsLoading, adoptCwd } = useAppState();
  const [cwd, setCwd] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<PopName | null>(null);

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

  const canSend = !busy && text.trim() !== '' && cwd.trim() !== '';

  return (
    <>
      <ConvHeader
        title="新会话"
        tools={<HeaderTools systemPrompt={null} open={open} onOpenChange={setOpen} />}
      />
      <div className="conv-shell">
        <EmptyState
          title="起航，驶向未至之境"
          subtitle="选择左侧的文件夹空间，从一次对话开始"
          cwd={workspace?.cwd ?? (cwd === '' ? null : cwd)}
          version={
            <>
              web v{__APP_VERSION__}
              <br />
              protocol v{PROTOCOL_VERSION}
            </>
          }
        >
          <label className="cwd-row">
            <Icon name="folder" size={14} />
            <input
              value={cwd}
              onChange={(event) => setCwd(event.target.value)}
              placeholder="/absolute/path/to/project"
              aria-label="工作目录"
              spellCheck={false}
            />
          </label>
          <Textarea
            value={text}
            onChange={setText}
            onSubmit={() => void start()}
            disabled={busy}
            placeholder="消息… 输入 / 使用命令"
          />
          <button
            type="button"
            className="send-btn"
            title="发送"
            aria-label="发送"
            disabled={!canSend}
            onClick={() => void start()}
          >
            <Icon name="send" size={18} />
          </button>
          {error === null ? null : <p className="err">{error}</p>}
          <p className="cwd-hint">
            当前文件夹空间：{workspace?.projectRoot ?? '（无历史项目，直接粘贴绝对路径）'}
          </p>
        </EmptyState>
      </div>
    </>
  );
}
