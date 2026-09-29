import type { DiscoveredModel } from '@ice-ai/protocol';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/i18n-provider';
import {
  ConfigButton,
  ConfigDetailActions,
  ConfigDetailHeader,
  ConfigDetailHeaderInfo,
  ConfigField,
} from '../settings-ui';
import { HeaderEditor, inputStyle } from './controls';
import { API_OPTIONS, type CustomProviderEntry } from './model-config';

export interface CustomProviderDetailProps {
  name: string;
  entry: CustomProviderEntry;
  canEdit: boolean;
  onRename(next: string): void;
  onChange(next: CustomProviderEntry): void;
  onDelete(): void;
  onDiscover(): Promise<{ models: DiscoveredModel[]; error?: string }>;
  onAddModels(models: DiscoveredModel[]): void;
}

/** 自定义 provider 的详情（名称 / 端点 / 凭据 / Headers / 导入模型） */
export function CustomProviderDetail({
  name,
  entry,
  canEdit,
  onRename,
  onChange,
  onDelete,
  onDiscover,
  onAddModels,
}: CustomProviderDetailProps) {
  const { t } = useI18n();
  const [importOpen, setImportOpen] = useState(false);
  const models = entry.models ?? [];

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
          spellCheck={false}
          onChange={(event) =>
            onChange({
              ...entry,
              baseUrl: event.target.value === '' ? undefined : event.target.value,
            })
          }
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

      <ConfigField label={t('models.headers')}>
        <HeaderEditor
          value={entry.headers}
          disabled={!canEdit}
          onChange={(next) =>
            onChange({
              ...entry,
              ...(next === undefined ? { headers: undefined } : { headers: next }),
            })
          }
        />
      </ConfigField>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <ConfigButton size="small" disabled={!canEdit} onClick={() => setImportOpen(true)}>
          {t('models.discoveryFetch')}
        </ConfigButton>
        <span style={{ marginLeft: 10, fontSize: 11.5, color: 'var(--text-dim)' }}>
          {t('models.providerModelCount', { count: models.length })}
        </span>
      </div>

      {importOpen && (
        <ImportModelsDialog
          existingIds={new Set(models.map((model) => model.id ?? '').filter(Boolean))}
          onDiscover={onDiscover}
          onAdd={(picked) => {
            onAddModels(picked);
            setImportOpen(false);
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

type DiscoverState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'done'; models: DiscoveredModel[] };

/** 导入模型弹层：拉 provider 的 `/models`，勾选后批量追加 */
function ImportModelsDialog({
  existingIds,
  onDiscover,
  onAdd,
  onClose,
}: {
  existingIds: Set<string>;
  onDiscover(): Promise<{ models: DiscoveredModel[]; error?: string }>;
  onAdd(models: DiscoveredModel[]): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<DiscoverState>({ phase: 'loading' });
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 父层的 onDiscover 是内联箭头函数（每次 render 换身份），用 ref 固定，避免挂载后重复拉取
  const onDiscoverRef = useRef(onDiscover);
  onDiscoverRef.current = onDiscover;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await onDiscoverRef.current();
        if (cancelled) return;
        if (result.error !== undefined) {
          setState({ phase: 'error', message: result.error });
        } else {
          setState({ phase: 'done', models: result.models });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            phase: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible =
    state.phase === 'done'
      ? state.models.filter(
          (model) =>
            filter.trim() === '' ||
            model.id.toLowerCase().includes(filter.trim().toLowerCase()) ||
            model.name.toLowerCase().includes(filter.trim().toLowerCase()),
        )
      : [];
  const selectedModels =
    state.phase === 'done' ? state.models.filter((m) => selected.has(m.id)) : [];

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 遮罩点击关闭（同 SettingsPanel 口径）
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
          maxHeight: 'min(70vh, calc(100vh - 32px))',
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
          {state.phase === 'done' ? (
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('models.discoveryFilterPlaceholder', { count: state.models.length })}
              style={inputStyle}
            />
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {state.phase === 'loading' ? t('models.discoveryFetching') : t('i18n.failed')}
            </span>
          )}
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {state.phase === 'error' && (
            <span style={{ fontSize: 12, color: 'var(--red)' }}>{state.message}</span>
          )}
          {state.phase === 'done' && visible.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 4px' }}>
              {t('models.discoveryNoMatches')}
            </span>
          )}
          {visible.map((model) => {
            const added = existingIds.has(model.id);
            return (
              <label
                key={model.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 5,
                  cursor: added ? 'default' : 'pointer',
                  opacity: added ? 0.5 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={added || selected.has(model.id)}
                  disabled={added}
                  onChange={() => toggle(model.id)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {model.id}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 11,
                    color: 'var(--text-dim)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 220,
                  }}
                >
                  {added ? t('models.discoveryAdded') : model.name}
                </span>
              </label>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <span style={{ flex: 1, fontSize: 11, color: 'var(--text-dim)' }}>
            {state.phase === 'done'
              ? t('models.discoveryShowing', { shown: visible.length, total: state.models.length })
              : ''}
          </span>
          <ConfigButton size="small" onClick={onClose}>
            {t('i18n.cancel')}
          </ConfigButton>
          <ConfigButton
            variant="primary"
            size="small"
            disabled={selectedModels.length === 0}
            onClick={() => onAdd(selectedModels)}
          >
            {selectedModels.length === 0
              ? t('models.discoveryAddSelected')
              : t('models.discoveryAddSelectedCount', { count: selectedModels.length })}
          </ConfigButton>
        </div>
      </div>
    </div>
  );
}
