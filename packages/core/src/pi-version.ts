import { VERSION } from '@earendil-works/pi-coding-agent';

/**
 * 锁定的 pi SDK 版本（运行时读取，避免在别处手抄第二份——ADR-0010 版本锁的单一来源）。
 * 仅 core 允许 import SDK（AGENTS.md 依赖铁律），server/web 经 `/api/health` 取。
 */
export const PI_VERSION = VERSION;
