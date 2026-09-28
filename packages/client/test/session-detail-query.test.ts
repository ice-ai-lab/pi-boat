import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `getSessionDetail` 的查询串——两个开关都是**行为**（不只是参数）：
 * - `force=1`：服务端做外部写入探测并按需从磁盘重建 runtime（ADR-0013）。漏了它，
 *   同一会话文件被别的进程写时，本进程内存里的条目/统计会停在 resume 一刻（2026-09-28 实测）。
 * - `deferMedia=1`：历史图片只发坐标（ADR-0024）。
 * 组合后的拼接顺序/问号边界容易在重构里被写坏，故锁在这里。
 */
const { getJson } = vi.hoisted(() => ({ getJson: vi.fn(async () => ({})) }));
vi.mock('../src/http', () => ({ getJson, http: {} }));

const { getSessionDetail } = await import('../src/endpoints/sessions');

describe('getSessionDetail', () => {
  beforeEach(() => {
    getJson.mockClear();
  });

  it('两个开关同时开：force 在前、deferMedia 在后', async () => {
    await getSessionDetail('s1', { deferMedia: true, force: true });
    expect(getJson).toHaveBeenCalledWith('/sessions/s1?force=1&deferMedia=1');
  });

  it('只开 force', async () => {
    await getSessionDetail('s1', { force: true });
    expect(getJson).toHaveBeenCalledWith('/sessions/s1?force=1');
  });

  it('只开 deferMedia', async () => {
    await getSessionDetail('s1', { deferMedia: true });
    expect(getJson).toHaveBeenCalledWith('/sessions/s1?deferMedia=1');
  });

  it('都不开：不挂空问号', async () => {
    await getSessionDetail('s1');
    expect(getJson).toHaveBeenCalledWith('/sessions/s1');
  });

  it('显式 false 等同不传（避免 `?force=0` 这种服务端只认 1 的写法）', async () => {
    await getSessionDetail('s1', { force: false, deferMedia: false });
    expect(getJson).toHaveBeenCalledWith('/sessions/s1');
  });

  it('会话 id 转义', async () => {
    await getSessionDetail('a/b', { force: true });
    expect(getJson).toHaveBeenCalledWith('/sessions/a%2Fb?force=1');
  });
});
