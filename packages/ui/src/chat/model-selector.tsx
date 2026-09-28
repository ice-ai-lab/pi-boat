import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/i18n-provider';

/**
 * ModelSelector（T2-1 + 原型 §8b「模型 + 推理等级合并控件」）：按设计规范 `ModelSelector.tsx`
 * 的整体移植（桌面向），视觉按原型 `.cbar--model` / `.menu--drill`。
 *
 * 收起态是**一个**控件：`[芯片图标] 模型 id [推理等级胶囊] ⌄`；展开后是两级菜单
 * ——根页两行（模型 / 推理等级）各进一个二级列表，二级页顶部带返回按钮。
 *
 * 差异只两处：①去掉 `useIsMobile`（移动端布局是排除域，ADR-0014）；
 * ②文案走本仓 i18n。⛔ **composer 不引入 `ProviderIcon`**——设计规范的 43 条 provider 映射
 * 只服务设置页的 provider 树（ADR-0020 以「组件层结构对齐」为准，不是把设置页的装饰搬进对话）。
 */
export interface ModelSelectorOption {
  provider: string;
  modelId: string;
  name: string;
}

export interface ModelSelectorProps {
  options: ModelSelectorOption[];
  value: { provider: string; modelId: string } | null;
  onChange(provider: string, modelId: string): void;
  /** 推理等级（与模型同控件，二级列表里选） */
  level: string | null;
  levels: string[];
  onLevelChange(level: string): void;
  disabled?: boolean;
  busy?: boolean;
}

const MODEL_FILTER_THRESHOLD = 8;
const MODEL_OPTION_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** 档位描述 key（原型二级列表右侧的说明） */
const THINKING_DESC_KEYS: Record<string, string> = {
  auto: 'chat.thinkingUseDefault',
  off: 'chat.thinkingOff',
  minimal: 'chat.thinkingMinimal',
  low: 'chat.thinkingLow',
  medium: 'chat.thinkingMedium',
  high: 'chat.thinkingHigh',
  xhigh: 'chat.thinkingXhigh',
  max: 'chat.thinkingMax',
};

function compareModelOptions(a: ModelSelectorOption, b: ModelSelectorOption): number {
  return (
    MODEL_OPTION_COLLATOR.compare(a.name || a.modelId, b.name || b.modelId) ||
    MODEL_OPTION_COLLATOR.compare(a.provider, b.provider) ||
    MODEL_OPTION_COLLATOR.compare(a.modelId, b.modelId)
  );
}

export function filterModelOptions(
  options: ModelSelectorOption[],
  query: string,
): ModelSelectorOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return options;
  return options.filter((option) =>
    `${option.name} ${option.modelId}`.toLocaleLowerCase().includes(normalizedQuery),
  );
}

/** 二级页：根页（模型 / 推理等级入口）→ 各自列表 */
type DrillPage = 'root' | 'models' | 'levels';

export function ModelSelector({
  options,
  value,
  onChange,
  level,
  levels,
  onLevelChange,
  disabled = false,
  busy = false,
}: ModelSelectorProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<DrillPage>('root');
  const [anchorRect, setAnchorRect] = useState<{
    top: number;
    right: number;
    bottom: number;
    left: number;
    width: number;
  } | null>(null);
  const [filter, setFilter] = useState('');
  const locked = disabled || busy;
  const sortedOptions = useMemo(() => [...options].sort(compareModelOptions), [options]);
  const filteredOptions = filterModelOptions(sortedOptions, filter);
  const showFilter = sortedOptions.length > MODEL_FILTER_THRESHOLD;
  const modelsByProvider: { provider: string; options: ModelSelectorOption[] }[] = [];
  for (const option of filteredOptions) {
    const group = modelsByProvider.find((item) => item.provider === option.provider);
    if (group) group.options.push(option);
    else modelsByProvider.push({ provider: option.provider, options: [option] });
  }

  const currentName = value
    ? (sortedOptions.find(
        (option) => option.modelId === value.modelId && option.provider === value.provider,
      )?.name ?? value.modelId)
    : sortedOptions.length > 0
      ? t('chat.selectModel')
      : t('chat.noModels');

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node) &&
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setFilter('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!locked) return;
    setOpen(false);
    setFilter('');
  }, [locked]);

  // 每次展开都从根页开始（与原型一致的二级回退语义）
  useEffect(() => {
    if (!open) setPage('root');
  }, [open]);

  const close = () => {
    setOpen(false);
    setFilter('');
  };

  const chooseModel = (option: ModelSelectorOption) => {
    const active = option.modelId === value?.modelId && option.provider === value?.provider;
    close();
    if (!active) onChange(option.provider, option.modelId);
  };

  const chooseLevel = (candidate: string) => {
    close();
    if (candidate !== level) onLevelChange(candidate);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 按设计规范，Esc 关面板挂在根容器上
    <div
      ref={rootRef}
      style={{ position: 'relative', minWidth: 0 }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        event.stopPropagation();
        if (page !== 'root') {
          setPage('root');
          return;
        }
        close();
      }}
    >
      {/* 原型 `.cbar--model`：30px 高 / 等宽模型 id / 等级胶囊 / 尾部 chevron */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-busy={busy || undefined}
        disabled={locked}
        title={
          busy
            ? t('chat.switchingModel')
            : locked
              ? currentName
              : sortedOptions.length > 0
                ? t('chat.changeModel')
                : t('chat.noModels')
        }
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          maxWidth: 260,
          height: 30,
          padding: '0 10px',
          overflow: 'hidden',
          border: 'none',
          borderRadius: 10,
          background: open ? 'var(--bg-hover)' : 'none',
          color: 'var(--text-muted)',
          cursor: locked ? 'not-allowed' : 'pointer',
          opacity: locked ? 0.5 : 1,
          transition: 'background 0.14s, color 0.14s',
        }}
        onMouseEnter={(event) => {
          if (locked) return;
          event.currentTarget.style.background = 'var(--bg-hover)';
          event.currentTarget.style.color = 'var(--text)';
        }}
        onMouseLeave={(event) => {
          if (locked) {
            event.currentTarget.style.background = 'none';
            event.currentTarget.style.color = 'var(--text-muted)';
            return;
          }
          event.currentTarget.style.background = open ? 'var(--bg-hover)' : 'none';
          event.currentTarget.style.color = 'var(--text-muted)';
        }}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchorRect({
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
          });
          setOpen((current) => {
            if (current) setFilter('');
            return !current;
          });
        }}
      >
        {busy ? (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            className="animate-spin"
            style={{ flexShrink: 0 }}
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          </svg>
        ) : (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
            <line x1="9" y1="1" x2="9" y2="4" />
            <line x1="15" y1="1" x2="15" y2="4" />
            <line x1="9" y1="20" x2="9" y2="23" />
            <line x1="15" y1="20" x2="15" y2="23" />
            <line x1="20" y1="9" x2="23" y2="9" />
            <line x1="20" y1="14" x2="23" y2="14" />
            <line x1="1" y1="9" x2="4" y2="9" />
            <line x1="1" y1="14" x2="4" y2="14" />
          </svg>
        )}
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
          }}
        >
          {currentName}
        </span>
        {level !== null && levels.length > 0 && (
          <span
            style={{
              flexShrink: 0,
              padding: '1.5px 6px',
              borderRadius: 6,
              background: 'var(--user-bg)',
              color: 'var(--accent)',
              fontSize: 11,
              fontWeight: 650,
            }}
          >
            {level}
          </span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-dim)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        anchorRect &&
        (() => {
          const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
          const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
          const spaceAbove = anchorRect.top - 8;
          const spaceBelow = viewportHeight - anchorRect.bottom - 8;
          const openAbove = spaceAbove > spaceBelow;
          const maxHeight = Math.max(
            120,
            Math.min(openAbove ? spaceAbove : spaceBelow, viewportHeight * 0.6),
          );
          const verticalPosition = openAbove
            ? { bottom: viewportHeight - anchorRect.top + 8 }
            : { top: anchorRect.bottom + 8 };
          const horizontalPosition: CSSProperties = {
            left: anchorRect.left,
            width: 'max-content',
            minWidth: Math.max(anchorRect.width, page === 'root' ? 268 : 0),
            maxWidth: Math.max(anchorRect.width, viewportWidth - anchorRect.left - 8),
          };

          return (
            <div
              ref={panelRef}
              role="listbox"
              style={{
                position: 'fixed',
                ...verticalPosition,
                ...horizontalPosition,
                zIndex: 500,
                display: 'flex',
                flexDirection: 'column',
                maxHeight,
                overflow: 'hidden',
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: 'var(--bg)',
                boxShadow: openAbove
                  ? '0 -4px 16px rgba(0,0,0,0.10)'
                  : '0 4px 16px rgba(0,0,0,0.10)',
              }}
            >
              {page === 'root' ? (
                <div style={{ padding: 5, minWidth: 268 }}>
                  <DrillRow
                    label={t('chat.modelLabel')}
                    value={currentName}
                    onClick={() => setPage('models')}
                  />
                  {levels.length > 0 && (
                    <DrillRow
                      label={t('chat.reasoningLabel')}
                      value={level ?? ''}
                      onClick={() => setPage('levels')}
                    />
                  )}
                </div>
              ) : (
                <>
                  <DrillHead
                    title={page === 'models' ? t('chat.modelLabel') : t('chat.reasoningLabel')}
                    backLabel={t('chat.back')}
                    onBack={() => setPage('root')}
                  />
                  {page === 'models' && showFilter && (
                    <div style={{ flexShrink: 0, padding: '0 8px 6px' }}>
                      <input
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        placeholder={t('chat.filterModels')}
                        aria-label={t('chat.filterModels')}
                        // biome-ignore lint/a11y/noAutofocus: 面板刚打开，筛选框应直接可用（设计规范同款）
                        autoFocus
                        autoComplete="off"
                        spellCheck={false}
                        style={{
                          boxSizing: 'border-box',
                          width: '100%',
                          minWidth: 220,
                          padding: '5px 8px',
                          border: '1px solid var(--border)',
                          borderRadius: 5,
                          outline: 'none',
                          background: 'var(--bg)',
                          color: 'var(--text)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                        }}
                      />
                    </div>
                  )}
                  <div style={{ minHeight: 0, overflowY: 'auto' }}>
                    {page === 'models' ? (
                      modelsByProvider.length === 0 ? (
                        <div
                          style={{
                            padding: '8px 12px',
                            color: 'var(--text-dim)',
                            fontSize: 12,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {filter.trim() ? t('chat.noMatchingModels') : t('chat.noModels')}
                        </div>
                      ) : (
                        modelsByProvider.map((group) => (
                          <div key={group.provider}>
                            {modelsByProvider.length > 1 && (
                              <div
                                style={{
                                  padding: '6px 12px 4px',
                                  color: 'var(--text-dim)',
                                  fontSize: 10,
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                }}
                              >
                                {group.provider}
                              </div>
                            )}
                            {group.options.map((option) => (
                              <MenuRow
                                key={`${option.provider}:${option.modelId}`}
                                active={
                                  option.modelId === value?.modelId &&
                                  option.provider === value?.provider
                                }
                                label={option.name}
                                mono
                                onClick={() => chooseModel(option)}
                              />
                            ))}
                          </div>
                        ))
                      )
                    ) : (
                      levels.map((candidate) => (
                        <MenuRow
                          key={candidate}
                          active={candidate === level}
                          label={candidate}
                          mono
                          hint={t(THINKING_DESC_KEYS[candidate] ?? 'chat.thinkingUseDefault')}
                          onClick={() => chooseLevel(candidate)}
                        />
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })()}
    </div>
  );
}

/** 根页的「模型 / 推理等级」两行入口（原型 `.drill-row`） */
function DrillRow({ label, value, onClick }: { label: string; value: string; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        height: 38,
        padding: '0 9px',
        border: 'none',
        borderRadius: 8,
        background: 'none',
        color: 'var(--text)',
        cursor: 'pointer',
        fontSize: 13,
        textAlign: 'left',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'none';
      }}
    >
      <span style={{ flexShrink: 0 }}>{label}</span>
      <span
        style={{
          marginLeft: 'auto',
          maxWidth: 152,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        {value}
      </span>
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-dim)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <polyline points="9 6 15 12 9 18" />
      </svg>
    </button>
  );
}

/** 二级页页头：返回 + 标题（原型 `.drill-head`） */
function DrillHead({
  title,
  backLabel,
  onBack,
}: {
  title: string;
  backLabel: string;
  onBack(): void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        margin: '0 4px 5px',
        padding: '4px 0 6px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <button
        type="button"
        onClick={onBack}
        title={backLabel}
        aria-label={backLabel}
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 24,
          height: 24,
          padding: 0,
          border: 'none',
          borderRadius: 7,
          background: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = 'var(--bg-hover)';
          event.currentTarget.style.color = 'var(--text)';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = 'none';
          event.currentTarget.style.color = 'var(--text-muted)';
        }}
      >
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
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
        }}
      >
        {title}
      </span>
    </div>
  );
}

function MenuRow({
  active,
  label,
  hint,
  mono = false,
  onClick,
}: {
  active: boolean;
  label: string;
  hint?: string;
  mono?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '7px 12px',
        border: 'none',
        background: active ? 'var(--bg-selected)' : 'none',
        color: active ? 'var(--text)' : 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        textAlign: 'left',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(event) => {
        if (!active) event.currentTarget.style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={(event) => {
        if (!active) event.currentTarget.style.background = 'none';
      }}
    >
      {active ? (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
          aria-hidden="true"
        >
          <polyline points="1.5 5 4 7.5 8.5 2.5" />
        </svg>
      ) : (
        <span style={{ width: 10, flexShrink: 0 }} />
      )}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        }}
        title={label}
      >
        {label}
      </span>
      {hint !== undefined && (
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)' }}>{hint}</span>
      )}
    </button>
  );
}
