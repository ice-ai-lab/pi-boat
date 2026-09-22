import { Chip } from '../primitives/chip';
import { Icon } from '../primitives/icon';

/**
 * 系统提示词内容（原型 `#popSys` 的 `.sysprompt` + `.pop-chips`）。
 *
 * 数据源：`GET /api/agent/:id` 的 `state.systemPrompt`（打开面板时懒加载一次）。
 * 三态文案：`""` →「为空（工具已禁用）」/ `null` + loading →「正在加载…」/ `null` →「尚未加载」。
 * 与原型的两处差异（docs/06 §11.2 已定）：不显示「版本 r42」「约 700 tokens」——
 * 前端无 tokenizer，硬凑会误导；改显示真实字符数。
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
    <div className={className}>
      <pre className="sysprompt">{text}</pre>
      <div className="pop-chips">
        {empty ? null : <span className="chip">{prompt.length.toLocaleString()} 字符</span>}
        <span className="chip">最近一次构建</span>
        <Chip
          onClick={() => {
            void navigator.clipboard?.writeText(prompt ?? '').then(
              () => onCopy?.(),
              () => undefined,
            );
          }}
          title="复制系统提示词"
        >
          <Icon name="copy" size={12} />
          复制
        </Chip>
      </div>
    </div>
  );
}
