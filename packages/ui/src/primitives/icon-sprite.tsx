/**
 * 图标 sprite（原型 `<svg width="0" height="0"><defs><symbol id="i-*">…`，逐字移植）。
 *
 * 为什么不用 lucide：原型的手绘图标是视觉基准的一部分（docs/06 §2「唯一基准」），
 * 换成第三方图标会改变笔画粗细与轮廓。sprite 在 `apps/web` 挂载一次，
 * `Icon` 用 `<use href="#i-*"/>` 引用。
 *
 * 基准：docs/design/piboat-web-v4.html（「纸墨」）。v4 符号不带 stroke 属性，
 * 线宽/颜色由 `.ico` 类的 CSS 提供（stroke-width:1.5）——与设计稿行为一致。
 */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {/* ============ v4「纸墨」符号集（逐字） ============ */}
        <symbol id="i-plus" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </symbol>
        <symbol id="i-search" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </symbol>
        <symbol id="i-folder" viewBox="0 0 24 24">
          <path d="M4 6a2 2 0 0 1 2-2h3l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        </symbol>
        <symbol id="i-branch" viewBox="0 0 24 24">
          <circle cx="6" cy="5" r="2.2" />
          <circle cx="6" cy="19" r="2.2" />
          <circle cx="18" cy="8" r="2.2" />
          <path d="M6 7.2v9.6M18 10.2c0 4-4 4.8-8.5 4.8" />
        </symbol>
        <symbol id="i-sun" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </symbol>
        <symbol id="i-moon" viewBox="0 0 24 24">
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
        </symbol>
        <symbol id="i-gear" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M5.2 18.8l1.7-1.7M17.1 6.9l1.7-1.7" />
        </symbol>
        <symbol id="i-panel" viewBox="0 0 24 24">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <path d="M15 4.5v15" />
        </symbol>
        <symbol id="i-chev" viewBox="0 0 24 24">
          <path d="m9 5 7 7-7 7" />
        </symbol>
        <symbol id="i-bulb" viewBox="0 0 24 24">
          <path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.7 10.7c.8.7 1.2 1.4 1.2 2.3h5c0-.9.4-1.6 1.2-2.3A6 6 0 0 0 12 3z" />
        </symbol>
        <symbol id="i-clip" viewBox="0 0 24 24">
          <path d="m20 11-8.5 8.5a5.3 5.3 0 0 1-7.5-7.5L12.5 3.5a3.5 3.5 0 0 1 5 5L9 17a1.8 1.8 0 0 1-2.5-2.5L14 7" />
        </symbol>
        <symbol id="i-up" viewBox="0 0 24 24">
          <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
        </symbol>
        <symbol id="i-stop" viewBox="0 0 24 24">
          <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
        </symbol>
        <symbol id="i-wrench" viewBox="0 0 24 24">
          <path d="M14.5 6.5a4.5 4.5 0 0 1 5.6-1.2l-3.2 3.2.9 2.8 2.8.9 3.2-3.2a4.5 4.5 0 0 1-6.3 5.3L7 19.8a2 2 0 0 1-2.8-2.8l10-10z" />
        </symbol>
        <symbol id="i-compact" viewBox="0 0 24 24">
          <path d="M4 7h16M7 12h10M10 17h4" />
        </symbol>
        <symbol id="i-copy" viewBox="0 0 24 24">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <path d="m4.5 12.5 5 5 10-11" />
        </symbol>
        <symbol id="i-x" viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6 6 18" />
        </symbol>
        <symbol id="i-fork" viewBox="0 0 24 24">
          <circle cx="6" cy="5" r="2" />
          <circle cx="6" cy="19" r="2" />
          <circle cx="18" cy="5" r="2" />
          <path d="M6 7v10M18 7c0 6-8 4-10 8" />
        </symbol>
        <symbol id="i-edit" viewBox="0 0 24 24">
          <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" />
          <path d="m13.5 6.5 3 3" />
        </symbol>
        <symbol id="i-file" viewBox="0 0 24 24">
          <path d="M6 2.5h8L19 7.5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4A1.5 1.5 0 0 1 6.5 2.5z" />
          <path d="M14 2.5v5h5" />
        </symbol>
        <symbol id="i-arrowup" viewBox="0 0 24 24">
          <path d="M12 19V6M6 12l6-6 6 6" />
        </symbol>
        <symbol id="i-arrowdn" viewBox="0 0 24 24">
          <path d="M12 5v13M6 12l6 6 6-6" />
        </symbol>
        <symbol id="i-cache" viewBox="0 0 24 24">
          <path d="M20 12a8 8 0 1 1-2.3-5.6M20 3.5V7h-3.5" />
        </symbol>
        <symbol id="i-cost" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5v9M15 9.5c-.8-1-1.8-1.3-3-1.3-1.7 0-2.8.9-2.8 2.1 0 2.9 5.8 1.5 5.8 4.4 0 1.2-1.2 2.1-2.9 2.1-1.3 0-2.4-.5-3.1-1.4" />
        </symbol>
        <symbol id="i-tps" viewBox="0 0 24 24">
          <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" />
        </symbol>
        <symbol id="i-sys" viewBox="0 0 24 24">
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
          <path d="m8 10 2.5 2.5L8 15M12.5 15H16" />
        </symbol>

        {/* ============ 旧符号（v4 之外仍在使用的补充集） ============ */}
        <symbol id="i-boat" viewBox="0 0 24 24">
          <path d="M3 15h18l-2.5 4.2a2 2 0 0 1-1.7 1H7.2a2 2 0 0 1-1.7-1L3 15Z" />
          <path d="M12 15V4l6 8" />
          <path d="M12 8 7 13" />
        </symbol>
        <symbol id="i-chev-r" viewBox="0 0 24 24">
          <path d="m9 5 7 7-7 7" />
        </symbol>
        <symbol id="i-chev-d" viewBox="0 0 24 24">
          <path d="m5 9 7 7 7-7" />
        </symbol>
        <symbol id="i-book" viewBox="0 0 24 24">
          <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
          <path d="M4 19a2 2 0 0 1 2-2h13" />
        </symbol>
        <symbol id="i-gauge" viewBox="0 0 24 24">
          <path d="M5 19a9 9 0 1 1 14 0" />
          <path d="M12 14 16 8" />
          <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
        </symbol>
        <symbol id="i-db" viewBox="0 0 24 24">
          <ellipse cx="12" cy="5.5" rx="8" ry="3" />
          <path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
          <path d="M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </symbol>
        <symbol id="i-coin" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M14.8 9.2c-.6-.8-1.6-1.2-2.8-1.2-1.7 0-3 .9-3 2.2 0 2.8 6 1.4 6 4.2 0 1.3-1.3 2.2-3 2.2-1.2 0-2.2-.4-2.8-1.2M12 6.5V8m0 8v1.5" />
        </symbol>
        <symbol id="i-send" viewBox="0 0 24 24">
          <path d="M12 19V5M6 11l6-6 6 6" />
        </symbol>
        <symbol id="i-img" viewBox="0 0 24 24">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="m5 18 5-5 3 3 3.5-3.5L20 16" />
        </symbol>
        <symbol id="i-refresh" viewBox="0 0 24 24">
          <path d="M20 11a8 8 0 1 0-2.3 6.3" />
          <path d="M20 5v6h-6" />
        </symbol>
        <symbol id="i-term" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="m7 9 3.5 3L7 15M12.5 15H17" />
        </symbol>
        <symbol id="i-pencil" viewBox="0 0 24 24">
          <path d="m14.5 5.5 4 4L8 20H4v-4L14.5 5.5Z" />
          <path d="m12.5 7.5 4 4" />
        </symbol>
        <symbol id="i-trash" viewBox="0 0 24 24">
          <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12" />
        </symbol>
        <symbol id="i-spark" viewBox="0 0 24 24">
          <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M18.4 5.6l-2.5 2.5M8.1 15.9l-2.5 2.5" />
        </symbol>
        <symbol id="i-upload" viewBox="0 0 24 24">
          <path d="M12 16V4M7 9l5-5 5 5" />
          <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </symbol>
        <symbol id="i-list" viewBox="0 0 24 24">
          <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
        </symbol>
        <symbol id="i-clock" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5l3.2 2" />
        </symbol>
      </defs>
    </svg>
  );
}
