import type { ContextUsage, SessionStatsInfo } from '@ice-ai/protocol';
import { useState } from 'react';
import { useI18n } from '../i18n/i18n-provider';

type SessionCopyField = 'file' | 'id' | 'projectDir' | 'gitBranch' | 'gitWorktree';

/**
 * 会话统计浮层（工具条「会话信息」下拉）：三列 key-value（会话信息 / 项目信息 / 消息计数 /
 * token 表含 cacheWrite·cost·cacheHitRate）+ 逐字段复制按钮 + 入场动画。
 * 逐字移植 pi-web `AppShell.tsx` 的 `session-info-popover`（T1-10 / C6）。
 */
export interface SessionInfoPopoverProps {
  stats: SessionStatsInfo | null;
  contextUsage: ContextUsage | null;
  /** 项目信息行（无则整节隐藏） */
  project?: {
    projectRoot?: string;
    cwd?: string;
    branch?: string;
    isWorktree?: boolean;
  } | null;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatCompact(n: number): string {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(0)}k`
      : String(n);
}

export function SessionInfoPopover({ stats, contextUsage, project }: SessionInfoPopoverProps) {
  const { t, locale } = useI18n();
  const [copiedSessionField, setCopiedSessionField] = useState<SessionCopyField | null>(null);

  if (!stats) {
    return (
      <div className="session-info-popover" style={POPOVER_STYLE}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {t('session.load')}
        </div>
      </div>
    );
  }

  const handleCopySessionField = (field: SessionCopyField, value: string) => {
    void navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedSessionField(field);
    setTimeout(
      () => setCopiedSessionField((current) => (current === field ? null : current)),
      1600,
    );
  };

  const totalActiveMs = stats.totalActiveMs ?? 0;
  const sessionRows = [
    ...(stats.sessionName
      ? [{ label: t('session.name'), value: stats.sessionName, copyField: null }]
      : []),
    {
      label: t('session.file'),
      value: stats.sessionFile ?? t('session.inMemory'),
      copyField: 'file' as const,
    },
    { label: t('session.id'), value: stats.sessionId, copyField: 'id' as const },
    ...(totalActiveMs > 0
      ? [{ label: t('session.totalActive'), value: formatDuration(totalActiveMs), copyField: null }]
      : []),
  ];
  const projectRows = [
    ...(project?.projectRoot
      ? [
          {
            label: t('session.projectDir'),
            value: project.projectRoot,
            copyField: 'projectDir' as const,
          },
        ]
      : []),
    ...(project?.branch
      ? [{ label: t('session.gitBranch'), value: project.branch, copyField: 'gitBranch' as const }]
      : []),
    ...(project?.isWorktree
      ? [
          {
            label: t('session.gitWorktree'),
            value: project?.cwd ?? '',
            copyField: 'gitWorktree' as const,
          },
        ]
      : []),
  ];
  const messageRows = [
    [t('session.user'), stats.userMessages.toLocaleString(locale)],
    [t('session.assistant'), stats.assistantMessages.toLocaleString(locale)],
    [t('session.toolCalls'), stats.toolCalls.toLocaleString(locale)],
    [t('session.toolResults'), stats.toolResults.toLocaleString(locale)],
    [t('session.total'), stats.totalMessages.toLocaleString(locale)],
  ];
  const tokenRows = [
    [t('session.input'), stats.tokens.input.toLocaleString(locale)],
    [t('session.output'), stats.tokens.output.toLocaleString(locale)],
    ...(stats.tokens.cacheRead > 0
      ? [[t('session.cacheRead'), stats.tokens.cacheRead.toLocaleString(locale)]]
      : []),
    ...(stats.tokens.cacheWrite > 0
      ? [[t('session.cacheWrite'), stats.tokens.cacheWrite.toLocaleString(locale)]]
      : []),
    [t('session.total'), stats.tokens.total.toLocaleString(locale)],
  ];
  const ctx = contextUsage ?? stats.contextUsage ?? null;
  const extraTokenRows = [
    ...(stats.cost > 0 ? [[t('session.cost'), `$${stats.cost.toFixed(4)}`]] : []),
    ...(ctx?.contextWindow
      ? [
          [
            t('session.context'),
            `${ctx.percent !== null ? `${ctx.percent.toFixed(1)}%` : '?'} / ${formatCompact(ctx.contextWindow)}`,
          ],
        ]
      : []),
    // Cache hit rate = cache reads / (input + cache writes + cache reads) —— 分母覆盖全部输入类 token
    ...(stats.tokens.cacheRead + stats.tokens.cacheWrite > 0 &&
    stats.tokens.cacheRead + stats.tokens.cacheWrite + stats.tokens.input > 0
      ? [
          [
            t('session.cacheHitRate'),
            `${(
              (stats.tokens.cacheRead /
                (stats.tokens.cacheRead + stats.tokens.cacheWrite + stats.tokens.input)) *
                100
            ).toFixed(1)}%`,
          ],
        ]
      : []),
  ];

  const section = (
    title: string,
    sectionRows: string[][],
    valueAlign: 'left' | 'right' = 'left',
    compact = false,
  ) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        {title}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? 'max-content max-content' : 'auto minmax(0, 1fr)',
          columnGap: compact ? 14 : 12,
          rowGap: 4,
          justifyContent: compact ? 'start' : undefined,
        }}
      >
        {sectionRows.map(([label, value]) => (
          <div key={`${title}:${label}`} style={{ display: 'contents' }}>
            <div style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{label}</div>
            <div
              style={{
                color: 'var(--text-muted)',
                minWidth: 0,
                overflowWrap: compact ? 'normal' : 'anywhere',
                textAlign: valueAlign,
                whiteSpace: valueAlign === 'right' ? 'nowrap' : 'normal',
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const copyTitleKey: Record<SessionCopyField, string> = {
    file: 'session.copyFile',
    id: 'session.copyId',
    projectDir: 'session.copyProjectDir',
    gitBranch: 'session.copyGitBranch',
    gitWorktree: 'session.copyGitWorktree',
  };

  const copyButton = (field: SessionCopyField, value: string) => {
    const copied = copiedSessionField === field;
    return (
      <button
        type="button"
        title={copied ? t('session.copied') : t(copyTitleKey[field])}
        onClick={() => handleCopySessionField(field, value)}
        style={{
          alignSelf: 'start',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          marginTop: -2,
          color: copied ? 'var(--accent)' : 'var(--text-dim)',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 4,
          cursor: 'pointer',
          flex: '0 0 auto',
          transition: 'color 0.12s, border-color 0.12s, background 0.12s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--accent)';
          e.currentTarget.style.borderColor = 'var(--accent)';
          e.currentTarget.style.background = 'var(--bg-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = copied ? 'var(--accent)' : 'var(--text-dim)';
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.background = 'transparent';
        }}
      >
        {copied ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    );
  };

  const sessionInfoSection = (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        {t('session.infoSection')}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          columnGap: 12,
          rowGap: 8,
          alignItems: 'start',
        }}
      >
        {sessionRows.map((row) => (
          <div key={`session-info:${row.label}`} style={{ display: 'contents' }}>
            <div style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{row.label}</div>
            <div
              style={{
                color: 'var(--text-muted)',
                minWidth: 0,
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                whiteSpace: 'normal',
              }}
            >
              {row.value}
            </div>
            <div>{row.copyField ? copyButton(row.copyField, row.value) : null}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const projectInfoSection =
    projectRows.length > 0 ? (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          {t('session.projectSection')}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr) auto',
            columnGap: 12,
            rowGap: 8,
            alignItems: 'start',
          }}
        >
          {projectRows.map((row) => (
            <div key={`project-info:${row.label}`} style={{ display: 'contents' }}>
              <div style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{row.label}</div>
              <div
                style={{
                  color: 'var(--text-muted)',
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                  whiteSpace: 'normal',
                }}
              >
                {row.value}
              </div>
              <div>{row.copyField ? copyButton(row.copyField, row.value) : null}</div>
            </div>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="session-info-popover" style={POPOVER_STYLE}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(360px, 1.7fr) minmax(140px, 0.55fr) minmax(190px, 0.75fr)',
          gap: 24,
          fontSize: 12,
          lineHeight: 1.5,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {sessionInfoSection}
          {projectInfoSection}
        </div>
        {section(t('session.messages'), messageRows)}
        {section(t('session.tokens'), [...tokenRows, ...extraTokenRows], 'right', true)}
      </div>
    </div>
  );
}

const POPOVER_STYLE = {
  background: 'var(--bg-panel)',
  borderBottom: '1px solid var(--border)',
  boxShadow: '0 10px 28px rgba(0,0,0,0.10)',
  padding: '12px 16px',
} as const;
