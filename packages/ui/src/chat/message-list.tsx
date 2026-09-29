import type { ChatState } from '@ice-ai/client';
import {
  captureScrollDistance,
  extractTurnWrittenFiles,
  getLiveFollowAttached,
  restoreScrollTop,
  shouldShowScrollToLatest,
} from '@ice-ai/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../utils/cn';
import { useScrollbarVisibility } from '../utils/use-scrollbar-visibility';
import { AssistantTurn, UserBubble } from './assistant-turn';
import styles from './chat.module.css';

/**
 * MessageList（docs/06 §4.2 / §8.2）：吸附模型滚动 + 历史懒加载。
 * 滚动判定的纯函数在 `@ice-ai/client`（chat-lazy-load，有单测）；本组件只做 DOM 接线：
 * - 贴底/重吸/上滚脱离 → getLiveFollowAttached
 * - 向上翻页前后按「距底部距离」还原视口 → capture/restoreScrollDistance（防跳动）
 */
export interface MessageListProps {
  chat: ChatState;
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?(): void;
  /** 助手消息末尾的「本轮改动」chip 点击（宿主在右栏打开该文件） */
  onOpenWrittenFile(path: string): void;
  /**
   * 顶部内边距（CSS 长度，如 `calc(36px + env(safe-area-inset-top))`）。宿主把工具条做成
   * 覆盖层时传它，让首条消息起始位置避开工具条；消息仍会滚到覆盖层下方（毛玻璃背板）。
   * 不传则沿用 16px。
   */
  topInset?: string;
}

/** 距顶部多少像素内触发自动翻页 */
const AUTO_LOAD_THRESHOLD_PX = 80;

export function MessageList({
  chat,
  hasOlder = false,
  loadingOlder = false,
  onLoadOlder,
  onOpenWrittenFile,
  topInset,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const attachedRef = useRef(true);
  const prevTopRef = useRef(0);
  const turnCountRef = useRef(0);
  /** 向上翻页前记下的「距底部距离」，内容前插后还原 */
  const pendingAnchorRef = useRef<number | null>(null);

  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current;
    if (el === null) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    attachedRef.current = true;
    setShowJump(false);
  }, []);

  const requestOlder = useCallback(() => {
    const el = scrollRef.current;
    if (el === null || onLoadOlder === undefined) return;
    pendingAnchorRef.current = captureScrollDistance(el.scrollHeight, el.scrollTop);
    onLoadOlder();
  }, [onLoadOlder]);

  const syncJump = useCallback((el: HTMLDivElement) => {
    setShowJump(shouldShowScrollToLatest(el.scrollTop, el.clientHeight, el.scrollHeight));
  }, []);

  // 内容变化：优先还原翻页锚点；否则吸附跟随；自己发消息（轮数增加）强制回底
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const anchor = pendingAnchorRef.current;
    if (anchor !== null) {
      pendingAnchorRef.current = null;
      const heightBefore = el.scrollHeight;
      el.scrollTop = restoreScrollTop(heightBefore, anchor);
      // markdown/代码块异步排版会继续增高：下一帧按差量再补一次，避免视口漂移
      requestAnimationFrame(() => {
        const delta = el.scrollHeight - heightBefore;
        if (delta !== 0 && pendingAnchorRef.current === null) el.scrollTop += delta;
      });
      prevTopRef.current = el.scrollTop;
      syncJump(el);
      return;
    }
    const turnCount = chat.turns.length;
    const forced = turnCount > turnCountRef.current;
    turnCountRef.current = turnCount;
    if (forced) {
      scrollToBottom('smooth');
      return;
    }
    if (attachedRef.current) scrollToBottom();
    syncJump(el);
  }, [chat, scrollToBottom, syncJump]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el === null) return;
    attachedRef.current = getLiveFollowAttached(
      attachedRef.current,
      prevTopRef.current,
      el.scrollTop,
      el.clientHeight,
      el.scrollHeight,
    );
    prevTopRef.current = el.scrollTop;
    syncJump(el);
    if (
      el.scrollTop < AUTO_LOAD_THRESHOLD_PX &&
      hasOlder &&
      !loadingOlder &&
      onLoadOlder !== undefined &&
      pendingAnchorRef.current === null
    ) {
      requestOlder();
    }
  }, [hasOlder, loadingOlder, onLoadOlder, requestOlder, syncJump]);

  useScrollbarVisibility(scrollRef);

  // 每轮写出的文件（docs/10 C14）：在助手消息末尾内联 chip，故按 turnId 索引
  const writtenByTurn = useMemo(() => {
    const byTurn = new Map<string, string[]>();
    for (const group of extractTurnWrittenFiles(chat.turns)) byTurn.set(group.turnId, group.paths);
    return byTurn;
  }, [chat.turns]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        data-chat-scroll=""
        className="scrollbar-subtle min-w-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] [overflow-anchor:none]"
        style={{ paddingTop: topInset === undefined ? 16 : `calc(16px + ${topInset})` }}
        aria-live="polite"
      >
        {/* 正文列：`--chat-content-max-width` 居中栏 + 16px 列内边距 */}
        <div style={{ minWidth: 0, padding: '0 16px' }}>
          <div
            style={{
              width: '100%',
              minWidth: 0,
              maxWidth: 'var(--chat-content-max-width, 1150px)',
              margin: '0 auto',
            }}
          >
            {(hasOlder || loadingOlder) && (
              <div className="mb-3 flex justify-center">
                <button
                  type="button"
                  onClick={requestOlder}
                  disabled={loadingOlder}
                  className={cn(
                    'rounded-[5px] border border-border bg-bg px-2.5 py-1 text-[11px] text-text-muted hover:bg-bg-hover hover:text-text',
                    loadingOlder && 'opacity-60',
                  )}
                >
                  {loadingOlder ? '加载中…' : '加载更早的消息'}
                </button>
              </div>
            )}
            {chat.turns.map((turn, index) => (
              <div key={turn.id} data-turn-index={index}>
                {turn.orphan !== true && <UserBubble turn={turn} />}
                <AssistantTurn
                  turn={turn}
                  streaming={chat.streaming}
                  writtenPaths={writtenByTurn.get(turn.id) ?? []}
                  onOpenFile={onOpenWrittenFile}
                />
              </div>
            ))}
            <div style={{ height: 16 }} />
          </div>
        </div>
      </div>
      {/* 设计规范 的外层 wrapper 定位：贴住消息区底部、居中 */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          paddingBottom: 10,
          pointerEvents: 'none',
          zIndex: 20,
        }}
      >
        <button
          type="button"
          aria-label="回到底部"
          title="回到底部"
          onClick={() => scrollToBottom('smooth')}
          className={cn(styles.scrollToBottom, showJump && styles.isVisible)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="5 12 12 19 19 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
