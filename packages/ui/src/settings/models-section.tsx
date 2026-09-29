import type {
  CatalogModel,
  DiscoveredModel,
  ModelsConfigTestResponse,
  ProviderUsageResponse,
} from '@ice-ai/protocol';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/i18n-provider';
import styles from './config-ui.module.css';
import { SecretInput } from './models/controls';
import {
  type CustomModelEntry,
  type CustomProviderEntry,
  type ModelsDraft,
  parseDraft,
  serializeDraft,
} from './models/model-config';
import { CustomModelDetail } from './models/model-detail';
import { CustomProviderDetail } from './models/provider-detail';
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
 * 自定义 provider 是三层结构：provider → model 列表（侧栏缩进）→ 模型详情编辑器
 * （能力 / 规格 / 价格 / 思考等级映射，见 `models/model-detail.tsx`）。
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
  /** models.dev 目录搜索（联网；用户点「搜索 / 填入」才发起） */
  onSearchCatalog(q: string): Promise<{ models: CatalogModel[]; error?: string }>;
  /** 按 provider `/models` 端点发现模型（联网；用户点「导入模型」才发起） */
  onDiscover(
    providerName: string,
    provider: { baseUrl: string; api: string; apiKey?: string },
  ): Promise<{ models: DiscoveredModel[]; error?: string }>;
  /** 真实补全测连通（联网；用户点「测试」才发起） */
  onTestModel(
    providerName: string,
    provider: { baseUrl: string; api: string; apiKey?: string },
    modelId: string,
  ): Promise<ModelsConfigTestResponse>;
  /** 目录刷新（联网；必须用户显式点） */
  refresh: {
    busy: boolean;
    lastResult: string | null;
    onRefresh(): void;
  };
}

type Selection =
  | { type: 'auth'; id: string }
  | { type: 'custom'; name: string }
  | { type: 'custom-model'; provider: string; index: number };

function shortenPath(p: string): string {
  return p.replace(/^\/(?:Users|home)\/[^/]+/, '~');
}

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
  const [savedOk, setSavedOk] = useState(false);
  // 切换 provider 由父层的 key={provider.id} 重新挂载，状态天然重置

  const save = () => {
    if (key.trim() === '') return;
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
                background: provider.configured ? 'var(--green)' : 'var(--border)',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: provider.configured ? 'var(--green)' : 'var(--text-dim)',
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
              ? 'var(--green)'
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
          {savedOk ? t('i18n.saved') : apiKey.saving ? t('i18n.saving') : t('i18n.save')}
        </button>
      </div>

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
  onDiscover,
  onTestModel,
  refresh,
}: ModelsSectionProps) {
  const { t } = useI18n();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [testing, setTesting] = useState<{
    index: number;
    pending: boolean;
    result: string | null;
    ok: boolean | null;
  } | null>(null);

  const draft: ModelsDraft | null = useMemo(() => parseDraft(config.text), [config.text]);
  const customProviders = useMemo(() => Object.entries(draft?.providers ?? {}), [draft]);

  // 默认选中：第一个已配置的 auth provider → 第一个自定义 provider。
  useEffect(() => {
    setSelection((current) => {
      if (current !== null) {
        const exists =
          (current.type === 'auth' &&
            authProviders.some((provider) => provider.id === current.id)) ||
          (current.type === 'custom' && customProviders.some(([name]) => name === current.name)) ||
          (current.type === 'custom-model' &&
            customProviders.some(
              ([name, entry]) =>
                name === current.provider &&
                (entry.models ?? []).length > current.index &&
                current.index >= 0,
            ));
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

  const mutateProvider = (name: string, next: CustomProviderEntry) => {
    mutateProviders((providers) => {
      providers[name] = next;
    });
  };

  const mutateModel = (providerName: string, index: number, next: CustomModelEntry) => {
    mutateProviders((providers) => {
      const provider = providers[providerName];
      if (provider === undefined) return;
      const models = [...(provider.models ?? [])];
      models[index] = next;
      providers[providerName] = { ...provider, models };
    });
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
      if (index === -1) return;
      const entry = entries[index]?.[1] ?? {};
      entries[index] = [next, entry];
      for (const key of Object.keys(providers)) delete providers[key];
      Object.assign(providers, Object.fromEntries(entries));
    });
    setSelection((current) =>
      current?.type === 'custom-model' && current.provider === oldName
        ? { type: 'custom-model', provider: next, index: current.index }
        : { type: 'custom', name: next },
    );
  };

  const addModel = (providerName: string) => {
    let index = 0;
    mutateProviders((providers) => {
      const provider = providers[providerName];
      if (provider === undefined) return;
      const models = [...(provider.models ?? [])];
      let id = 'new-model';
      let n = 1;
      while (models.some((model) => model.id === id)) id = `new-model-${n++}`;
      index = models.length;
      models.push({ id });
      providers[providerName] = { ...provider, models };
    });
    setSelection({ type: 'custom-model', provider: providerName, index });
  };

  const removeModel = (providerName: string, index: number) => {
    mutateProviders((providers) => {
      const provider = providers[providerName];
      if (provider === undefined) return;
      const models = (provider.models ?? []).filter((_, i) => i !== index);
      providers[providerName] = { ...provider, models };
    });
    setSelection({ type: 'custom', name: providerName });
  };

  const activeProviders = authProviders.filter((provider) => provider.configured);
  const unconfiguredProviders = authProviders.filter((provider) => !provider.configured);
  const showDivider =
    (activeProviders.length > 0 || unconfiguredProviders.length > 0) && customProviders.length > 0;

  const selectedAuth =
    selection?.type === 'auth' ? (authProviders.find((p) => p.id === selection.id) ?? null) : null;

  const expandedProvider =
    selection?.type === 'custom'
      ? selection.name
      : selection?.type === 'custom-model'
        ? selection.provider
        : null;

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
    if (selection.type === 'custom') {
      const entry = draft?.providers[selection.name];
      if (entry === undefined) return null;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CustomProviderDetail
            key={selection.name}
            name={selection.name}
            entry={entry}
            canEdit={config.error === null && config.parseError === null}
            onRename={(next) => renameCustomProvider(selection.name, next)}
            onChange={(next) => mutateProvider(selection.name, next)}
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
            onDiscover={() =>
              onDiscover(selection.name, {
                baseUrl: entry.baseUrl ?? '',
                api: entry.api ?? 'openai-completions',
                ...(entry.apiKey !== undefined ? { apiKey: entry.apiKey } : {}),
              })
            }
            onAddModels={(models) => {
              mutateProviders((providers) => {
                const provider = providers[selection.name];
                if (provider === undefined) return;
                const existing = provider.models ?? [];
                const existingIds = new Set(existing.map((model) => model.id));
                const additions = models
                  .filter((model) => !existingIds.has(model.id))
                  .map((model): CustomModelEntry => ({ id: model.id, name: model.name }));
                providers[selection.name] = {
                  ...provider,
                  models: [...existing, ...additions],
                };
              });
            }}
          />
          <EnabledModelsBlock
            models={enabled.models.filter((model) => model.provider === selection.name)}
            enabled={enabled}
            refresh={refresh}
          />
        </div>
      );
    }
    if (selection.type === 'custom-model') {
      const provider = draft?.providers[selection.provider];
      const model = provider?.models?.[selection.index];
      if (provider === undefined || model === undefined) return null;
      const test =
        testing !== null && testing.index === selection.index
          ? { testing: testing.pending, result: testing.result, ok: testing.ok }
          : { testing: false, result: null, ok: null };
      return (
        <CustomModelDetail
          key={`${selection.provider}:${selection.index}`}
          providerName={selection.provider}
          provider={provider}
          model={model}
          canEdit={config.error === null && config.parseError === null}
          test={test}
          onChange={(next) => mutateModel(selection.provider, selection.index, next)}
          onRemove={() => removeModel(selection.provider, selection.index)}
          onTest={() => {
            const baseUrl = model.baseUrl ?? provider.baseUrl ?? '';
            const api = model.api ?? provider.api ?? 'openai-completions';
            const apiKey = provider.apiKey;
            const index = selection.index;
            setTesting({ index, pending: true, result: null, ok: null });
            void (async () => {
              try {
                const result = await onTestModel(
                  selection.provider,
                  { baseUrl, api, ...(apiKey !== undefined ? { apiKey } : {}) },
                  model.id ?? '',
                );
                setTesting({
                  index,
                  pending: false,
                  result: result.ok
                    ? `${t('i18n.connected')} · ${result.latencyMs ?? 0}ms${
                        result.text !== undefined ? ` · ${result.text}` : ''
                      }`
                    : `${t('i18n.failed')}: ${result.error ?? ''}`,
                  ok: result.ok,
                });
              } catch (error) {
                setTesting({
                  index,
                  pending: false,
                  result: `${t('i18n.failed')}: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                  ok: false,
                });
              }
            })();
          }}
          onSearchCatalog={onSearchCatalog}
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
                  <ConfigSidebarText className={styles.isGrow}>
                    {provider.displayName}
                  </ConfigSidebarText>
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
              customProviders.map(([name, entry]) => {
                const selected =
                  (selection?.type === 'custom' && selection.name === name) ||
                  (selection?.type === 'custom-model' && selection.provider === name);
                const models = entry.models ?? [];
                return (
                  <div key={name}>
                    <ConfigSidebarItem
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
                      <ConfigSidebarText className={styles.isGrow}>{name}</ConfigSidebarText>
                      {models.length > 0 && (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            color: 'var(--text-dim)',
                          }}
                        >
                          {models.length}
                        </span>
                      )}
                    </ConfigSidebarItem>

                    {expandedProvider === name && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1,
                          margin: '1px 0 4px 8px',
                          paddingLeft: 8,
                          borderLeft: '1px solid var(--border)',
                        }}
                      >
                        {models.map((model, index) => {
                          const modelSelected =
                            selection?.type === 'custom-model' &&
                            selection.provider === name &&
                            selection.index === index;
                          return (
                            <ConfigSidebarItem
                              key={model.id ?? ''}
                              active={modelSelected}
                              onClick={() =>
                                setSelection({ type: 'custom-model', provider: name, index })
                              }
                              style={{ height: 26, fontSize: 11.5 }}
                            >
                              <ConfigSidebarText className={styles.isGrow}>
                                {(model.id ?? '') === '' ? t('i18n.newModel') : model.id}
                              </ConfigSidebarText>
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
                            </ConfigSidebarItem>
                          );
                        })}
                        <ConfigSidebarItem
                          onClick={() => addModel(name)}
                          style={{ height: 26, fontSize: 11.5, color: 'var(--text-muted)' }}
                        >
                          + {t('i18n.model')}
                        </ConfigSidebarItem>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </ConfigSidebarList>
          <ConfigListAction onClick={() => setPickerOpen(true)}>
            {t('i18n.addProvider')}
          </ConfigListAction>
        </ConfigSidebar>

        <ConfigDetail>
          <ConfigDetailStack className={styles.isFill}>
            {detail ?? <ConfigEmptyState>{t('i18n.selectProviderModel')}</ConfigEmptyState>}
          </ConfigDetailStack>
        </ConfigDetail>
      </ConfigSplitView>

      <ConfigFooter
        status={
          (config.error !== null || config.parseError !== null) && (
            <span style={{ color: 'var(--red)' }}>
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
