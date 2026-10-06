import type { FileListEntry } from '@ice-ai/protocol';
import { FileTypeIcon } from '../code/file-type-icon';
import { IconFolderCloseRegular, IconFolderOpenRegular } from '../code/icons';
import { useI18n } from '../i18n/i18n-provider';
import styles from './file-tree.module.css';

/**
 * FileTree——按 DSH `ui-sidebar-files` 的 FilesBody 重做（MIT，逻辑同形、接线本地化）：
 * - 目录优先，同组内 `Intl.Collator` 自然序（`file2` < `file10`），大小写不敏感；
 * - 每层一个 `<ul>`，子层缩进 18px；行内 hover 底色、目录三级墨色开合图标、文件彩色类型图标；
 * - 折叠层缓存已列条目（重开秒出），失败/空目录各占一行注记；
 * - 与 DSH 对齐：行内不放 hover 动作（提及/下载走查看器与工具行），git 徽标进「变更文件」区。
 */
export interface FileTreeProps {
  /** 根目录绝对路径（展示与相对路径基准） */
  root: string;
  /** 已加载的目录内容：绝对路径 → 条目 */
  entriesByPath: ReadonlyMap<string, FileListEntry[]>;
  /** 正在加载的目录 */
  loadingPaths?: ReadonlySet<string>;
  /** 列目录失败的目录：绝对路径 → 错误文案（在该层位置出一行注记） */
  errorsByPath?: ReadonlyMap<string, string>;
  expandedPaths: ReadonlySet<string>;
  activePath?: string | null;
  onToggleDir(path: string): void;
  onOpenFile(path: string): void;
}

/** 自然、大小写不敏感的名称序（DSH `byName` 同款 Collator）。 */
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** 目录优先，再按名称自然序（DSH `orderEntries` 同形）。 */
export function orderEntries(entries: readonly FileListEntry[]): FileListEntry[] {
  return [...entries].sort((left, right) => {
    const group = Number(right.type === 'directory') - Number(left.type === 'directory');
    return group !== 0 ? group : byName.compare(left.name, right.name);
  });
}

/** 一层的行表：加载中 / 失败 / 空 / 条目 / 被忽略注记。 */
function Level({ path, tree }: { path: string; tree: FileTreeProps }) {
  const { t } = useI18n();
  const level = tree.entriesByPath.get(path);
  const error = tree.errorsByPath?.get(path);

  if (level === undefined) {
    return <li className={styles.note}>{t('files.treeLoading')}</li>;
  }
  if (tree.loadingPaths?.has(path) === true && level.length === 0) {
    return <li className={styles.note}>{t('files.treeLoading')}</li>;
  }
  if (level.length === 0 && error === undefined) {
    return <li className={styles.note}>{t('files.treeEmpty')}</li>;
  }
  return (
    <>
      {error !== undefined && <li className={styles.note}>{error}</li>}
      {orderEntries(level).map((entry) => (
        <Entry key={entry.name} entry={entry} tree={tree} />
      ))}
    </>
  );
}

/** 一条目：目录切换 / 文件打开（协议只有这两种；防御分支不出）。 */
function Entry({ entry, tree }: { entry: FileListEntry; tree: FileTreeProps }) {
  const path = entry.path;
  if (entry.type === 'directory') {
    const expanded = tree.expandedPaths.has(path);
    return (
      <li className={styles.item}>
        <button
          type="button"
          className={styles.row}
          aria-expanded={expanded}
          onClick={() => tree.onToggleDir(path)}
        >
          <span className={styles.icon}>
            {expanded ? <IconFolderOpenRegular size={16} /> : <IconFolderCloseRegular size={16} />}
          </span>
          <span className={styles.name} title={entry.name}>
            {entry.name}
          </span>
        </button>
        {expanded && (
          <ul className={styles.level}>
            <Level path={path} tree={tree} />
          </ul>
        )}
      </li>
    );
  }
  return (
    <li className={styles.item}>
      <button
        type="button"
        className={`${styles.row}${tree.activePath === path ? ` ${styles.rowActive}` : ''}`}
        onClick={() => tree.onOpenFile(path)}
      >
        <span className={styles.fileIcon}>
          <FileTypeIcon path={entry.name} size={16} />
        </span>
        <span className={styles.name} title={entry.name}>
          {entry.name}
        </span>
      </button>
    </li>
  );
}

/** 文件树本体：根层 + 已展开的各层。 */
export function FileTree(props: FileTreeProps) {
  const { t } = useI18n();
  const rootLevel = props.entriesByPath.get(props.root);
  if (rootLevel === undefined && props.loadingPaths?.has(props.root) !== true) {
    return <p className={styles.note}>{t('files.treeLoading')}</p>;
  }
  return (
    <ul className={styles.level}>
      <Level path={props.root} tree={props} />
    </ul>
  );
}
