import { z } from 'zod';

/**
 * 扩展 UI 双向通道（ADR-0012）：快照类型 + 请求/应答形状。
 *
 * 形状按 SDK 0.87.1 的 **RPC 面**（`RpcExtensionUIRequest`）实现——那是 SDK 自己在
 * `modes/rpc/rpc-mode.js` 里认的边界：**9 个 method，没有 `custom`**（RPC 模式自身的
 * `custom()` 直接 `return undefined`，TUI 专属成员逐个 no-op）。因此本仓不引入
 * `pi-tui`，也不自创 Web 语义。
 *
 * 与 RPC 的两处**有意分歧**（都记在 ADR-0012）：
 * 1. `id` 收进请求对象内部（请求自包含），RPC 是平铺在事件顶层
 * 2. 事件载荷嵌在 `request` 字段下（`{type, seq, request}`）——zod 判别联合需要
 *    单一判别字段，平铺会让 9 个 method 与外层 `type` 抢判别位
 *
 * 载荷形状本身与 RPC 逐字段一致（含 `timeout` 只在 select/confirm/input 上）。
 */

export const WIDGET_PLACEMENTS = ['aboveEditor', 'belowEditor'] as const;
export const WidgetPlacementSchema = z.enum(WIDGET_PLACEMENTS);
export type WidgetPlacement = z.infer<typeof WidgetPlacementSchema>;

export const NOTIFY_TYPES = ['info', 'warning', 'error'] as const;
export const NotifyTypeSchema = z.enum(NOTIFY_TYPES);
export type NotifyType = z.infer<typeof NotifyTypeSchema>;

/** 状态栏项快照（AgentState.extensionStatuses 元素） */
export const ExtensionStatusItemSchema = z.object({
  statusKey: z.string(),
  statusText: z.string(),
});
export type ExtensionStatusItem = z.infer<typeof ExtensionStatusItemSchema>;

/** 挂件快照（AgentState.extensionWidgets 元素） */
export const ExtensionWidgetItemSchema = z.object({
  widgetKey: z.string(),
  widgetLines: z.array(z.string()),
  widgetPlacement: WidgetPlacementSchema.optional(),
});
export type ExtensionWidgetItem = z.infer<typeof ExtensionWidgetItemSchema>;

// ---------------------------------------------------------------------------
// 请求（core → 客户端，走事件通道）
// ---------------------------------------------------------------------------

export const EXTENSION_UI_METHODS = [
  'select',
  'confirm',
  'input',
  'editor',
  'notify',
  'setStatus',
  'setWidget',
  'setTitle',
  'set_editor_text',
] as const;
export const ExtensionUiMethodSchema = z.enum(EXTENSION_UI_METHODS);
export type ExtensionUiMethod = z.infer<typeof ExtensionUiMethodSchema>;

/**
 * 阻塞型 method（等 `extension_ui_response`）：`select` / `confirm` / `input` / `editor`。
 * ⚠️ 只有 select/confirm/input 带 `timeout`，且**该字段是扩展自己传的**——扩展不传就
 * 没有超时，`editor` 更是连字段都没有。宿主必须自加服务端默认超时（ADR-0012）。
 */
export const EXTENSION_UI_BLOCKING_METHODS = ['select', 'confirm', 'input', 'editor'] as const;
export type ExtensionUiBlockingMethod = (typeof EXTENSION_UI_BLOCKING_METHODS)[number];

export const ExtensionUiRequestSchema = z.discriminatedUnion('method', [
  z.object({
    id: z.string(),
    method: z.literal('select'),
    title: z.string(),
    options: z.array(z.string()),
    /** 扩展请求的超时（毫秒）；缺省 = 只受宿主默认超时约束 */
    timeout: z.number().optional(),
  }),
  z.object({
    id: z.string(),
    method: z.literal('confirm'),
    title: z.string(),
    message: z.string(),
    timeout: z.number().optional(),
  }),
  z.object({
    id: z.string(),
    method: z.literal('input'),
    title: z.string(),
    placeholder: z.string().optional(),
    timeout: z.number().optional(),
  }),
  z.object({
    id: z.string(),
    method: z.literal('editor'),
    title: z.string(),
    prefill: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    method: z.literal('notify'),
    message: z.string(),
    notifyType: NotifyTypeSchema.optional(),
  }),
  z.object({
    id: z.string(),
    method: z.literal('setStatus'),
    statusKey: z.string(),
    /** 缺省 = 清除该 key 的状态项 */
    statusText: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    method: z.literal('setWidget'),
    widgetKey: z.string(),
    /** 缺省 = 清除该 key 的挂件；**只支持字符串数组**（工厂形态在 RPC 模式即被忽略） */
    widgetLines: z.array(z.string()).optional(),
    widgetPlacement: WidgetPlacementSchema.optional(),
  }),
  z.object({
    id: z.string(),
    method: z.literal('setTitle'),
    title: z.string(),
  }),
  z.object({
    id: z.string(),
    method: z.literal('set_editor_text'),
    text: z.string(),
  }),
]);
export type ExtensionUiRequest = z.infer<typeof ExtensionUiRequestSchema>;

// ---------------------------------------------------------------------------
// 应答（客户端 → core，走命令通道 extension_ui_response）
// ---------------------------------------------------------------------------

/**
 * 三种形状（与 `RpcExtensionUIResponse` 一致）：
 * - `{id, value}`：select / input / editor 的返回文本
 * - `{id, confirmed}`：confirm 的布尔答案
 * - `{id, cancelled:true}`：用户取消**或宿主超时**（二者不可区分，与 RPC 模式一致）
 */
export const ExtensionUiResponseSchema = z.union([
  z.object({ id: z.string(), value: z.string() }),
  z.object({ id: z.string(), confirmed: z.boolean() }),
  z.object({ id: z.string(), cancelled: z.literal(true) }),
]);
export type ExtensionUiResponse = z.infer<typeof ExtensionUiResponseSchema>;
