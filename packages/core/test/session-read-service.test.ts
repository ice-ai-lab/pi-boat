import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeStats, SessionReadService } from '../src/read/session-read-service';

/**
 * SessionReadService 测试：临时目录写真实 .jsonl（SDK SessionManager 解析），
 * 验证列表/详情/分页/改名/统计。不触碰 ~/.pi 真实会话目录。
 */

const usage = {
  input: 10,
  output: 20,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 30,
  cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
};

const now = '2026-01-15T10:00:00.000Z';
const ts = (i: number) => `2026-01-15T10:0${i}:00.000Z`;

/** 4 条消息条目：user → assistant(toolCall) → toolResult → assistant */
function fixtureLines(sessionId: string): string[] {
  const entries = [
    { type: 'session', version: 3, id: sessionId, timestamp: now, cwd: '/proj' },
    {
      type: 'message',
      id: 'e1',
      parentId: null,
      timestamp: ts(0),
      message: { role: 'user', content: '请读取 README', timestamp: Date.parse(ts(0)) },
    },
    {
      type: 'message',
      id: 'e2',
      parentId: 'e1',
      timestamp: ts(1),
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '思考中…' },
          { type: 'toolCall', id: 'tc1', name: 'read', arguments: { path: 'README.md' } },
        ],
        api: 'anthropic-messages',
        provider: 'anthropic',
        model: 'claude-test',
        usage,
        stopReason: 'toolUse',
        timestamp: Date.parse(ts(1)),
      },
    },
    {
      type: 'message',
      id: 'e3',
      parentId: 'e2',
      timestamp: ts(2),
      message: {
        role: 'toolResult',
        toolCallId: 'tc1',
        toolName: 'read',
        content: [{ type: 'text', text: '# hello' }],
        isError: false,
        timestamp: Date.parse(ts(2)),
      },
    },
    {
      type: 'message',
      id: 'e4',
      parentId: 'e3',
      timestamp: ts(3),
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '这个项目是 hello。' }],
        api: 'anthropic-messages',
        provider: 'anthropic',
        model: 'claude-test',
        usage,
        stopReason: 'stop',
        timestamp: Date.parse(ts(3)),
      },
    },
  ];
  return entries.map((entry) => JSON.stringify(entry));
}

describe('SessionReadService', () => {
  let dir: string;
  const sessionId = 'aaaabbbb-cccc-dddd-eeee-ffff00001111';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'piboat-test-sessions-'));
    writeFileSync(join(dir, `${sessionId}.jsonl`), `${fixtureLines(sessionId).join('\n')}\n`);
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const service = () => new SessionReadService({ sessionDir: dir });

  it('list：磁盘扫描 + ISO 时间戳映射', async () => {
    const sessions = await service().list();
    expect(sessions).toHaveLength(1);
    const info = sessions[0];
    if (!info) throw new Error('missing session info');
    expect(info.id).toBe(sessionId);
    expect(info.cwd).toBe('/proj');
    expect(info.created).toBe(now);
    expect(info.messageCount).toBe(4);
    expect(info.firstMessage).toBe('请读取 README');
    expect(() => new Date(info.modified)).not.toThrow();
  });

  it('search：按首条消息/名字过滤', async () => {
    expect(await service().search('README')).toHaveLength(1);
    expect(await service().search('不存在的关键词')).toHaveLength(0);
  });

  it('detail：tree/context/stats/leafId 装配', async () => {
    const detail = await service().detail(sessionId);
    if (!detail) throw new Error('missing detail');
    expect(detail.sessionId).toBe(sessionId);
    expect(detail.filePath).toContain(sessionId);
    expect(detail.leafId).toBe('e4');
    expect(detail.tree).toHaveLength(1); // 根 e1
    expect(detail.tree[0]?.children[0]?.entry.id).toBe('e2');

    expect(detail.context.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'toolResult',
      'assistant',
    ]);
    expect(detail.context.entryIds).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(detail.context.model).toEqual({ provider: 'anthropic', modelId: 'claude-test' });
    expect(detail.context.hasMore).toBe(false);

    expect(detail.stats).toMatchObject({
      userMessages: 1,
      assistantMessages: 2,
      toolCalls: 1,
      toolResults: 1,
      totalMessages: 4,
      tokens: { input: 20, output: 40, total: 60 },
      cost: 0.6,
    });
  });

  it('context 分页：tail 截窗 + hasMore + oldestEntryId', async () => {
    const page = await service().context(sessionId, { tail: 2 });
    if (!page) throw new Error('missing context');
    expect(page.entryIds).toEqual(['e3', 'e4']);
    expect(page.hasMore).toBe(true);
    expect(page.oldestEntryId).toBe('e3');

    // before：取 e3 之前（excludeLeaf 语义）
    const older = await service().context(sessionId, { before: 'e3' });
    if (!older) throw new Error('missing older context');
    expect(older.entryIds).toEqual(['e1', 'e2']);
    expect(older.hasMore).toBe(false);
  });

  it('context：assistant 消息携带 thinking 全文', async () => {
    const page = await service().context(sessionId, {});
    if (!page) throw new Error('missing context');
    const assistant = page.messages.find((m) => m.role === 'assistant');
    const thinking = assistant?.content.find((b) => b.type === 'thinking');
    expect(thinking?.type).toBe('thinking');
  });

  it('rename：追加 session_info 行并体现在列表', async () => {
    const svc = service();
    const info = await svc.rename(sessionId, '我的调试会话');
    if (!info) throw new Error('missing renamed info');
    expect(info?.name).toBe('我的调试会话');
    const sessions = await svc.list();
    expect(sessions[0]?.name).toBe('我的调试会话');
  });

  it('未知 id：detail/context 返回 null', async () => {
    expect(await service().detail('nope')).toBeNull();
    expect(await service().context('nope', {})).toBeNull();
  });
});

describe('computeStats（纯函数）', () => {
  it('空条目返回全零', () => {
    const stats = computeStats([], 's');
    expect(stats).toMatchObject({ userMessages: 0, toolCalls: 0, cost: 0, tokens: { total: 0 } });
  });
});
