import { describe, expect, it } from 'vitest';
import type {
  AgentMessage,
  AssistantMessage,
  SessionEntry,
  SessionInfo,
  SessionTreeNode,
  Usage,
} from '../src/index';

/**
 * 域类型的漂移防线（ADR-0017）。
 *
 * 这些类型现在是 pi-ai / pi-coding-agent 的**再导出与派生**，没有 zod 可 parse——
 * 因此防线从「运行时 parse」变成「编译期赋值」：下面每个样例都是 SDK 形状，
 * 能被 protocol 类型接受才算通过；`@ts-expect-error` 反向证明没放宽。
 * 这是比 schema 更强的约束：SDK 改字段时是编译错误，而不是测试里少一条断言。
 */

const usage: Usage = {
  input: 100,
  output: 50,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 150,
  cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
};

const assistant: AssistantMessage = {
  role: 'assistant',
  content: [
    { type: 'thinking', thinking: 'let me think' },
    { type: 'text', text: 'hello' },
    { type: 'toolCall', id: 'tc_1', name: 'read', arguments: { path: '/tmp/a.ts' } },
  ],
  api: 'anthropic-messages',
  provider: 'anthropic',
  model: 'claude-sonnet-4',
  usage,
  stopReason: 'stop',
  timestamp: 1_700_000_000_000,
};

const base = { id: 'e1', parentId: null, timestamp: '2026-01-01T00:00:00Z' };

describe('domain/message', () => {
  it('accepts all eight agent message roles', () => {
    const samples: AgentMessage[] = [
      { role: 'user', content: 'hi', timestamp: 1 },
      assistant,
      {
        role: 'toolResult',
        toolCallId: 'tc_1',
        toolName: 'read',
        content: [{ type: 'text', text: 'file content' }],
        isError: false,
        timestamp: 1,
      },
      {
        role: 'bashExecution',
        command: 'ls',
        output: 'a\nb',
        exitCode: undefined,
        cancelled: false,
        truncated: false,
        timestamp: 1,
      },
      { role: 'custom', customType: 'todo', content: 'injected', display: true, timestamp: 1 },
      { role: 'branchSummary', summary: 's', fromId: null, timestamp: 1 },
      { role: 'compactionSummary', summary: 's', tokensBefore: 10, timestamp: 1 },
      // 转录 system 消息（SDK ≥ 0.86）：载体可达但不进 UI
      {
        role: 'system',
        content: 'base prompt',
        sections: { tools: 'x', removed: null },
        timestamp: 1,
      },
    ];
    expect(samples.map((m) => m.role)).toHaveLength(8);
  });

  it('rejects unknown roles', () => {
    // @ts-expect-error 未声明的角色不得进入 AgentMessage
    const bad: AgentMessage = { role: 'notice', timestamp: 1 };
    expect(bad).toBeDefined();
  });

  it('derives custom roles by role, not by hand', () => {
    type Roles = AgentMessage['role'];
    const roles: Roles[] = [
      'system',
      'user',
      'assistant',
      'toolResult',
      'bashExecution',
      'custom',
      'branchSummary',
      'compactionSummary',
    ];
    expect(new Set(roles).size).toBe(8);
  });
});

describe('domain/session-entry', () => {
  it('accepts all eleven entry types plus header', () => {
    const entries: SessionEntry[] = [
      { type: 'message', ...base, message: { role: 'user', content: 'hi', timestamp: 1 } },
      { type: 'thinking_level_change', ...base, thinkingLevel: 'high' },
      { type: 'model_change', ...base, provider: 'anthropic', modelId: 'claude' },
      // 用量条目（SDK ≥ 0.86）：不进上下文但计费
      {
        type: 'usage',
        ...base,
        kind: 'cache_warm',
        provider: 'anthropic',
        model: 'claude',
        usage,
        note: 'prompt cache warm',
      },
      {
        type: 'compaction',
        ...base,
        summary: 's',
        firstKeptEntryId: 'e0',
        tokensBefore: 1000,
        systemMessage: { role: 'system', content: 'prompt at boundary', timestamp: 1 },
      },
      { type: 'branch_summary', ...base, fromId: 'e0', summary: 's' },
      { type: 'custom', ...base, customType: 'artifact', data: { v: 1 } },
      { type: 'custom_message', ...base, customType: 'todo', content: 'x', display: true },
      // 上下文编辑条目（SDK ≥ 0.86）：省略或替换既有条目的模型上下文
      { type: 'context_edit', ...base, targetId: 'e0', replacement: null },
      {
        type: 'context_edit',
        ...base,
        targetId: 'e1',
        replacement: { content: [{ type: 'text', text: 'rewritten' }] },
      },
      { type: 'label', ...base, targetId: 'e0', label: 'v1' },
      { type: 'session_info', ...base, name: 'my session' },
    ];
    expect(new Set(entries.map((e) => e.type)).size).toBe(11);
  });

  it('rejects unknown entry types', () => {
    // @ts-expect-error 未声明的条目类型不得进入 SessionEntry
    const bad: SessionEntry = { type: 'mystery', ...base };
    expect(bad).toBeDefined();
  });
});

describe('domain/session-info', () => {
  it('accepts a recursive session tree', () => {
    const leaf = {
      entry: { type: 'session_info', id: 'e2', parentId: 'e1', timestamp: 't2' },
      children: [],
    } satisfies SessionTreeNode;
    const tree: SessionTreeNode = {
      entry: { type: 'session_info', id: 'e1', parentId: null, timestamp: 't1' },
      children: [leaf],
      label: 'root branch',
    };
    expect(tree.children).toHaveLength(1);
  });

  it('keeps wire timestamps as ISO strings over SDK Date', () => {
    const info: SessionInfo = {
      path: '/tmp/s.jsonl',
      id: 's1',
      cwd: '/tmp',
      created: '2026-01-01T00:00:00Z',
      modified: '2026-01-02T00:00:00Z',
      messageCount: 1,
      firstMessage: 'hi',
      revision: '10:1',
    };
    expect(typeof info.created).toBe('string');
    // eslint 风格注：allMessagesText（SDK 供搜索用的全文拼接）刻意不在 wire 上
    // @ts-expect-error wire 上不接受 Date（SDK 形状在协议层被覆盖）
    const bad: SessionInfo = { ...info, created: new Date() };
    expect(bad).toBeDefined();
  });
});
