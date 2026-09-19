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

  it('rejects M2 commands not yet in the protocol', () => {
    expect(() => AgentCommandSchema.parse({ type: 'fork', entryId: 'e1' })).toThrow();
    expect(() => AgentCommandSchema.parse({ type: 'compact' })).toThrow();
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
