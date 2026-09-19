import { z } from 'zod';

/**
 * 扩展 UI 协议（docs/02 §3.5）——协议清单标注"最容易被漏掉的成员"。
 * 请求经事件通道 `extension_ui_request` 下发；应答经命令通道
 * `extension_ui_response` 回传；服务端主动关闭经 `extension_ui_closed` 通知。
 * 阻塞型（select/confirm/input/editor/custom）带 id/timeout/expiresAt，
 * 非阻塞型（notify/setStatus/setWidget/setTitle/set_editor_text）单向通知。
 * 形状对齐 SDK 0.85.1 `modes/rpc/rpc-types.ts` 的 RpcExtensionUIRequest/Response。
 */

export const WIDGET_PLACEMENTS = ['aboveEditor', 'belowEditor'] as const;
export const WidgetPlacementSchema = z.enum(WIDGET_PLACEMENTS);
export type WidgetPlacement = z.infer<typeof WidgetPlacementSchema>;

export const NOTIFY_TYPES = ['info', 'warning', 'error'] as const;
export const NotifyTypeSchema = z.enum(NOTIFY_TYPES);
export type NotifyType = z.infer<typeof NotifyTypeSchema>;

/** 阻塞型请求公共字段：expiresAt 为服务端计算的超时时刻（epoch 毫秒） */
const BlockingBaseSchema = z.object({
  id: z.string(),
  timeout: z.number().optional(),
  expiresAt: z.number().optional(),
});

export const ExtensionUiRequestSchema = z.discriminatedUnion('method', [
  BlockingBaseSchema.extend({
    method: z.literal('select'),
    title: z.string(),
    options: z.array(z.string()),
  }),
  BlockingBaseSchema.extend({
    method: z.literal('confirm'),
    title: z.string(),
    message: z.string(),
  }),
  BlockingBaseSchema.extend({
    method: z.literal('input'),
    title: z.string(),
    placeholder: z.string().optional(),
  }),
  BlockingBaseSchema.extend({
    method: z.literal('editor'),
    title: z.string(),
    prefill: z.string().optional(),
  }),
  z.object({
    method: z.literal('notify'),
    message: z.string(),
    notifyType: NotifyTypeSchema.optional(),
  }),
  z.object({
    method: z.literal('setStatus'),
    statusKey: z.string(),
    /** statusText 缺省（JSON 字段缺失）= 清除该项 */
    statusText: z.string().optional(),
  }),
  z.object({
    method: z.literal('setWidget'),
    widgetKey: z.string(),
    /** widgetLines 缺省 = 清除该挂件 */
    widgetLines: z.array(z.string()).optional(),
    widgetPlacement: WidgetPlacementSchema.optional(),
  }),
  z.object({
    method: z.literal('setTitle'),
    title: z.string(),
  }),
  z.object({
    method: z.literal('set_editor_text'),
    text: z.string(),
  }),
  z.object({
    method: z.literal('custom'),
    /** 阻塞型 custom 才有 id；纯通知型无 */
    id: z.string().optional(),
    timeout: z.number().optional(),
    expiresAt: z.number().optional(),
    /** 扩展自定义 UI 载荷，形状由扩展约定 */
    payload: z.unknown().optional(),
    /** true = 服务端关闭通知，客户端据此撤下对应 UI */
    closed: z.boolean().optional(),
  }),
]);
export type ExtensionUiRequest = z.infer<typeof ExtensionUiRequestSchema>;

/** 阻塞型请求的应答（三选一：值 / 布尔确认 / 取消） */
export const ExtensionUiResponseSchema = z.union([
  z.object({
    id: z.string(),
    value: z.string(),
  }),
  z.object({
    id: z.string(),
    confirmed: z.boolean(),
  }),
  z.object({
    id: z.string(),
    cancelled: z.literal(true),
  }),
]);
export type ExtensionUiResponse = z.infer<typeof ExtensionUiResponseSchema>;

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
