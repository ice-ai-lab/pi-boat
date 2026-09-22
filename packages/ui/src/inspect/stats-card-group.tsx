import type { SessionStatsDisplay } from '../chat/usage-line';
import { cacheHitPercent } from '../chat/usage-line';
import { formatCost, formatDuration, formatTokens } from '../lib/format';
import { Icon, type IconName } from '../primitives/icon';

/**
 * 会话统计浮层（原型 `#popStats`：`.pop-grid` 两列卡片 + 跨两列的 Token 卡）。
 *
 * 只渲染有数据的行（docs/06 §11.2：冷会话无耗时/速度数据时字段必须可选，
 * `undefined` 的行不出现——不拿 0 冒充）。
 */
export interface StatsCardGroupProps {
  session: {
    name?: string | undefined;
    id: string;
    file?: string | null | undefined;
    activeMs?: number | undefined;
  };
  project: { cwd?: string | null | undefined; branch?: string | null | undefined };
  messages: {
    user?: number | undefined;
    assistant?: number | undefined;
    toolCalls?: number | undefined;
    total?: number | undefined;
  };
  performance?: {
    rounds?: number | undefined;
    steps?: number | undefined;
    llmMs?: number | undefined;
    toolMs?: number | undefined;
    tps?: number | undefined;
  };
  tokens?: SessionStatsDisplay;
  className?: string;
}

export function StatsCardGroup({
  session,
  project,
  messages,
  performance,
  tokens,
  className,
}: StatsCardGroupProps) {
  const hit = tokens === undefined ? null : cacheHitPercent(tokens);
  return (
    <div className={className === undefined ? 'pop-grid' : `pop-grid ${className}`}>
      <StatCard icon="file" title="会话信息">
        <Row label="名称" value={session.name} />
        <Row label="会话 ID" value={session.id} />
        <Row label="存储文件" value={session.file} />
        <Row label="活跃时长" value={formatDuration(session.activeMs)} />
      </StatCard>
      <StatCard icon="folder" title="项目信息">
        <Row label="工作目录" value={project.cwd} />
        <Row label="Git 分支" value={project.branch} />
        <Row label="最近提交" value={undefined} />
        <Row label="Worktree" value={undefined} />
      </StatCard>
      <StatCard icon="copy" title="消息统计">
        <Row label="用户消息" value={messages.user} />
        <Row label="助手消息" value={messages.assistant} />
        <Row label="工具调用" value={messages.toolCalls} />
        <Row label="总计" value={messages.total} />
      </StatCard>
      <StatCard icon="gauge" title="性能统计">
        <Row
          label="对话轮数 / 步数"
          value={
            performance?.rounds === undefined && performance?.steps === undefined
              ? undefined
              : `${performance?.rounds ?? '—'} / ${performance?.steps ?? '—'}`
          }
        />
        <Row label="LLM 耗时" value={formatDuration(performance?.llmMs)} />
        <Row label="工具耗时" value={formatDuration(performance?.toolMs)} />
        <Row
          label="生成速度"
          value={performance?.tps === undefined ? undefined : `${performance.tps.toFixed(1)} t/s`}
        />
      </StatCard>
      <StatCard icon="db" title="Token 统计" span2>
        <Row label="输入（未缓存）" value={formatTokens(tokens?.input)} />
        <Row label="缓存读" value={formatTokens(tokens?.cacheRead)} />
        <Row label="缓存写" value={formatTokens(tokens?.cacheWrite)} />
        <Row label="输出" value={formatTokens(tokens?.output)} />
        <Row
          label="合计 / 费用"
          value={joinPresent([
            formatTokens(
              (tokens?.input ?? 0) +
                (tokens?.output ?? 0) +
                (tokens?.cacheRead ?? 0) +
                (tokens?.cacheWrite ?? 0),
            ),
            formatCost(tokens?.cost),
          ])}
        />
        <Row
          label="缓存命中率 / 上下文"
          value={joinPresent([
            hit === null ? undefined : `${hit}%`,
            tokens?.contextPercent === null || tokens?.contextPercent === undefined
              ? undefined
              : `${tokens.contextPercent.toFixed(0)}% / ${formatTokens(tokens.contextWindow ?? 0)}`,
          ])}
        />
      </StatCard>
    </div>
  );
}

function StatCard({
  icon,
  title,
  span2 = false,
  children,
}: {
  icon: IconName;
  title: string;
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={span2 ? 'stat-card span2' : 'stat-card'}>
      <h3>
        <Icon name={icon} size={14} />
        {title}
      </h3>
      <dl>{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{String(value)}</dd>
    </>
  );
}

function joinPresent(parts: (string | null | undefined)[]): string | undefined {
  const kept = parts.filter(
    (part): part is string => part !== undefined && part !== null && part !== '',
  );
  return kept.length === 0 ? undefined : kept.join(' · ');
}
