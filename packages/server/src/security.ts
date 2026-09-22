import { PORTS } from '@ice-ai/protocol';
import type { MiddlewareHandler } from 'hono';

/**
 * 本机访问防护（docs/01 §5.6 / docs/04 §6；鉴权模型见 ADR-0007）。
 *
 * 威胁模型：server 绑定 127.0.0.1 但握有宿主机文件系统全部权限——用户浏览器里的
 * 恶意网页可以直接向 http://127.0.0.1:<port> 发请求（CSRF / DNS 重绑定）。
 * 三道闸全部常开、不可关：
 * ① Host 校验（防 DNS 重绑定）：只认回环主机名
 * ② Origin 校验（防 CSRF）：白名单 = 同源 + dev web（9528）
 * ③ Sec-Fetch-Site：cross-site 一律拒——覆盖"无 Origin 的跨站子资源请求"
 *    （<img>/<script>/表单导航）。`Sec-` 前缀是 forbidden header name，页面 JS 无法伪造
 *
 * **代价：GET 不得有副作用**（ADR-0007）——无 Origin 的跨站 GET 没有凭据兜底，
 * 一个带副作用的 GET 会被直接利用。新增路由须过 docs/04 §6 检查清单。
 *
 * 2026-09-22（ADR-0007）删除了原第三道闸"Bearer token + SSE 一次性票据"：token 相对
 * ①② 只多挡一格（见上），而票据层只为 EventSource 无法带 header 而存在，且 dev 期
 * 跨源页面无从取得随机 token。非回环绑定（LAN）另议，届时引入用户可输入的口令。
 */

/**
 * dev web 白名单（vite dev 9528；localhost/127.0.0.1 变体一并放行，docs/01 §5.2.2）。
 * CORS 头（server.ts）与本文件的 Origin 校验共用这一份——两者语义相同（谁可以调本 API），
 * 分开放会漂移：只加一处 = 要么安全闸漏口，要么 dev 前端被 CORS 误拦。
 */
export const DEV_WEB_ORIGINS: string[] = [
  `http://localhost:${PORTS.web}`,
  `http://127.0.0.1:${PORTS.web}`,
];

/** 集合形态（Origin 校验每次请求 O(1) 查） */
const DEV_WEB_ORIGIN_SET = new Set(DEV_WEB_ORIGINS);

/** 回环 Host：localhost / 127.0.0.1 / [::1]，可带端口 */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export function securityMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    // ① Host 校验（防 DNS 重绑定）
    const host = c.req.header('host') ?? '';
    if (!LOOPBACK_HOST.test(host)) {
      return c.json({ error: 'Forbidden host' }, 403);
    }

    // ② Origin 校验（带 Origin 才校验：curl / 同源 GET 导航无 Origin）
    const origin = c.req.header('origin');
    if (origin !== undefined && !allowedOrigins(host).has(origin)) {
      return c.json({ error: 'Forbidden origin' }, 403);
    }

    // ③ 跨站请求一律拒（同一主机名的 dev 跨源属 same-site，放行）
    if (c.req.header('sec-fetch-site') === 'cross-site') {
      return c.json({ error: 'Forbidden cross-site request' }, 403);
    }

    return next();
  };
}

/** 同源（http://<Host>）∪ dev web 白名单 */
function allowedOrigins(host: string): Set<string> {
  return new Set([`http://${host}`, ...DEV_WEB_ORIGIN_SET]);
}
