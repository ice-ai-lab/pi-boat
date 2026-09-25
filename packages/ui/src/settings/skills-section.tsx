import { useState } from 'react';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { SettingsNotice, SettingsRow, SettingsSectionTitle } from './settings-panel';

/** skills 列表项（协议 SkillInfo 的展示子集） */
export interface SkillItemView {
  name: string;
  description: string;
  scope: 'user' | 'project' | 'temporary';
  disableModelInvocation: boolean;
}

export interface SkillSearchItemView {
  package: string;
  description?: string;
  installs: number | null;
  url: string;
}

export interface SkillUpdateView {
  package: string;
  state: 'up-to-date' | 'update-available' | 'unsupported' | 'error';
  currentVersion?: string;
  latestVersion?: string;
  error?: string;
}

/**
 * SkillsSection（docs/06 §4.4）：列表 + 「禁止模型自动调用」开关 + 市场搜索/安装 + 更新检查。
 * 开关写的是 settings.json 覆盖表（不改 SKILL.md 原文）。
 */
export interface SkillsSectionProps {
  cwd: string | null;
  skills: SkillItemView[];
  diagnostics: { type: string; message: string }[];
  projectResourcesLoaded: boolean;
  loading: boolean;
  busy: boolean;
  onToggle(skill: SkillItemView, disableModelInvocation: boolean): void;

  search: {
    query: string;
    onQueryChange(q: string): void;
    onSearch(): void;
    results: SkillSearchItemView[];
    loading: boolean;
    error: string | null;
    onInstall(packageName: string, scope: 'global' | 'project'): void;
    installingPackage: string | null;
  };

  updates: {
    results: SkillUpdateView[];
    checking: boolean;
    updating: boolean;
    onCheck(): void;
    onUpdate(packageName?: string): void;
  };
}

const UPDATE_LABEL: Record<SkillUpdateView['state'], string> = {
  'up-to-date': '已是最新',
  'update-available': '有更新',
  unsupported: '不支持检查（非 npm 来源）',
  error: '检查失败',
};

export function SkillsSection({
  cwd,
  skills,
  diagnostics,
  projectResourcesLoaded,
  loading,
  busy,
  onToggle,
  search,
  updates,
}: SkillsSectionProps) {
  const [scope, setScope] = useState<'global' | 'project'>('global');

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SettingsSectionTitle
          title="已安装 skills"
          hint={cwd === null ? '无项目上下文：只显示用户级 skill' : `项目：${cwd}`}
        />
        {!projectResourcesLoaded && (
          <SettingsNotice tone="warn">
            项目级资源未加载（项目未信任）：看到的不是全部，去「项目信任」开启
          </SettingsNotice>
        )}
        {loading && <p className="py-2 text-[12px] text-fg-faint">加载中…</p>}
        {!loading && skills.length === 0 && (
          <p className="py-2 text-[12px] text-fg-faint">没有 skill</p>
        )}
        <div className="flex flex-col">
          {skills.map((skill) => (
            <label
              key={skill.name}
              className="hairline-b flex items-start gap-3 border-line-1 py-2.5 last:border-b-0"
            >
              <input
                type="checkbox"
                checked={!skill.disableModelInvocation}
                disabled={busy}
                onChange={(event) => onToggle(skill, !event.target.checked)}
                className="mt-0.5 size-3.5 accent-[var(--accent)]"
                title="允许模型自动调用"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] text-fg">{skill.name}</span>
                  <span className="sq shrink-0 bg-surface-side px-1 text-[10px] text-fg-faint">
                    {skill.scope}
                  </span>
                  {skill.disableModelInvocation && (
                    <span className="sq shrink-0 bg-warn-soft px-1 text-[10px] text-warn">
                      仅手动
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-fg-faint">
                  {skill.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        {diagnostics.length > 0 && (
          <div className="mt-3">
            {diagnostics.map((diagnostic) => (
              <SettingsNotice
                // 诊断条目由服务端一次性给出，文本 + 类型即身份（同文重复也无害）
                key={`${diagnostic.type}:${diagnostic.message}`}
                tone={
                  diagnostic.type === 'collision' || diagnostic.type === 'error' ? 'error' : 'warn'
                }
              >
                {diagnostic.message}
              </SettingsNotice>
            ))}
          </div>
        )}
      </section>

      <section>
        <SettingsSectionTitle
          title="安装 skill"
          hint="搜索 npm registry（联网）；安装到用户级或当前项目"
        />
        <div className="flex items-center gap-1.5">
          <Input
            value={search.query}
            onChange={(event) => search.onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') search.onSearch();
            }}
            placeholder="搜索 skill 包（如 pi-notify）"
          />
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value === 'project' ? 'project' : 'global')}
            className="sq hairline h-8 border-line-2 bg-surface-raised px-1.5 text-[11.5px] text-fg-muted"
          >
            <option value="global">用户级</option>
            <option value="project">项目级</option>
          </select>
          <Button variant="chip" size="sm" disabled={search.loading} onClick={search.onSearch}>
            {search.loading ? '搜索中…' : '搜索'}
          </Button>
        </div>
        {search.error !== null && <SettingsNotice tone="warn">{search.error}</SettingsNotice>}
        <div className="mt-2 flex flex-col">
          {search.results.map((result) => (
            <div
              key={result.package}
              className="hairline-b flex items-center gap-2 border-line-1 py-2 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-fg">{result.package}</span>
                {result.description !== undefined && (
                  <span className="block truncate text-[11.5px] text-fg-faint">
                    {result.description}
                  </span>
                )}
              </span>
              {result.installs !== null && (
                <span className="shrink-0 text-[10.5px] text-fg-faint">↓{result.installs}</span>
              )}
              <Button
                variant="primary"
                size="sm"
                disabled={search.installingPackage !== null}
                onClick={() => search.onInstall(result.package, scope)}
              >
                {search.installingPackage === result.package ? '安装中…' : '安装'}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SettingsSectionTitle title="更新" hint="与 npm registry 比对（联网）" />
        <div className="flex items-center gap-2">
          <Button variant="chip" size="sm" disabled={updates.checking} onClick={updates.onCheck}>
            {updates.checking ? '检查中…' : '检查更新'}
          </Button>
          <Button
            variant="chip"
            size="sm"
            disabled={
              updates.updating || !updates.results.some((r) => r.state === 'update-available')
            }
            onClick={() => updates.onUpdate()}
          >
            全部更新
          </Button>
        </div>
        {updates.results.length > 0 && (
          <div className="mt-2 flex flex-col">
            {updates.results.map((result) => (
              <SettingsRow
                key={result.package}
                label={result.package}
                hint={
                  result.state === 'update-available'
                    ? `${result.currentVersion ?? '?'} → ${result.latestVersion ?? '?'}`
                    : (result.error ?? UPDATE_LABEL[result.state])
                }
              >
                {result.state === 'update-available' && (
                  <Button
                    variant="chip"
                    size="sm"
                    disabled={updates.updating}
                    onClick={() => updates.onUpdate(result.package)}
                  >
                    更新
                  </Button>
                )}
              </SettingsRow>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
