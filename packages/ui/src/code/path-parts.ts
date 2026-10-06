/** 路径拆目录段 + 末段（对齐 DSH util-workspace-path 的 `pathPartsOf`；PathLabel 消费）。 */

/**
 * 把一个路径拆成「目录部分（含结尾分隔符）」与「末段」。
 * @param path - 任意分隔符（`/` 或 `\`）的路径。
 * @returns directory 为空串表示路径就在当前目录。
 */
export function pathPartsOf(path: string): { directory: string; name: string } {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (cut < 0) return { directory: '', name: path };
  return { directory: path.slice(0, cut + 1), name: path.slice(cut + 1) };
}
