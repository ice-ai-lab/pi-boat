import type { CSSProperties } from 'react';
import { cn } from '../lib/cn';

/**
 * 图标（docs/06 §6 对账表）：原型 SVG sprite 的 `#i-*` 原样引用（`IconSprite` 在应用根挂载一次）。
 * 不用第三方图标库——原型的笔画与轮廓是视觉基准的一部分（docs/06 §2）。
 */
export const ICON_NAMES = [
  'boat',
  'panel',
  'plus',
  'search',
  'folder',
  'file',
  'chev-r',
  'chev-d',
  'branch',
  'book',
  'wrench',
  'gauge',
  'db',
  'coin',
  'send',
  'stop',
  'img',
  'gear',
  'moon',
  'sun',
  'refresh',
  'term',
  'pencil',
  'trash',
  'check',
  'copy',
  'bulb',
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

/** 品牌帆船标记（原型 `#i-boat`） */
export function BoatMark({
  size = 20,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <Icon
      name="boat"
      size={size}
      className={className}
      {...(title === undefined ? {} : { title })}
    />
  );
}
