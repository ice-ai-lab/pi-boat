import { useState } from 'react';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { SettingsNotice, SettingsRow, SettingsSectionTitle } from './settings-panel';
import type { SkillUpdateView } from './skills-section';

export interface PluginItemView {
  source: string;
  displayName: string;
  scope: 'user' | 'project';
  type: 'npm' | 'git' | 'local';
  enabled: boolean;
  filtered: boolean;
}

/**
 * PluginsSection（docs/06 §4.4）：扩展包列表 + 启停 / 移除 / 更新 + 安装。
 * 「禁用」= 从 settings 的 sources 里移除但保留磁盘副本（协议语义），所以列表里仍在。
 */
export interface PluginsSectionProps {
  cwd: string | null;
  packages: PluginItemView[];
  standaloneExtensions: string[];
  totals: { packages: number; extensions: number; skills: number };
  projectResourcesLoaded: boolean;
  loading: boolean;
  busy: boolean;
  onAction(action: 'enable' | 'disable' | 'remove' | 'update', source: string): void;
  install: {
    source: string;
    onSourceChange(value: string): void;
    scope: 'global' | 'project';
    onScopeChange(scope: 'global' | 'project'): void;
    onInstall(): void;
    busy: boolean;
  };
  updates: { results: SkillUpdateView[]; checking: boolean; onCheck(): void };
}

export function PluginsSection({
  cwd,
  packages,
  standaloneExtensions,
  totals,
  projectResourcesLoaded,
  loading,
  busy,
  onAction,
  install,
  updates,
}: PluginsSectionProps) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SettingsSectionTitle
          title="扩展包"
          hint={`${totals.packages} 个包 · ${totals.extensions} 个扩展 · ${totals.skills} 个 skill${
            cwd === null ? '' : ` · 项目：${cwd}`
          }`}
        />
        {!projectResourcesLoaded && (
          <SettingsNotice tone="warn">项目级资源未加载（项目未信任）</SettingsNotice>
        )}
        {loading && <p className="py-2 text-[12px] text-fg-faint">加载中…</p>}
        {!loading && packages.length === 0 && (
          <p className="py-2 text-[12px] text-fg-faint">没有安装扩展包（可用下面的安装入口）</p>
        )}
        <div className="flex flex-col">
          {packages.map((pkg) => (
            <div
              key={pkg.source}
              className="hairline-b flex items-center gap-2 border-line-1 py-2.5 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] text-fg">{pkg.displayName}</span>
                  <span className="sq shrink-0 bg-surface-side px-1 text-[10px] text-fg-faint">
                    {pkg.type} · {pkg.scope}
                  </span>
                  {pkg.filtered && (
                    <span className="sq shrink-0 bg-warn-soft px-1 text-[10px] text-warn">
                      已过滤
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-fg-faint">
                  {pkg.source}
                </span>
              </span>
              <Button
                variant="chip"
                size="sm"
                disabled={busy}
                onClick={() => onAction(pkg.enabled ? 'disable' : 'enable', pkg.source)}
              >
                {pkg.enabled ? '禁用' : '启用'}
              </Button>
              <Button
                variant="chip"
                size="sm"
                disabled={busy}
                onClick={() => onAction('update', pkg.source)}
              >
                更新
              </Button>
              {confirmRemove === pkg.source ? (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      onAction('remove', pkg.source);
                      setConfirmRemove(null);
                    }}
                  >
                    确认移除
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(null)}>
                    取消
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirmRemove(pkg.source)}
                >
                  移除
                </Button>
              )}
            </div>
          ))}
        </div>
        {standaloneExtensions.length > 0 && (
          <div className="mt-3">
            <p className="text-[11.5px] text-fg-subtle">非包形式扩展（直接放在扩展目录）</p>
            {standaloneExtensions.map((name) => (
              <p key={name} className="font-mono text-[11px] text-fg-faint">
                {name}
              </p>
            ))}
          </div>
        )}
      </section>

      <section>
        <SettingsSectionTitle title="安装扩展包" hint="npm 包名 / git 地址 / 本地路径（联网）" />
        <div className="flex items-center gap-1.5">
          <Input
            value={install.source}
            onChange={(event) => install.onSourceChange(event.target.value)}
            placeholder="npm:<包名> 或 git+https://…"
          />
          <select
            value={install.scope}
            onChange={(event) =>
              install.onScopeChange(event.target.value === 'project' ? 'project' : 'global')
            }
            className="sq hairline h-8 border-line-2 bg-surface-raised px-1.5 text-[11.5px] text-fg-muted"
          >
            <option value="global">用户级</option>
            <option value="project">项目级</option>
          </select>
          <Button
            variant="primary"
            size="sm"
            disabled={install.busy || install.source.trim().length === 0}
            onClick={install.onInstall}
          >
            {install.busy ? '安装中…' : '安装'}
          </Button>
        </div>
      </section>

      <section>
        <SettingsSectionTitle title="更新检查" hint="与 npm registry 比对（联网）" />
        <div className="flex items-center gap-2">
          <Button variant="chip" size="sm" disabled={updates.checking} onClick={updates.onCheck}>
            {updates.checking ? '检查中…' : '检查插件更新'}
          </Button>
        </div>
        {updates.results.length > 0 && (
          <div className="mt-2">
            {updates.results.map((result) => (
              <SettingsRow
                key={result.package}
                label={result.package}
                hint={
                  result.state === 'update-available'
                    ? `${result.currentVersion ?? '?'} → ${result.latestVersion ?? '?'}`
                    : (result.error ?? result.state)
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
