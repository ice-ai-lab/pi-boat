import type { ReactNode } from 'react';

/**
 * EmptyState：新会话首屏（T3-1 / C1 / C8 / C30）——按设计规范 `ChatWindow` 的空会话态：
 * 品牌行（32×32 应用图标 + `PiBoat` 22px/700）+ **直接复用 Composer** + 扩展货架；
 * 容器为「上 flex-1 / 内容 / 下 flex-1」（居中偏下）。
 *
 * 版本号不在这里：2026-09-28 用户拍板撤掉品牌行右侧的两行版本块，pi 版本随应用版本常驻
 * **侧栏品牌胶囊**（`sidebar.tsx` 的 `BrandTitle`）。
 */
export interface EmptyStateProps {
  /** 输入卡（宿主渲染的 Composer） */
  children?: ReactNode;
  /** 扩展货架（composer 之下） */
  shelf?: ReactNode;
}

export function EmptyState({ children, shelf }: EmptyStateProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1" />
      <div className="mb-3 w-full" style={{ padding: '0 16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            maxWidth: 'var(--chat-content-max-width, 1150px)',
            margin: '0 auto',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <img
            src="/icons/apple-touch-icon.png"
            width={32}
            height={32}
            alt=""
            style={{ flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: 22,
              color: 'var(--text)',
              fontWeight: 700,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            PiBoat
          </span>
        </div>
      </div>
      {children}
      {shelf}
      <div className="min-h-0 flex-1" />
    </div>
  );
}
