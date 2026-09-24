import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';

/**
 * `models.json` 的读写（docs/02 §6.4）。
 *
 * 为什么需要一层封装：文件由**两个进程**共用（本服务与用户手边的 pi CLI/TUI），
 * 而面板的"保存"是**整份覆盖**。因此读取必须比 JSON.parse 宽容——
 * pi 自己接受的东西这里读不出来，就等于用户一按保存就把配置删空。
 *
 * 宽容三条（与 pi 的加载器对齐）：BOM、`//` 行注释、尾逗号。
 * 读不出来时**抛错而不是返回空**：空会让上面那条"删空"真实发生。
 */

/** 面板与 pi 都认的 provider 级字段（写入前归一化 cost） */
const MODEL_COST_KEYS = ['input', 'output', 'cacheRead', 'cacheWrite'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function modelsConfigPath(agentDir?: string): string {
  return join(agentDir ?? getAgentDir(), 'models.json');
}

/** models.json 存在但内容不能用 ⇒ 绝不允许被覆盖（面板的整份保存会丢数据） */
export class ModelsConfigReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelsConfigReadError';
  }
}

/**
 * 与 pi 的 `stripJsonComments` 等价（SDK 未导出）：去 `//` 行注释与尾逗号，
 * 字符串字面量内的 `//` 不动。
 */
function stripJsonComments(input: string): string {
  return input
    .replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g, (match) => (match.startsWith('"') ? match : ''))
    .replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (match, tail?: string) =>
      tail !== undefined ? tail : match.startsWith('"') ? match : '',
    );
}

/** cost 组部分给值时补 0（组内缺键会让 pi 的计价读出 undefined） */
function normalizeModelCost(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const provided = MODEL_COST_KEYS.filter((key) => value[key] !== undefined);
  if (provided.length === 0) return undefined;
  if (provided.some((key) => typeof value[key] !== 'number' || !Number.isFinite(value[key]))) {
    return undefined;
  }
  return Object.fromEntries([
    ...Object.entries(value),
    ...MODEL_COST_KEYS.map((key) => [key, value[key] ?? 0]),
  ]);
}

/** cost 组补零；整组为空则删掉该键（而不是留一个半截对象） */
export function normalizeModelsConfigCosts(data: Record<string, unknown>): Record<string, unknown> {
  const normalized = structuredClone(data);
  if (!isRecord(normalized.providers)) return normalized;
  for (const provider of Object.values(normalized.providers)) {
    if (!isRecord(provider) || !Array.isArray(provider.models)) continue;
    for (const model of provider.models) {
      if (!isRecord(model) || !('cost' in model)) continue;
      const cost = normalizeModelCost(model.cost);
      if (cost !== undefined) model.cost = cost;
      else delete model.cost;
    }
  }
  return normalized;
}

/** 丢弃空 id 的模型条目（面板编辑中途留下的半成品） */
function sanitizeModelsConfig(data: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(data.providers)) return data;
  const providers = Object.fromEntries(
    Object.entries(data.providers).map(([providerId, provider]) => {
      if (!isRecord(provider) || !Array.isArray(provider.models)) return [providerId, provider];
      const models = provider.models.filter(
        (model) => !isRecord(model) || typeof model.id !== 'string' || model.id.trim().length > 0,
      );
      return [providerId, { ...provider, models }];
    }),
  );
  return { ...data, providers };
}

/** 读取（宽容解析）；文件不存在 → `{providers:{}}` */
export function readModelsConfig(path = modelsConfigPath()): Record<string, unknown> {
  if (!existsSync(path)) return { providers: {} };
  let parsed: unknown;
  try {
    const content = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
    if (content.trim() === '') return { providers: {} };
    parsed = JSON.parse(stripJsonComments(content));
  } catch (error) {
    throw new ModelsConfigReadError(
      `Failed to read models.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new ModelsConfigReadError('Failed to read models.json: expected a JSON object');
  }
  return parsed;
}

/**
 * 写入（归一化 cost + 清空 id + 原子替换）。
 * 写前**先读一遍**：读不出来说明面板的草稿不是从这份文件构建的，写下去就是删配置。
 *
 * 权限：`0o600`——文件里可能有 provider 级 `apiKey`，不能给同机其他用户读。
 */
export function writeModelsConfig(data: Record<string, unknown>, path = modelsConfigPath()): void {
  readModelsConfig(path);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const normalized = normalizeModelsConfigCosts(sanitizeModelsConfig(data));
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(normalized, null, 2), { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, path);
}
