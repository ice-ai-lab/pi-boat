import type { CatalogModel, ProviderUsageResponse } from '@ice-ai/protocol';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/i18n-provider';
import { ProviderIcon } from './provider-icon';
import { ProviderUsageSummary } from './provider-usage-summary';
import { SettingsNotice } from './settings-panel';
import {
  ConfigButton,
  ConfigDetail,
  ConfigDetailActions,
  ConfigDetailHeader,
  ConfigDetailHeaderInfo,
  ConfigDetailStack,
  ConfigEmptyState,
  ConfigField,
  ConfigFooter,
  ConfigListAction,
  ConfigPanelShell,
  ConfigSectionTitle,
  ConfigSidebar,
  ConfigSidebarItem,
  ConfigSidebarList,
  ConfigSidebarText,
  ConfigSplitView,
  ConfigStatusDot,
  ConfigSwitch,
} from './settings-ui';

/**
 * ModelsSection（docs/06 §4.4；对齐 参考实现 ModelsConfig 的主从布局）：
 * 左侧 provider 清单（已配置 API Key 的 provider + models.json 自定义 provider +
 * 「添加 Provider」），右侧所选条目的详情；底部保存条写整份 models.json。
 *
 * 可见范围（enabledModels）的引擎在 core（ADR-0011）：这里只发 toggle，
 * 不自己算 pattern 命中。
 */

export interface AuthProviderView {
  id: string;
  displayName: string;
  configured: boolean;
  /** 凭据来源标签（如 "DEEPSEEK_API_KEY"；缺省 = auth.json） */
  source?: string;
  modelCount: number;
  supportsOAuth: boolean;
}

export interface ModelItemView {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
}

export interface ModelsSectionProps {
  /** 项目根（决定 enabledModels 的项目域解析；models.json 只有全局一份） */
  cwd: string | null;
  /** 可用 API Key 登录的 provider（GET /api/models/auth-providers） */
  authProviders: AuthProviderView[];
  authProvidersLoading: boolean;
  /** 可见范围块（详情里按 provider 过滤展示） */
  enabled: {
    models: ModelItemView[];
    canWrite: boolean;
    busy: boolean;
    /** 至少留一个模型的护栏提示 */
    hint: string | null;
    warnings: string[];
    onToggle(modelId: string, enabled: boolean): void;
  };
  /** models.json 草稿（原文是单一事实来源，所有编辑都落到这段文本上） */
  config: {
    modelsPath: string;
    text: string;
    dirty: boolean;
    saving: boolean;
    error: string | null;
    parseError: string | null;
    onChange(text: string): void;
    onSave(): void;
  };
  /** API Key 保存 / 断开（写 auth.json） */
  apiKey: {
    saving: boolean;
    onSave(providerId: string, apiKey: string): void;
    onRemove(providerId: string): void;
  };
  /** 用量查询（联网；由宿主调 mutation） */
  onQueryUsage(providerId: string): Promise<ProviderUsageResponse>;
  /** models.dev 目录搜索（联网；用户点「搜索」才发起） */
  onSearchCatalog(q: string): Promise<{ models: CatalogModel[]; error?: string }>;
  /** 目录刷新（联网；必须用户显式点） */
  refresh: {
    busy: boolean;
    lastResult: string | null;
    onRefresh(): void;
  };
}

type Selection = { type: 'auth'; id: string } | { type: 'custom'; name: string };

interface CustomProviderEntry {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  models?: { id?: string; name?: string; reasoning?: boolean }[];
}

/** 宽松解析草稿（parse 失败返回 null：编辑入口全部禁用，保存由宿主拦） */
function parseDraft(text: string): { providers: Record<string, CustomProviderEntry> } | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const providers =
      typeof record.providers === 'object' && record.providers !== null
        ? (record.providers as Record<string, CustomProviderEntry>)
        : {};
    return { providers };
  } catch {
    return null;
  }
}

/** 把 providers 写回草稿文本（2 空格缩进，与初次载入的展示一致） */
function serializeDraft(providers: Record<string, CustomProviderEntry>): string {
  return `${JSON.stringify({ providers }, null, 2)}\n`;
}

function shortenPath(p: string): string {
  return p.replace(/^\/(?:Users|home)\/[^/]+/, '~');
}

const API_OPTIONS = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'google-generative-ai',
] as const;

const inputStyle = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--border)',
  borderRadius: 5,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 12,
  outline: 'none',
} as const;

/** 秘密输入：单行 + 右侧明/密切换 */
function SecretInput({
  value,
  onChange,
  placeholder,
  onKeyDown,
}: {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        style={{ ...inputStyle, fontFamily: 'var(--font-mono)', paddingRight: 34 }}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'hide' : 'show'}
        title={visible ? 'hide' : 'show'}
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          padding: 3,
          border: 'none',
          background: 'none',
          color: 'var(--text-dim)',
          cursor: 'pointer',
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
          aria-hidden={true}
        >
          {visible ? (
            <>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </>
          ) : (
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

// ── 详情：API Key provider ────────────────────────────────────────────────────

function ApiKeyDetail({
  provider,
  enabledModels,
  enabled,
  apiKey,
  onQueryUsage,
  refresh,
}: {
  provider: AuthProviderView;
  enabledModels: ModelItemView[];
  enabled: ModelsSectionProps['enabled'];
  apiKey: ModelsSectionProps['apiKey'];
  onQueryUsage: ModelsSectionProps['onQueryUsage'];
  refresh: ModelsSectionProps['refresh'];
}) {
  const { t } = useI18n();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  // 切换 provider 由父层的 key={provider.id} 重新挂载，状态天然重置

  const save = () => {
    if (key.trim() === '') return;
    setError(null);
    setSavedOk(false);
    apiKey.onSave(provider.id, key.trim());
    setKey('');
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2000);
  };

  const providerModels = enabledModels.filter((model) => model.provider === provider.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ConfigDetailHeader>
        <ConfigDetailHeaderInfo>
          <ConfigSectionTitle>API KEY</ConfigSectionTitle>
        </ConfigDetailHeaderInfo>
        <ConfigDetailActions>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: provider.configured ? '#4ade80' : 'var(--border)',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: provider.configured ? '#4ade80' : 'var(--text-dim)',
              }}
            >
              {t(provider.configured ? 'i18n.configured' : 'i18n.notConfigured')}
            </span>
          </div>
          {provider.configured && (
            <ConfigButton
              variant="danger"
              size="small"
              onClick={() => apiKey.onRemove(provider.id)}
              disabled={apiKey.saving}
            >
              {t('i18n.disconnect')}
            </ConfigButton>
          )}
        </ConfigDetailActions>
      </ConfigDetailHeader>

      {!provider.configured && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {t('models.apiKeyHint', { provider: provider.displayName, count: provider.modelCount })}
        </p>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <SecretInput
          value={key}
          onChange={setKey}
          placeholder={provider.configured ? t('models.replaceKey') : 'sk-…'}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && key.trim() !== '') save();
          }}
        />
        <button
          type="button"
          onClick={save}
          disabled={apiKey.saving || key.trim() === '' || savedOk}
          style={{
            padding: '6px 14px',
            background: savedOk
              ? '#16a34a'
              : key.trim() !== ''
                ? 'var(--accent)'
                : 'var(--bg-panel)',
            border: 'none',
            borderRadius: 5,
            color: savedOk
              ? '#fff'
              : key.trim() !== ''
                ? 'var(--accent-contrast)'
                : 'var(--text-dim)',
            cursor: apiKey.saving || key.trim() === '' || savedOk ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          {savedOk && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden={true}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {savedOk ? t('i18n.saved') : apiKey.saving ? t('i18n.saving') : t('i18n.save')}
        </button>
      </div>
      {error !== null && <p style={{ margin: 0, fontSize: 12, color: '#f87171' }}>{error}</p>}

      <ProviderUsageSummary
        providerId={provider.id}
        enabled={provider.configured}
        onQuery={onQueryUsage}
      />

      <EnabledModelsBlock models={providerModels} enabled={enabled} refresh={refresh} />
    </div>
  );
}

// ── 详情：可见范围（按 provider 过滤的开关 + 维护操作） ──────────────────────

function EnabledModelsBlock({
  models,
  enabled,
  refresh,
}: {
  models: ModelItemView[];
  enabled: ModelsSectionProps['enabled'];
  refresh?: ModelsSectionProps['refresh'];
}) {
  const { t } = useI18n();
  if (models.length === 0) return null;
  const enabledCount = models.filter((model) => model.enabled).length;
  return (
    <section style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
          {t('models.enabledSection')}
        </span>
        <span
          style={{
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            marginRight: 'auto',
          }}
        >
          {t('models.enabledCount', { enabled: enabledCount, total: models.length })}
        </span>
      </div>
      {enabled.warnings.length > 0 && (
        <SettingsNotice tone="warn">{enabled.warnings.join('；')}</SettingsNotice>
      )}
      {enabled.hint !== null && <SettingsNotice>{enabled.hint}</SettingsNotice>}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'var(--bg-panel)',
          overflowY: 'auto',
          maxHeight: 280,
        }}
      >
        {models.map((model, index) => {
          const soloEnabled = enabledCount === 1 && model.enabled;
          return (
            <div
              key={model.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 9px',
                borderTop: index === 0 ? 'none' : '1px solid var(--border)',
              }}
            >
              {/* 关掉的条目**留在列表里**（只是变淡 + 开关关闭）：删掉的话用户再也点不回来 */}
              <span style={{ minWidth: 0, flex: 1, opacity: model.enabled ? 1 : 0.5 }}>
                <span
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    color: 'var(--text)',
                    fontSize: 11,
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {model.name}
                </span>
                <span
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    color: 'var(--text-dim)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {model.id}
                </span>
              </span>
              <ConfigSwitch
                checked={model.enabled}
                disabled={!enabled.canWrite || enabled.busy || soloEnabled}
                label={t('models.enabledToggle', { model: model.name })}
                onChange={(next) => enabled.onToggle(model.id, next)}
              />
            </div>
          );
        })}
      </div>
      {refresh !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ConfigButton size="small" disabled={refresh.busy} onClick={refresh.onRefresh}>
            {refresh.busy ? t('models.refreshingCatalog') : t('models.refreshCatalog')}
          </ConfigButton>
          {refresh.lastResult !== null && (
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{refresh.lastResult}</span>
          )}
        </div>
      )}
    </section>
  );
}

// ── 详情：models.json 自定义 provider（紧凑编辑） ─────────────────────────────

function CustomProviderDetail({
  name,
  entry,
  canEdit,
  onRename,
  onChange,
  onDelete,
  enabledModels,
  enabled,
  onSearchCatalog,
}: {
  name: string;
  entry: CustomProviderEntry;
  canEdit: boolean;
  onRename(next: string): void;
  onChange(next: CustomProviderEntry): void;
  onDelete(): void;
  enabledModels: ModelItemView[];
  enabled: ModelsSectionProps['enabled'];
  onSearchCatalog: ModelsSectionProps['onSearchCatalog'];
}) {
  const { t } = useI18n();
  const [newModelId, setNewModelId] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogState, setCatalogState] = useState<
    | { phase: 'idle' }
    | { phase: 'loading' }
    | { phase: 'error'; message: string }
    | { phase: 'done'; results: CatalogModel[] }
  >({ phase: 'idle' });
  const models = entry.models ?? [];
  const providerModels = enabledModels.filter((model) => model.provider === name);

  const handleCatalogSearch = async () => {
    const q = catalogQuery.trim();
    if (q === '') return;
    setCatalogState({ phase: 'loading' });
    try {
      const result = await onSearchCatalog(q);
      if (result.error !== undefined) {
        setCatalogState({ phase: 'error', message: result.error });
      } else {
        setCatalogState({ phase: 'done', results: result.models });
      }
    } catch (cause) {
      setCatalogState({
        phase: 'error',
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ConfigDetailHeader>
        <ConfigDetailHeaderInfo>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </span>
        </ConfigDetailHeaderInfo>
        <ConfigDetailActions>
          <ConfigButton variant="danger" size="small" disabled={!canEdit} onClick={onDelete}>
            {t('i18n.delete')}
          </ConfigButton>
        </ConfigDetailActions>
      </ConfigDetailHeader>

      <ConfigField label={t('i18n.providerName')}>
        <input
          value={name}
          disabled={!canEdit}
          onChange={(event) => onRename(event.target.value.trim())}
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
        />
      </ConfigField>

      <ConfigField label="Base URL">
        <input
          value={entry.baseUrl ?? ''}
          disabled={!canEdit}
          placeholder="https://api.example.com/v1"
          onChange={(event) => onChange({ ...entry, baseUrl: event.target.value })}
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
        />
      </ConfigField>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <ConfigField label={t('models.apiOverride')} style={{ flex: 1, minWidth: 180 }}>
          <select
            value={entry.api ?? API_OPTIONS[0]}
            disabled={!canEdit}
            onChange={(event) => onChange({ ...entry, api: event.target.value })}
            style={inputStyle}
          >
            {API_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </ConfigField>
        <ConfigField label="API KEY" style={{ flex: 1, minWidth: 180 }}>
          <input
            type="password"
            value={entry.apiKey ?? ''}
            disabled={!canEdit}
            placeholder={t('i18n.optional')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) =>
              onChange({
                ...entry,
                ...(event.target.value === ''
                  ? { apiKey: undefined }
                  : { apiKey: event.target.value }),
              })
            }
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
          />
        </ConfigField>
      </div>

      <ConfigField label={`${t('i18n.model')}（${models.length}）`}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {models.length === 0 && (
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{t('i18n.noResults')}</span>
          )}
          {models.map((model, index) => (
            <div
              key={model.id !== undefined && model.id !== '' ? model.id : `new-model-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color:
                    model.id !== undefined && model.id !== '' ? 'var(--text)' : 'var(--text-dim)',
                  minWidth: 0,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {model.id !== undefined && model.id !== '' ? model.id : t('i18n.newModel')}
              </span>
              {model.name !== undefined && model.name !== model.id && (
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{model.name}</span>
              )}
              {model.reasoning === true && (
                <span
                  style={{
                    fontSize: 9,
                    padding: '1px 4px',
                    background: 'rgba(99,102,241,0.12)',
                    color: 'rgba(99,102,241,0.8)',
                    borderRadius: 3,
                    flexShrink: 0,
                  }}
                >
                  T
                </span>
              )}
              <ConfigButton
                size="small"
                variant="ghost"
                disabled={!canEdit}
                onClick={() => {
                  const next = models.filter((_, i) => i !== index);
                  onChange({ ...entry, models: next.length > 0 ? next : undefined });
                }}
              >
                {t('i18n.delete')}
              </ConfigButton>
            </div>
          ))}
        </div>
      </ConfigField>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={newModelId}
          disabled={!canEdit}
          placeholder={`${t('i18n.model')} id`}
          onChange={(event) => setNewModelId(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && newModelId.trim() !== '') {
              onChange({ ...entry, models: [...models, { id: newModelId.trim() }] });
              setNewModelId('');
            }
          }}
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)', flex: 1 }}
        />
        <ConfigButton
          variant="primary"
          size="small"
          disabled={!canEdit || newModelId.trim() === ''}
          onClick={() => {
            onChange({ ...entry, models: [...models, { id: newModelId.trim() }] });
            setNewModelId('');
          }}
        >
          + {t('i18n.model')}
        </ConfigButton>
      </div>

      {/* 从 models.dev 目录导入（联网；只有点「搜索」才发起） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ConfigSectionTitle>{t('models.catalogFill')}</ConfigSectionTitle>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={catalogQuery}
            onChange={(event) => setCatalogQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && catalogQuery.trim() !== '') {
                void handleCatalogSearch();
              }
            }}
            placeholder={t('models.catalogSearchPlaceholder')}
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
          />
          <ConfigButton
            size="small"
            disabled={catalogState.phase === 'loading' || catalogQuery.trim() === ''}
            onClick={() => void handleCatalogSearch()}
          >
            {catalogState.phase === 'loading' ? t('i18n.searching') : t('i18n.search')}
          </ConfigButton>
        </div>
        {catalogState.phase === 'error' && (
          <SettingsNotice tone="warn">{catalogState.message}</SettingsNotice>
        )}
        {catalogState.phase === 'done' && catalogState.results.length === 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{t('i18n.noResults')}</span>
        )}
        {catalogState.phase === 'done' &&
          catalogState.results.map((result) => {
            const known = models.some((model) => model.id === result.id);
            return (
              <div
                key={`${result.provider}:${result.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '5px 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 11.5,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text)',
                    flexShrink: 0,
                  }}
                >
                  {result.id}
                </span>
                <span
                  style={{
                    color: 'var(--text-dim)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {result.name}
                </span>
                <ConfigButton
                  size="small"
                  variant={known ? 'ghost' : 'secondary'}
                  disabled={!canEdit || known}
                  onClick={() =>
                    onChange({
                      ...entry,
                      models: [...models, { id: result.id, name: result.name }],
                    })
                  }
                >
                  {known ? '✓' : '+'}
                </ConfigButton>
              </div>
            );
          })}
      </div>

      <EnabledModelsBlock models={providerModels} enabled={enabled} />
    </div>
  );
}

// ── 添加 Provider 选择器 ─────────────────────────────────────────────────────

function AddProviderPicker({
  unconfigured,
  onPick,
  onAddCustom,
  onClose,
}: {
  unconfigured: AuthProviderView[];
  onPick(id: string): void;
  onAddCustom(): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const matches = (name: string, id: string) =>
    needle === '' || name.toLowerCase().includes(needle) || id.toLowerCase().includes(needle);
  const available = unconfigured.filter((provider) => matches(provider.displayName, provider.id));
  const showCustom = needle === '' || 'custom'.includes(needle);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 遮罩点击关闭 + Escape 关闭（同 SettingsPanel 口径）
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        style={{
          width: 560,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'min(64vh, calc(100vh - 32px))',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <input
            ref={(input) => {
              // 挂载即聚焦（不用 autoFocus 属性：a11y lint 禁止；参考实现 同款 setTimeout 让位动画）
              setTimeout(() => input?.focus(), 30);
            }}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('i18n.searchProviders')}
            style={inputStyle}
          />
        </div>
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {available.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => onPick(provider.id)}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                cursor: 'pointer',
                minWidth: 0,
                textAlign: 'left',
                width: '100%',
              }}
            >
              <ProviderIcon id={provider.id} size={16} />
              <span
                style={{
                  fontSize: 12.5,
                  color: 'var(--text)',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {provider.displayName}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {t('models.providerModelCount', { count: provider.modelCount })}
              </span>
            </button>
          ))}
          {available.length === 0 && available.length !== unconfigured.length && (
            <span style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 4px' }}>
              {t('i18n.noProviders')}
            </span>
          )}
          {showCustom && (
            <button
              type="button"
              onClick={onAddCustom}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                background: 'var(--bg-panel)',
                border: '1px dashed var(--border)',
                borderRadius: 7,
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
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
                aria-hidden={true}
                style={{ color: 'var(--text-dim)', flexShrink: 0 }}
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                {t('models.addCustomProvider')}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export function ModelsSection({
  cwd,
  authProviders,
  authProvidersLoading,
  enabled,
  config,
  apiKey,
  onQueryUsage,
  onSearchCatalog,
  refresh,
}: ModelsSectionProps) {
  const { t } = useI18n();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const draft = useMemo(() => parseDraft(config.text), [config.text]);
  const customProviders = useMemo(() => Object.entries(draft?.providers ?? {}), [draft]);

  // 默认选中：第一个已配置的 auth provider → 第一个自定义 provider。
  useEffect(() => {
    setSelection((current) => {
      if (current !== null) {
        const exists =
          (current.type === 'auth' &&
            authProviders.some((provider) => provider.id === current.id)) ||
          (current.type === 'custom' && customProviders.some(([name]) => name === current.name));
        if (exists) return current;
      }
      const configured = authProviders.find((provider) => provider.configured);
      if (configured !== undefined) return { type: 'auth', id: configured.id };
      const firstCustom = customProviders[0];
      if (firstCustom !== undefined) return { type: 'custom', name: firstCustom[0] };
      return null;
    });
  }, [authProviders, customProviders]);

  const mutateProviders = (mutate: (providers: Record<string, CustomProviderEntry>) => void) => {
    if (draft === null) return;
    const providers = { ...draft.providers };
    mutate(providers);
    config.onChange(serializeDraft(providers));
  };

  const addCustomProvider = () => {
    let finalName = 'new-provider';
    let n = 1;
    while (draft?.providers[finalName] !== undefined) finalName = `new-provider-${n++}`;
    mutateProviders((providers) => {
      providers[finalName] = { api: 'openai-completions' };
    });
    setPickerOpen(false);
    setSelection({ type: 'custom', name: finalName });
  };

  const renameCustomProvider = (oldName: string, next: string) => {
    if (next === '' || next === oldName || draft?.providers[next] !== undefined) return;
    mutateProviders((providers) => {
      const entries = Object.entries(providers);
      const index = entries.findIndex(([key]) => key === oldName);
      const entry = entries[index];
      if (index === -1 || entry === undefined) return;
      entries[index] = [next, entry[1] ?? {}];
      const renamed = Object.fromEntries(
        entries.map(([key, value]) => [key, value ?? {}]),
      ) as Record<string, CustomProviderEntry>;
      providersClear(providers);
      Object.assign(providers, renamed);
    });
    setSelection({ type: 'custom', name: next });
  };

  const activeProviders = authProviders.filter((provider) => provider.configured);
  const unconfiguredProviders = authProviders.filter((provider) => !provider.configured);
  const showDivider =
    (activeProviders.length > 0 || unconfiguredProviders.length > 0) && customProviders.length > 0;

  const selectedAuth =
    selection?.type === 'auth' ? (authProviders.find((p) => p.id === selection.id) ?? null) : null;
  const selectedCustomEntry =
    selection?.type === 'custom' ? (draft?.providers[selection.name] ?? null) : null;

  const detail = (() => {
    if (selection === null || authProvidersLoading) return null;
    if (selectedAuth !== null) {
      return (
        <ApiKeyDetail
          key={selectedAuth.id}
          provider={selectedAuth}
          enabledModels={enabled.models}
          enabled={enabled}
          apiKey={apiKey}
          onQueryUsage={onQueryUsage}
          refresh={refresh}
        />
      );
    }
    if (selection.type === 'custom' && selectedCustomEntry !== null) {
      return (
        <CustomProviderDetail
          key={selection.name}
          name={selection.name}
          entry={selectedCustomEntry}
          canEdit={config.error === null && config.parseError === null}
          onRename={(next) => renameCustomProvider(selection.name, next)}
          onSearchCatalog={onSearchCatalog}
          onChange={(next) =>
            mutateProviders((providers) => {
              providers[selection.name] = next;
            })
          }
          onDelete={() => {
            mutateProviders((providers) => {
              delete providers[selection.name];
            });
            const remaining = Object.keys(draft?.providers ?? {}).filter(
              (name) => name !== selection.name,
            );
            setSelection(
              remaining.length > 0
                ? { type: 'custom', name: remaining[0] ?? '' }
                : activeProviders.length > 0
                  ? { type: 'auth', id: activeProviders[0]?.id ?? '' }
                  : null,
            );
          }}
          enabledModels={enabled.models}
          enabled={enabled}
        />
      );
    }
    return null;
  })();

  return (
    <ConfigPanelShell
      embedded
      title={t('common.models')}
      subtitle={shortenPath(config.modelsPath)}
      closeLabel={t('i18n.close')}
      onClose={() => {}}
    >
      <ConfigSplitView>
        <ConfigSidebar>
          <ConfigSidebarList>
            {activeProviders.map((provider) => {
              const selected = selection?.type === 'auth' && selection.id === provider.id;
              return (
                <ConfigSidebarItem
                  key={provider.id}
                  active={selected}
                  onClick={() => setSelection({ type: 'auth', id: provider.id })}
                >
                  <ProviderIcon id={provider.id} size={16} />
                  <ConfigSidebarText className="is-grow">{provider.displayName}</ConfigSidebarText>
                  <ConfigStatusDot active />
                </ConfigSidebarItem>
              );
            })}

            {showDivider && (
              <div style={{ margin: '4px 8px', borderTop: '1px solid var(--border)' }} />
            )}

            {authProvidersLoading ? (
              <div style={{ padding: '10px 8px', fontSize: 12, color: 'var(--text-muted)' }}>
                {t('i18n.loading')}
              </div>
            ) : (
              customProviders.map(([name]) => {
                const selected = selection?.type === 'custom' && selection.name === name;
                return (
                  <ConfigSidebarItem
                    key={name}
                    active={selected}
                    onClick={() => setSelection({ type: 'custom', name })}
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ color: 'var(--text-dim)', flexShrink: 0 }}
                      aria-hidden={true}
                    >
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                      <rect x="9" y="9" width="6" height="6" />
                    </svg>
                    <ConfigSidebarText className="is-grow">{name}</ConfigSidebarText>
                  </ConfigSidebarItem>
                );
              })
            )}
          </ConfigSidebarList>
          <ConfigListAction onClick={() => setPickerOpen(true)}>
            {t('i18n.addProvider')}
          </ConfigListAction>
        </ConfigSidebar>

        <ConfigDetail>
          <ConfigDetailStack className="is-fill">
            {detail ?? <ConfigEmptyState>{t('i18n.selectProviderModel')}</ConfigEmptyState>}
          </ConfigDetailStack>
        </ConfigDetail>
      </ConfigSplitView>

      <ConfigFooter
        status={
          (config.error !== null || config.parseError !== null) && (
            <span style={{ color: '#f87171' }}>
              {config.error !== null
                ? t('models.configUnreadable', { error: config.error })
                : `${t('models.parseErrorTitle')}: ${config.parseError ?? ''}`}
            </span>
          )
        }
      >
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 4 }}>
          {cwd === null ? '' : shortenPath(cwd)}
        </span>
        <ConfigButton
          variant="primary"
          onClick={config.onSave}
          disabled={
            config.saving || !config.dirty || config.parseError !== null || config.error !== null
          }
        >
          {config.saving ? t('i18n.saving') : t('i18n.save')}
        </ConfigButton>
      </ConfigFooter>

      {pickerOpen && (
        <AddProviderPicker
          unconfigured={unconfiguredProviders}
          onPick={(id) => {
            setSelection({ type: 'auth', id });
            setPickerOpen(false);
          }}
          onAddCustom={addCustomProvider}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </ConfigPanelShell>
  );
}

/** 清空对象自身的键（rename 时复用同一个对象引用） */
function providersClear(providers: Record<string, CustomProviderEntry>): void {
  for (const key of Object.keys(providers)) delete providers[key];
}
