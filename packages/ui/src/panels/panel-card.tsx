import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n-provider';
import styles from './panel-card.module.css';

/**
 * PanelCard：顶部活动面板（系统提示词 / 工具定义）的通用玻璃卡壳。
 * 版面照 `docs/design/piboat-web-v3.html` 的 `.pop`：head（图标 + 标题 + 右侧元信息 + 收起键）
 * + 0.5px 发丝线 + body。可用高度由宿主经 `--panel-max-height` 传入。
 */
export interface PanelCardProps {
  /** 标题左侧图标（14px 线性图标） */
  icon: ReactNode;
  title: string;
  /** 右侧元信息（字符数 / 工具数 …），省略则不渲染 */
  meta?: ReactNode;
  onClose(): void;
  /** body 是否带内边距并自身滚动；工具面板需要两栏满铺，传 false */
  padded?: boolean;
  children: ReactNode;
}

export function PanelCard({ icon, title, meta, onClose, padded = true, children }: PanelCardProps) {
  const { t } = useI18n();
  return (
    <section className={styles.card} aria-label={title}>
      <header className={styles.head}>
        <span className={styles.headIcon} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.title}>{title}</span>
        {meta !== undefined && <span className={styles.sub}>{meta}</span>}
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          title={t('panel.collapse')}
          aria-label={t('panel.collapse')}
        >
          {/* 原型 #i-chev-d（14px） */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 9 7 7 7-7" />
          </svg>
        </button>
      </header>
      <div className={styles.rule} aria-hidden="true" />
      <div className={padded ? styles.body : styles.bodyFlush}>{children}</div>
    </section>
  );
}
