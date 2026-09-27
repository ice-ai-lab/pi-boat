import { useI18n } from '../i18n/i18n-provider';
import styles from './system-prompt-panel.module.css';

/**
 * SystemPromptPanel：按设计规范。
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
    <section className={styles.panel} aria-label={t('system.prompt')}>
      <div className={styles.scroll}>
        {prompt ? (
          <div className={styles.text}>{prompt}</div>
        ) : (
          <div className={styles.empty}>
            {prompt === '' ? t('system.empty') : loading ? t('system.loading') : t('system.load')}
          </div>
        )}
      </div>
    </section>
  );
}
