import type { ReactNode } from 'react';
import { Button } from '../primitives/button';
import { Switch } from '../primitives/switch';
import { SettingsNotice, SettingsRow, SettingsSectionTitle } from './settings-panel';

/**
 * GeneralSection（docs/06 §4.4 general）：工具设置 + 项目信任 + 关于。
 * 主题/字号等外观项随 F5（ADR-0019-2 深色主题在 F5）；这里先给能落地的系统项。
 */
export interface GeneralSectionProps {
  version: string;
  tools: {
    isWindows: boolean;
    powerShellEnabled: boolean;
    busy: boolean;
    onTogglePowerShell(enabled: boolean): void;
  };
  trust: {
    cwd: string | null;
    requiresTrust: boolean;
    trusted: boolean;
    busy: boolean;
    onToggle(trusted: boolean): void;
  };
  appearance?: ReactNode;
}

export function GeneralSection({ version, tools, trust, appearance }: GeneralSectionProps) {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SettingsSectionTitle title="工具" hint="影响 Agent 执行命令的方式" />
        {tools.isWindows ? (
          <SettingsRow
            label="使用 PowerShell"
            hint="关闭则使用 cmd.exe；仅影响 Windows 上的命令执行"
          >
            <Switch
              checked={tools.powerShellEnabled}
              disabled={tools.busy}
              onCheckedChange={tools.onTogglePowerShell}
            />
          </SettingsRow>
        ) : (
          <SettingsRow label="Shell" hint="非 Windows 平台固定使用系统 sh" />
        )}
      </section>

      <section>
        <SettingsSectionTitle
          title="项目信任"
          hint="未信任的项目：项目内 skills / 扩展 / 配置不加载（唯一的开关就是这里）"
        />
        {trust.cwd === null ? (
          <SettingsNotice>先选择项目（或打开一个会话）再管理信任</SettingsNotice>
        ) : !trust.requiresTrust ? (
          <SettingsRow label="此项目无需要信任的资源" hint={trust.cwd} />
        ) : (
          <SettingsRow
            label={trust.trusted ? '已信任' : '未信任'}
            hint={`${trust.cwd}${trust.trusted ? '' : '（项目资源未加载）'}`}
          >
            <Button
              variant={trust.trusted ? 'chip' : 'primary'}
              size="sm"
              disabled={trust.busy}
              onClick={() => trust.onToggle(!trust.trusted)}
            >
              {trust.trusted ? '撤销信任' : '信任此项目'}
            </Button>
          </SettingsRow>
        )}
      </section>

      {appearance !== undefined && (
        <section>
          <SettingsSectionTitle title="外观" />
          {appearance}
        </section>
      )}

      <section>
        <SettingsSectionTitle title="关于" />
        <SettingsRow label="PiBoat Web" hint={`版本 ${version}`} />
      </section>
    </div>
  );
}
