import { FolderOpen, Loader2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';

/**
 * EmptyState：新会话首屏。布局照抄 pi-web `ChatWindow` 的空会话态——
 * 顶部一行品牌标题（图标 + 22px 粗体，mono 字体对齐右侧版本信息），下面紧跟输入卡。
 * 提交前只做字符串级校验（非空、绝对路径），存在性由 core 校验（400 → 展示错误）。
 */
export interface EmptyStateProps {
  onStart(cwd: string): void;
  starting: boolean;
  /** 上次使用的 cwd（startup-preferences，ADR-0019-4） */
  initialCwd?: string;
  error?: string | null;
}

export function EmptyState({ onStart, starting, initialCwd = '', error }: EmptyStateProps) {
  const [cwd, setCwd] = useState(initialCwd);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = cwd.trim();
    if (trimmed.length > 0 && !starting) onStart(trimmed);
  };

  const canStart = cwd.trim().length > 0 && !starting;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div style={{ marginTop: 16, paddingLeft: 16, paddingRight: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            maxWidth: 'var(--chat-content-max-width, 820px)',
            margin: '0 auto',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <span aria-hidden style={{ fontSize: 26, lineHeight: 1 }}>
              🚢
            </span>
            <span
              style={{
                fontSize: 22,
                color: 'var(--text)',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              PiBoat
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>新会话</span>
        </div>
      </div>

      <form
        onSubmit={submit}
        style={{
          padding: '20px 16px 0',
          maxWidth: 'var(--chat-content-max-width, 820px)',
          width: '100%',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg)',
            border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
            borderRadius: 14,
            padding: '10px 10px 10px 14px',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.10)',
          }}
        >
          <FolderOpen size={15} style={{ flexShrink: 0, color: 'var(--text-dim)' }} />
          <input
            value={cwd}
            onChange={(event) => setCwd(event.target.value)}
            placeholder="/path/to/project（绝对路径）"
            spellCheck={false}
            autoComplete="off"
            disabled={starting}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              lineHeight: 1.6,
              minHeight: 24,
            }}
          />
          <button
            type="submit"
            disabled={!canStart}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              background: canStart ? 'var(--accent)' : 'var(--bg-panel)',
              border: 'none',
              borderRadius: 8,
              color: canStart ? 'var(--accent-contrast)' : 'var(--text-dim)',
              cursor: canStart ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {starting && <Loader2 size={14} className="animate-spin" />}
            开始
          </button>
        </div>
        <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
          输入一个工作目录，开始一段新的航行
        </p>
        {error !== undefined && error !== null && error.length > 0 && (
          <div
            role="alert"
            style={{
              marginTop: 8,
              padding: '7px 10px',
              background: 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              color: '#ef4444',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
