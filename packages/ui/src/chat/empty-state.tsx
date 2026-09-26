import type { ReactNode } from 'react';

/**
 * EmptyState：新会话首屏（T3-1 / C1 / C8 / C30）——逐字照抄 pi-web `ChatWindow` 的空会话态：
 * 品牌行（32×32 应用图标 + `Pi Web` 22px/700 + 右侧两行版本块）+ **直接复用 Composer**
 * + 扩展货架；容器为「上 flex-1 / 内容 / 下 flex-1」（居中偏下），`paddingRight` 桌面 52（避让 minimap）。
 */
export interface EmptyStateProps {
  /** web 应用版本（如 `0.1.0`） */
  appVersion: string;
  /** pi SDK 版本（null 时不显示该行） */
  piVersion: string | null;
  /** 输入卡（宿主渲染的 Composer） */
  children?: ReactNode;
  /** 扩展货架（composer 之下） */
  shelf?: ReactNode;
}

export function EmptyState({ appVersion, piVersion, children, shelf }: EmptyStateProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1" />
      <div className="mb-3 w-full" style={{ paddingLeft: 16, paddingRight: 52 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            maxWidth: 'var(--chat-content-max-width, 820px)',
            margin: '0 auto',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 0,
              flex: 1,
              lineHeight: 1.4,
              overflow: 'hidden',
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
              Pi Web
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 2,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              web <span style={{ color: 'var(--text)' }}>v{appVersion}</span>
            </span>
            {piVersion !== null && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                pi <span style={{ color: 'var(--text)' }}>v{piVersion}</span>
              </span>
            )}
          </div>
        </div>
      </div>
      {children}
      {shelf}
      <div className="min-h-0 flex-1" />
    </div>
  );
}
