/**
 * URL 级安全判定（纯函数，vitest 直测；electron 侧只消费结果）。
 */

/** 导航目标与当前页面同源（窗口内导航放行；外部链接交系统浏览器） */
export function isSameOrigin(rawUrl: string, origin: string): boolean {
  try {
    return new URL(rawUrl).origin === origin;
  } catch {
    return false;
  }
}

/**
 * IPC sender 校验（ADR-0035：IPC handler 校验 sender frame URL）。
 * 放行两类：① 应用页面（app origin 列表内）；② 打包内静态恢复页 recovery.html
 * （file: 协议、文件名收口，避免任意 file: 页面都能调窄桥）。
 */
export function isAllowedSender(rawUrl: string, appOrigins: readonly string[]): boolean {
  try {
    const url = new URL(rawUrl);
    if (appOrigins.includes(url.origin)) return true;
    return url.protocol === 'file:' && url.pathname.endsWith('/recovery.html');
  } catch {
    return false;
  }
}
