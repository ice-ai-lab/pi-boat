/** 一枚全彩方形代码文件图标（DSH CodeFileIcon 同形；artwork 表来自 DSH，MIT）。 */
import { type ReactNode, useId } from 'react';
import { CODE_FILE_ARTWORK, CODE_FILE_ICON_ID_TOKEN } from './code-file-icon-artwork';
import type { CodeFileType } from './code-file-types';
import type { IconProps } from './icon-props';

/**
 * 渲染一枚带原配色的方形代码文件字形。
 * @param props - 细分代码类型、可选尺寸与 class。
 * @returns 内嵌 artwork 的装饰性 SVG（渐变/clipPath 的 id 按实例隔离）。
 */
export function CodeFileIcon({
  type,
  size = 20,
  className,
}: IconProps & { readonly type: CodeFileType }): ReactNode {
  const instanceId = `ice-code-icon-${useId().replaceAll(':', '')}`;
  const artwork = CODE_FILE_ARTWORK[type].replaceAll(CODE_FILE_ICON_ID_TOKEN, instanceId);
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      // biome-ignore lint/security/noDangerouslySetInnerHtml: 静态 artwork 表（code.test 锁它只含 SVG 图形），id 按实例替换
      dangerouslySetInnerHTML={{ __html: artwork }}
    />
  );
}
