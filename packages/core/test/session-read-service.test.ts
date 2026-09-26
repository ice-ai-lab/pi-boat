import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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

/** 转录 system 消息 + 用量条目：验证历史投影与实时路径同口径（system 不进 UI，usage 计入统计） */
function systemUsageFixtureLines(sessionId: string): string[] {
  const entries: Array<Record<string, unknown>> = [
    { type: 'session', version: 3, id: sessionId, timestamp: now, cwd: '/proj' },
    {
      type: 'message',
      id: 's0',
      parentId: null,
      timestamp: ts(0),
      message: {
        role: 'system',
        content: '完整 prompt 与工具声明',
        sections: { tools: '工具声明段' },
        timestamp: Date.parse(ts(0)),
      },
    },
    {
      type: 'message',
      id: 'p1',
      parentId: 's0',
      timestamp: ts(1),
      message: { role: 'user', content: '你好', timestamp: Date.parse(ts(1)) },
    },
    {
      type: 'usage',
      id: 'w1',
      parentId: 'p1',
      timestamp: ts(2),
      kind: 'cache_warm',
      provider: 'anthropic',
      model: 'claude-test',
      usage,
    },
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

  // SDK ≥ 0.86：用量条目（如 prompt 缓存预热）不进模型上下文但计费，
  // 漏掉它会与 SDK `/session` 的口径不一致。
  it('usage 条目计入 token / cost，但不计消息数', () => {
    const entries = [
      {
        type: 'usage',
        id: 'u1',
        parentId: null,
        timestamp: ts(0),
        kind: 'cache_warm',
        provider: 'anthropic',
        model: 'claude-test',
        usage,
      },
    ] as unknown as Parameters<typeof computeStats>[0];
    const stats = computeStats(entries, 's');
    expect(stats.tokens).toEqual({ input: 10, output: 20, cacheRead: 0, cacheWrite: 0, total: 30 });
    expect(stats.cost).toBeCloseTo(0.3);
    expect(stats.totalMessages).toBe(0);
  });

  // 口径漂移防线（ADR-0017）：这份实现手工跟随 SDK 的 getSessionStats，
  // 下面每一条都是曾经漏掉的项——SDK 源码对照见实现处的表格。
  it('与 SDK 口径一致：摘要用量、toolResult 用量、totalMessages 计数', () => {
    const entries = [
      {
        type: 'compaction',
        id: 'c1',
        parentId: null,
        timestamp: ts(0),
        summary: 's',
        firstKeptEntryId: 'e0',
        tokensBefore: 100,
        usage, // 摘要那次 LLM 调用也要计费
      },
      {
        type: 'message',
        id: 'e1',
        parentId: null,
        timestamp: ts(1),
        message: {
          role: 'toolResult',
          toolCallId: 'tc',
          toolName: 'read',
          content: [],
          usage, // 工具侧用量
          isError: false,
          timestamp: 1,
        },
      },
      {
        type: 'message',
        id: 'e2',
        parentId: null,
        timestamp: ts(2),
        message: { role: 'system', content: 'prompt', timestamp: 2 },
      },
      {
        type: 'message',
        id: 'e3',
        parentId: null,
        timestamp: ts(3),
        message: {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'tc', name: 'read', arguments: {} }],
          api: 'a',
          provider: 'p',
          model: 'm',
          usage,
          stopReason: 'toolUse',
          timestamp: 3,
        },
      },
    ] as unknown as Parameters<typeof computeStats>[0];
    const stats = computeStats(entries, 's');
    expect(stats.totalMessages).toBe(3); // 含 system——SDK 的 totalMessages 是一切 message 条目
    expect(stats.toolResults).toBe(1);
    expect(stats.assistantMessages).toBe(1);
    expect(stats.toolCalls).toBe(1);
    // 三份 usage（compaction + toolResult + assistant）都要计入
    expect(stats.tokens).toEqual({ input: 30, output: 60, cacheRead: 0, cacheWrite: 0, total: 90 });
    expect(stats.cost).toBeCloseTo(0.9);
  });
});

describe('SessionReadService（SDK ≥ 0.86 新条目）', () => {
  let dir: string;
  const sessionId = 'aaaabbbb-1111-2222-3333-444455556666';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'piboat-test-sysusage-'));
    writeFileSync(
      join(dir, `${sessionId}.jsonl`),
      `${systemUsageFixtureLines(sessionId).join('\n')}\n`,
    );
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('context：转录 system 消息不进聊天投影（与 wire 实时路径同口径）', async () => {
    const context = await new SessionReadService({ sessionDir: dir }).context(sessionId, {});
    if (!context) throw new Error('missing context');
    expect(context.messages.map((m) => m.role)).toEqual(['user']);
    // 平行数组不得因过滤而错位
    expect(context.entryIds).toHaveLength(context.messages.length);
  });

  it('stats：usage 条目计入 token / cost；totalMessages 按 SDK 口径含 system 消息', async () => {
    const detail = await new SessionReadService({ sessionDir: dir }).detail(sessionId);
    if (!detail) throw new Error('missing detail');
    expect(detail.stats.tokens).toEqual({
      input: 10,
      output: 20,
      cacheRead: 0,
      cacheWrite: 0,
      total: 30,
    });
    // SDK `getSessionStats` 的 totalMessages 数的是**一切 message 条目**（含 system），
    // 本函数逐条对齐它（ADR-0017）——此前这里漏掉 system 与 toolResult/摘要用量，
    // 导致同一会话在冷（本函数）/热（getSessionStats）两条路径上数字不一致。
    expect(detail.stats.totalMessages).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 列表项目归一（enrich）与列表指纹缓存（ADR-0008；项目清单本身的测试见
// project-read-service.test.ts）
// ---------------------------------------------------------------------------

/**
 * 多项目目录夹具：sessionsRoot 下每项目一个子目录（SDK 真实布局）。注入假
 * resolver（避开 git 子进程），验证列表项 enrich 出的 projectKey 可用于过滤。
 */
describe('SessionReadService 列表项目归一（enrich）', () => {
  let root: string;
  const session = (id: string, cwd: string, timestamp: string) =>
    `${JSON.stringify({ type: 'session', version: 3, id, timestamp, cwd })}\n`;

  /** 假解析器：把 cwd 归一到 /repo（模拟 git toplevel 收敛），非 /repo/* 则原样 */
  const fakeResolver = () => {
    const calls: string[] = [];
    return {
      calls,
      resolve: async (cwd: string) => {
        calls.push(cwd);
        const isGit = cwd.startsWith('/repo');
        const projectRoot = isGit ? '/repo' : cwd;
        return {
          projectRoot,
          projectKey: projectRoot,
          isGit,
          ...(isGit ? { branch: 'main' } : {}),
        };
      },
      clear: () => {
        calls.push('<clear>');
      },
    };
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'piboat-projects-'));
    mkdirSync(join(root, '--repo--'), { recursive: true });
    mkdirSync(join(root, '--repo-packages-core--'), { recursive: true });
    mkdirSync(join(root, '--other--'), { recursive: true });
    mkdirSync(join(root, '--empty--'), { recursive: true }); // 空目录：不出现在清单里
    // mtime 显式设定：lastModified 与排序都取自 stat mtime（不解析正文）
    const at = (day: number) => new Date(`2026-01-${day}T10:00:00.000Z`).getTime() / 1000;
    const write = (dir: string, name: string, id: string, cwd: string, day: number) => {
      const path = join(root, dir, name);
      writeFileSync(path, session(id, cwd, `2026-01-${day}T10:00:00.000Z`));
      utimesSync(path, at(day), at(day));
    };
    write('--repo--', '2026-01-15T10-00-00-000Z_aaaa.jsonl', 'aaaa', '/repo', 15);
    write('--repo--', '2026-01-16T10-00-00-000Z_bbbb.jsonl', 'bbbb', '/repo', 16);
    write(
      '--repo-packages-core--',
      '2026-01-10T10-00-00-000Z_cccc.jsonl',
      'cccc',
      '/repo/packages/core',
      10,
    );
    write('--other--', '2026-01-12T10-00-00-000Z_dddd.jsonl', 'dddd', '/other', 12);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const service = (resolver = fakeResolver()) =>
    new SessionReadService({ sessionsRoot: root, sessionDir: root, resolver });

  it('force=1 清空项目解析缓存', async () => {
    const resolver = fakeResolver();
    await service(resolver).list({ force: true });
    expect(resolver.calls).toContain('<clear>');
  });

  it('列表项带 projectKey（与项目清单同键）', async () => {
    const sessions = await service().list();
    const ids = sessions.map((s) => s.id).sort();
    expect(ids).toEqual(['aaaa', 'bbbb', 'cccc', 'dddd']);
    expect(sessions.find((s) => s.id === 'cccc')?.projectKey).toBe('/repo');
  });

  it('projectKey 过滤只返回该项目；未知键返回空数组', async () => {
    expect((await service().list({ projectKey: '/repo' })).map((s) => s.id)).toEqual([
      'bbbb',
      'aaaa',
      'cccc',
    ]);
    expect(await service().list({ projectKey: '/nope' })).toEqual([]);
  });
});

describe('SessionReadService 列表缓存（指纹失效）', () => {
  let root: string;
  const line = (id: string, timestamp: string) =>
    `${JSON.stringify({ type: 'session', version: 3, id, timestamp, cwd: '/repo' })}\n`;
  const resolver = {
    resolve: async (cwd: string) => ({ projectRoot: cwd, projectKey: cwd, isGit: false }),
    clear: () => {},
  };
  const at15 = new Date('2026-01-15T10:00:00.000Z').getTime() / 1000;
  const at16 = new Date('2026-01-16T10:00:00.000Z').getTime() / 1000;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'piboat-cache-'));
    mkdirSync(join(root, '--repo--'), { recursive: true });
    const first = join(root, '--repo--', '2026-01-15T10-00-00-000Z_aaaa.jsonl');
    writeFileSync(first, line('aaaa', '2026-01-15T10:00:00.000Z'));
    utimesSync(first, at15, at15);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const service = () => new SessionReadService({ sessionsRoot: root, sessionDir: root, resolver });

  it('目录内容变化（新会话落盘）后指纹改变，列表不返回陈旧结果', async () => {
    const svc = service();
    const before = await svc.listFingerprint();
    expect(await svc.list()).toHaveLength(1);

    const second = join(root, '--repo--', '2026-01-16T10-00-00-000Z_bbbb.jsonl');
    writeFileSync(second, line('bbbb', '2026-01-16T10:00:00.000Z'));
    utimesSync(second, at16, at16);

    const after = await svc.listFingerprint();
    expect(after).not.toBe(before);
    expect((await svc.list()).map((s) => s.id)).toEqual(['bbbb', 'aaaa']);
  });

  it('指纹不变时复用缓存；force / invalidate 重建', async () => {
    const svc = service();
    const cached = await svc.list();
    expect(await svc.list()).toBe(cached); // 同一数组引用 ⇒ 走缓存
    expect(await svc.list({ force: true })).not.toBe(cached);
    const rebuilt = await svc.list();
    svc.invalidate();
    expect(await svc.list()).not.toBe(rebuilt); // 失效后重建
  });
});

// ---------------------------------------------------------------------------
// B4：详情指纹 / 推理文本 / 正文搜索 / summary 快路径 / transient 合并
// ---------------------------------------------------------------------------

describe('SessionReadService（B4）', () => {
  let dir: string;
  const sessionId = 'bbbb1111-2222-3333-4444-555566667777';
  const ts = (i: number) => `2026-02-15T10:0${i}:00.000Z`;
  const usage = {
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 2,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'piboat-b4-sessions-'));
    const entries = [
      { type: 'session', version: 3, id: sessionId, timestamp: ts(0), cwd: '/proj' },
      {
        type: 'message',
        id: 'u1',
        parentId: null,
        timestamp: ts(0),
        message: { role: 'user', content: '帮我看看 rate limiter', timestamp: Date.parse(ts(0)) },
      },
      {
        type: 'message',
        id: 'a1',
        parentId: 'u1',
        timestamp: ts(1),
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: '先看令牌桶的实现' },
            { type: 'text', text: '这是 expiring-map 的用法' },
          ],
          api: 'anthropic-messages',
          provider: 'anthropic',
          model: 'claude-test',
          usage,
          stopReason: 'stop',
          timestamp: Date.parse(ts(1)),
        },
      },
    ];
    writeFileSync(
      join(dir, `${sessionId}.jsonl`),
      `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`,
    );
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const service = () => new SessionReadService({ sessionDir: dir });

  it('revision：文件指纹（size:mtime）；未知会话 → null', async () => {
    const revision = await service().revision(sessionId);
    expect(revision).toMatch(/^\d+:\d+$/);
    expect(await service().revision('nope')).toBeNull();
  });

  it('detail：info 带 revision（详情视图缓存的失效判据）', async () => {
    const detail = await service().detail(sessionId);
    expect(detail?.info.revision).toMatch(/^\d+:\d+$/);
  });

  it('thinking：按 blockIndex 取全量推理文本；非 assistant / 非 thinking 块 → null', async () => {
    expect(await service().thinking(sessionId, 'a1', 0)).toEqual({ thinking: '先看令牌桶的实现' });
    expect(await service().thinking(sessionId, 'a1', 1)).toBeNull(); // 文本块
    expect(await service().thinking(sessionId, 'u1', 0)).toBeNull(); // 非 assistant
    expect(await service().thinking(sessionId, 'missing', 0)).toBeNull();
  });

  it('search：命中**正文**（不只是名字/首条消息）', async () => {
    const hits = await service().search('expiring-map');
    expect(hits.map((s) => s.id)).toEqual([sessionId]);
    // 首条消息命中仍走轻量路径
    expect((await service().search('rate limiter')).map((s) => s.id)).toEqual([sessionId]);
    expect(await service().search('绝不存在的词')).toEqual([]);
  });

  it('searchDetailed：正文命中带 entryId 与 before/match/after 片段（T2-3）', async () => {
    const detailed = await service().searchDetailed('expiring-map');
    expect(detailed.truncated).toBe(false);
    expect(detailed.results).toHaveLength(1);
    const hit = detailed.results[0];
    expect(hit?.session.id).toBe(sessionId);
    // 正文命中落在具体条目上（轻量字段未命中）
    expect(hit?.entryId).not.toBeNull();
    expect(hit?.match.toLowerCase()).toBe('expiring-map');
    expect(`${hit?.before}${hit?.match}${hit?.after}`).toContain('expiring-map');
  });

  it('searchDetailed：轻量字段命中 → entryId 为 null，片段来自首条消息', async () => {
    const detailed = await service().searchDetailed('rate limiter');
    expect(detailed.results).toHaveLength(1);
    const hit = detailed.results[0];
    expect(hit?.entryId).toBeNull();
    expect(hit?.match.toLowerCase()).toBe('rate limiter');
  });

  it('list：summary=1 跳过项目解析（不回 projectKey，也不污染缓存）', async () => {
    const full = await service().list();
    const fast = await service().list({ summary: true });
    expect(full[0]?.id).toBe(sessionId);
    expect(fast[0]?.id).toBe(sessionId);
    expect(fast[0]?.projectKey).toBeUndefined();
    // 快路径不该把「无分组」的结果写进缓存：随后的全量读仍应带分组
    const again = await service().list();
    expect(again[0]?.projectRoot).toBe(full[0]?.projectRoot);
  });

  it('list：transient 内存会话排在最前，同 id 以内存态为准', async () => {
    const transient = {
      path: '',
      id: 'mem-1',
      cwd: '/proj',
      created: ts(0),
      modified: ts(0),
      messageCount: 0,
      firstMessage: '',
      transient: true,
    };
    const sessions = await service().list({ transient: [transient] });
    expect(sessions.map((s) => s.id)).toEqual(['mem-1', sessionId]);
    // 同 id：内存态胜出（磁盘那条被去重）
    const shadowed = await service().list({ transient: [{ ...transient, id: sessionId }] });
    expect(shadowed).toHaveLength(1);
    expect(shadowed[0]?.transient).toBe(true);
  });
});
