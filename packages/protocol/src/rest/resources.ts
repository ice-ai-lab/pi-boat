import { z } from 'zod';

/**
 * ⑤ REST 资源——资源域（docs/02 §6.9）：skills / plugins / 工具设置 / 项目信任。
 *
 * 这四组的共同点：**数据源都在磁盘上的资源目录**（`~/.pi/agent` 与项目 `.pi/`），
 * 而"项目级资源是否加载"由**信任**决定。因此 `?cwd` 不只是"看哪个项目"，
 * 它还决定：
 * - 未信任的项目：项目内 skills/extensions **不加载**（返回结果里
 *   `projectResourcesLoaded:false` 告诉前端"你看到的不是全部"）
 * - `POST /api/project-trust` 是**唯一**改变这一点的入口
 *
 * `POST /api/skills/install`、`/api/plugins`、`/api/skills/update`、`/api/plugins/check`
 * 会联网（npm registry）；其余只读本地。
 */

// ---------------------------------------------------------------------------
// 项目信任
// ---------------------------------------------------------------------------

export const ProjectTrustQuerySchema = z.object({
  cwd: z.string().min(1),
});
export type ProjectTrustResponse = {
  /** 该项目存在"需要信任才能加载"的资源（否则信任与否没差别） */
  requiresTrust: boolean;
  trusted: boolean;
};

export const ProjectTrustRequestSchema = z.object({
  cwd: z.string().min(1),
  /** 缺省 = 信任；false 可撤销 */
  trusted: z.boolean().optional(),
});
// ---------------------------------------------------------------------------
// skills
// ---------------------------------------------------------------------------

export const SkillsQuerySchema = z.object({
  cwd: z.string().min(1),
});
export type SkillInfo = {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  /** 来源（用户级 / 项目级 / 包内） */
  source: string;
  scope: 'user' | 'project' | 'temporary';
  /** 是否禁止模型自动调用（只能由用户显式 `/skill:name` 触发） */
  disableModelInvocation: boolean;
};

/**
 * 资源加载诊断。`collision` = 同名资源互相覆盖（两个包里都叫 `foo` 的 skill）——
 * 单独一档而不是并进 warning：它意味着"你装的某个包其实没生效"，
 * 用户要据此去决定留哪个，提示级别与措辞都不同。
 */
export type ResourceDiagnosticType = 'info' | 'warning' | 'error' | 'collision';

export type ResourceDiagnostic = {
  type: ResourceDiagnosticType;
  message: string;
};

export type SkillsResponse = {
  skills: SkillInfo[];
  diagnostics: ResourceDiagnostic[];
  /** 项目级资源是否真的加载了（未信任时为 false，前端要提示） */
  projectResourcesLoaded: boolean;
};

/**
 * PATCH /api/skills —— 切换单个 skill 的「禁止模型自动调用」。
 * 写进 `settings.json` 的 skill 覆盖表（不是改 SKILL.md 文件：那是用户的原文，
 * 我们不该为了一个开关去重写它）。
 */
export const SkillPatchRequestSchema = z.object({
  name: z.string().min(1),
  disableModelInvocation: z.boolean(),
  /** 写全局还是项目设置；缺省 global */
  scope: z.enum(['global', 'project']).optional(),
  cwd: z.string().optional(),
});
export type SkillPatchRequest = z.infer<typeof SkillPatchRequestSchema>;

/** POST /api/skills/search —— npm registry 搜索（服务端代理，浏览器不直连） */
export const SkillSearchRequestSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
});
export type SkillSearchResult = {
  package: string;
  description?: string;
  /** 周下载量（registry 给不出时为 null） */
  installs: number | null;
  url: string;
};

export type SkillSearchResponse = {
  results: SkillSearchResult[];
  error?: string;
};

/** POST /api/skills/install —— 装一个 skill 包（会联网） */
export const SkillInstallRequestSchema = z.object({
  package: z.string().min(1),
  scope: z.enum(['global', 'project']),
  cwd: z.string().optional(),
});
export type SkillInstallRequest = z.infer<typeof SkillInstallRequestSchema>;

/**
 * skill / plugin 的更新检查结果。
 * `state` 四态而不是布尔：`unsupported`（非 npm 来源，如 git 目录）与
 * `error`（网络失败）需要不同的提示文案，混成一个 false 会让用户以为"已是最新"。
 */
export type SkillUpdateState = 'up-to-date' | 'update-available' | 'unsupported' | 'error';

export type SkillUpdateResult = {
  package: string;
  state: SkillUpdateState;
  currentVersion?: string;
  latestVersion?: string;
  error?: string;
};

export type SkillCheckResponse = {
  results: SkillUpdateResult[];
};

export const SkillUpdateRequestSchema = z.object({
  package: z.string().optional(),
});
// ---------------------------------------------------------------------------
// plugins（扩展包）
// ---------------------------------------------------------------------------

export const PluginsQuerySchema = z.object({
  cwd: z.string().min(1),
});
export type PluginPackageInfo = {
  source: string;
  displayName: string;
  scope: 'user' | 'project';
  type: 'npm' | 'git' | 'local';
  /** 装到磁盘的位置（可用作展示；不可写时缺省） */
  installedPath?: string;
  /** 用户显式过滤（只加载声明的扩展/技能） */
  filtered: boolean;
  /** 该包当前是否启用（禁用 = 从 settings 的 sources 里移除但不删除磁盘副本） */
  enabled: boolean;
};

export type PluginsResponse = {
  packages: PluginPackageInfo[];
  /** 非包形式加载的扩展（用户直接放在扩展目录里的 .js/.ts） */
  standaloneExtensions: string[];
  totals: {
    packages: number;
    extensions: number;
    skills: number;
  };
  diagnostics: ResourceDiagnostic[];
  projectResourcesLoaded: boolean;
};

export const PLUGIN_ACTIONS = ['install', 'remove', 'update', 'disable', 'enable'] as const;
export const PluginActionSchema = z.enum(PLUGIN_ACTIONS);
export const PluginActionRequestSchema = z.object({
  action: PluginActionSchema,
  /** install 必填；其余动作也可用（指定要操作哪个包） */
  source: z.string().optional(),
  scope: z.enum(['global', 'project']).optional(),
  cwd: z.string().min(1),
});
export type PluginActionRequest = z.infer<typeof PluginActionRequestSchema>;

// ---------------------------------------------------------------------------
// 工具设置（Windows 专属的 PowerShell 开关）
// ---------------------------------------------------------------------------

export type ToolSettingsResponse = {
  isWindows: boolean;
  /** 非 Windows 上恒 false（字段仍在：前端按它决定是否显示开关） */
  powerShellEnabled: boolean;
};

export const ToolSettingsUpdateSchema = z.object({
  powerShellEnabled: z.boolean(),
});
