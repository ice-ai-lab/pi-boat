import type { AgentSession, AgentSessionRuntime } from '@earendil-works/pi-coding-agent';
import { vi } from 'vitest';

/**
 * 最小 AgentSessionRuntime fake（测试专用）。
 *
 * 为什么需要：B2 起 SessionRegistryEntry 委托的是 **runtime** 而非裸 session
 * （只有 runtime 有 fork/switchSession/newSession，那是 fork/clone/恢复的原语）。
 * 测试只用到 `.session` 与 `.dispose()`，其余成员给出可断言的桩。
 */
export function fakeRuntime(
  session: AgentSession,
  overrides: Record<string, unknown> = {},
): AgentSessionRuntime {
  const runtime = {
    get session() {
      return session;
    },
    cwd: '/tmp',
    services: {},
    diagnostics: [],
    modelFallbackMessage: undefined,
    setRebindSession: vi.fn(),
    setBeforeSessionInvalidate: vi.fn(),
    fork: vi.fn(async () => ({ cancelled: false })),
    newSession: vi.fn(async () => ({ cancelled: false })),
    switchSession: vi.fn(async () => ({ cancelled: false })),
    importFromJsonl: vi.fn(async () => ({ cancelled: false })),
    dispose: vi.fn(async () => {}),
    ...overrides,
  };
  return runtime as unknown as AgentSessionRuntime;
}

/** 会话文件最小桩（工具选择持久化 / 重建 runtime 路径用） */
export function fakeSessionManager(overrides: Record<string, unknown> = {}) {
  const appended: Array<{ customType: string; data: unknown }> = [];
  return {
    appended,
    manager: {
      getCwd: () => '/tmp',
      getSessionDir: () => '/tmp',
      getSessionFile: () => '/tmp/sess-1.jsonl',
      isPersisted: () => true,
      getEntries: () => [],
      getEntry: () => undefined,
      getLeafId: () => 'leaf-1',
      appendCustomEntry: vi.fn((customType: string, data?: unknown) => {
        appended.push({ customType, data });
        return 'entry-1';
      }),
      appendSessionInfo: () => 'entry-1',
      createBranchedSession: () => undefined,
      ...overrides,
    },
  };
}
