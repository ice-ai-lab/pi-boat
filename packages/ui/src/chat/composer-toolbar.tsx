import type { CSSProperties } from 'react';
import { useI18n } from '../i18n/i18n-provider';
import { ComposerMenus } from './composer-menus';
import { ModelSelector, type ModelSelectorOption } from './model-selector';

/**
 * ComposerToolbar（T2-6/T2-5）：输入卡**下方**的工具行，按设计规范 `ChatInput.tsx` 底部行
 * 的三段式布局——`左区（附件 + 模型选择器） ── flex:1 spacer ── 右区（思考 / 预设 / 压缩 /
 * [停止] / 声音）`。
 *
 * 与设计规范一致的取舍：`自动命名 / 导出 / 统计` 三个文字按钮**不在这里**（它们属于顶栏工具条），
 * 流式中右区只留红色停止与声音（思考/预设/压缩被 `!isStreaming` 守卫掉）。
 */

/** 设计规范底部工具条的按钮规格：32px 高 / 9px 圆角 / 12px 字 / text-muted */
const BAR_BUTTON: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  height: 32,
  padding: '8px 12px',
  background: 'none',
  border: 'none',
  borderRadius: 9,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 12,
  flexShrink: 0,
  transition: 'background 0.12s, color 0.12s',
};

export interface ComposerToolbarProps {
  /** 左-1：附件按钮（32×32，有图时 accent 色） */
  attachedCount: number;
  onAttachClick(): void;
  /** 左-2：模型选择器 */
  modelOptions: ModelSelectorOption[];
  model: { provider: string; modelId: string } | null;
  onModelChange(provider: string, modelId: string): void;
  modelBusy: boolean;
  /** 右区菜单（思考档位 + 工具预设） */
  thinkingLevel: string | null;
  thinkingLevels: string[];
  onThinkingLevelChange(level: string): void;
  toolPreset: string | null;
  toolPresets: { value: string; label: string }[];
  onToolPresetChange(preset: string): void;
  /** 右区：压缩（`showCompact` 为 false 时整块隐藏——空态没有会话上下文可压缩） */
  compacting: boolean;
  showCompact?: boolean;
  onCompact(): void;
  onAbortCompaction(): void;
  /** 右-7：流式中的红色停止 */
  streaming: boolean;
  onAbort(): void;
  /** 右-8：声音开关（SVG 两态） */
  soundEnabled: boolean;
  onToggleSound(): void;
}

export function ComposerToolbar({
  attachedCount,
  onAttachClick,
  modelOptions,
  model,
  onModelChange,
  modelBusy,
  thinkingLevel,
  thinkingLevels,
  onThinkingLevelChange,
  toolPreset,
  toolPresets,
  onToolPresetChange,
  compacting,
  showCompact = true,
  onCompact,
  onAbortCompaction,
  streaming,
  onAbort,
  soundEnabled,
  onToggleSound,
}: ComposerToolbarProps) {
  const { t } = useI18n();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* 左区：附件 + 模型选择器 */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          type="button"
          title={t('chat.attachImage')}
          aria-label={t('chat.attachImage')}
          onClick={onAttachClick}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            padding: 0,
            background: 'none',
            border: 'none',
            borderRadius: 9,
            color: attachedCount > 0 ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = 'var(--bg-hover)';
            event.currentTarget.style.color = attachedCount > 0 ? 'var(--accent)' : 'var(--text)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = 'none';
            event.currentTarget.style.color =
              attachedCount > 0 ? 'var(--accent)' : 'var(--text-muted)';
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
        {(modelOptions.length > 0 || model !== null) && (
          <ModelSelector
            options={modelOptions}
            value={model}
            onChange={onModelChange}
            disabled={streaming}
            busy={modelBusy}
          />
        )}
      </div>

      {/* 中区 spacer */}
      <div style={{ flex: 1 }} />

      {/* 右区 */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 2,
        }}
      >
        <ComposerMenus
          thinkingLevel={thinkingLevel}
          thinkingLevels={thinkingLevels}
          onThinkingLevelChange={onThinkingLevelChange}
          toolPreset={toolPreset}
          toolPresets={toolPresets}
          onToolPresetChange={onToolPresetChange}
          streaming={streaming}
        />

        {!streaming && showCompact && (
          <button
            type="button"
            title={compacting ? t('chat.stopCompaction') : t('chat.compactContext')}
            aria-label={compacting ? t('chat.stopCompaction') : t('chat.compactContext')}
            onClick={compacting ? onAbortCompaction : onCompact}
            style={{
              ...BAR_BUTTON,
              background: compacting ? 'rgba(239,68,68,0.08)' : 'none',
              color: compacting ? 'var(--red)' : 'var(--text-muted)',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = compacting
                ? 'rgba(239,68,68,0.16)'
                : 'var(--bg-hover)';
              event.currentTarget.style.color = compacting ? 'var(--red)' : 'var(--text)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = compacting ? 'rgba(239,68,68,0.08)' : 'none';
              event.currentTarget.style.color = compacting ? 'var(--red)' : 'var(--text-muted)';
            }}
          >
            {compacting ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="10" y1="14" x2="3" y2="21" />
                <line x1="21" y1="3" x2="14" y2="10" />
              </svg>
            )}
            <span style={{ whiteSpace: 'nowrap' }}>
              {compacting ? t('chat.compacting') : t('chat.compact')}
            </span>
          </button>
        )}

        {streaming && (
          <button
            type="button"
            title={t('chat.stopAgent')}
            aria-label={t('chat.stop')}
            onClick={onAbort}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
              padding: '8px 14px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 9,
              color: 'var(--red)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 0.12s',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = 'rgba(239,68,68,0.16)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'rgba(239,68,68,0.08)';
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" fill="currentColor" />
            </svg>
            {t('chat.stop')}
          </button>
        )}

        <button
          type="button"
          title={soundEnabled ? t('chat.disableSound') : t('chat.enableSound')}
          aria-label={soundEnabled ? t('chat.disableSound') : t('chat.enableSound')}
          aria-pressed={soundEnabled}
          onClick={onToggleSound}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            padding: 0,
            background: 'none',
            border: 'none',
            borderRadius: 9,
            color: soundEnabled ? 'var(--text-muted)' : 'var(--text-dim)',
            cursor: 'pointer',
            opacity: soundEnabled ? 1 : 0.55,
            flexShrink: 0,
            transition: 'background 0.12s, color 0.12s, opacity 0.12s',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = 'var(--bg-hover)';
            event.currentTarget.style.color = 'var(--text)';
            event.currentTarget.style.opacity = '1';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = 'none';
            event.currentTarget.style.color = soundEnabled
              ? 'var(--text-muted)'
              : 'var(--text-dim)';
            event.currentTarget.style.opacity = soundEnabled ? '1' : '0.55';
          }}
        >
          {soundEnabled ? (
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
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : (
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
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
