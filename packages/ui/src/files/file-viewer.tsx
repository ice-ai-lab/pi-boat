import type { FileTab } from '@ice-ai/client';
import {
  documentPreviewKind,
  formatFileSize,
  getFileName,
  getLanguageFromPath,
  isDocxPath,
  isImagePath,
} from '@ice-ai/client';
import { AlertTriangle, Download, ExternalLink, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n/i18n-provider';
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
 *
 * 抬头（`.file-viewer-toolbar`）按 参考实现 同形：路径 + `语言 · N lines · 体积` + 监听小圆点 +
 * （有改动才出现）内容/diff 切换 + 图标动作（提及 / 折行 / 下载）。尺寸一律走
 * `.file-viewer-icon-button` 的 24×24，别在组件里覆写 width，否则与 参考实现 并排看就会错位。
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
  /** 该文件在 git 里是否有可对比的改动（决定是否出「内容/diff」切换） */
  diffAvailable?: boolean;
  /** 字节流 URL（图片/PDF/下载） */
  byteUrl(type: 'read' | 'preview' | 'download'): string;
  onToggleWrap(): void;
  onShowDiff(): void;
  onShowSource(): void;
  /** 「提及」：把相对路径插入聊天输入框（F16 的查看器入口） */
  onAtMention?(): void;
}

/** 折行图标（与 参考实现 同一枚；文本按钮 32×24 是样式跑偏的根源） */
function WrapIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M3 12h15a3 3 0 1 1 0 6h-4" />
      <path d="m16 16-2 2 2 2" />
      <path d="M3 18h7" />
    </svg>
  );
}

/** 提及图标（@） */
function MentionIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </svg>
  );
}

export function FileViewer({
  tab,
  displayPath,
  loading,
  error,
  text,
  size,
  patch,
  diffAvailable = false,
  byteUrl,
  onToggleWrap,
  onShowDiff,
  onShowSource,
  onAtMention,
}: FileViewerProps) {
  const { t } = useI18n();
  const name = getFileName(tab.path);
  const image = isImagePath(tab.path);
  const pdf = documentPreviewKind(tab.path) !== null;
  const docx = isDocxPath(tab.path);
  const sourceMode = tab.displayMode !== 'diff';
  const lines = text === undefined || text === null ? null : text.split('\n').length;
  const meta =
    size === undefined
      ? null
      : `${getLanguageFromPath(tab.path)}${lines === null ? '' : ` · ${lines} lines`} · ${formatFileSize(size)}`;

  return (
    <div
      className="file-viewer-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        className="file-viewer-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 12px',
          borderBottom: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-dim)',
          background: 'var(--bg)',
          flexShrink: 0,
        }}
      >
        <span
          className="file-viewer-path"
          style={{ fontFamily: 'var(--font-mono)' }}
          title={tab.path}
        >
          {displayPath}
        </span>
        {meta !== null && (
          <span className="file-viewer-meta" title={meta}>
            {meta}
          </span>
        )}
        {/* 实时监听（docs/07 §9 的 type=watch 未实现）——恒灰，别假装已同步 */}
        <span
          role="img"
          title={t('i18n.notWatching')}
          aria-label={t('i18n.notWatching')}
          className="file-viewer-live-indicator"
          style={{ background: 'var(--border)' }}
        />
        <div className="file-viewer-controls">
          {diffAvailable && (
            /* biome-ignore lint/a11y/useSemanticElements: 与 参考实现 同形（外层已是 flex 容器，换 fieldset 会改版式） */
            <div
              role="group"
              className="file-viewer-mode-switch"
              aria-label={t('i18n.fileViewMode')}
            >
              <button
                type="button"
                onClick={onShowSource}
                aria-pressed={sourceMode}
                className="file-viewer-mode-button"
                style={{
                  background: sourceMode ? 'var(--bg-selected)' : 'transparent',
                  color: sourceMode ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                {t('files.viewSource')}
              </button>
              <button
                type="button"
                onClick={onShowDiff}
                title={t('i18n.compareHead')}
                aria-pressed={!sourceMode}
                className="file-viewer-mode-button"
                style={{
                  background: !sourceMode ? 'var(--bg-selected)' : 'transparent',
                  color: !sourceMode ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                {t('files.viewDiff')}
              </button>
            </div>
          )}
          <div className="file-viewer-actions">
            {onAtMention !== undefined && (
              <button
                type="button"
                onClick={onAtMention}
                title={t('files.insertPath')}
                aria-label={t('files.mention')}
                className="file-viewer-icon-button"
              >
                <MentionIcon />
              </button>
            )}
            {sourceMode && !image && !pdf && !docx && (
              <button
                type="button"
                onClick={onToggleWrap}
                title={t(tab.wrapLines ? 'i18n.disableWrap' : 'i18n.enableWrap')}
                aria-label={t(tab.wrapLines ? 'i18n.disableWrap' : 'i18n.enableWrap')}
                aria-pressed={tab.wrapLines}
                className="file-viewer-icon-button"
                style={{
                  background: tab.wrapLines ? 'var(--bg-selected)' : 'transparent',
                  color: tab.wrapLines ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                <WrapIcon />
              </button>
            )}
          </div>
          <a
            href={byteUrl('download')}
            download={name}
            title={t('files.download')}
            aria-label={t('files.download')}
            className="file-viewer-icon-button"
          >
            <Download size={14} />
          </a>
          <a
            href={byteUrl('read')}
            target="_blank"
            rel="noreferrer"
            title={t('files.openInNewTab')}
            aria-label={t('files.openInNewTab')}
            className="file-viewer-icon-button"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {loading && (
        <div className="flex flex-1 items-center justify-center gap-2 text-[12px] text-fg-faint">
          <Loader2 size={14} className="animate-spin" />
          {t('files.loading')}
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
          {!sourceMode && <DiffView patch={patch ?? ''} />}
          {sourceMode && image && <ImagePreview src={byteUrl('preview')} alt={name} />}
          {sourceMode && !image && pdf && (
            <iframe title={name} src={byteUrl('preview')} className="min-h-0 flex-1 border-0" />
          )}
          {sourceMode && !image && !pdf && docx && (
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
          {sourceMode && !image && !pdf && !docx && text !== undefined && text !== null && (
            <CodeViewer code={text} wrapLines={tab.wrapLines} />
          )}
          {sourceMode && !image && !pdf && !docx && (text === undefined || text === null) && (
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
