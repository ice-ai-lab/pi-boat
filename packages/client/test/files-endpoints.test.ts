import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import { fileByteUrl, readFileText } from '../src/endpoints/files';
import { http } from '../src/http';

/**
 * 契约回归（曾出过的 bug）：`fileByteUrl` 给 DOM（`<img>`/`<a download>`）用的是
 * **含 `/api` 的完整同源 URL**，而 Axios 实例的 baseURL 已经是 `/api`。`readFileText`
 * 早前直接把它交给 Axios，拼成 `/api/api/files/...`——服务端没有该路由，SPA 兜底返回
 * index.html，于是右栏查看器对任何文本文件都显示 index.html（且不报错）。
 * 这里锁住两条 URL 口径：DOM 用带 `/api` 的，Axios 用不带 `/api` 的。
 */
const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  http.defaults.adapter = async (
    config: InternalAxiosRequestConfig,
  ): Promise<AxiosResponse<string>> => {
    calls.push(`${config.baseURL ?? ''}${config.url ?? ''}`);
    return { data: 'file body', status: 200, statusText: 'OK', headers: {}, config };
  };
});

describe('文件域读取端点', () => {
  it('fileByteUrl 输出 DOM 可直消费的完整同源 URL（含一次 /api）', () => {
    expect(fileByteUrl('/repo/a b.ts')).toBe('/api/files/%2Frepo/a%20b.ts?type=read');
    expect(fileByteUrl('/repo/a.ts', 'download', 's1')).toBe(
      '/api/files/%2Frepo/a.ts?type=download&sessionId=s1',
    );
  });

  it('readFileText 经 Axios 时不得重复 /api（回归：查看器恒显 index.html）', async () => {
    const text = await readFileText('/repo/a.ts');
    expect(text).toBe('file body');
    expect(calls).toEqual(['/api/files/%2Frepo/a.ts?type=read']);
  });

  it('readFileText 透传 sessionId', async () => {
    await readFileText('/repo/a.ts', 's1');
    expect(calls).toEqual(['/api/files/%2Frepo/a.ts?type=read&sessionId=s1']);
  });
});
