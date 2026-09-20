import { z } from 'zod';

/**
 * 扩展 UI 快照类型（AgentState.extensionStatuses / extensionWidgets 元素）。
 * 交互通道（request/response/closed 事件）随 M2 扩展 UI 里程碑再定
 * （2026-09-20 定案：已定义未接线视同期货，删到有消费方为止）。
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
