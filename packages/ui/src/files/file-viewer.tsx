import type { FileTab } from '@ice-ai/client';
import {
  documentPreviewKind,
  formatFileSize,
  getFileName,
  isDocxPath,
  isImagePath,
} from '@ice-ai/client';
import { AlertTriangle, Download, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';
import { CodeViewer } from './code-viewer';
import { DiffView } from './diff-view';
import { ImagePreview } from './image-preview';

/**
 * FileViewer（docs/06 §4.3）：按文件类型分发查看方式。
 * - 文本/代码 → CodeViewer（行号；F5 接 shiki 高亮）
 * - 图片 → ImagePreview（字节走 preview URL）
 * - PDF → iframe 原生渲染
 * - 有 git 改动且切到 diff → DiffView（unified patch 由宿主取）
 * - DOCX / 二进制 → 不假装能预览，给下载（后端不做 DOCX 转换，docs/07 §9）
 */
export interface FileViewerProps {
  tab: FileTab;
  /** 相对项目根的展示路径 */
  displayPath: string;
  loading: boolean;
  error?: string | null;
  /** 文本内容（source 模式） */
  text?: string | null;
  /** 文件体积（meta） */
  size?: number;
  /** diff 模式的 patch */
  patch?: string | null;
  /** 字节流 URL（图片/PDF/下载） */
  byteUrl(type: 'read' | 'preview' | 'download'): string;
  onToggleWrap(): void;
  onShowDiff(): void;
  onShowSource(): void;
}

export function FileViewer({
  tab,
  displayPath,
  loading,
  error,
  text,
  size,
  patch,
  byteUrl,
  onToggleWrap,
  onShowDiff,
  onShowSource,
}: FileViewerProps) {
  const name = getFileName(tab.path);
  const image = isImagePath(tab.path);
  const pdf = documentPreviewKind(tab.path) !== null;
  const docx = isDocxPath(tab.path);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="hairline-b flex shrink-0 items-center gap-2 border-line-2 px-3 py-1.5">
        <span className="truncate font-mono text-[11.5px] text-fg-subtle" title={tab.path}>
          {displayPath}
        </span>
        {size !== undefined && (
          <span className="shrink-0 text-[11px] text-fg-faint">{formatFileSize(size)}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {tab.displayMode !== 'diff' && (
            <button
              type="button"
              onClick={onShowDiff}
              title="查看 git 改动"
              className="sq px-2 py-0.5 text-[11.5px] text-fg-subtle hover:bg-hover hover:text-fg"
            >
              diff
            </button>
          )}
          {tab.displayMode === 'diff' && (
            <button
              type="button"
              onClick={onShowSource}
              title="查看文件内容"
              className="sq px-2 py-0.5 text-[11.5px] text-fg-subtle hover:bg-hover hover:text-fg"
            >
              内容
            </button>
          )}
          {tab.displayMode === 'source' && !image && !pdf && (
            <button
              type="button"
              aria-pressed={tab.wrapLines}
              onClick={onToggleWrap}
              title="折行"
              className={cn(
                'sq px-2 py-0.5 text-[11.5px] hover:bg-hover',
                tab.wrapLines ? 'text-accent' : 'text-fg-subtle hover:text-fg',
              )}
            >
              折行
            </button>
          )}
          <a
            href={byteUrl('download')}
            download={name}
            title="下载"
            aria-label="下载文件"
            className="sq flex h-6 w-6 items-center justify-center text-fg-subtle hover:bg-hover hover:text-fg"
          >
            <Download size={13} />
          </a>
          <a
            href={byteUrl('read')}
            target="_blank"
            rel="noreferrer"
            title="在新标签页打开"
            aria-label="在新标签页打开"
            className="sq flex h-6 w-6 items-center justify-center text-fg-subtle hover:bg-hover hover:text-fg"
          >
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {loading && (
        <div className="flex flex-1 items-center justify-center gap-2 text-[12px] text-fg-faint">
          <Loader2 size={14} className="animate-spin" />
          加载中…
        </div>
      )}

      {!loading && error !== undefined && error !== null && (
        <div className="flex flex-1 items-center justify-center gap-2 px-6 text-center text-[12px] text-danger">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {!loading && (error === undefined || error === null) && (
        <>
          {tab.displayMode === 'diff' && <DiffView patch={patch ?? ''} />}
          {tab.displayMode !== 'diff' && image && (
            <ImagePreview src={byteUrl('preview')} alt={name} />
          )}
          {tab.displayMode !== 'diff' && !image && pdf && (
            <iframe title={name} src={byteUrl('preview')} className="min-h-0 flex-1 border-0" />
          )}
          {tab.displayMode !== 'diff' && !image && !pdf && docx && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-[12.5px] text-fg-muted">DOCX 不支持在线预览</p>
              <p className="text-[11.5px] text-fg-faint">
                后端不提供 DOCX 转换（docs/07 §9）；请下载后用本地应用打开
              </p>
              <a
                href={byteUrl('download')}
                download={name}
                className="sq mt-1 bg-accent-weak px-3 py-1.5 text-[12px] text-accent"
              >
                下载 {name}
              </a>
            </div>
          )}
          {tab.displayMode !== 'diff' &&
            !image &&
            !pdf &&
            !docx &&
            text !== undefined &&
            text !== null && <CodeViewer code={text} wrapLines={tab.wrapLines} />}
          {tab.displayMode !== 'diff' &&
            !image &&
            !pdf &&
            !docx &&
            (text === undefined || text === null) && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-[12.5px] text-fg-muted">二进制文件不便内联展示</p>
                <a
                  href={byteUrl('download')}
                  download={name}
                  className="sq bg-accent-weak px-3 py-1.5 text-[12px] text-accent"
                >
                  下载 {name}
                </a>
              </div>
            )}
        </>
      )}
    </div>
  );
}
