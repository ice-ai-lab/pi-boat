import { useI18n } from '../i18n/i18n-provider';
import { ModelSelector, type ModelSelectorOption } from './model-selector';
import { ToolPresetMenu } from './tool-preset-menu';

/**
 * ComposerToolbar（T2-6/T2-5）：输入卡内工具行的**左簇**——`＋ · 模型+推理等级 · 工具预设 ·
 * 压缩 · 提示音`（原型 `.card-foot` 里 spacer 左侧的那一段）。
 *
 * 右侧的「停止 / 引导 / 后续消息 / 发送」动作归 `Composer` 自己渲染（它才有草稿与流式状态），
 * 本组件因此不再持 spacer 与右对齐：它在卡内是以 `flex` 顺序排布的一段。
 *
 * 与设计规范一致的取舍：`自动命名 / 导出 / 统计` 三个入口**不在这里**（前两者属于顶栏工具条，
 * 统计是输入卡下方的指标行）。
 */

export interface ComposerToolbarProps {
  /** 左-1：附件按钮（30×30，有图时 accent 色） */
  attachedCount: number;
  onAttachClick(): void;
  /** 左-2：模型 + 推理等级合并控件 */
  modelOptions: ModelSelectorOption[];
  model: { provider: string; modelId: string } | null;
  onModelChange(provider: string, modelId: string): void;
  modelBusy: boolean;
  thinkingLevel: string | null;
  thinkingLevels: string[];
  onThinkingLevelChange(level: string): void;
  /** 左-3：工具预设 */
  toolPreset: string | null;
  toolPresets: { value: string; label: string }[];
  onToolPresetChange(preset: string): void;
  /** 左-4：压缩（`showCompact` 为 false 时整块隐藏——空态没有会话上下文可压缩） */
  compacting: boolean;
  showCompact?: boolean;
  onCompact(): void;
  onAbortCompaction(): void;
  /** 左-5：提示音开关（SVG 两态） */
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
  soundEnabled,
  onToggleSound,
}: ComposerToolbarProps) {
  const { t } = useI18n();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      {/* ＋：原型 `.plus`（32px 圆形热区，图标 17px） */}
      <button
        type="button"
        title={t('chat.attachImage')}
        aria-label={t('chat.attachImage')}
        onClick={onAttachClick}
        style={{
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          width: 32,
          height: 32,
          padding: 0,
          background: 'none',
          border: 'none',
          borderRadius: 999,
          color: attachedCount > 0 ? 'var(--accent)' : 'var(--text-muted)',
          cursor: 'pointer',
          transition: 'background 0.14s, color 0.14s',
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
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {(modelOptions.length > 0 || model !== null) && (
        <ModelSelector
          options={modelOptions}
          value={model}
          onChange={onModelChange}
          level={thinkingLevel}
          levels={thinkingLevels}
          onLevelChange={onThinkingLevelChange}
          disabled={false}
          busy={modelBusy}
        />
      )}

      <ToolPresetMenu
        toolPreset={toolPreset}
        toolPresets={toolPresets}
        onToolPresetChange={onToolPresetChange}
      />

      {showCompact && (
        <button
          type="button"
          title={compacting ? t('chat.stopCompaction') : t('chat.compactContext')}
          aria-label={compacting ? t('chat.stopCompaction') : t('chat.compactContext')}
          onClick={compacting ? onAbortCompaction : onCompact}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 30,
            padding: '0 10px',
            background: compacting ? 'var(--red-bg)' : 'none',
            border: 'none',
            borderRadius: 10,
            color: compacting ? 'var(--red)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 12,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'background 0.14s, color 0.14s',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = compacting
              ? 'color-mix(in srgb, var(--red) 20%, transparent)'
              : 'var(--bg-hover)';
            event.currentTarget.style.color = compacting ? 'var(--red)' : 'var(--text)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = compacting ? 'var(--red-bg)' : 'none';
            event.currentTarget.style.color = compacting ? 'var(--red)' : 'var(--text-muted)';
          }}
        >
          {compacting ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
              aria-hidden="true"
            >
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <line x1="8.12" y1="8.12" x2="20" y2="20" />
              <line x1="8.12" y1="15.88" x2="20" y2="4" />
            </svg>
          )}
          <span style={{ whiteSpace: 'nowrap' }}>
            {compacting ? t('chat.compacting') : t('chat.compact')}
          </span>
        </button>
      )}

      {/* 提示音（原型 `.cbar--icon`：30×30 图标键） */}
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
          width: 30,
          height: 30,
          padding: 0,
          background: 'none',
          border: 'none',
          borderRadius: 10,
          color: soundEnabled ? 'var(--text-muted)' : 'var(--text-dim)',
          cursor: 'pointer',
          opacity: soundEnabled ? 1 : 0.55,
          flexShrink: 0,
          transition: 'background 0.14s, color 0.14s, opacity 0.14s',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = 'var(--bg-hover)';
          event.currentTarget.style.color = 'var(--text)';
          event.currentTarget.style.opacity = '1';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = 'none';
          event.currentTarget.style.color = soundEnabled ? 'var(--text-muted)' : 'var(--text-dim)';
          event.currentTarget.style.opacity = soundEnabled ? '1' : '0.55';
        }}
      >
        {soundEnabled ? (
          <svg
            width="13"
            height="13"
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
            width="13"
            height="13"
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
  );
}
