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

/** 压缩会话：u1 → a1 → u2 → a2 → c1(compaction, firstKept=u2) → u3 → a3 */
function compactedFixtureLines(sessionId: string): string[] {
  const user = (id: string, parentId: string | null, i: number, text: string) => ({
    type: 'message',
    id,
    parentId,
    timestamp: ts(i),
    message: { role: 'user', content: text, timestamp: Date.parse(ts(i)) },
  });
  const assistant = (id: string, parentId: string, i: number, text: string) => ({
    type: 'message',
    id,
    parentId,
    timestamp: ts(i),
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
      api: 'anthropic-messages',
      provider: 'anthropic',
      model: 'claude-test',
      usage,
      stopReason: 'stop',
      timestamp: Date.parse(ts(i)),
    },
  });
  const entries = [
    { type: 'session', version: 3, id: sessionId, timestamp: now, cwd: '/proj' },
    user('u1', null, 0, '修一条船'),
    assistant('a1', 'u1', 1, '好的。'),
    user('u2', 'a1', 2, '继续'),
    assistant('a2', 'u2', 3, '收到。'),
    {
      type: 'compaction',
      id: 'c1',
      parentId: 'a2',
      timestamp: ts(4),
      summary: '之前讨论了修船。',
      firstKeptEntryId: 'u2',
      tokensBefore: 12345,
    },
    user('u3', 'c1', 5, '压缩后的问题'),
    assistant('a3', 'u3', 6, '压缩后的回答。'),
  ];
  return entries.map((entry) => JSON.stringify(entry));
}

/** 长工具流量段：r0(user) → tr1..tr250(toolResult)，验证 raw cap 截断 */
function toolSpamFixtureLines(sessionId: string): string[] {
  const entries: Array<Record<string, unknown>> = [
    { type: 'session', version: 3, id: sessionId, timestamp: now, cwd: '/proj' },
    {
      type: 'message',
      id: 'r0',
      parentId: null,
      timestamp: now,
      message: { role: 'user', content: '跑工具', timestamp: Date.parse(now) },
    },
  ];
  for (let i = 1; i <= 250; i++) {
    entries.push({
      type: 'message',
      id: `tr${i}`,
      parentId: i === 1 ? 'r0' : `tr${i - 1}`,
      timestamp: now,
      message: {
        role: 'toolResult',
        toolCallId: `tc${i}`,
        toolName: 'spam',
        content: [{ type: 'text', text: `输出 ${i}` }],
        isError: false,
        timestamp: Date.parse(now),
      },
    });
  }
  return entries.map((entry) => JSON.stringify(entry));
}

describe('SessionReadService', () => {
  let dir: string;
  let compactedDir: string;
  let toolSpamDir: string;
  const sessionId = 'aaaabbbb-cccc-dddd-eeee-ffff00001111';
  const compactedId = 'aaaa2222-3333-4444-5555-666600000000';
  const toolSpamId = 'aaaa7777-8888-9999-0000-111100000000';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'piboat-test-sessions-'));
    compactedDir = mkdtempSync(join(tmpdir(), 'piboat-test-compacted-'));
    toolSpamDir = mkdtempSync(join(tmpdir(), 'piboat-test-toolspam-'));
    writeFileSync(join(dir, `${sessionId}.jsonl`), `${fixtureLines(sessionId).join('\n')}\n`);
    writeFileSync(
      join(compactedDir, `${compactedId}.jsonl`),
      `${compactedFixtureLines(compactedId).join('\n')}\n`,
    );
    writeFileSync(
      join(toolSpamDir, `${toolSpamId}.jsonl`),
      `${toolSpamFixtureLines(toolSpamId).join('\n')}\n`,
    );
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(compactedDir, { recursive: true, force: true });
    rmSync(toolSpamDir, { recursive: true, force: true });
  });

  const service = (sessionDir = dir) => new SessionReadService({ sessionDir });

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

  it('context 分页：tail 只计可见消息（toolResult 不吃预算）+ hasMore + oldestEntryId', async () => {
    // tail=2 → 2 条可见消息（e4、e2），中间的 toolResult e3 附带返回
    const page = await service().context(sessionId, { tail: 2 });
    if (!page) throw new Error('missing context');
    expect(page.entryIds).toEqual(['e2', 'e3', 'e4']);
    expect(page.hasMore).toBe(true);
    expect(page.oldestEntryId).toBe('e2');

    // before：取 e3 之前（excludeLeaf 语义）
    const older = await service().context(sessionId, { before: 'e3' });
    if (!older) throw new Error('missing older context');
    expect(older.entryIds).toEqual(['e1', 'e2']);
    expect(older.hasMore).toBe(false);

    // 继续向上翻到根：只剩 e1，无更早历史
    const oldest = await service().context(sessionId, { before: 'e2', tail: 2 });
    if (!oldest) throw new Error('missing oldest context');
    expect(oldest.entryIds).toEqual(['e1']);
    expect(oldest.hasMore).toBe(false);
  });

  it('context 分页：压缩会话的历史照常可翻（压缩点不是死路）', async () => {
    // u1 → a1 → u2 → a2 → c1(compaction, firstKept=u2) → u3 → a3
    const page = await service(compactedDir).context(compactedId, {});
    if (!page) throw new Error('missing context');
    expect(page.entryIds).toEqual(['u1', 'a1', 'u2', 'a2', 'c1', 'u3', 'a3']);
    expect(page.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'compactionSummary',
      'user',
      'assistant',
    ]);
    const divider = page.messages[4];
    if (divider?.role !== 'compactionSummary') throw new Error('missing divider');
    expect(divider.summary).toBe('之前讨论了修船。');
    expect(divider.tokensBefore).toBe(12345);
    expect(page.hasMore).toBe(false);

    // 翻过 firstKeptEntryId（旧实现在此只剩一条摘要、hasMore=false 死路）
    const preCompaction = await service(compactedDir).context(compactedId, { before: 'u2' });
    if (!preCompaction) throw new Error('missing pre-compaction context');
    expect(preCompaction.entryIds).toEqual(['u1', 'a1']);
    expect(preCompaction.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(preCompaction.hasMore).toBe(false);

    // before 指向根：空页（旧实现会原样重发最新窗口，客户端死循环）
    const atRoot = await service(compactedDir).context(compactedId, { before: 'u1' });
    if (!atRoot) throw new Error('missing root context');
    expect(atRoot.entryIds).toEqual([]);
    expect(atRoot.hasMore).toBe(false);
    expect(atRoot.oldestEntryId).toBeUndefined();

    // before 指向不存在的条目：同样空页，不回退
    const ghost = await service(compactedDir).context(compactedId, { before: 'nope' });
    if (!ghost) throw new Error('missing ghost context');
    expect(ghost.entryIds).toEqual([]);
  });

  it('context 分页：raw cap 兑底长工具流量段', async () => {
    // r0(user) → tr1..tr250(toolResult)；tail=1 时可见锚点只有 r0，
    // 靠原始条目上限 200 截断，更早历史靠继续翻页
    const page = await service(toolSpamDir).context(toolSpamId, { tail: 1 });
    if (!page) throw new Error('missing context');
    expect(page.entryIds).toHaveLength(200);
    expect(page.entryIds[0]).toBe('tr51');
    expect(page.entryIds[199]).toBe('tr250');
    expect(page.messages.every((m) => m.role === 'toolResult')).toBe(true);
    expect(page.hasMore).toBe(true);

    // 从截断点继续向上：tr50..tr1 + r0，翻到底
    const older = await service(toolSpamDir).context(toolSpamId, { before: 'tr51', tail: 1 });
    if (!older) throw new Error('missing older context');
    expect(older.entryIds).toHaveLength(51);
    expect(older.entryIds[0]).toBe('r0');
    expect(older.entryIds[1]).toBe('tr1');
    expect(older.entryIds[50]).toBe('tr50');
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
