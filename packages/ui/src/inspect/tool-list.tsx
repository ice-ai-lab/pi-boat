import { cn } from '../lib/cn';
import { Icon, type IconName } from '../primitives/icon';

/**
 * 工具定义浮层（原型 `#popTools`：`.preset-seg` + `.tool-item` + `.switch`）。
 *
 * ⚠️ M1 只读展示：预设切换与工具开关依赖 core 的 `set_tools`（M2，docs/02 §11.1），
 * 因此这里的开关不接回调（不给「点了没反应」的假交互）。当前值 = `default` 预设。
 */
export type ToolPreset = 'chat-only' | 'read-only' | 'default' | 'full';

export interface ToolDefinition {
  name: string;
  description: string;
  icon: IconName;
  enabled: boolean;
}

/** 原型 8 个内置工具的默认状态（default 预设） */
export const DEFAULT_TOOLS: readonly ToolDefinition[] = [
  { name: 'read', description: '读取文件内容，支持行号范围与图片', icon: 'file', enabled: true },
  { name: 'bash', description: '在会话目录执行 shell 命令并回传输出', icon: 'term', enabled: true },
  { name: 'edit', description: '精确字符串替换修改文件', icon: 'pencil', enabled: true },
  { name: 'write', description: '创建或整文件写入', icon: 'file', enabled: true },
  { name: 'grep', description: '基于 ripgrep 的内容搜索', icon: 'search', enabled: true },
  { name: 'find', description: '按 glob 模式查找文件路径', icon: 'folder', enabled: true },
  {
    name: 'todo_write',
    description: '维护任务清单，跟踪多步执行进度',
    icon: 'list',
    enabled: true,
  },
  {
    name: 'task',
    description: '派生子代理执行隔离的探索 / 编写任务',
    icon: 'spark',
    enabled: false,
  },
];

export interface ToolListProps {
  preset?: ToolPreset;
  tools?: readonly ToolDefinition[];
  className?: string;
}

const PRESETS: readonly ToolPreset[] = ['chat-only', 'read-only', 'default', 'full'];

export function ToolList({ preset = 'default', tools = DEFAULT_TOOLS, className }: ToolListProps) {
  return (
    <div className={className}>
      <div className="preset-seg">
        {PRESETS.map((item) => (
          <button key={item} type="button" className={cn(item === preset && 'on')} disabled>
            {item}
          </button>
        ))}
      </div>
      <div>
        {tools.map((tool) => (
          <div key={tool.name} className="tool-item">
            <Icon name={tool.icon} size={16} className="ti-ico" />
            <div className="ti-main">
              <div className="ti-n">{tool.name}</div>
              <div className="ti-d">{tool.description}</div>
            </div>
            <span
              className={cn('switch', tool.enabled && 'on')}
              title="工具开关（M2 接入 core 的 set_tools）"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
