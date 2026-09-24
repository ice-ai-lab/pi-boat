import { describe, expect, it } from 'vitest';
import { AgentCommandSchema, CommandResultSchemas, NewSessionRequestSchema } from '../src/index';

describe('commands/agent-command', () => {
  it('parses all M1 command variants', () => {
    const commands = [
      { type: 'prompt', message: 'hello' },
      { type: 'prompt', message: 'hi', streamingBehavior: 'steer' },
      { type: 'steer', message: 'redirect' },
      { type: 'follow_up', message: 'next' },
      { type: 'abort' },
      { type: 'clear_queue' },
      { type: 'get_state' },
      { type: 'get_session_stats' },
      { type: 'get_last_assistant_text' },
      { type: 'get_commands' },
      { type: 'get_tools' },
      { type: 'set_tools', toolNames: ['read', 'bash'] },
    ];
    for (const command of commands) {
      expect(AgentCommandSchema.parse(command)).toEqual(command);
    }
  });

  it('rejects empty prompt messages', () => {
    expect(() => AgentCommandSchema.parse({ type: 'prompt', message: '' })).toThrow();
  });

  it('accepts the branch / compaction / model commands (B2)', () => {
    expect(AgentCommandSchema.parse({ type: 'fork', entryId: 'e1' })).toMatchObject({
      type: 'fork',
    });
    expect(AgentCommandSchema.parse({ type: 'compact' })).toMatchObject({ type: 'compact' });
    expect(AgentCommandSchema.parse({ type: 'fork_branch', entryId: 'e1' }).type).toBe(
      'fork_branch',
    );
    expect(AgentCommandSchema.parse({ type: 'clone' }).type).toBe('clone');
    expect(AgentCommandSchema.parse({ type: 'navigate_tree', targetId: 'e1' }).type).toBe(
      'navigate_tree',
    );
    expect(
      AgentCommandSchema.parse({ type: 'set_model', provider: 'p', modelId: 'm' }),
    ).toMatchObject({ provider: 'p', modelId: 'm' });
    expect(AgentCommandSchema.parse({ type: 'set_thinking_level', level: 'high' }).type).toBe(
      'set_thinking_level',
    );
    expect(AgentCommandSchema.parse({ type: 'abort_compaction' }).type).toBe('abort_compaction');
    expect(AgentCommandSchema.parse({ type: 'set_auto_compaction', enabled: true }).type).toBe(
      'set_auto_compaction',
    );
    expect(AgentCommandSchema.parse({ type: 'set_auto_retry', enabled: false }).type).toBe(
      'set_auto_retry',
    );
    expect(AgentCommandSchema.parse({ type: 'set_session_name', name: 'x' }).type).toBe(
      'set_session_name',
    );
    expect(AgentCommandSchema.parse({ type: 'reload' }).type).toBe('reload');
  });

  it('set_tools：显式名单与预设两形态（互斥由 core 校验）', () => {
    expect(AgentCommandSchema.parse({ type: 'set_tools', toolNames: ['read'] })).toMatchObject({
      toolNames: ['read'],
    });
    expect(AgentCommandSchema.parse({ type: 'set_tools', preset: 'read-only' })).toMatchObject({
      preset: 'read-only',
    });
    expect(() => AgentCommandSchema.parse({ type: 'set_tools', preset: 'nope' })).toThrow();
  });

  it('extension_ui_response：三态形状', () => {
    expect(
      AgentCommandSchema.parse({ type: 'extension_ui_response', id: 'x', value: 'v' }),
    ).toMatchObject({ value: 'v' });
    expect(
      AgentCommandSchema.parse({ type: 'extension_ui_response', id: 'x', confirmed: true }),
    ).toMatchObject({ confirmed: true });
    expect(
      AgentCommandSchema.parse({ type: 'extension_ui_response', id: 'x', cancelled: true }),
    ).toMatchObject({ cancelled: true });
    // id 必填
    expect(() => AgentCommandSchema.parse({ type: 'extension_ui_response', value: 'v' })).toThrow();
  });

  it('exposes a result schema per command', () => {
    expect(Object.keys(CommandResultSchemas).sort()).toEqual(
      [
        'prompt',
        'steer',
        'follow_up',
        'abort',
        'clear_queue',
        'get_state',
        'get_session_stats',
        'get_last_assistant_text',
        'get_commands',
        'get_tools',
        'set_tools',
        'set_model',
        'set_thinking_level',
        'compact',
        'abort_compaction',
        'set_auto_compaction',
        'set_auto_retry',
        'fork',
        'fork_branch',
        'clone',
        'navigate_tree',
        'set_session_name',
        'reload',
        'extension_ui_response',
      ].sort(),
    );
  });
});

describe('commands/new-session', () => {
  it('parses a minimal creation request', () => {
    expect(NewSessionRequestSchema.parse({ cwd: '/tmp' })).toEqual({ cwd: '/tmp' });
  });

  it('parses an ensure_session preflight request', () => {
    const body = { cwd: '/tmp', type: 'ensure_session', provider: 'anthropic', modelId: 'claude' };
    expect(NewSessionRequestSchema.parse(body)).toEqual(body);
  });

  it('rejects provider without modelId', () => {
    expect(() => NewSessionRequestSchema.parse({ cwd: '/tmp', provider: 'anthropic' })).toThrow();
    expect(() => NewSessionRequestSchema.parse({ cwd: '/tmp', modelId: 'claude' })).toThrow();
  });
});
