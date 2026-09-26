import { useI18n } from '../i18n/i18n-provider';

/**
 * WorkspacePlaceholder：无会话且未选项目时的中栏占位（T3-1 的 A 侧 counterpart）。
 * 按设计规范 的两种形态：
 * - 选了项目（等一句话开新会话）→ 居中「从侧栏选择会话」
 * - 什么都没选 → 左上角「开始使用」引导块（1. 选择项目 / 2. 添加模型）
 */
export function WorkspacePlaceholder({ hasCwd }: { hasCwd: boolean }) {
  const { t } = useI18n();
  if (hasCwd) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 15,
        }}
      >
        {t('workspace.selectSession')}
      </div>
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      <svg
        width="44"
        height="44"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ opacity: 0.7, flexShrink: 0 }}
      >
        <line x1="20" y1="12" x2="4" y2="12" />
        <polyline points="10 6 4 12 10 18" />
      </svg>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
          {t('workspace.getStarted')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <span style={{ color: 'var(--text-dim)', marginRight: 6 }}>1.</span>
          {t('workspace.selectProject')}
          <br />
          <span style={{ color: 'var(--text-dim)', marginRight: 6 }}>2.</span>
          {t('workspace.addModels')}
        </div>
      </div>
    </div>
  );
}
