import type { SlashCommandInfo } from '@ice-ai/protocol';

/**
 * 斜杠命令的输入匹配与展示（A 类移植自 pi-web lib/slash-display.ts 的匹配部分）。
 * 与 `@` 提及的区别：斜杠命令必须在**行首**（或仅前导空白）——命令不嵌在句子里。
 */

export interface SlashQueryMatch {
  /** `/` 在文本中的下标 */
  start: number;
  /** `/` 之后已输入的文本（命令名 + 可能已跟的空格与参数） */
  query: string;
  /** 已输入命令名（不含参数） */
  name: string;
  /** 已进入参数区（`/cmd ` 之后） */
  hasArgs: boolean;
}

/** 光标前的斜杠 token（行首或前导空白之后） */
export function extractSlashQuery(textBeforeCursor: string): SlashQueryMatch | null {
  const match = /(?:^|\s)\/([^\s]*)(\s.*)?$/s.exec(textBeforeCursor);
  if (match === null) return null;
  const name = match[1] ?? '';
  const args = match[2];
  return {
    start:
      textBeforeCursor.length -
      (args === undefined ? name.length + 1 : name.length + 1 + args.length),
    query: `${name}${args ?? ''}`,
    name,
    hasArgs: args !== undefined,
  };
}

const SOURCE_LABEL: Record<string, string> = {
  extension: '扩展',
  prompt: '模板',
  skill: 'skill',
};

export function slashSourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

/** 按命令名过滤（前缀优先，再子串；不区分大小写），限制条数 */
export function filterSlashCommands(
  commands: readonly SlashCommandInfo[],
  name: string,
  limit = 20,
): SlashCommandInfo[] {
  const needle = name.toLowerCase();
  if (needle.length === 0) return [...commands].slice(0, limit);
  const prefix: SlashCommandInfo[] = [];
  const substring: SlashCommandInfo[] = [];
  for (const command of commands) {
    const lower = command.name.toLowerCase();
    if (lower.startsWith(needle)) prefix.push(command);
    else if (lower.includes(needle)) substring.push(command);
  }
  prefix.sort((a, b) => a.name.localeCompare(b.name));
  substring.sort((a, b) => a.name.localeCompare(b.name));
  return [...prefix, ...substring].slice(0, limit);
}

/** 选中候选后替换整段命令 token（命令名 + 尾随空格，便于继续输参数） */
export function applySlashInsertion(
  text: string,
  match: SlashQueryMatch,
  commandName: string,
): { text: string; caret: number } {
  const replacement = `/${commandName} `;
  const end = match.start + 1 + match.query.length;
  const next = `${text.slice(0, match.start)}${replacement}${text.slice(end)}`;
  return { text: next, caret: match.start + replacement.length };
}

/** 提交时的命令解析：`/name args` → { name, args }；非命令返回 null */
export function parseSlashSubmission(text: string): { name: string; args: string } | null {
  const match = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (match === null) return null;
  return { name: match[1] ?? '', args: (match[2] ?? '').trim() };
}
