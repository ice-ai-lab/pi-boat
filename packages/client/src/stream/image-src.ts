import type { ImageContent } from '@ice-ai/protocol';
import { entryImageUrl } from '../endpoints/sessions';

/**
 * 消息图片 → 可渲染 src（docs/05 §6；ADR-0024）。
 *
 * 两种形态：
 * - `data` 非空（实时事件、未请求 `deferMedia` 的历史）→ `data:` URL，浏览器直接渲染
 * - `data` 为空（服务端 `deferMedia` 的占位）→ 惰性端点 URL，渲染时才取字节
 *
 * 为什么坐标是（entryId + **消息内块下标**）：服务端擦 base64 时把块留在原位，
 * 而 `sessionEntryToContextMessages()` 对 message 条目原样透传，所以这个下标与文件里
 * `entry.message.content` 的下标一致，正是 `/entries/:entryId/image?blockIndex=N` 要的。
 */

/** 惰性取数需要的坐标；实时路径（内联 base64）不需要 */
export interface ImageCoords {
  sessionId?: string | null;
  entryId?: string | null;
}

/**
 * 内容里的图片块 → src 列表（保序，跳过取不到坐标的块）。
 * 无图片 → `undefined`（与视图模型里 `images?` 的「无」语义一致）。
 */
export function messageImageSrcs(content: unknown, coords: ImageCoords = {}): string[] | undefined {
  if (!Array.isArray(content)) return undefined;
  const srcs: string[] = [];
  content.forEach((block, blockIndex) => {
    const src = imageBlockSrc(block, blockIndex, coords);
    if (src !== null) srcs.push(src);
  });
  return srcs.length > 0 ? srcs : undefined;
}

/** 单个块 → src；不是图片块 / 拿不到坐标 → null */
function imageBlockSrc(block: unknown, blockIndex: number, coords: ImageCoords): string | null {
  if (
    block === null ||
    typeof block !== 'object' ||
    (block as { type?: unknown }).type !== 'image'
  ) {
    return null;
  }
  const image = block as ImageContent;
  if (image.data !== '') return `data:${image.mimeType};base64,${image.data}`;
  const { sessionId, entryId } = coords;
  if (sessionId === undefined || sessionId === null) return null;
  if (entryId === undefined || entryId === null) return null;
  return entryImageUrl(sessionId, entryId, blockIndex);
}
