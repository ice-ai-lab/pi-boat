import { cn } from '../lib/cn';

/**
 * 工具定义浮层（原型 `#popTools`：`.tool-it`(.on) + `.tn`/`.td` + `.sw` 开关）。
 *
 * 原型里 `.tn`/`.td` 是 `.tool-it` 的直接 flex 子元素（`width:74px` / `flex:1`），
 * 不能另包一层 div，否则两列宽度语义失效。
 *
 * ⚠️ M1 只读展示：工具开关依赖 core 的 `set_tools`（M2，docs/02 §11.1），
 * 因此这里的开关不接回调（不给「点了没反应」的假交互）。当前值 = `default` 预设。
 * （预设切换在输入卡的「模式」chip —— ModeChip，v4 原型同位。）
 */
export type ToolPreset = 'chat-only' | 'read-only' | 'default' | 'full';

export interface ToolDefinition {
  name: string;
  description: string;
  enabled: boolean;
}

/** 原型 8 个内置工具的默认状态（default 预设） */
export const DEFAULT_TOOLS: readonly ToolDefinition[] = [
  { name: 'read', description: '读取文件内容，支持行号范围与图片', enabled: true },
  { name: 'bash', description: '在会话目录执行 shell 命令并回传输出', enabled: true },
  { name: 'edit', description: '精确字符串替换修改文件', enabled: true },
  { name: 'write', description: '创建或整文件写入', enabled: true },
  { name: 'grep', description: '基于 ripgrep 的内容搜索', enabled: true },
  { name: 'find', description: '按 glob 模式查找文件路径', enabled: true },
  { name: 'todo_write', description: '维护任务清单，跟踪多步执行进度', enabled: true },
  { name: 'task', description: '派生子代理执行隔离的探索 / 编写任务', enabled: false },
];

export interface ToolListProps {
  tools?: readonly ToolDefinition[];
  className?: string;
}

export function ToolList({ tools = DEFAULT_TOOLS, className }: ToolListProps) {
  return (
    <div className={className}>
      {tools.map((tool) => (
        <div key={tool.name} className={cn('tool-it', tool.enabled && 'on')}>
          <span className="tn">{tool.name}</span>
          <span className="td">{tool.description}</span>
          <span
            className={cn('sw', tool.enabled && 'on')}
            title="工具开关（M2 接入 core 的 set_tools）"
          />
        </div>
      ))}
    </div>
  );
}
