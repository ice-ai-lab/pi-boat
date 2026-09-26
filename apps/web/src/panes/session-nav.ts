/**
 * WorkspaceLayout 之外的会话导航对账（ADR-0019-5：URL `?s=` 是当前会话的唯一真相）。
 *
 * ## 为什么要有这个纯函数
 *
 * 「URL → 会话」与「会话 → URL」如果各写一个 effect，它们会在**同一个提交里互相覆盖**：
 * 用户点侧栏切到 B 时 state 还是 A，会话→URL 那个 effect 会把 URL 写回 A；随后 `open(B)`
 * 完成又反向把 URL 写成 B，再触发一次 `open(A)`……两个会话无限互切（2026-09-26 实测：
 * 每秒一组 `open` + `get_commands/get_tools/get_session_stats`）。
 *
 * 所以对账只能有**一个决策处**，且方向必须由「谁发起的」显式决定（`selfInitiated`）：
 * - 用户 / URL 发起的（点击、前进后退、粘贴链接）→ **URL 赢**，去切会话；
 * - 本组件发起的（建会话、fork）→ **会话赢**，把 URL 补上。
 *
 * 纯函数：这条规则是「不许反向覆盖」的全部依据，用单测钉住比靠浏览器试稳。
 */
export type SessionNavDecision =
  /** 已一致（或没有可执行的动作） */
  | { kind: 'none' }
  /** URL 是空态而 state 里还有会话，且不是本组件发起的 → 用户要新会话 */
  | { kind: 'reset' }
  /** URL 指名了会话 → 切过去（幂等，`open()` 内部对已驻留会话直接返回） */
  | { kind: 'open'; sessionId: string }
  /** 本组件发起的切换，URL 还没跟上 → 补写 `?s=` */
  | { kind: 'writeUrl'; sessionId: string };

export function decideSessionNav(input: {
  /** URL `?s=`（null = 空态） */
  urlSessionId: string | null;
  /** hook 里的当前会话 id */
  sessionId: string | null;
  /** 本次切换是否由本组件发起（建会话 / fork：会话先行、URL 后跟） */
  selfInitiated: boolean;
}): SessionNavDecision {
  const { urlSessionId, sessionId, selfInitiated } = input;
  if (urlSessionId === sessionId) return { kind: 'none' };

  if (selfInitiated) {
    // 会话先行：URL 随后补上（sessionId 为 null = 建会话失败，由 startSession 自己清标记）
    return sessionId === null ? { kind: 'none' } : { kind: 'writeUrl', sessionId };
  }

  if (urlSessionId === null) {
    // URL 空态：清掉 state 里残留的会话（「新建会话」按钮）
    return sessionId === null ? { kind: 'none' } : { kind: 'reset' };
  }

  // URL 指名了会话：一律以 URL 为准（绝不能在这里把当前会话写回 URL）
  return { kind: 'open', sessionId: urlSessionId };
}
