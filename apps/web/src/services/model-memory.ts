/**
 * 模型选择记忆（用户 2026-09-30 要求：选过模型后，下一次新会话自动沿用）。
 * 记录「最后一次选中的模型」（不分项目与会话——在会话里切的模型同样算数），
 * localStorage，best-effort：存储不可用时只是不记忆，不影响任何功能。
 */
const LAST_MODEL_KEY = 'piboat:last-model';

export interface LastModel {
  provider: string;
  modelId: string;
}

export function getLastModel(): LastModel | null {
  try {
    const raw = window.localStorage.getItem(LAST_MODEL_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as LastModel).provider !== 'string' ||
      typeof (parsed as LastModel).modelId !== 'string'
    ) {
      return null;
    }
    return { provider: (parsed as LastModel).provider, modelId: (parsed as LastModel).modelId };
  } catch {
    return null;
  }
}

export function setLastModel(model: LastModel): void {
  try {
    window.localStorage.setItem(LAST_MODEL_KEY, JSON.stringify(model));
  } catch {
    // 存储不可用：best-effort
  }
}
