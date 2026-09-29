import { useState } from 'react';
import { useI18n } from '../i18n/i18n-provider';
import { PanelCard } from './panel-card';
import styles from './system-prompt-panel.module.css';

/**
 * 系统提示词面板：版面照 `docs/design/piboat-web-v3.html` 的 `#popSys`——
 * 玻璃卡（`PanelCard`）+ 内嵌等宽正文框 + 底部信息 chips（token 粗估 / 上下文占比 / 注入时机 / 复制）。
 * 展示的是 pi 的**结构化 prompt**（不是某次请求实际下发的），ADR-0015。
 */
export interface SystemPromptPanelProps {
  prompt: string | null;
  loading: boolean;
  onClose(): void;
  /** 上下文窗口大小（token，`ContextUsage.contextWindow`），未知传 null。
   *  chip 展示的是**这份提示词自身**占窗口的比例（估算 token ÷ contextWindow），
   *  不是会话级 `ContextUsage.percent`（那个是整段对话的占用，与提示词无关）。 */
  contextWindow?: number | null;
}

/**
 * token 粗估：CJK（含日文假名）每字 ≈ 1 token，其余每 4 字符 ≈ 1 token。
 * SDK 只导出 `estimateTokens(AgentMessage)`（吃消息对象，不吃裸字符串），此处仅用于展示「约 N tokens」。
 */
function estimateTokens(text: string): number {
  let cjk = 0;
  let total = 0;
  for (const ch of text) {
    total += 1;
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(ch)) cjk += 1;
  }
  return Math.ceil(cjk + (total - cjk) / 4);
}

function BookIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 原型 #i-book */}
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
      <path d="M4 19a2 2 0 0 1 2-2h13" />
    </svg>
  );
}

export function SystemPromptPanel({
  prompt,
  loading,
  onClose,
  contextWindow = null,
}: SystemPromptPanelProps) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);

  const chars = prompt === null ? 0 : Array.from(prompt).length;
  const tokens = prompt ? estimateTokens(prompt) : 0;
  const contextShare =
    contextWindow !== null && contextWindow > 0 ? (tokens / contextWindow) * 100 : null;
  const copy = () => {
    if (prompt === null || prompt === '') return;
    void navigator.clipboard
      .writeText(prompt)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // 剪贴板权限被拒：静默（按钮态不变）
      });
  };

  return (
    <PanelCard
      icon={<BookIcon />}
      title={t('system.prompt')}
      meta={prompt ? t('system.charCount', { count: chars.toLocaleString(locale) }) : undefined}
      onClose={onClose}
    >
      {prompt ? (
        <>
          <div className={styles.prompt}>{prompt}</div>
          <div className={styles.chips}>
            <span className={styles.chip}>
              {t('system.tokenEstimate', { count: tokens.toLocaleString(locale) })}
            </span>
            {contextShare !== null && (
              <span className={styles.chip}>
                {t('system.contextShare', { percent: contextShare.toFixed(2) })}
              </span>
            )}
            <span className={styles.chip}>{t('system.injectedAtCreation')}</span>
            <button type="button" className={styles.chipAct} onClick={copy}>
              {/* 原型 #i-copy（s12） */}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? t('system.copied') : t('system.copy')}
            </button>
          </div>
        </>
      ) : (
        <div className={styles.prompt}>
          {prompt === '' ? t('system.empty') : loading ? t('system.loading') : t('system.load')}
        </div>
      )}
    </PanelCard>
  );
}
