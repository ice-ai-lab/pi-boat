import { getFileName } from '@ice-ai/client';
import { getFileIcon } from '../files/file-icon';
import { useI18n } from '../i18n/i18n-provider';

/**
 * TurnWrittenFiles（docs/06 §4.2 / docs/10 C14）：本轮写出的文件（从写类工具参数抽取，
 * client 层算好、按轮传入）。点击文件在右栏打开（宿主回传）。
 *
 * 形态按 参考实现 `components/TurnWrittenFiles.tsx`：一行 chip（`--bg-subtle` 底 + 1px 描边 +
 * 圆角 6 + mono 12 + 12px 文件图标 + **文件名**，完整路径只留在 `title`），内联在助手消息末尾；
 * 无标题行，「改动的文件」只作为列表的 `aria-label`。
 */
export interface TurnWrittenFilesProps {
  paths: string[];
  onOpen(path: string): void;
}

export function TurnWrittenFiles({ paths, onOpen }: TurnWrittenFilesProps) {
  const { t } = useI18n();
  if (paths.length === 0) return null;
  return (
    <ul
      aria-label={t('chat.filesWritten')}
      className="mt-[6px] flex flex-wrap items-center gap-[6px]"
    >
      {paths.map((path) => {
        const name = getFileName(path);
        return (
          <li key={path}>
            <button
              type="button"
              title={path}
              aria-label={t('chat.openWrittenFile', { name })}
              onClick={() => onOpen(path)}
              className="inline-flex cursor-pointer items-center gap-[4px] rounded-[6px] border border-border bg-bg-subtle px-[8px] py-[2px] font-mono text-[12px] text-text"
            >
              {getFileIcon(name, 12)}
              <span>{name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
