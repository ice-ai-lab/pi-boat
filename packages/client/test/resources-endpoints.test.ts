import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkPluginUpdates,
  checkSkillUpdates,
  getPlugins,
  pluginAction,
  updateSkills,
} from '../src/endpoints/resources';
import { http } from '../src/http';

/**
 * 契约回归（曾出过的 bug）：这三个 POST 端点的 cwd 走 **body**，server 侧对应的
 * Zod 是 `ResourceCheckRequestSchema` / `SkillUpdateRequestSchema`。
 * 之前客户端把 cwd 放 body、server 从 `?cwd` 读 → 检查更新永远 400 Missing cwd；
 * 两边都没发现，因为 server 测试只断言 query 形式，而 client 没有端点测试。
 */
const calls: { url: string; body: Record<string, unknown> | undefined }[] = [];

beforeEach(() => {
  calls.length = 0;
  http.defaults.adapter = async (
    config: InternalAxiosRequestConfig,
  ): Promise<AxiosResponse<{ results: [] }>> => {
    calls.push({
      url: `${config.baseURL ?? ''}${config.url ?? ''}`,
      body:
        typeof config.data === 'string'
          ? (JSON.parse(config.data) as Record<string, unknown>)
          : undefined,
    });
    return {
      data: { results: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
});

describe('资源域端点的 cwd 走 body（不是 ?cwd）', () => {
  it('POST /api/skills/check', async () => {
    await checkSkillUpdates('/repo');
    expect(calls).toEqual([{ url: '/api/skills/check', body: { cwd: '/repo' } }]);
  });

  it('POST /api/skills/update：带 package 与不带都带 cwd', async () => {
    await updateSkills('/repo');
    await updateSkills('/repo', 'npm:pi-x');
    expect(calls.map((call) => call.body)).toEqual([
      { cwd: '/repo' },
      { cwd: '/repo', package: 'npm:pi-x' },
    ]);
  });

  it('POST /api/plugins/check', async () => {
    await checkPluginUpdates('/repo');
    expect(calls).toEqual([{ url: '/api/plugins/check', body: { cwd: '/repo' } }]);
  });

  it('对照：GET/POST /api/plugins 仍按原形状（query / body）', async () => {
    await getPlugins('/repo');
    await pluginAction({ action: 'update', source: 'npm:pi-x', cwd: '/repo' });
    expect(calls).toEqual([
      { url: '/api/plugins?cwd=%2Frepo', body: undefined },
      { url: '/api/plugins', body: { action: 'update', source: 'npm:pi-x', cwd: '/repo' } },
    ]);
  });
});
