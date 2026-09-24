import { describe, expect, it } from 'vitest';
import * as protocol from '../src/index';
import {
  ProjectsQuerySchema,
  ProjectsResponseSchema,
  SessionDetailResponseSchema,
  SessionListQuerySchema,
  SessionListResponseSchema,
} from '../src/index';

const sessionInfo = {
  path: '/home/u/.pi/sessions/s1.jsonl',
  id: 's1',
  cwd: '/tmp',
  created: '2026-01-01T00:00:00Z',
  modified: '2026-01-02T00:00:00Z',
  messageCount: 4,
  firstMessage: 'hello',
};

describe('rest/sessions', () => {
  it('parses the session list envelope', () => {
    const body = {
      sessions: [sessionInfo],
      registryVersion: 3,
      listFingerprint: 'a1b2c3d4e5f60718',
      runningSessionIds: ['s1'],
      completionNotificationSuppressedSessionIds: [],
    };
    expect(SessionListResponseSchema.parse(body)).toEqual(body);
  });

  it('parses a session detail snapshot', () => {
    const body = {
      sessionId: 's1',
      filePath: '/home/u/.pi/sessions/s1.jsonl',
      info: sessionInfo,
      leafId: 'e9',
      tree: [
        {
          entry: { type: 'session_info', id: 'e1', parentId: null, timestamp: 't' },
          children: [],
        },
      ],
      context: {
        messages: [{ role: 'user', content: 'hi', timestamp: 1 }],
        entryIds: ['e1'],
        thinkingLevel: 'medium',
        model: { provider: 'anthropic', modelId: 'claude' },
        hasMore: false,
      },
      stats: {
        sessionId: 's1',
        userMessages: 1,
        assistantMessages: 1,
        toolCalls: 0,
        toolResults: 0,
        totalMessages: 2,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        cost: 0,
      },
      totalActiveMs: 1200,
    };
    expect(SessionDetailResponseSchema.parse(body)).toEqual(body);
  });
});

describe('rest/projects（ADR-0008）', () => {
  it('parses a projects response（含 cwds 合并信息）', () => {
    const body = {
      listFingerprint: 'a1b2c3d4e5f60718',
      projects: [
        {
          projectKey: '/repo',
          projectRoot: '/repo',
          cwd: '/repo',
          cwds: ['/repo', '/repo/packages/core'],
          sessionCount: 3,
          lastModified: '2026-01-16T10:00:00.000Z',
          isGit: true,
          branch: 'main',
        },
        {
          projectKey: '/plain',
          projectRoot: '/plain',
          cwd: '/plain',
          cwds: ['/plain'],
          sessionCount: 1,
          lastModified: '2026-01-12T10:00:00.000Z',
          isGit: false,
        },
      ],
    };
    expect(ProjectsResponseSchema.parse(body)).toEqual(body);
  });

  it('list 查询参数只接受 force=1（严格），其余值报错', () => {
    expect(SessionListQuerySchema.parse({ force: '1', projectKey: '/repo' })).toEqual({
      force: '1',
      projectKey: '/repo',
    });
    expect(SessionListQuerySchema.safeParse({ force: 'true' }).success).toBe(false);
    expect(ProjectsQuerySchema.safeParse({ force: '0' }).success).toBe(false);
  });
});

describe('协议包不导出路由路径常量（docs/02 §3「不养期货」）', () => {
  it('没有任何 *_PATH / *Path 形式的导出', () => {
    // 常量的唯一价值是"两端共用一份"。在 client SDK 真正消费它之前，
    // 那些 export 只是无消费方的期货——本仓的规矩是出现消费方时再加。
    // 这条断言就是防它悄悄长回来的闸门：真要用时会有意改这里，并同时接上调用方。
    const offenders = Object.keys(protocol).filter(
      (name) => name.endsWith('_PATH') || (name.endsWith('Path') && name !== 'sessionPath'),
    );
    expect(offenders).toEqual([]);
  });

  it('域文件只导出 schema / 类型 / 枚举之类的契约，不导出地址', () => {
    // 抽查几个历史上有过路径常量的域：现在应当一个都找不到
    expect('SESSIONS_PATH' in protocol).toBe(false);
    expect('AGENT_NEW_PATH' in protocol).toBe(false);
    expect('MODELS_CONFIG_PATH' in protocol).toBe(false);
    expect('WORKTREES_PATH' in protocol).toBe(false);
  });
});
