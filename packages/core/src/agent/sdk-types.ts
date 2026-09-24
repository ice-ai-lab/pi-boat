import type { AgentSession } from '@earendil-works/pi-coding-agent';

/**
 * SDK 的 `Model` 类型别名。
 *
 * 为什么绕一层：`Model` 定义在 `@earendil-works/pi-ai`（pi-coding-agent 的传递依赖），
 * 而 pi-coding-agent 的公开导出里**没有** `Model`（只导出 `ModelRuntime`/`ModelRegistry`
 * 等）。直接 import pi-ai 会给 core 增加一个只有类型用途的直接依赖；从
 * `AgentSession['model']` 反推可以拿到**同一个**类型，且版本随 SDK 走。
 */
export type SdkModel = NonNullable<AgentSession['model']>;

/** 模型的身份键（与 provider 一起唯一确定一个模型） */
export type SdkModelRef = Pick<SdkModel, 'provider' | 'id'>;
