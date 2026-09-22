import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { getRunningState, newSession, sendCommand } from '../src/endpoints/agent';
import { ApiClient, ApiError, ResponseSchemaError } from '../src/http';

/**
 * 信封与协议解析回归（ADR-0005/0009）：
 * server 的成功响应是 `{success:true, data}`（命令通道）或直接是资源体（REST 读），
 * 这两条路径必须各按各的 schema 解析——套错会得到
 * “expected null, received object”这类只会在真机上暴露的错误（2026-09-23 抓到过）。
 */

/**
 * 用 axios adapter 伪造响应，不走网络。
 * 自定义 adapter 需自行按状态码 reject（真实 adapter 走 `settle`），否则 4xx/5xx
 * 会被当成成功响应——这会让“错误信封归一”的测试假绿。
 */
function stub(client: ApiClient, body: unknown, status = 200): ApiClient {
  client.http.defaults.adapter = async (config) => {
    const response = {
      data: body,
      status,
      statusText: String(status),
      headers: {},
      config,
    } as AxiosResponse;
    if (status >= 200 && status < 300) return response;
    throw new AxiosError(`Request failed with status ${status}`, undefined, config, null, response);
  };
  return client;
}

describe('命令通道信封', () => {
  it('abort：解出 {success,data:null} → null', async () => {
    const client = stub(new ApiClient(), { success: true, data: null });
    await expect(sendCommand(client, 's1', { type: 'abort' })).resolves.toBeNull();
  });

  it('get_state：解出 data 并过 AgentState schema', async () => {
    const state = {
      sessionId: 's1',
      isStreaming: false,
      isPromptRunning: false,
      isCompacting: false,
      autoCompactionEnabled: true,
      autoRetryEnabled: true,
      model: null,
      messageCount: 0,
      pendingMessageCount: 0,
      queuedMessages: { steering: [], followUp: [] },
      lastSeq: 0,
      contextUsage: null,
      systemPrompt: 'x',
      thinkingLevel: 'medium',
      extensionStatuses: [],
      extensionWidgets: [],
    };
    const client = stub(new ApiClient(), { success: true, data: state });
    await expect(sendCommand(client, 's1', { type: 'get_state' })).resolves.toEqual(state);
  });

  it('信封形状不符（把 data 直接当响应体）→ ResponseSchemaError', async () => {
    const client = stub(new ApiClient(), { sessionId: 's1' });
    await expect(sendCommand(client, 's1', { type: 'get_state' })).rejects.toThrow(
      ResponseSchemaError,
    );
  });
});

describe('REST 资源体', () => {
  it('轻查：{running:false} 与 {running:true,state} 两种形状', async () => {
    const offline = stub(new ApiClient(), { running: false });
    await expect(getRunningState(offline, 's1')).resolves.toEqual({ running: false });
  });

  it('newSession：走 NewSessionOk 扩展信封', async () => {
    const client = stub(new ApiClient(), {
      success: true,
      data: null,
      sessionId: 's1',
      model: { provider: 'anthropic', modelId: 'm' },
      thinkingLevel: 'medium',
    });
    await expect(newSession(client, { cwd: '/tmp' })).resolves.toMatchObject({ sessionId: 's1' });
  });
});

describe('错误信封归一（docs/04 §4.1）', () => {
  it('非 2xx → ApiError，保留 code', async () => {
    const client = stub(
      new ApiClient(),
      { error: 'Prompt rejected', code: 'prompt_rejected', accepted: false },
      400,
    );
    await expect(sendCommand(client, 's1', { type: 'prompt', message: 'x' })).rejects.toThrow(
      ApiError,
    );
    await sendCommand(client, 's1', { type: 'prompt', message: 'x' }).catch((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe('prompt_rejected');
      expect((error as ApiError).status).toBe(400);
    });
  });

  it('新增：非法 JSON 信封也归一为 ApiError（不抛 zod 原始错误）', async () => {
    const client = stub(new ApiClient(), { message: 'boom' }, 500);
    await expect(getRunningState(client, 's1')).rejects.toThrow(ApiError);
  });
});
