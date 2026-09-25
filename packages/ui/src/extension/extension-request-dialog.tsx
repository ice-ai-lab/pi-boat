import type { ExtensionUiRequest } from '@ice-ai/protocol';
import { type ReactNode, useState } from 'react';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { Textarea } from '../primitives/textarea';

/**
 * ExtensionRequestDialog（docs/06 §4.4 / ADR-0012）：扩展 UI 的**阻塞型**请求对话框。
 * 只覆盖本仓支持的 9 个 method 里需要应答的四种：select / confirm / input / editor
 * （`custom` 明确不支持；setStatus/setWidget/notify 是单向的，不走这里）。
 * 不应答会让扩展一直挂到宿主默认超时（`{cancelled:true}`），所以对话框必须有取消键。
 */
export interface ExtensionRequestDialogProps {
  request: ExtensionUiRequest;
  onRespond(response: { value?: string; confirmed?: boolean; cancelled?: true }): void;
}

export function ExtensionRequestDialog({ request, onRespond }: ExtensionRequestDialogProps) {
  const [value, setValue] = useState('');
  const method = request.method;

  if (method === 'select') {
    const options = (request as { options?: string[] }).options ?? [];
    return (
      <Dialog title={(request as { title?: string }).title ?? '扩展询问'}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onRespond({ value: option })}
            className="sq w-full px-3 py-1.5 text-left text-[12.5px] text-fg-muted hover:bg-hover hover:text-fg"
          >
            {option}
          </button>
        ))}
      </Dialog>
    );
  }

  if (method === 'confirm') {
    return (
      <Dialog title={(request as { title?: string }).title ?? '扩展确认'}>
        <p className="px-1 pb-2 text-[12.5px] text-fg-muted">
          {(request as { message?: string }).message ?? ''}
        </p>
        <div className="flex justify-end gap-2 px-1">
          <Button variant="chip" size="sm" onClick={() => onRespond({ cancelled: true })}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={() => onRespond({ confirmed: true })}>
            确认
          </Button>
        </div>
      </Dialog>
    );
  }

  if (method === 'input') {
    return (
      <Dialog title={(request as { title?: string }).title ?? '扩展输入'}>
        <div className="flex items-center gap-2 px-1">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={(request as { placeholder?: string }).placeholder ?? ''}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onRespond({ value });
            }}
          />
          <Button variant="primary" size="sm" onClick={() => onRespond({ value })}>
            提交
          </Button>
          <Button variant="chip" size="sm" onClick={() => onRespond({ cancelled: true })}>
            取消
          </Button>
        </div>
      </Dialog>
    );
  }

  // editor
  return (
    <Dialog title={(request as { title?: string }).title ?? '扩展编辑器'}>
      <div className="flex flex-col gap-2 px-1">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={8}
          className="sq hairline border-line-2 bg-code-bg p-2 font-mono text-[12px]"
        />
        <div className="flex justify-end gap-2">
          <Button variant="chip" size="sm" onClick={() => onRespond({ cancelled: true })}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={() => onRespond({ value })}>
            提交
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Dialog({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/25 p-6"
    >
      <div className="sq elev-panel w-[min(480px,90vw)] bg-surface-raised p-4">
        <h3 className="mb-2 text-[13px] font-semibold text-fg">{title}</h3>
        {children}
      </div>
    </div>
  );
}
