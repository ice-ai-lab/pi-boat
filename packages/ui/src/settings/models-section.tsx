import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { SettingsNotice, SettingsRow, SettingsSectionTitle } from './settings-panel';

/**
 * ModelsSection（docs/06 §4.4）：模型域三块——可见范围 / models.json 原文 / 目录刷新。
 * 可见范围的**引擎在 core**（ADR-0011）：这里只发 toggle / prune / resync 三种操作，
 * 不自己算 pattern 命中。
 */
export interface ModelItemView {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
}

export interface ModelsSectionProps {
  /** 可见范围块 */
  enabled: {
    models: ModelItemView[];
    scope: 'global' | 'project';
    canWrite: boolean;
    settingsPath: string;
    warnings: string[];
    /** 至少留一个模型的护栏提示 */
    hint: string | null;
    busy: boolean;
    onToggle(modelId: string, enabled: boolean): void;
    onPrune(): void;
    onResync(): void;
  };
  /** models.json 原文块 */
  config: {
    modelsPath: string;
    text: string;
    dirty: boolean;
    saving: boolean;
    error: string | null;
    onChange(text: string): void;
    onSave(): void;
    onReload(): void;
    /** 解析失败时禁保存（本地护栏，服务端仍会校验） */
    parseError: string | null;
  };
  /** 目录刷新块（唯一联网入口，必须用户显式点） */
  refresh: {
    busy: boolean;
    lastResult: string | null;
    onRefresh(): void;
  };
  /** 远端目录 / provider 发现（可选，联网） */
  catalog?: {
    query: string;
    onQueryChange(q: string): void;
    onSearch(): void;
    results: { id: string; name: string; provider: string }[];
    loading: boolean;
    error: string | null;
  };
}

export function ModelsSection({ enabled, config, refresh, catalog }: ModelsSectionProps) {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SettingsSectionTitle
          title="可见模型"
          hint="模型选择器只显示这里开启的模型；关闭最后一个会退回「全部可用」语义，故被禁止"
        />
        {enabled.warnings.length > 0 && (
          <SettingsNotice tone="warn">{enabled.warnings.join('；')}</SettingsNotice>
        )}
        {enabled.hint !== null && <SettingsNotice>{enabled.hint}</SettingsNotice>}
        <SettingsRow
          label="生效来源"
          hint={`${enabled.settingsPath}${enabled.canWrite ? '' : '（只读）'}`}
        >
          <span className="sq bg-surface-side px-1.5 py-0.5 text-[11px] text-fg-subtle">
            {enabled.scope === 'project' ? '项目覆盖' : '全局'}
          </span>
        </SettingsRow>
        <div className="mt-2 flex flex-col">
          {enabled.models.length === 0 && (
            <p className="py-3 text-[12px] text-fg-faint">
              没有可见模型（选择器会退化为「全部可用」）
            </p>
          )}
          {enabled.models.map((model) => (
            <label
              key={model.id}
              className="hairline-b flex items-center gap-3 border-line-1 py-2 last:border-b-0"
            >
              <input
                type="checkbox"
                checked={model.enabled}
                disabled={
                  !enabled.canWrite ||
                  enabled.busy ||
                  (model.enabled && enabled.models.filter((m) => m.enabled).length === 1)
                }
                onChange={(event) => enabled.onToggle(model.id, event.target.checked)}
                className="size-3.5 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-fg">{model.name}</span>
                <span className="block truncate font-mono text-[11px] text-fg-faint">
                  {model.id}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="chip"
            size="sm"
            disabled={!enabled.canWrite || enabled.busy}
            onClick={enabled.onPrune}
          >
            清理失效项（prune）
          </Button>
          <Button
            variant="chip"
            size="sm"
            disabled={!enabled.canWrite || enabled.busy}
            onClick={enabled.onResync}
          >
            修复改名残留（resync）
          </Button>
        </div>
      </section>

      <section>
        <SettingsSectionTitle
          title="models.json"
          hint={`${config.modelsPath}（含 provider 级 apiKey；保存即整份覆盖）`}
        />
        {config.error !== null && <SettingsNotice tone="error">{config.error}</SettingsNotice>}
        {config.parseError !== null && (
          <SettingsNotice tone="warn">JSON 无法解析：{config.parseError}</SettingsNotice>
        )}
        <textarea
          value={config.text}
          onChange={(event) => config.onChange(event.target.value)}
          spellCheck={false}
          rows={16}
          className="sq hairline scrollbar-thin w-full resize-y border-line-2 bg-code-bg p-2.5 font-mono text-[11.5px] leading-[1.55] text-fg outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={config.saving || config.parseError !== null || !config.dirty}
            onClick={config.onSave}
          >
            {config.saving ? '保存中…' : '保存'}
          </Button>
          <Button variant="chip" size="sm" disabled={config.saving} onClick={config.onReload}>
            重新载入
          </Button>
          {config.dirty && <span className="text-[11.5px] text-warn">有未保存改动</span>}
        </div>
      </section>

      <section>
        <SettingsSectionTitle
          title="模型目录"
          hint="只有点击按钮才联网（离线态优先用本地缓存 / models-store.json）"
        />
        <div className="flex items-center gap-2">
          <Button variant="chip" size="sm" disabled={refresh.busy} onClick={refresh.onRefresh}>
            {refresh.busy ? '刷新中…' : '刷新目录'}
          </Button>
          {refresh.lastResult !== null && (
            <span className="text-[11.5px] text-fg-faint">{refresh.lastResult}</span>
          )}
        </div>
        {catalog !== undefined && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Input
                value={catalog.query}
                onChange={(event) => catalog.onQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') catalog.onSearch();
                }}
                placeholder="搜索 models.dev 目录（联网）"
              />
              <Button
                variant="chip"
                size="sm"
                disabled={catalog.loading}
                onClick={catalog.onSearch}
              >
                搜索
              </Button>
            </div>
            {catalog.error !== null && <SettingsNotice tone="warn">{catalog.error}</SettingsNotice>}
            <div className="scrollbar-thin max-h-48 overflow-y-auto">
              {catalog.results.map((model) => (
                <div
                  key={`${model.provider}:${model.id}`}
                  className="hairline-b border-line-1 py-1.5 last:border-b-0"
                >
                  <p className="truncate text-[12px] text-fg">{model.name}</p>
                  <p className="truncate font-mono text-[11px] text-fg-faint">
                    {model.provider}:{model.id}
                  </p>
                </div>
              ))}
              {catalog.results.length === 0 && !catalog.loading && (
                <p className="py-2 text-[11.5px] text-fg-faint">没有结果（点「搜索」联网查询）</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
