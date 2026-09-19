import { describe, expect, it } from 'vitest';
import {
  agentStatePath,
  entryThinkingPath,
  SESSIONS_PATH,
  SessionDetailResponseSchema,
  SessionListResponseSchema,
  sessionContextPath,
  sessionPath,
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
      sessionListVersion: 3,
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

  it('builds route paths from constants', () => {
    expect(SESSIONS_PATH).toBe('/api/sessions');
    expect(sessionPath('abc/def')).toBe('/api/sessions/abc/def');
    expect(agentStatePath('s1')).toBe('/api/agent/s1');
    expect(sessionContextPath('s1')).toBe('/api/sessions/s1/context');
    expect(entryThinkingPath('s1', 'e9')).toBe('/api/sessions/s1/entries/e9/thinking');
  });
});
