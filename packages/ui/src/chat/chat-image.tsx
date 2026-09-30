import { useI18n } from '../i18n/i18n-provider';

/**
 * 消息里的图片（用户附件 / 工具结果）。`src` 由 client 层算好：
 * 实时路径是 `data:` URL，`deferMedia` 的历史是惰性端点 URL（ADR-0024）。
 *
 * 点击在新标签打开原图——设计规范的灯箱（`image-preview-dialog`）是 T3-9，
 * 本组件不假装提供它（AGENTS.md：命名不得暗示做不到的事）。
 */
function ChatImage({ src }: { src: string }) {
  const { t } = useI18n();
  const label = t('chat.previewImage');
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
      style={{ display: 'inline-block', lineHeight: 0, flexShrink: 0 }}
    >
      <img
        src={src}
        alt={label}
        style={{
          maxWidth: 240,
          maxHeight: 240,
          borderRadius: 8,
          border: '1px solid var(--border)',
          objectFit: 'contain',
          background: 'var(--bg-subtle)',
        }}
      />
    </a>
  );
}

/** 一组图片（横向换行排列，240×240 上限） */
export function ChatImageList({ sources }: { sources: string[] }) {
  if (sources.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {sources.map((src) => (
        <ChatImage key={src} src={src} />
      ))}
    </div>
  );
}
