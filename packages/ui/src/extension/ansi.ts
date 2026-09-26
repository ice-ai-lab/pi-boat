// biome-ignore-all lint/suspicious/noControlCharactersInRegex: \x1B/\x07 等控制字符是 ANSI 转义序列本身的组成（按设计规范 lib/ansi.ts）
const ANSI_ESCAPE_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g;
const TUI_CURSOR_MARKER_RE = /\x1B_pi:c\x07/g;

/** 剔除 ANSI 转义序列（设计规范 的 stripAnsi，完全落地） */
export function stripAnsi(text: string): string {
  return text.replace(TUI_CURSOR_MARKER_RE, '').replace(ANSI_ESCAPE_RE, '');
}
