import { describe, expect, it } from 'vitest';
import {
  AgentMessageSchema,
  type AssistantMessage,
  AssistantMessageSchema,
  normalizeToolCalls,
  type SessionEntry,
  SessionEntrySchema,
  SessionTreeNodeSchema,
  type Usage,
  UsageSchema,
} from '../src/index';

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
    { type: 'thinking', thinking: 'let me think', deferred: true },
    { type: 'text', text: 'hello' },
    {
      type: 'toolCall',
      id: 'tc_1',
      name: 'read',
      arguments: { path: '/tmp/a.ts' },
      rawInput: '{"path"',
    },
  ],
  api: 'anthropic-messages',
  provider: 'anthropic',
  model: 'claude-sonnet-4',
  usage,
  stopReason: 'stop',
  timestamp: 1_700_000_000_000,
};

describe('domain/message', () => {
  it('parses all five agent message roles', () => {
    const samples = [
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
        cancelled: false,
        truncated: false,
        timestamp: 1,
      },
      { role: 'custom', customType: 'todo', content: 'injected', display: true, timestamp: 1 },
    ];
    for (const message of samples) {
      expect(AgentMessageSchema.parse(message)).toEqual(message);
    }
  });

  it('rejects unknown roles', () => {
    expect(() => AgentMessageSchema.parse({ role: 'notice', timestamp: 1 })).toThrow();
  });

  it('parses usage with cost breakdown', () => {
    expect(UsageSchema.parse(usage)).toEqual(usage);
  });

  it('keeps rawInput as wire-only tool call buffer', () => {
    const parsed = AssistantMessageSchema.parse(assistant);
    expect(parsed.content[2]).toMatchObject({ rawInput: '{"path"' });
  });
});

describe('domain/session-entry', () => {
  it('parses all nine entry types plus header', () => {
    const base = { id: 'e1', parentId: null, timestamp: '2026-01-01T00:00:00Z' };
    const entries: SessionEntry[] = [
      { type: 'message', ...base, message: { role: 'user', content: 'hi', timestamp: 1 } },
      { type: 'thinking_level_change', ...base, thinkingLevel: 'high' },
      { type: 'model_change', ...base, provider: 'anthropic', modelId: 'claude' },
      {
        type: 'compaction',
        ...base,
        summary: 's',
        firstKeptEntryId: 'e0',
        tokensBefore: 1000,
      },
      { type: 'branch_summary', ...base, fromId: 'e0', summary: 's' },
      { type: 'custom', ...base, customType: 'artifact', data: { v: 1 } },
      { type: 'custom_message', ...base, customType: 'todo', content: 'x', display: true },
      { type: 'label', ...base, targetId: 'e0', label: 'v1' },
      { type: 'session_info', ...base, name: 'my session' },
    ];
    for (const entry of entries) {
      expect(SessionEntrySchema.parse(entry)).toEqual(entry);
    }
  });

  it('rejects unknown entry types', () => {
    expect(() =>
      SessionEntrySchema.parse({ type: 'mystery', id: 'e1', parentId: null, timestamp: 't' }),
    ).toThrow();
  });
});

describe('domain/session-info', () => {
  it('parses a recursive session tree', () => {
    const leaf = {
      entry: { type: 'session_info', id: 'e2', parentId: 'e1', timestamp: 't2' },
      children: [],
    };
    const tree = {
      entry: { type: 'session_info', id: 'e1', parentId: null, timestamp: 't1' },
      children: [leaf],
      label: 'root branch',
      compressedEntryIds: ['e0'],
    };
    expect(SessionTreeNodeSchema.parse(tree)).toEqual(tree);
  });
});

describe('domain/normalize', () => {
  it('normalizes file-shaped tool calls', () => {
    expect(normalizeToolCalls([{ id: 'a', name: 'read', arguments: { path: '/x' } }])).toEqual([
      { id: 'a', name: 'read', arguments: { path: '/x' } },
    ]);
  });

  it('normalizes sdk streaming-shaped tool calls', () => {
    expect(
      normalizeToolCalls([{ toolCallId: 'b', toolName: 'bash', input: { command: 'ls' } }]),
    ).toEqual([{ id: 'b', name: 'bash', arguments: { command: 'ls' } }]);
  });

  it('falls back to empty arguments and drops malformed items', () => {
    expect(
      normalizeToolCalls([
        { id: 'c', toolName: 'grep' },
        { name: 'no-id' },
        { id: 'd', name: 'edit', arguments: 'not-an-object' },
      ]),
    ).toEqual([
      { id: 'c', name: 'grep', arguments: {} },
      { id: 'd', name: 'edit', arguments: {} },
    ]);
  });
});
