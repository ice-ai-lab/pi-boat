import type { CSSProperties } from 'react';
import type { HighlightLine } from './code-highlight';
import styles from './highlight.module.css';

/** 空行占位（零宽空格）：折行/缩进场景下保住行高 */
const EMPTY_LINE = '\u200b';

/** token 行内 CSS 变量；缺色时给 inherit，好让 `.token` 里的 `var()` 有值可取 */
function tokenStyle(token: HighlightLine[number]): CSSProperties {
  return {
    '--shiki-light': token.style['--shiki-light'] ?? 'inherit',
    '--shiki-dark': token.style['--shiki-dark'] ?? 'inherit',
  } as CSSProperties;
}

/** 高亮行文本：一处 token → 一处 `<span>`；未高亮（null）时不渲染本组件 */
export function HighlightedText({ line }: { line: HighlightLine }) {
  if (line.length === 0) return <span className={styles.token}>{EMPTY_LINE}</span>;
  return (
    <>
      {line.map((token, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 行内 token 是纯静态切片，顺序即身份
        <span key={index} className={styles.token} style={tokenStyle(token)}>
          {token.content}
        </span>
      ))}
    </>
  );
}
