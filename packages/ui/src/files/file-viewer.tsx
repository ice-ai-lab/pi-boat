import type { FilePreviewMode, FileTab } from '@ice-ai/client';
import {
  documentPreviewKind,
  getFileName,
  getLanguageFromPath,
  isDocxPath,
  isImagePath,
} from '@ice-ai/client';
import { AlertTriangle, ChevronDown, Loader2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { MarkdownView } from '../chat/markdown-view';
import { CodeBlock } from '../code/code-block';
import { DiffBlock } from '../code/diff-block';
import { PathLabel } from '../code/path-label';
import { useI18n } from '../i18n/i18n-provider';
import styles from './file-viewer.module.css';
import { ImagePreview } from './image-preview';

/**
 * FileViewer（docs/06 §4.3）：按文件类型分发查看方式。
 * - 文本/代码 → CodeBlock（行号 + shiki 高亮）；markdown → 默认 MarkdownView 渲染，
 *   右上角出「Markdown / 代码 / 纯文本」查看方式选择器（DSH documentpreview 的 renderer 同概念）
 * - 图片 → ImagePreview（字节走 preview URL）
 * - PDF → iframe 原生渲染
 * - 有 git 改动且切到 diff → DiffBlock（code/DiffBlock，DSH 观感）
 * - DOCX / 二进制 → 不假装能预览，给下载（后端不做 DOCX 转换，docs/07 §9）
 *
 * 抬头（`.file-viewer-toolbar`）按 DSH 标题行同形（38px + 发丝线）：路径（PathLabel）+
 * 监听小圆点 + （有改动才出现）内容/diff 切换 + 图标动作（提及 / 折行）。
 * 2026-10-06 定案：不展示行数/体积 meta，不出复制/下载/新标签页动作。
 */
export interface FileViewerProps {
  tab: FileTab;
  /** 相对项目根的展示路径 */
  displayPath: string;
  loading: boolean;
  error?: string | null;
  /** 文本内容（source 模式） */
  text?: string | null;
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
  /** 切换 markdown 文件的正文渲染方式（仅 markdown 文件出现选择器） */
  onPreviewModeChange?(mode: FilePreviewMode): void;
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

/** 源码正文最多渲染的行数：超过截断并提示（防几万行 DOM 卡死；完整内容走下载） */
const MAX_RENDER_LINES = 5000;

/** markdown 文件的三种正文渲染（选择器标签的 i18n key 后缀） */
const PREVIEW_MODES: readonly FilePreviewMode[] = ['markdown', 'code', 'text'];

export function FileViewer({
  tab,
  displayPath,
  loading,
  error,
  text,
  patch,
  diffAvailable = false,
  byteUrl,
  onToggleWrap,
  onShowDiff,
  onShowSource,
  onAtMention,
  onPreviewModeChange,
}: FileViewerProps) {
  const { t } = useI18n();
  const name = getFileName(tab.path);
  const image = isImagePath(tab.path);
  const pdf = documentPreviewKind(tab.path) !== null;
  const docx = isDocxPath(tab.path);
  const sourceMode = tab.displayMode !== 'diff';
  /** 源码与 diff 共用同一份语言推断（client 的扩展名表；未知 = 'text' → 纯文本） */
  const language = getLanguageFromPath(tab.path);
  const isMarkdown = language === 'md' || language === 'mdx';
  /** 正文渲染方式：undefined = 自动（markdown 文件 → markdown，其余 → code） */
  const previewMode: FilePreviewMode = tab.previewMode ?? (isMarkdown ? 'markdown' : 'code');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  // 正文截断：只渲染前 MAX_RENDER_LINES 行（CodeBlock 的 viewport 高亮只管算力，DOM 行数还是得裁）
  const { visibleCode, truncated } = useMemo(() => {
    if (text === undefined || text === null) return { visibleCode: '', truncated: false };
    const all = text.split('\n');
    if (all.length <= MAX_RENDER_LINES) return { visibleCode: text, truncated: false };
    return { visibleCode: all.slice(0, MAX_RENDER_LINES).join('\n'), truncated: true };
  }, [text]);

  return (
    <div
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
      <div className={styles.toolbar}>
        <PathLabel path={displayPath} className={styles.path} />
        {/* 实时监听（docs/07 §9 的 type=watch 未实现）——恒灰，别假装已同步 */}
        <span
          role="img"
          title={t('i18n.notWatching')}
          aria-label={t('i18n.notWatching')}
          className={styles.liveIndicator}
          style={{ background: 'var(--border)' }}
        />
        <div className={styles.controls}>
          {sourceMode && isMarkdown && (
            <div ref={pickerRef} className={styles.previewPicker}>
              <button
                type="button"
                onClick={() => setPickerOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={pickerOpen}
                className={styles.previewPickerButton}
              >
                {t(`files.preview.${previewMode}`)}
                <ChevronDown size={12} />
              </button>
              {pickerOpen && (
                <>
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: 菜单外的点击热区（收起菜单） */}
                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: 同上 */}
                  <div
                    className={styles.previewPickerBackdrop}
                    onClick={() => setPickerOpen(false)}
                  />
                  <div role="menu" className={styles.previewPickerMenu}>
                    {PREVIEW_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={mode === previewMode}
                        onClick={() => {
                          setPickerOpen(false);
                          onPreviewModeChange?.(mode);
                        }}
                        className={styles.previewPickerItem}
                      >
                        <span>{t(`files.preview.${mode}`)}</span>
                        {mode === previewMode && <span className={styles.check}>✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {diffAvailable && (
            /* biome-ignore lint/a11y/useSemanticElements: 与 参考实现 同形（外层已是 flex 容器，换 fieldset 会改版式） */
            <div role="group" className={styles.modeSwitch} aria-label={t('i18n.fileViewMode')}>
              <button
                type="button"
                onClick={onShowSource}
                aria-pressed={sourceMode}
                className={styles.modeButton}
                style={{
                  background: sourceMode ? 'var(--bg)' : 'transparent',
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
                className={styles.modeButton}
                style={{
                  background: !sourceMode ? 'var(--bg)' : 'transparent',
                  color: !sourceMode ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                {t('files.viewDiff')}
              </button>
            </div>
          )}
          <div className={styles.actions}>
            {onAtMention !== undefined && (
              <button
                type="button"
                onClick={onAtMention}
                title={t('files.insertPath')}
                aria-label={t('files.mention')}
                className={styles.iconButton}
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
                className={styles.iconButton}
                style={{
                  background: tab.wrapLines ? 'var(--bg-selected)' : 'transparent',
                  color: tab.wrapLines ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                <WrapIcon />
              </button>
            )}
          </div>
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
          {!sourceMode && (
            <div className="scrollbar-subtle min-h-0 flex-1 overflow-auto">
              <DiffBlock
                patch={patch ?? ''}
                language={language}
                emptyHint={t('files.noChanges')}
                labels={{
                  codeLabel: t('code.codeLabel'),
                  wrapLabel: t('code.wrap'),
                  unwrapLabel: t('code.unwrap'),
                  copy: t('code.copy'),
                  copied: t('code.copied'),
                  collapseAria: t('diff.collapseAria'),
                  expandAria: (hidden) => t('diff.expandAria', { count: hidden }),
                  collapse: t('diff.collapse'),
                  expand: (hidden) => t('diff.expand', { count: hidden }),
                }}
              />
            </div>
          )}
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
            <div className="scrollbar-subtle flex min-h-0 flex-1 flex-col overflow-auto">
              {previewMode === 'markdown' ? (
                <div className="px-4 py-3">
                  <MarkdownView markdown={text} />
                </div>
              ) : previewMode === 'text' ? (
                <pre className={styles.plainText}>{text}</pre>
              ) : (
                <>
                  <CodeBlock
                    code={visibleCode}
                    lang={language}
                    showHeader={false}
                    lineNumbers
                    wrap={tab.wrapLines}
                    copyLabel={t('code.copy')}
                    copiedLabel={t('code.copied')}
                  />
                  {truncated && (
                    <p className="px-4 py-2 text-[11.5px] text-fg-faint">
                      {t('files.truncated', { count: MAX_RENDER_LINES })}
                    </p>
                  )}
                </>
              )}
            </div>
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
