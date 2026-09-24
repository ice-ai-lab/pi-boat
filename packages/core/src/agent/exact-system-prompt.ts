import type { InlineExtension } from '@earendil-works/pi-coding-agent';

/**
 * 精确系统提示词覆写（G2-10）。
 *
 * 为什么需要：pi 0.86 起系统提示词进了会话转录——`agent.state.systemPrompt` 是
 * 从持久化的 system 消息**回放**出来的，不可赋值，agent 循环的请求上下文里也没有
 * `systemPrompt` 字段。宿主想「原样发出这一份提示词」只有一条受支持的路径：
 * `before_agent_start` 处理器返回 `{systemPrompt}` —— SDK 会把它当作本轮 provider 的
 * 前置 system 消息，而转录里仍照常记录 pi 的结构化段落。
 *
 * `getPrompt` 每轮都会读一次，所以重载了上下文文件的会话在下一轮 prompt 就带上新内容。
 */
export const EXACT_SYSTEM_PROMPT_EXTENSION_NAME = 'piboat-exact-system-prompt';

export function createExactSystemPromptExtension(
  getPrompt: () => string | undefined,
): InlineExtension {
  return {
    name: EXACT_SYSTEM_PROMPT_EXTENSION_NAME,
    hidden: true,
    factory: (pi) => {
      pi.on('before_agent_start', () => {
        const systemPrompt = getPrompt();
        return systemPrompt === undefined ? undefined : { systemPrompt };
      });
    },
  };
}
