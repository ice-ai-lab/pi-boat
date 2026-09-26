import type { SessionEntry, SessionTreeNode } from '@ice-ai/protocol';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/i18n-provider';

/** pi-web `lib/types.ts` 的 BranchPreview（B 协议树不带，字段恒缺省走 labelEntry 回退） */
interface BranchPreview {
  role?: string | null;
  text: string;
}

/** 树节点：pi-web 的 SessionTreeNode 带可选 branchPreview / compressedEntryIds（B 协议恒缺省） */
interface BranchTreeNode extends Omit<SessionTreeNode, 'children'> {
  children: BranchTreeNode[];
  compressedEntryIds?: string[];
  branchPreview?: BranchPreview;
}

interface BranchNavigatorProps {
  tree: BranchTreeNode[];
  activeLeafId: string | null;
  onLeafChange: (leafId: string | null) => void;
  /** 为 true 时渲染成工具条内联按钮（顶部下拉） */
  inline?: boolean;
  /** 内联模式下用该 ref 的包围盒定位下拉 */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** 内联模式的受控开合 */
  open?: boolean;
  /** 内联模式按钮点击回调 */
  onToggle?: () => void;
  /** 是否有活动会话（决定空态文案） */
  hasSession?: boolean;
  /** 内联时只渲染图标（无文字） */
  compact?: boolean;
  /** 内联下拉挂载但由其它控件提供触发器 */
  hideInlineButton?: boolean;
}

/**
 * BranchNavigator：逐字移植 pi-web `components/BranchNavigator.tsx`（T3-15 / C7）——
 * 连接导引线 + 7×7 三态节点圆点 + `U`/`A` 角色徽章 + `+N` 链压缩，算法内聚。
 */
// 从根到 activeLeafId 的可见路径（迭代 DFS：线性会话退化为链，递归会爆栈）
export function buildActivePath(nodes: BranchTreeNode[], targetId: string | null): Set<string> {
  if (!targetId) return new Set();
  const target = targetId;
  const stack: { node: BranchTreeNode; path: string[] }[] = nodes.map((n) => ({
    node: n,
    path: [n.entry.id],
  }));
  while (stack.length > 0) {
    const { node, path } = stack.pop() as { node: BranchTreeNode; path: string[] };
    if (node.entry.id === target || node.compressedEntryIds?.includes(target)) {
      return new Set(path);
    }
    for (const child of node.children) {
      stack.push({ node: child, path: [...path, child.entry.id] });
    }
  }
  return new Set();
}

// 会话文件的 system 消息是 prompt 而不是一轮对话，不作为分支标签
function isMessageEntry(entry: SessionEntry): boolean {
  return entry.type === 'message' && 'message' in entry && entry.message.role !== 'system';
}

// 把可见的线性链压缩到第一个分叉/叶节点
export function compressChain(node: BranchTreeNode): {
  node: BranchTreeNode;
  skipped: number;
  branchPreview?: BranchPreview;
  labelEntry: SessionEntry;
} {
  let current: BranchTreeNode = node;
  let branchPreview = current.branchPreview;
  let labelEntry: SessionEntry | null = isMessageEntry(current.entry) ? current.entry : null;
  let skipped = current.compressedEntryIds?.length ?? 0;
  while (current.children.length === 1) {
    current = current.children[0] as BranchTreeNode;
    branchPreview ??= current.branchPreview;
    if (!labelEntry && isMessageEntry(current.entry)) labelEntry = current.entry;
    skipped += 1 + (current.compressedEntryIds?.length ?? 0);
  }
  return { node: current, skipped, branchPreview, labelEntry: labelEntry ?? current.entry };
}

// 顶层行：多根（从第一条消息分叉）时根本身就是分支；否则取第一个分叉节点的子节点
export function selectTopLevelBranches(tree: BranchTreeNode[]): BranchTreeNode[] {
  if (tree.length > 1) return tree;
  if (tree.length === 0) return [];
  const first = compressChain(tree[0] as BranchTreeNode).node;
  return first.children.length > 1 ? first.children : [];
}

function getLabel(entry: SessionEntry): string {
  if (entry.type === 'message' && isMessageEntry(entry)) {
    const msg = entry.message as { role: string; content: unknown };
    const content = msg.content;
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join(' ');
    }
    if (text.length > 40) text = `${text.slice(0, 40)}…`;
    if (text) return text;
    if (msg.role === 'assistant') return '[assistant]';
  }
  return entry.type;
}

// 是否存在任何分叉（迭代：线性链深度等于条目数，递归会爆栈）
export function hasSessionBranches(nodes: BranchTreeNode[]): boolean {
  if (nodes.length > 1) return true;
  const stack: BranchTreeNode[] = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop() as BranchTreeNode;
    if (node.children.length > 1) return true;
    for (const child of node.children) stack.push(child);
  }
  return false;
}

interface TreeNodeProps {
  node: BranchTreeNode;
  activePathIds: Set<string>;
  depth: number;
  isLast: boolean;
  parentLines: boolean[]; // 各祖先深度上其后是否还有兄弟
  onSelect: (id: string) => void;
}

function TreeNodeView({
  node,
  activePathIds,
  depth,
  isLast,
  parentLines,
  onSelect,
}: TreeNodeProps) {
  const { node: rep, skipped, branchPreview, labelEntry } = compressChain(node);
  const isActive = activePathIds.has(rep.entry.id);
  const isOnPath = activePathIds.has(node.entry.id) || activePathIds.has(rep.entry.id);
  const label = branchPreview?.text ?? getLabel(labelEntry);
  const role = branchPreview
    ? (branchPreview.role ?? null)
    : isMessageEntry(labelEntry)
      ? (labelEntry as { message: { role: string } }).message.role
      : null;

  return (
    <div>
      {/* 本节点行 */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 逐字移植 pi-web 的树行（点击选叶） */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 同上——键盘用户由目录树外的分支按钮提供等价入口 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 24,
          cursor: 'pointer',
        }}
        onClick={() => onSelect(rep.entry.id)}
      >
        {/* 缩进导引线 */}
        {parentLines.map((hasLine, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 缩进导引线按深度定位，下标即身份
            key={i}
            style={{
              width: 16,
              flexShrink: 0,
              position: 'relative',
              height: '100%',
              alignSelf: 'stretch',
            }}
          >
            {hasLine && (
              <div
                style={{
                  position: 'absolute',
                  left: 7,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: 'var(--border)',
                }}
              />
            )}
          </div>
        ))}

        {/* 分叉连接线 */}
        <div
          style={{
            width: 16,
            flexShrink: 0,
            position: 'relative',
            height: '100%',
            alignSelf: 'stretch',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 7,
              top: 0,
              bottom: isLast ? '50%' : 0,
              width: 1,
              background: 'var(--border)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 7,
              top: '50%',
              width: 9,
              height: 1,
              background: 'var(--border)',
            }}
          />
        </div>

        {/* 节点圆点（三态） */}
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            flexShrink: 0,
            background: isActive
              ? 'var(--accent)'
              : isOnPath
                ? 'var(--text-muted)'
                : 'var(--border)',
            border: isActive ? 'none' : '1px solid var(--text-dim)',
            marginRight: 6,
            transition: 'background 0.12s',
          }}
        />

        {/* 角色徽章 */}
        {role && (
          <span
            style={{
              fontSize: 9,
              fontFamily: 'var(--font-mono)',
              color: role === 'user' ? 'var(--accent)' : 'var(--text-dim)',
              background: role === 'user' ? 'rgba(37,99,235,0.08)' : 'var(--bg-hover)',
              border: `1px solid ${role === 'user' ? 'rgba(37,99,235,0.2)' : 'var(--border)'}`,
              borderRadius: 3,
              padding: '0 4px',
              marginRight: 5,
              flexShrink: 0,
              lineHeight: '16px',
            }}
          >
            {role === 'user' ? 'U' : 'A'}
          </span>
        )}

        {/* 压缩计数 */}
        {skipped > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginRight: 5, flexShrink: 0 }}>
            +{skipped}
          </span>
        )}

        {/* 标签 */}
        <span
          style={{
            fontSize: 11,
            color: isActive ? 'var(--text)' : isOnPath ? 'var(--text-muted)' : 'var(--text-dim)',
            fontWeight: isActive ? 500 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
        >
          {label}
        </span>
      </div>

      {/* 子节点 */}
      {rep.children.map((child, idx) => (
        <TreeNodeView
          key={child.entry.id}
          node={child}
          activePathIds={activePathIds}
          depth={depth + 1}
          isLast={idx === rep.children.length - 1}
          parentLines={[...parentLines, !isLast]}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function BranchNavigator({
  tree,
  activeLeafId,
  onLeafChange,
  inline,
  containerRef,
  open: openProp,
  onToggle,
  hasSession,
  compact,
  hideInlineButton,
}: BranchNavigatorProps) {
  const { t } = useI18n();
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp !== undefined ? openProp : openInternal;
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    if (!open || !inline) return;
    const anchor = containerRef?.current ?? btnRef.current;
    if (!anchor) return;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom, left: rect.left, width: rect.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(anchor);
    return () => ro.disconnect();
  }, [open, inline, containerRef]);

  const activePathIds = useMemo(() => buildActivePath(tree, activeLeafId), [tree, activeLeafId]);

  const handleSelect = useCallback(
    (id: string) => {
      onLeafChange(id);
    },
    [onLeafChange],
  );

  const noBranchReason = !hasSession
    ? t('i18n.noActiveSession')
    : !hasSessionBranches(tree)
      ? t('i18n.noBranches')
      : null;

  const topLevel = selectTopLevelBranches(tree);
  const hasContent = !noBranchReason && topLevel.length > 0;

  const branchIcon = (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ color: hasContent ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0 }}
    >
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );

  const chevron = (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="var(--text-dim)"
      strokeWidth="1.6"
      aria-hidden="true"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        marginLeft: 2,
        transform: open ? 'rotate(180deg)' : 'none',
        transition: 'transform 0.15s',
      }}
    >
      <polyline points="2 3.5 5 6.5 8 3.5" />
    </svg>
  );

  if (inline) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'stretch' }}>
        <button
          ref={btnRef}
          type="button"
          onClick={() => (onToggle ? onToggle() : setOpenInternal((v) => !v))}
          style={{
            display: hideInlineButton ? 'none' : 'flex',
            alignItems: 'center',
            gap: 6,
            height: '100%',
            padding: '0 12px',
            background: open ? 'var(--bg-selected)' : 'none',
            border: 'none',
            borderTop: open ? '2px solid var(--accent)' : '2px solid transparent',
            borderRight: '1px solid var(--border)',
            cursor: 'pointer',
            color: open ? 'var(--text)' : 'var(--text-muted)',
            fontSize: 11,
            whiteSpace: 'nowrap',
            transition: 'color 0.1s, background 0.1s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = open ? 'var(--text)' : 'var(--text-muted)';
          }}
          title={t('i18n.branches')}
          aria-label={t('i18n.branches')}
          aria-pressed={open}
        >
          {branchIcon}
          {!compact && <span>{t('i18n.branches')}</span>}
        </button>
        {open && dropdownPos && (
          <div
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              background: 'var(--bg-panel)',
              borderBottom: '1px solid var(--border)',
              zIndex: 500,
            }}
          >
            {hasContent ? (
              <div style={{ padding: '4px 12px 8px 12px', maxHeight: 260, overflowY: 'auto' }}>
                {topLevel.map(
                  (child, idx): ReactNode => (
                    <TreeNodeView
                      key={child.entry.id}
                      node={child}
                      activePathIds={activePathIds}
                      depth={0}
                      isLast={idx === topLevel.length - 1}
                      parentLines={[]}
                      onSelect={handleSelect}
                    />
                  ),
                )}
              </div>
            ) : (
              <div
                style={{
                  padding: '10px 16px',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  fontStyle: 'italic',
                }}
              >
                {noBranchReason}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* 头部折叠行 */}
      <button
        type="button"
        onClick={() => setOpenInternal((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '5px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: 11,
          textAlign: 'left',
        }}
      >
        {branchIcon}
        <span style={{ color: 'var(--text-muted)' }}>{t('i18n.branches')}</span>
        {chevron}
      </button>

      {/* 树面板 - 覆盖层 */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 100,
          }}
        >
          {hasContent ? (
            <div style={{ padding: '4px 12px 8px 12px', maxHeight: 260, overflowY: 'auto' }}>
              {topLevel.map((child, idx) => (
                <TreeNodeView
                  key={child.entry.id}
                  node={child}
                  activePathIds={activePathIds}
                  depth={0}
                  isLast={idx === topLevel.length - 1}
                  parentLines={[]}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: '10px 16px',
                fontSize: 12,
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}
            >
              {noBranchReason ?? t('i18n.noBranches')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
