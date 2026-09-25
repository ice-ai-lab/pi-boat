/** 窄屏门禁（docs/06 §9.1）：只保大屏；隐藏由 index.css 的 880px 媒体查询完成（零 JS） */
export function MobileGate() {
  return (
    <div className="mobile-gate h-dvh items-center justify-center p-8 text-center">
      <div>
        <p className="text-base font-medium text-fg">窗口过窄（小于 880px）</p>
        <p className="mt-2 text-sm text-fg-muted">
          请加宽窗口后使用 PiBoat（小屏适配不在一期范围）
        </p>
      </div>
    </div>
  );
}
