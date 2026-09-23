import type { CSSProperties } from 'react';
import { cn } from '../lib/cn';

/**
 * 图标（docs/06 §6 对账表）：原型 SVG sprite 的 `#i-*` 原样引用（`IconSprite` 在应用根挂载一次）。
 * 不用第三方图标库——原型的笔画与轮廓是视觉基准的一部分（docs/06 §2）。
 */
export const ICON_NAMES = [
  // v4「纸墨」符号集
  'plus',
  'search',
  'folder',
  'branch',
  'sun',
  'moon',
  'gear',
  'panel',
  'chev',
  'bulb',
  'clip',
  'up',
  'stop',
  'wrench',
  'compact',
  'copy',
  'check',
  'x',
  'fork',
  'edit',
  'file',
  'arrowup',
  'arrowdn',
  'cache',
  'cost',
  'tps',
  'sys',
  // 旧补充集（v4 之外仍在使用）
  'boat',
  'chev-r',
  'chev-d',
  'book',
  'gauge',
  'db',
  'coin',
  'send',
  'img',
  'refresh',
  'term',
  'pencil',
  'trash',
  'spark',
  'upload',
  'list',
  'clock',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export interface IconProps {
  name: IconName;
  /** 原型 `.ico` 三档：12 / 14 / 16 / 18；其他数值走内联尺寸（品牌标记 20 / 52） */
  size?: number;
  /** 保留入参以兼容旧调用点；sprite 的 stroke-width 已是原型规格，这里不再覆盖 */
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  /** 语义图标：给可读名；缺省 = 装饰图标（对 AT 隐藏） */
  title?: string;
}

const SIZE_CLASS: Record<number, string> = {
  12: 's12',
  14: 's14',
  16: '',
  18: 's18',
};

export function Icon({ name, size = 16, className, style, title }: IconProps) {
  const sizeClass = SIZE_CLASS[size];
  const inline = sizeClass === undefined ? { width: size, height: size } : undefined;
  const common = {
    className: cn('ico', sizeClass === '' ? undefined : sizeClass, className),
    style: { ...inline, ...style },
  };
  if (title === undefined) {
    return (
      <svg {...common} aria-hidden="true">
        <use href={`#i-${name}`} />
      </svg>
    );
  }
  return (
    <svg {...common} role="img" aria-label={title}>
      <title>{title}</title>
      <use href={`#i-${name}`} />
    </svg>
  );
}

/** 品牌帆船标记（原型 `.brand .mark`：两片主帆 `.sail` 弱靛蓝填充 + 船身描边） */
export function BoatMark({
  size = 19,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const paths = (
    <>
      <path className="sail" d="M12.8 3.2v8.6h6.4c-1.6-3.4-3.6-6-6.4-8.6z" />
      <path className="sail" d="M11.2 5.4v6.4H5.2c1.3-2.6 3.2-4.8 6-6.4z" />
      <path d="M3.4 14.6h17.2l-2.3 4.6a2 2 0 0 1-1.8 1.1H7.5a2 2 0 0 1-1.8-1.1z" />
    </>
  );
  const common = {
    width: size,
    height: size,
    className: cn('mark', className),
    viewBox: '0 0 24 24',
    ...(title === undefined ? {} : { role: 'img' as const, 'aria-label': title }),
  };
  if (title === undefined) {
    return (
      <svg {...common} aria-hidden="true">
        {paths}
      </svg>
    );
  }
  return (
    <svg {...common}>
      <title>{title}</title>
      {paths}
    </svg>
  );
}
