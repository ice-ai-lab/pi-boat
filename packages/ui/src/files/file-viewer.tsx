import type { FileTab } from '@ice-ai/client';
import {
  documentPreviewKind,
  formatFileSize,
  getFileName,
  isDocxPath,
  isImagePath,
} from '@ice-ai/client';
import { AlertTriangle, Download, ExternalLink, Loader2 } from 'lucide-react';
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
      <div
        className="file-viewer-toolbar hairline-b flex shrink-0 items-center gap-3 border-border px-3"
        style={{ background: 'var(--bg-panel)' }}
      >
        <span
          className="file-viewer-path"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-muted)' }}
          title={tab.path}
        >
          {displayPath}
        </span>
        {size !== undefined && (
          <span className="file-viewer-meta" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {formatFileSize(size)}
          </span>
        )}
        <div className="file-viewer-controls">
          <div className="file-viewer-mode-switch">
            <button
              type="button"
              onClick={onShowSource}
              aria-pressed={tab.displayMode !== 'diff'}
              title="查看文件内容"
              className="file-viewer-mode-button"
              style={{
                background: tab.displayMode !== 'diff' ? 'var(--bg-selected)' : 'transparent',
                color: tab.displayMode !== 'diff' ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              内容
            </button>
            <button
              type="button"
              onClick={onShowDiff}
              aria-pressed={tab.displayMode === 'diff'}
              title="查看 git 改动"
              className="file-viewer-mode-button"
              style={{
                background: tab.displayMode === 'diff' ? 'var(--bg-selected)' : 'transparent',
                color: tab.displayMode === 'diff' ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              diff
            </button>
          </div>
          <div className="file-viewer-actions">
            {tab.displayMode === 'source' && !image && !pdf && (
              <button
                type="button"
                aria-pressed={tab.wrapLines}
                onClick={onToggleWrap}
                title="折行"
                className="file-viewer-icon-button"
                style={{
                  width: 'auto',
                  padding: '0 8px',
                  color: tab.wrapLines ? 'var(--accent)' : undefined,
                }}
              >
                折行
              </button>
            )}
            <a
              href={byteUrl('download')}
              download={name}
              title="下载"
              aria-label="下载文件"
              className="file-viewer-icon-button"
            >
              <Download size={13} />
            </a>
            <a
              href={byteUrl('read')}
              target="_blank"
              rel="noreferrer"
              title="在新标签页打开"
              aria-label="在新标签页打开"
              className="file-viewer-icon-button"
            >
              <ExternalLink size={13} />
            </a>
          </div>
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
