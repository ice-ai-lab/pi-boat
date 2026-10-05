import type { TextRow as TextRowModel } from '@ice-ai/client';
import { MarkdownView } from './markdown-view';
import rowStyles from './trail.module.css';

/**
 * TextRow：中间轮的普通文本（非思考、非最终回答）。多轮 trace 里停下来调工具的
 * assistant 消息常带正文，按块序平铺在轨迹里（docs/05 §6.5 规则 4
 * 「最终回答之前的消息进组」），静止后随过程组收拢，不再被 `final` 覆盖吞掉。
 */
export function TextRowView({ row }: { row: TextRowModel }) {
  return (
    <div className={rowStyles.textRow}>
      <MarkdownView markdown={row.text} />
    </div>
  );
}
