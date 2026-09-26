import { AnsiUp } from 'ansi_up';
import { useMemo } from 'react';

/**
 * 把扩展挂件（pi-lens / nano-context / rpiv-todo 等）输出的 ANSI SGR 转义序列
 * 渲染为着色 HTML。逐字移植 pi-web `components/AnsiText.tsx`：
 * `ansi_up` 支持完整 SGR 集（16/256/24-bit 色、粗斜体下划线删除线、链接、复位），
 * 且默认转义 HTML 实体——挂件文本无法注入标记。
 */
export function AnsiText({ text }: { text: string }) {
  const html = useMemo(() => new AnsiUp().ansi_to_html(text), [text]);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: ansi_up 默认转义 HTML 实体，挂件文本无法注入标记
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
