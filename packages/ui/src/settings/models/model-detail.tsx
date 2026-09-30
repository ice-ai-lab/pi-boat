import type { CatalogModel, ThinkingLevelMap } from '@ice-ai/protocol';
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/i18n-provider';
import {
  ConfigButton,
  ConfigDetailActions,
  ConfigDetailHeader,
  ConfigDetailHeaderInfo,
  ConfigField,
  ConfigSectionTitle,
} from '../settings-ui';
import {
  CapabilityCheckbox,
  dashedButtonStyle,
  HeaderEditor,
  inputStyle,
  ThinkingLevelMapEditor,
} from './controls';
import {
  API_OPTIONS,
  COST_KEYS,
  type CostKey,
  type CustomModelEntry,
  type CustomProviderEntry,
} from './model-config';

interface CatalogMatchResult {
  models: CatalogModel[];
  error?: string;
}

export interface CustomModelDetailProps {
  providerName: string;
  provider: CustomProviderEntry;
  model: CustomModelEntry;
  canEdit: boolean;
  test: { testing: boolean; result: string | null; ok: boolean | null };
  onChange(next: CustomModelEntry): void;
  onRemove(): void;
  onTest(): void;
  onSearchCatalog(q: string): Promise<CatalogMatchResult>;
}

type FillState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; message: string; prev: CustomModelEntry | null };

/**
 * 自定义 provider 的单个模型编辑器（对齐 参考实现 的模型详情）。
 *
 * 覆盖 models.json 里模型条目的可编辑字段：能力（reasoning / input）、规格
 * （contextWindow / maxTokens）、价格（四个费率）、思考等级映射与 API/BaseURL/Headers
 * 覆盖。字段语义以 SDK 的 `ProviderModelConfig` 为准（ADR-0017）。
 */
export function CustomModelDetail({
  providerName,
  provider,
  model,
  canEdit,
  test,
  onChange,
  onRemove,
  onTest,
  onSearchCatalog,
}: CustomModelDetailProps) {
  const { t } = useI18n();
  const [costEditing, setCostEditing] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fillState, setFillState] = useState<FillState>({ phase: 'idle' });

  const input = model.input ?? ['text'];

  const handleFill = async () => {
    const id = (model.id ?? '').trim();
    if (id === '') return;
    setFillState({ phase: 'loading' });
    try {
      const result = await onSearchCatalog(id);
      if (result.error !== undefined) {
        setFillState({ phase: 'done', message: result.error, prev: null });
        return;
      }
      const exact = result.models.filter((entry) => entry.id === id);
      if (exact.length === 0) {
        setFillState({ phase: 'done', message: t('models.catalogNoExactMatch'), prev: null });
        return;
      }
      const chosen = pickCatalogMatch(exact, providerName, provider.baseUrl);
      const { next, filled } = fillEmptyFields(model, chosen);
      if (filled.length === 0) {
        setFillState({ phase: 'done', message: t('models.catalogNoEmptyFields'), prev: null });
        return;
      }
      onChange(next);
      setFillState({
        phase: 'done',
        message: t('models.catalogFilled', { count: filled.length }),
        prev: model,
      });
    } catch (error) {
      setFillState({
        phase: 'done',
        message: error instanceof Error ? error.message : String(error),
        prev: null,
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ConfigDetailHeader>
        <ConfigDetailHeaderInfo>
          <ConfigSectionTitle>{t('i18n.model')}</ConfigSectionTitle>
        </ConfigDetailHeaderInfo>
        <ConfigDetailActions>
          <ConfigButton size="small" disabled={!canEdit || test.testing} onClick={onTest}>
            {test.testing ? t('i18n.testingModel') : t('i18n.test')}
          </ConfigButton>
          <ConfigButton variant="danger" size="small" disabled={!canEdit} onClick={onRemove}>
            {t('i18n.remove')}
          </ConfigButton>
        </ConfigDetailActions>
      </ConfigDetailHeader>

      {test.result !== null && (
        <span
          style={{
            fontSize: 11.5,
            color: test.ok === true ? 'var(--green)' : 'var(--red)',
          }}
        >
          {test.result}
        </span>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <ConfigField label="ID *" style={{ flex: 1, minWidth: 200 }}>
          <input
            value={model.id ?? ''}
            disabled={!canEdit}
            placeholder="glm-5.3"
            spellCheck={false}
            onChange={(event) => onChange({ ...model, id: event.target.value })}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
          />
        </ConfigField>
        <ConfigField label="Name" style={{ flex: 1, minWidth: 200 }}>
          <input
            value={model.name ?? ''}
            disabled={!canEdit}
            placeholder="Display name"
            spellCheck={false}
            onChange={(event) => onChange({ ...model, name: conditionally(event.target.value) })}
            style={inputStyle}
          />
        </ConfigField>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <ConfigButton
          size="small"
          disabled={!canEdit || fillState.phase === 'loading' || (model.id ?? '').trim() === ''}
          onClick={() => void handleFill()}
        >
          {fillState.phase === 'loading' ? t('models.catalogFilling') : t('models.catalogFill')}
        </ConfigButton>
        {fillState.phase === 'done' && (
          <>
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{fillState.message}</span>
            {fillState.prev !== null && (
              <button
                type="button"
                onClick={() => {
                  if (fillState.prev !== null) onChange(fillState.prev);
                  setFillState({ phase: 'idle' });
                }}
                style={{ ...dashedButtonStyle, height: 24 }}
              >
                {t('models.catalogUndo')}
              </button>
            )}
          </>
        )}
        <a
          href="https://models.dev"
          target="_blank"
          rel="noreferrer"
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: 'var(--text-dim)',
            textDecoration: 'none',
          }}
        >
          {t('models.catalogSource')}
        </a>
      </div>

      <ConfigField label={t('models.capabilities')}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <CapabilityCheckbox
            checked={model.reasoning === true}
            label={t('models.reasoning')}
            disabled={!canEdit}
            onChange={(checked) => onChange({ ...model, reasoning: checked })}
          />
          <CapabilityCheckbox
            checked={input.includes('image')}
            label={t('models.imageInput')}
            disabled={!canEdit}
            onChange={(checked) =>
              onChange({
                ...model,
                input: checked ? ['text', 'image'] : ['text'],
              })
            }
          />
        </div>
      </ConfigField>

      <ConfigField label={t('models.modelSpecs')}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <NumberField
            label={t('models.contextWindow')}
            value={model.contextWindow}
            disabled={!canEdit}
            onChange={(value) => onChange({ ...model, contextWindow: value })}
            style={{ flex: 1, minWidth: 180 }}
          />
          <NumberField
            label={t('models.maxOutputTokens')}
            value={model.maxTokens}
            disabled={!canEdit}
            onChange={(value) => onChange({ ...model, maxTokens: value })}
            style={{ flex: 1, minWidth: 180 }}
          />
        </div>
      </ConfigField>

      <ConfigField
        label={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {t('models.costPerMillion')}
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setCostEditing((current) => !current)}
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--accent)',
                cursor: canEdit ? 'pointer' : 'default',
                fontSize: 11,
                padding: 0,
              }}
            >
              {costEditing ? t('models.finishEditingCosts') : t('models.editCosts')}
            </button>
          </span>
        }
      >
        {costEditing ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {COST_KEYS.map((key) => (
              <NumberField
                key={key}
                label={costLabel(t, key)}
                value={model.cost?.[key]}
                disabled={!canEdit}
                onChange={(value) => onChange({ ...model, cost: setCost(model, key, value) })}
                style={{ flex: 1, minWidth: 130 }}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {COST_KEYS.map((key) => (
              <div key={key} style={{ flex: 1, minWidth: 130 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
                  {costLabel(t, key)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>
                  {model.cost?.[key] === undefined
                    ? t('models.notProvided')
                    : formatCost(model.cost[key])}
                </div>
              </div>
            ))}
          </div>
        )}
      </ConfigField>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <button
          type="button"
          onClick={() => setAdvancedOpen((current) => !current)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            {t('models.advancedSettings')}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 'auto' }}>
            {advancedSummary(model, t)}
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{advancedOpen ? '▾' : '▸'}</span>
        </button>

        {advancedOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 14 }}>
            {/* 编辑器自带「思考等级映射」标题与默认/禁用/自定义说明，不再套 ConfigField 标签 */}
            <ThinkingLevelMapEditor
              value={model.thinkingLevelMap}
              disabled={!canEdit}
              onChange={(next: ThinkingLevelMap | undefined) =>
                onChange({ ...model, thinkingLevelMap: next })
              }
            />

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <ConfigField label={t('models.apiOverride')} style={{ flex: 1, minWidth: 180 }}>
                <select
                  value={model.api ?? ''}
                  disabled={!canEdit}
                  onChange={(event) =>
                    onChange({ ...model, api: conditionally(event.target.value) })
                  }
                  style={inputStyle}
                >
                  <option value="">{t('models.providerDefaults')}</option>
                  {API_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  {/* 已存在于 models.json 的非标准 api 值：保留为可选项，避免被下拉框静默换成第一项 */}
                  {model.api !== undefined &&
                    !API_OPTIONS.includes(model.api as (typeof API_OPTIONS)[number]) && (
                      <option value={model.api}>{model.api}</option>
                    )}
                </select>
              </ConfigField>
              <ConfigField label="Base URL" style={{ flex: 1, minWidth: 180 }}>
                <input
                  value={model.baseUrl ?? ''}
                  disabled={!canEdit}
                  placeholder={provider.baseUrl ?? 'https://api.example.com/v1'}
                  spellCheck={false}
                  onChange={(event) =>
                    onChange({ ...model, baseUrl: conditionally(event.target.value) })
                  }
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                />
              </ConfigField>
            </div>

            <ConfigField label={t('models.headers')}>
              <HeaderEditor
                value={model.headers}
                disabled={!canEdit}
                onChange={(next) =>
                  onChange({
                    ...model,
                    ...(next === undefined ? { headers: undefined } : { headers: next }),
                  })
                }
              />
            </ConfigField>
          </div>
        )}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  disabled,
  onChange,
  style,
}: {
  label: string;
  value: number | undefined;
  disabled: boolean;
  onChange(value: number | undefined): void;
  style?: React.CSSProperties;
}) {
  // 本地保留原始文本以便输入小数/中间态；不在聚焦时被外部值覆盖，失焦时归一
  const [raw, setRaw] = useState(value === undefined ? '' : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setRaw(value === undefined ? '' : String(value));
  }, [value, focused]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, ...style }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <input
        value={raw}
        disabled={disabled}
        inputMode="decimal"
        spellCheck={false}
        placeholder="—"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          const external = value === undefined ? '' : String(value);
          setRaw(external);
        }}
        onChange={(event) => {
          const text = event.target.value;
          setRaw(text);
          const trimmed = text.trim();
          if (trimmed === '') {
            onChange(undefined);
            return;
          }
          const parsed = Number(trimmed);
          if (Number.isFinite(parsed) && parsed >= 0) onChange(parsed);
        }}
        style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
      />
    </div>
  );
}

function costLabel(t: (key: string) => string, key: CostKey): string {
  return t(`models.cost${key.charAt(0).toUpperCase()}${key.slice(1)}`);
}

function formatCost(value: number): string {
  return `$${value} / M`;
}

function setCost(
  model: CustomModelEntry,
  key: CostKey,
  value: number | undefined,
): CustomModelEntry['cost'] {
  const cost = { ...(model.cost ?? {}) };
  if (value === undefined) {
    delete cost[key];
  } else {
    cost[key] = value;
  }
  return Object.keys(cost).length > 0 ? cost : undefined;
}

/** 空串写成 undefined，避免把空值落进 models.json */
function conditionally(value: string): string | undefined {
  return value === '' ? undefined : value;
}

/** 从 models.dev 精确命中的候选中挑最贴近当前 provider 的一条 */
function pickCatalogMatch(
  candidates: CatalogModel[],
  providerName: string,
  baseUrl: string | undefined,
): CatalogModel {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = norm(providerName);
  const byName = candidates.find((entry) => {
    const other = norm(entry.provider);
    return target !== '' && (other === target || other.includes(target) || target.includes(other));
  });
  if (byName !== undefined) return byName;
  if (baseUrl !== undefined) {
    try {
      const host = norm(new URL(baseUrl).hostname.split('.')[0] ?? '');
      const byHost = candidates.find((entry) => {
        const other = norm(entry.provider);
        return host !== '' && (other.includes(host) || host.includes(other));
      });
      if (byHost !== undefined) return byHost;
    } catch {
      // baseUrl 非法时忽略主机匹配
    }
  }
  // candidates 非空（调用方已过滤），此处兜底
  return candidates[0] as CatalogModel;
}

/** 只填「当前为空」的字段 + 缺失的价格费率（不覆盖用户已填的值） */
function fillEmptyFields(
  model: CustomModelEntry,
  catalog: CatalogModel,
): { next: CustomModelEntry; filled: string[] } {
  const next: CustomModelEntry = { ...model };
  const filled: string[] = [];
  if ((next.name ?? '') === '' && catalog.name !== '') {
    next.name = catalog.name;
    filled.push('name');
  }
  if (next.reasoning === undefined && catalog.reasoning !== undefined) {
    next.reasoning = catalog.reasoning;
    filled.push('reasoning');
  }
  if (next.input === undefined && catalog.input !== undefined) {
    const input = catalog.input.filter(
      (item): item is 'text' | 'image' => item === 'text' || item === 'image',
    );
    if (input.length > 0) {
      next.input = input;
      filled.push('input');
    }
  }
  if (next.contextWindow === undefined && catalog.contextWindow !== undefined) {
    next.contextWindow = catalog.contextWindow;
    filled.push('contextWindow');
  }
  if (next.maxTokens === undefined && catalog.maxTokens !== undefined) {
    next.maxTokens = catalog.maxTokens;
    filled.push('maxTokens');
  }
  const cost = { ...(next.cost ?? {}) };
  for (const key of COST_KEYS) {
    const catalogValue = catalog.cost?.[key];
    if (cost[key] === undefined && catalogValue !== undefined) {
      cost[key] = catalogValue;
      filled.push(`cost.${key}`);
    }
  }
  if (Object.keys(cost).length > 0) next.cost = cost;
  return { next, filled };
}

function advancedSummary(
  model: CustomModelEntry,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const parts: string[] = [];
  const thinkingCount = Object.keys(model.thinkingLevelMap ?? {}).length;
  if (thinkingCount > 0) parts.push(t('models.thinkingSummary', { count: thinkingCount }));
  const headerCount = Object.keys(model.headers ?? {}).length;
  if (headerCount > 0) parts.push(t('models.headersSummary', { count: headerCount }));
  if ((model.api ?? '') !== '') parts.push(t('models.apiOverride'));
  return parts.length > 0 ? parts.join(' · ') : t('models.providerDefaults');
}
