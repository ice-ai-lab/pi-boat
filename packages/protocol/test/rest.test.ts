import { describe, expect, it } from 'vitest';
import * as protocol from '../src/index';
import {
  ProjectsQuerySchema,
  type ProjectsResponse,
  type SessionDetailResponse,
  SessionListQuerySchema,
  type SessionListResponse,
} from '../src/index';

/**
 * REST 契约测试（ADR-0017 后形态）：
 * - **入参**仍是 zod：这里 parse 正/反例（server 用同一份 schema 校验，失败 → 400）
 * - **出参**只是类型：样例用 `const body: X = {…}` 做**编译期**断言——
 *   比 schema parse 更强（SDK 加字段/改字段直接编译失败，而不是少一条断言）
 */

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
  it('会话列表信封的形状（含 registryVersion 与 listFingerprint 的语义区别）', () => {
    const body: SessionListResponse = {
      sessions: [sessionInfo],
      registryVersion: 3,
      listFingerprint: 'a1b2c3d4e5f60718',
      runningSessionIds: ['s1'],
      completionNotificationSuppressedSessionIds: [],
    };
    expect(body.sessions).toHaveLength(1);
    expect(body.registryVersion).toBe(3);
  });

  it('会话详情快照的形状（tree / context / stats / wrapperRebuilt）', () => {
    const body: SessionDetailResponse = {
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
        sessionFile: undefined,
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
    expect(body.tree[0]?.entry.type).toBe('session_info');
    // wrapperRebuilt 只在 force=1 触发重建时出现（ADR-0013b）
    expect(body.wrapperRebuilt).toBeUndefined();
  });
});

describe('rest/projects（ADR-0008）', () => {
  it('项目清单的形状（同一仓库的多个 cwd 合并为一项）', () => {
    const body: ProjectsResponse = {
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
    expect(body.projects).toHaveLength(2);
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
