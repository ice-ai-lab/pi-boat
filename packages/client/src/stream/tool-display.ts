/** 工具行的展示辅助（纯函数） */

/** 从工具参数里抽一行摘要标题（bash→命令、read/write/edit→路径、grep→查询词…） */
export function toolTitle(toolName: string, args: unknown): string {
  if (args === null || typeof args !== 'object') return toolName;
  const record = args as Record<string, unknown>;
  const first = (key: string): string | undefined => {
    const value = record[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };
  const pick =
    first('command') ??
    first('file_path') ??
    first('path') ??
    first('filePath') ??
    first('pattern') ??
    first('query') ??
    first('url');
  if (pick !== undefined) {
    const oneLine = pick.split('\n')[0] ?? '';
    return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
  }
  return toolName;
}

/** toolResult / tool_execution 的输出文本（TextContent 块拼接） */
export function resultText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (
      block !== null &&
      typeof block === 'object' &&
      (block as { type?: string }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
    ) {
      parts.push((block as { text: string }).text);
    }
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

/** 简短耗时展示（1.2s / 34s / 2m10s） */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m${seconds}s`;
}
