import { describe, expect, it } from 'vitest';
import { sessionExportUrl } from '../src/endpoints/sessions';

/**
 * 直接进浏览器地址栏的 URL（不进 axios 的 baseURL）：前缀与 disposition 都只能在这里锁。
 * 2026-09-27 实测事故：漏了 `inline=1`，顶栏「完整历史」点下去变成下载 `session (1).html`。
 */
describe('sessionExportUrl', () => {
  it('恒带 inline=1（否则服务端回 attachment，新标签页变成一次下载）', () => {
    expect(sessionExportUrl('s1')).toBe('/api/sessions/s1/export?inline=1');
  });

  it('会话 id 转义（id 里可能有 `/` 等路径字符）', () => {
    expect(sessionExportUrl('a/b')).toBe('/api/sessions/a%2Fb/export?inline=1');
  });
});
