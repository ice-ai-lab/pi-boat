import { useI18n } from '../i18n/i18n-provider';

/**
 * SystemPromptPanel：逐字移植 pi-web `components/SystemPromptPanel.tsx`。
 * 无标题栏、无关闭键；`height:min(600px,75dvh); min-height:220px`。
 * 展示的是 pi 的**结构化 prompt**（不是某次请求实际下发的），ADR-0015。
 */
export interface SystemPromptPanelProps {
  prompt: string | null;
  loading: boolean;
}

export function SystemPromptPanel({ prompt, loading }: SystemPromptPanelProps) {
  const { t } = useI18n();
  return (
    <section className="system-prompt-panel" aria-label={t('system.prompt')}>
      <div className="system-prompt-scroll">
        {prompt ? (
          <div className="system-prompt-text">{prompt}</div>
        ) : (
          <div className="system-prompt-empty">
            {prompt === '' ? t('system.empty') : loading ? t('system.loading') : t('system.load')}
          </div>
        )}
      </div>

      <style>{`
        .system-prompt-panel {
          display: flex;
          height: min(600px, 75dvh);
          min-height: 220px;
          flex-direction: column;
          background: var(--bg-panel);
          border-bottom: 1px solid var(--border);
        }
        .system-prompt-scroll {
          min-height: 0;
          flex: 1;
          overflow: auto;
          padding: 12px 16px;
        }
        .system-prompt-text {
          color: var(--text-muted);
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.6;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }
        .system-prompt-empty {
          padding: 10px 0;
          color: var(--text-muted);
          font-size: 12px;
          font-style: italic;
        }
      `}</style>
    </section>
  );
}
