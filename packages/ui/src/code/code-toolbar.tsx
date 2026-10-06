/** 代码卡片头：语言标 + 折行/复制动作（DSH CodeToolbar 同形；Tooltip 用原生 title 替代）。 */

import css from './code-card.module.css';
import { supportsHighlighting } from './highlight';
import {
  IconCheckOutlineRegular,
  IconCopyOutlineRegular,
  IconNowrapFillRegular,
  IconWrapFillRegular,
} from './icons';

/** 卡片属主提供的本地化文案。 */
export interface CodeToolbarLabels {
  /** 语言未知/不支持高亮时的占位标题。 */
  codeLabel: string;
  /** 启用折行的动作。 */
  wrapLabel: string;
  /** 保持源列宽、横向滚动的动作。 */
  unwrapLabel: string;
}

/** 卡片头的状态与回调。 */
interface CodeToolbarProps {
  lang?: string | undefined;
  title?: string | undefined;
  /** 动作区左侧的状态文字（如 `+3 -1`）。 */
  status?: string | undefined;
  labels: CodeToolbarLabels;
  copyLabel: string;
  copiedLabel: string;
  copied: boolean;
  wrapped: boolean;
  onCopy?: (() => void) | undefined;
  onWrap?: (() => void) | undefined;
}

/** 语言标 + 可键盘触达的图标动作（tooltip 走原生 title）。 */
export function CodeToolbar({
  lang,
  title,
  status,
  labels,
  copyLabel,
  copiedLabel,
  copied,
  wrapped,
  onCopy,
  onWrap,
}: CodeToolbarProps) {
  const wrapLabel = wrapped ? labels.unwrapLabel : labels.wrapLabel;
  const clipboardLabel = copied ? copiedLabel : copyLabel;
  return (
    <div className={css.header} data-code-block-banner>
      <div className={css.heading}>
        <span className={css.language}>{supportsHighlighting(lang) ? lang : labels.codeLabel}</span>
        {title !== undefined && (
          <span className={css.title} title={title}>
            {title}
          </span>
        )}
      </div>
      <div className={css.actions}>
        {status !== undefined && <span className={css.status}>{status}</span>}
        {onWrap !== undefined && (
          <button
            type="button"
            className={css.action}
            aria-label={wrapLabel}
            aria-pressed={wrapped}
            title={wrapLabel}
            onClick={onWrap}
          >
            {wrapped ? <IconNowrapFillRegular size={14} /> : <IconWrapFillRegular size={14} />}
          </button>
        )}
        {onCopy !== undefined && (
          <button
            type="button"
            className={css.action}
            aria-label={clipboardLabel}
            title={clipboardLabel}
            onClick={onCopy}
          >
            {copied ? <IconCheckOutlineRegular size={14} /> : <IconCopyOutlineRegular size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}
