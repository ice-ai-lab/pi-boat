import type {
  RpcExtensionUIRequest,
  RpcExtensionUIResponse,
} from '@earendil-works/pi-coding-agent';

/**
 * 扩展 UI 双向通道（ADR-0012 + ADR-0017）：快照类型 + 请求/应答形状。
 *
 * **不重新定义**：载荷就是 SDK 的 `RpcExtensionUIRequest` / `RpcExtensionUIResponse`
 * ——SDK 自己在 `modes/rpc/rpc-mode.js` 里认的边界（9 个 method，没有 `custom`）。
 * 本仓只做两处**有意分歧**（记在 ADR-0012）：
 * 1. 请求的 `id` 收进对象内部（请求自包含），RPC 是平铺在事件顶层 ⇒ 去掉 `type`
 * 2. 事件载荷嵌在 `request` 字段下（`{type, seq, request}`），不与被投影事件的
 *    判别字段 `type` 抢位
 */

/** 挂件位置（SDK `setWidget` 的取值） */
export type WidgetPlacement = NonNullable<
  Extract<RpcExtensionUIRequest, { method: 'setWidget' }>['widgetPlacement']
>;

/** 通知级别（SDK `notify` 的取值） */

/** 状态栏项快照（AgentState.extensionStatuses 元素） */
export type ExtensionStatusItem = { statusKey: string; statusText: string };

/** 挂件快照（AgentState.extensionWidgets 元素） */
export type ExtensionWidgetItem = {
  widgetKey: string;
  widgetLines: string[];
  widgetPlacement?: WidgetPlacement;
};

/** 分配律 Omit（直接 Omit<Union> 会塌缩成公共键，丢掉 9 个 method 的字段） */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** 请求（core → 客户端，走事件通道）：即 RPC 形状去掉顶层判别字段 */
export type ExtensionUiRequest = DistributiveOmit<RpcExtensionUIRequest, 'type'>;

/**
 * 应答（客户端 → core，走命令通道 extension_ui_response）：
 * 即 RPC 形状去掉顶层判别字段（同上，判别字段由命令信封承担）。
 */
export type ExtensionUiResponse = DistributiveOmit<RpcExtensionUIResponse, 'type'>;
