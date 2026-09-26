import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/i18n-provider';

/** 工具项（协议 `ToolInfo` 的展示子集：`parameters` / `promptGuidelines` 来自 SDK） */
export interface ToolDefinitionView {
  name: string;
  description: string;
  /** 出现在当前激活工具集里 */
  active: boolean;
  /** JSON Schema 参数定义（SDK `ToolInfo.parameters`，形状由 getToolParameterFields 收窄） */
  parameters?: unknown;
  /** 提示词准则（SDK `ToolInfo.promptGuidelines`） */
  promptGuidelines?: string[];
}

interface ParameterField {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  allowedValues?: string;
  defaultValue?: string;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** JSON Schema 类型 → 可读字符串（按设计规范 `formatSchemaType`） */
export function formatSchemaType(schema: Record<string, unknown>): string {
  const variants = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : null;
  if (variants) {
    return variants
      .map((variant) =>
        variant && typeof variant === 'object'
          ? formatSchemaType(variant as Record<string, unknown>)
          : 'unknown',
      )
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(' | ');
  }

  if (schema.const !== undefined) return formatValue(schema.const);
  if (Array.isArray(schema.enum) && schema.enum.length > 0 && schema.type === undefined) {
    return [...new Set(schema.enum.map((value) => (value === null ? 'null' : typeof value)))].join(
      ' | ',
    );
  }

  const rawType = schema.type;
  const type = Array.isArray(rawType)
    ? rawType.filter((value): value is string => typeof value === 'string').join(' | ')
    : typeof rawType === 'string'
      ? rawType
      : typeof schema.$ref === 'string'
        ? (schema.$ref.split('/').pop() ?? 'object')
        : 'unknown';

  if (type === 'array') {
    const items = schema.items;
    const itemType =
      items && typeof items === 'object'
        ? formatSchemaType(items as Record<string, unknown>)
        : 'unknown';
    return `${itemType}[]`;
  }
  return type;
}

/** 参数表（按设计规范 `getToolParameterFields`） */
export function getToolParameterFields(parameters?: unknown): ParameterField[] {
  if (parameters === null || parameters === undefined || typeof parameters !== 'object') return [];
  const schemaRoot = parameters as Record<string, unknown>;
  if (!schemaRoot.properties || typeof schemaRoot.properties !== 'object') return [];
  const properties = schemaRoot.properties as Record<string, unknown>;
  const required = new Set(
    Array.isArray(schemaRoot.required)
      ? schemaRoot.required.filter((value): value is string => typeof value === 'string')
      : [],
  );

  return Object.entries(properties).map(([name, value]) => {
    const schema = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    return {
      name,
      type: formatSchemaType(schema),
      description: typeof schema.description === 'string' ? schema.description : undefined,
      required: required.has(name),
      allowedValues: Array.isArray(schema.enum)
        ? schema.enum.map(formatValue).join(', ')
        : undefined,
      defaultValue: schema.default === undefined ? undefined : formatValue(schema.default),
    };
  });
}

function EmptyState({ children }: { children: string }) {
  return <div className="tool-definitions-empty">{children}</div>;
}

/**
 * ToolDefinitionsPanel（T6-1）：按设计规范。
 * 两栏：左侧工具列表（`.tool-definitions-item`，选中 `inset 2px 0 0 accent`）+ 右侧参数/准则详情。
 * 挂载形态（工具条下方 `position:fixed` 下拉）由宿主负责（T1-6）。
 */
export interface ToolDefinitionsPanelProps {
  tools: ToolDefinitionView[] | null;
  loading: boolean;
}

export function ToolDefinitionsPanel({ tools, loading }: ToolDefinitionsPanelProps) {
  const { t } = useI18n();
  const activeTools = useMemo(() => tools?.filter((tool) => tool.active) ?? null, [tools]);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);

  useEffect(() => {
    setSelectedToolName((current) =>
      activeTools?.some((tool) => tool.name === current)
        ? current
        : (activeTools?.[0]?.name ?? null),
    );
  }, [activeTools]);

  const selectedTool =
    activeTools?.find((tool) => tool.name === selectedToolName) ?? activeTools?.[0] ?? null;
  const fields = selectedTool ? getToolParameterFields(selectedTool.parameters) : [];

  return (
    <div className="tool-definitions-panel">
      <nav className="tool-definitions-sidebar" aria-label={t('tools.title')}>
        <div className="tool-definitions-list">
          {activeTools && activeTools.length > 0 ? (
            activeTools.map((tool) => {
              const selected = tool.name === selectedTool?.name;
              return (
                <button
                  key={tool.name}
                  type="button"
                  className={`tool-definitions-item${selected ? ' selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => setSelectedToolName(tool.name)}
                >
                  <code>{tool.name}</code>
                </button>
              );
            })
          ) : activeTools ? (
            <EmptyState>{t('tools.noTools')}</EmptyState>
          ) : (
            <EmptyState>{loading ? t('tools.loading') : t('tools.load')}</EmptyState>
          )}
        </div>
      </nav>

      <section className="tool-definition-detail" aria-label={t('tools.details')}>
        {selectedTool ? (
          <div className="tool-definition-scroll">
            {selectedTool.description !== '' && (
              <section className="tool-definition-section">
                <div className="tool-definition-section-label">{t('tools.description')}</div>
                <div className="tool-definition-description">{selectedTool.description}</div>
              </section>
            )}

            <section className="tool-definition-section">
              <div className="tool-definition-section-label">
                <span>{t('tools.parameters')}</span>
                <span>{t('tools.parameterCount', { count: fields.length })}</span>
              </div>
              {fields.length > 0 ? (
                <div className="tool-definition-fields">
                  {fields.map((field) => (
                    <div className="tool-definition-field" key={field.name}>
                      <div className="tool-definition-field-name">
                        <code>{field.name}</code>
                        <span className={field.required ? 'required' : undefined}>
                          {t(field.required ? 'tools.required' : 'tools.optional')}
                        </span>
                      </div>
                      <div className="tool-definition-field-value">
                        <code className="tool-definition-type">{field.type}</code>
                        {field.description !== undefined && <div>{field.description}</div>}
                        {field.allowedValues !== undefined && (
                          <div className="tool-definition-meta">
                            {t('tools.allowedValues')}: <code>{field.allowedValues}</code>
                          </div>
                        )}
                        {field.defaultValue !== undefined && (
                          <div className="tool-definition-meta">
                            {t('tools.defaultValue')}: <code>{field.defaultValue}</code>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tool-definition-no-parameters">{t('tools.noParameters')}</div>
              )}
            </section>

            {selectedTool.promptGuidelines !== undefined &&
              selectedTool.promptGuidelines.length > 0 && (
                <section className="tool-definition-section">
                  <div className="tool-definition-section-label">{t('tools.guidelines')}</div>
                  <ul className="tool-definition-guidelines">
                    {selectedTool.promptGuidelines.map((guideline, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: 准则文本可能重复，位置即身份
                      <li key={`${selectedTool.name}:${index}`}>{guideline}</li>
                    ))}
                  </ul>
                </section>
              )}
          </div>
        ) : (
          <EmptyState>
            {activeTools ? t('tools.noTools') : loading ? t('tools.loading') : t('tools.load')}
          </EmptyState>
        )}
      </section>
    </div>
  );
}
