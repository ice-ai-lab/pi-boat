import type { AgentMessage } from '@ice-ai/protocol';
import { describe, expect, it } from 'vitest';
import { messageImageSrcs } from '../src/stream/image-src';
import { rebuildTurns } from '../src/stream/rebuild';

/**
 * 图片 src 映射（ADR-0024）：内联字节 → `data:` URL；`deferMedia` 占位（空 data）→
 * 惰性端点 URL。坐标是「条目 id + **消息内块下标**」，与服务端 `entryImage()` 的
 * 取数参数一致（块在原位、只擦 data）。
 */

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const inlineImage = { type: 'image', data: PNG, mimeType: 'image/png' } as const;
const deferredImage = { type: 'image', data: '', mimeType: 'image/png' } as const;
const textBlock = { type: 'text', text: '看这张图' } as const;

describe('messageImageSrcs', () => {
  it('内联字节（实时路径）→ data URL，不需要坐标', () => {
    expect(messageImageSrcs([textBlock, inlineImage])).toEqual([`data:image/png;base64,${PNG}`]);
  });

  it('占位块 → 惰性端点 URL，块下标取**消息内下标**（不是第几张图）', () => {
    expect(
      messageImageSrcs([textBlock, deferredImage], { sessionId: 's1', entryId: 'e9' }),
    ).toEqual(['/api/sessions/s1/entries/e9/image?blockIndex=1']);
  });

  it('占位块拿不到坐标 → 跳过（宁可不显示，也不发一个坏 URL）', () => {
    expect(messageImageSrcs([deferredImage])).toBeUndefined();
    expect(messageImageSrcs([deferredImage], { sessionId: 's1' })).toBeUndefined();
    expect(messageImageSrcs([deferredImage], { entryId: 'e9' })).toBeUndefined();
  });

  it('没有图片（或无块数组）→ undefined', () => {
    expect(messageImageSrcs([textBlock])).toBeUndefined();
    expect(messageImageSrcs('纯字符串内容')).toBeUndefined();
    expect(messageImageSrcs(null)).toBeUndefined();
  });
});

describe('rebuild：历史图片按会话坐标映射', () => {
  const userMessage = {
    role: 'user',
    content: [textBlock, deferredImage],
    timestamp: 1,
  } as unknown as AgentMessage;
  const assistantMessage = {
    role: 'assistant',
    content: [{ type: 'toolCall', id: 'tc1', name: 'screenshot', arguments: {} }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'claude-test',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: {} },
    stopReason: 'toolUse',
    timestamp: 2,
  } as unknown as AgentMessage;
  const toolResultMessage = {
    role: 'toolResult',
    toolCallId: 'tc1',
    toolName: 'screenshot',
    content: [textBlock, deferredImage],
    isError: false,
    timestamp: 3,
  } as unknown as AgentMessage;

  it('用户附件与工具结果图都带 sessionId + 各自条目的 entryId', () => {
    const turns = rebuildTurns(
      [userMessage, assistantMessage, toolResultMessage],
      ['e1', 'e2', 'e3'],
      'sess-1',
    );
    expect(turns[0]?.user.images).toEqual(['/api/sessions/sess-1/entries/e1/image?blockIndex=1']);
    const tool = turns[0]?.trail.find((item) => item.kind === 'tool');
    expect(tool?.images).toEqual(['/api/sessions/sess-1/entries/e3/image?blockIndex=1']);
  });

  it('不传 sessionId（测试/无会话上下文）→ 占位块被跳过，不产坏 URL', () => {
    const turns = rebuildTurns([userMessage], ['e1']);
    expect(turns[0]?.user.images).toBeUndefined();
    expect(turns[0]?.user.text).toBe('看这张图');
  });
});
