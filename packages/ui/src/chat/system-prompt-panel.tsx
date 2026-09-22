import { Button } from '../primitives/button';
import { Icon } from '../primitives/icon';

/**
 * 系统提示词面板（docs/06 §4.2 / §11.2）：
 * **整宽面板**（不取原型的 560px 锚定浮层——2000+ 字符的长文本点外关闭会丢阅读位置）。
 * 规格照 pi-web `SystemPromptPanel`：`height: min(600px, 75dvh)` + `overflow:auto` +
 * `pre-wrap` + `overflow-wrap:anywhere` + 等宽 12px；三态文案见下。
 * 数据源：`GET /api/agent/:id` 的 `state.systemPrompt`（打开面板时懒加载一次）。
 */
export interface SystemPromptPanelProps {
  /** null = 尚未加载 / 加载中；'' = 为空（工具已禁用） */
  prompt: string | null;
  loading?: boolean;
  onCopy?: () => void;
  className?: string;
}

export function SystemPromptPanel({
  prompt,
  loading = false,
  onCopy,
  className,
}: SystemPromptPanelProps) {
  const text =
    prompt === null
      ? loading
        ? '正在加载…'
        : '尚未加载（会话未在运行）'
      : prompt === ''
        ? '为空（工具已禁用）'
        : prompt;
  const empty = prompt === null || prompt === '';
  return (
    <section className={className} aria-label="系统提示词">
      <div className="mb-3 flex items-center gap-2">
        <Icon name="book" size={14} className="text-fg-subtle" />
        <h3 className="text-[13px] font-semibold">系统提示词</h3>
        <span className="ml-auto flex items-center gap-2">
          {empty ? null : (
            <span className="text-[11px] text-fg-faint">{prompt.length.toLocaleString()} 字符</span>
          )}
          <Button
            variant="chip"
            onClick={() => {
              void navigator.clipboard?.writeText(prompt ?? '').then(
                () => onCopy?.(),
                () => undefined,
              );
            }}
            disabled={empty}
          >
            <Icon name="copy" size={12} />
            复制
          </Button>
        </span>
      </div>
      <pre
        className="scrollbar-thin m-0 overflow-auto whitespace-pre-wrap rounded-[10px] border-[0.5px] border-line-1 bg-code-bg p-3 font-mono text-[12px] leading-[17px] text-fg-muted"
        style={{ height: 'min(600px, 75dvh)', overflowWrap: 'anywhere' }}
      >
        {text}
      </pre>
      <p className="mt-2 text-[11px] text-fg-faint">
        最近一次构建的提示词；上下文文件重载后内容会变化。
      </p>
    </section>
  );
}
