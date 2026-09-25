import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { THINKING_LEVELS, type ThinkingLevel } from '@ice-ai/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigService } from '../src/config/config-service';

/**
 * ConfigService 冒烟测试（ADR-0017 后新增）：它此前零覆盖，而本轮改了两处
 * ——构造参数（目录一律走 SDK 的 getAgentDir）与思考档位来源（改用 pi-ai 的
 * getSupportedThinkingLevels）。本用例钉住"面板拿得到模型与档位"这条主路径。
 *
 * 隔离：`PI_CODING_AGENT_DIR` 指向临时目录，绝不碰用户的 ~/.pi/agent；
 * 全程离线（createAgentSessionServices 读已落盘目录，不联网，ADR-0011③）。
 */
describe('ConfigService（模型面板主路径）', () => {
  let agentDir: string;
  let previous: string | undefined;

  beforeAll(() => {
    agentDir = mkdtempSync(join(tmpdir(), 'piboat-config-'));
    previous = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
  });

  afterAll(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(agentDir, { recursive: true, force: true });
  });

  it('models()：返回模型清单，思考档位取自 SDK（词汇表即 protocol 的 THINKING_LEVELS）', async () => {
    const response = await new ConfigService().models(process.cwd());

    expect(Array.isArray(response.modelList)).toBe(true);
    expect(response.defaultThinkingLevel).toBeDefined();
    expect(THINKING_LEVELS).toContain(response.defaultThinkingLevel as ThinkingLevel);

    const vocabulary = new Set<string>(THINKING_LEVELS);
    for (const [key, levels] of Object.entries(response.thinkingLevels)) {
      expect(levels.length, `${key} 至少要有 off 一档`).toBeGreaterThan(0);
      for (const level of levels) expect(vocabulary.has(level), `${key}: ${level}`).toBe(true);
    }
    // 每个可见模型都必须有档位条目（否则面板上选不了思考级别）
    for (const model of response.modelList) {
      expect(response.thinkingLevels[`${model.provider}:${model.id}`]).toBeDefined();
    }
  });

  it('models-config 原文读写走 SDK 解析出的目录（getAgentDir，不再有构造参数）', () => {
    const service = new ConfigService();
    const { modelsPath, config } = service.readConfig();
    expect(modelsPath).toBe(join(agentDir, 'models.json'));
    // 目录是干净的：SDK 初始化会落一份空壳 `{providers:{}}`，这里只断言没有真实 provider
    expect(config.providers).toEqual({});
    expect(service.writeConfig({ providers: {} }).modelsPath).toBe(modelsPath);
  });
});
