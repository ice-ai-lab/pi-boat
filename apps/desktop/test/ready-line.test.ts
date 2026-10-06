import { describe, expect, it } from 'vitest';
import { parseReadyLine } from '../src/main/server-process';

/**
 * 就绪行解析：锁 `packages/server/src/start.ts` 的 stdout 契约口径
 * （`[pi-boat-server] listening on <url>`，ADR-0035 就绪信号）。
 */
describe('parseReadyLine', () => {
  it('parses the ready line into a URL', () => {
    const url = parseReadyLine('[pi-boat-server] listening on http://127.0.0.1:41234');
    expect(url).not.toBeNull();
    expect(url?.protocol).toBe('http:');
    expect(url?.hostname).toBe('127.0.0.1');
    expect(url?.port).toBe('41234');
  });

  it('accepts surrounding text on the same line', () => {
    expect(
      parseReadyLine('noise before [pi-boat-server] listening on http://127.0.0.1:1 ok'),
    ).not.toBeNull();
  });

  it('returns null for unrelated lines', () => {
    expect(parseReadyLine('')).toBeNull();
    expect(parseReadyLine('[pi-boat] Open http://127.0.0.1:9527 to start')).toBeNull();
    expect(parseReadyLine('[pi-boat-server] SIGINT received, shutting down…')).toBeNull();
  });

  it('returns null when the URL is malformed', () => {
    expect(parseReadyLine('[pi-boat-server] listening on ::not-a-url::')).toBeNull();
  });
});
