import { useEffect, useState } from 'react';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { ScrollArea } from '../primitives/scroll-area';
import { SettingsNotice, SettingsRow, SettingsSectionTitle } from './settings-panel';

/**
 * DirectoryPicker（docs/06 §4.3）：目录选择器。
 * 浏览**不受 allowed-roots 限制**（用户必须能走到任意目录才能选中它）；
 * 选中动作由宿主负责（`POST /api/cwd/validate` 才是 allowed-roots 的写入入口）。
 */
export interface DirectoryPickerProps {
  /** 当前路径（受控）；缺省从家目录开始 */
  path?: string;
  onNavigate(path: string): void;
  onSelect(path: string): void;
  /** 浏览数据（宿主取数，本组件不调接口） */
  data?: {
    path: string;
    parentPath: string | null;
    directories: { name: string; path: string; readable: boolean }[];
    drives?: string[];
  } | null;
  loading?: boolean;
  error?: string | null;
  /** 选中按钮文案 */
  selectLabel?: string;
  /** 手动输入路径（可直接选一个没浏览到的目录） */
  allowManualInput?: boolean;
}

export function DirectoryPicker({
  path,
  onNavigate,
  onSelect,
  data,
  loading = false,
  error,
  selectLabel = '使用此目录',
  allowManualInput = true,
}: DirectoryPickerProps) {
  const [manual, setManual] = useState(path ?? '');
  const current = data?.path ?? path ?? '';

  useEffect(() => {
    setManual(current);
  }, [current]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <SettingsSectionTitle title="选择目录" hint="选中即授权该目录（allowed-roots 的唯一来源）" />
      <div className="flex items-center gap-1.5">
        <Input
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && manual.trim().length > 0) onNavigate(manual.trim());
          }}
          placeholder="/path/to/project"
          spellCheck={false}
          className="font-mono text-[12px]"
        />
        <Button
          variant="chip"
          size="sm"
          onClick={() => onNavigate(manual.trim())}
          disabled={manual.trim().length === 0}
        >
          前往
        </Button>
        {allowManualInput && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onSelect(manual.trim())}
            disabled={manual.trim().length === 0}
          >
            {selectLabel}
          </Button>
        )}
      </div>

      {error !== undefined && error !== null && (
        <SettingsNotice tone="error">{error}</SettingsNotice>
      )}

      <div className="sq hairline flex min-h-0 flex-col border-line-2">
        <div className="hairline-b flex items-center gap-2 border-line-1 px-2 py-1.5">
          <button
            type="button"
            disabled={data?.parentPath === null || data?.parentPath === undefined}
            onClick={() => {
              if (data?.parentPath !== null && data?.parentPath !== undefined)
                onNavigate(data.parentPath);
            }}
            className="sq px-2 py-0.5 text-[11.5px] text-fg-subtle hover:bg-hover hover:text-fg disabled:opacity-40"
          >
            ↑ 上级
          </button>
          <span className="truncate font-mono text-[11px] text-fg-faint" title={current}>
            {current}
          </span>
          {loading && <span className="ml-auto text-[11px] text-fg-faint">加载中…</span>}
        </div>
        <ScrollArea className="max-h-64 min-h-32">
          {(data?.drives ?? []).map((drive) => (
            <button
              key={drive}
              type="button"
              onClick={() => onNavigate(drive)}
              className="sq flex w-full items-center px-2 py-1 text-left text-[12px] text-fg-muted hover:bg-hover"
            >
              {drive}
            </button>
          ))}
          {(data?.directories ?? []).map((entry) => (
            <div key={entry.path} className="group/dir flex items-center">
              <button
                type="button"
                disabled={!entry.readable}
                onClick={() => onNavigate(entry.path)}
                title={entry.path}
                className="sq min-w-0 flex-1 truncate px-2 py-1 text-left text-[12px] text-fg-muted hover:bg-hover disabled:opacity-50"
              >
                {entry.name}
              </button>
              <button
                type="button"
                onClick={() => onSelect(entry.path)}
                className="sq mr-1 hidden px-1.5 py-0.5 text-[10.5px] text-accent hover:bg-accent-weak group-hover/dir:block"
              >
                选它
              </button>
            </div>
          ))}
          {data !== null && data !== undefined && (data.directories ?? []).length === 0 && (
            <p className="px-2 py-2 text-[11.5px] text-fg-faint">此目录下没有子目录</p>
          )}
        </ScrollArea>
      </div>

      <SettingsRow label="当前选择" hint={current.length > 0 ? undefined : '还没选中目录'}>
        <Button
          variant="primary"
          size="sm"
          disabled={current.length === 0}
          onClick={() => onSelect(current)}
        >
          {selectLabel}
        </Button>
      </SettingsRow>
    </div>
  );
}
