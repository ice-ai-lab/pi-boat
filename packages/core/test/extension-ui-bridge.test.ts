import { describe, expect, it, vi } from 'vitest';
import { ExtensionUiBridge } from '../src/agent/extension-ui-bridge';

/**
 * 扩展 UI 桥（ADR-0012）：9 个 RPC 面 method、三个 SDK 不兜的兜底
 * （默认超时 / dispose 清账 / 关闭通知）、TUI 专属成员的 no-op 语义。
 */

function makeBridge(options: { defaultTimeoutMs?: number } = {}) {
  const requests: Array<Record<string, unknown>> = [];
  const closed: Array<{ id: string; reason: string }> = [];
  const bridge = new ExtensionUiBridge({
    emit: (request) => requests.push(request as unknown as Record<string, unknown>),
    emitClosed: (id, reason) => closed.push({ id, reason }),
    defaultTimeoutMs: options.defaultTimeoutMs ?? 5 * 60_000,
  });
  return { bridge, requests, closed, ui: bridge.createContext() };
}

describe('ExtensionUiBridge：下行请求', () => {
  it('fire-and-forget 类 method 立即发事件并更新快照', () => {
    const { ui, requests, bridge } = makeBridge();

    ui.notify('已保存', 'info');
    ui.setStatus('lint', 'clean');
    ui.setStatus('tmp', 'x');
    ui.setStatus('tmp', undefined); // 缺省 = 清除
    ui.setWidget('w1', ['line1', 'line2'], { placement: 'belowEditor' });
    ui.setWidget('w2', ['gone']);
    ui.setWidget('w2', undefined);
    ui.setTitle('pi-boat');
    ui.setEditorText('draft');

    expect(requests.map((r) => r.method)).toEqual([
      'notify',
      'setStatus',
      'setStatus',
      'setStatus',
      'setWidget',
      'setWidget',
      'setWidget',
      'setTitle',
      'set_editor_text',
    ]);
    expect(bridge.statusItems).toEqual([{ statusKey: 'lint', statusText: 'clean' }]);
    expect(bridge.widgetItems).toEqual([
      { widgetKey: 'w1', widgetLines: ['line1', 'line2'], widgetPlacement: 'belowEditor' },
    ]);
  });

  it('setWidget 的工厂形态被忽略（RPC 模式同样不支持 pi-tui 组件）', () => {
    const { ui, requests } = makeBridge();
    ui.setWidget('w', (() => ({})) as never);
    expect(requests).toEqual([]);
  });

  it('pasteToEditor 退化为设置编辑器文本；getEditorText 返回宿主快照', () => {
    const { ui, requests } = makeBridge();
    ui.pasteToEditor('pasted');
    expect(requests.map((r) => r.method)).toEqual(['set_editor_text']);
    expect(ui.getEditorText()).toBe('pasted');
  });

  it('TUI 专属成员逐个 no-op，custom 直接返回 undefined（不挂起）', async () => {
    const { ui, requests } = makeBridge();
    expect(ui.onTerminalInput(() => {})).toBeTypeOf('function');
    ui.setWorkingMessage('x');
    ui.setWorkingVisible(true);
    ui.setWorkingIndicator({ frames: [] });
    ui.setHiddenThinkingLabel('x');
    ui.setFooter(undefined);
    ui.setHeader(undefined);
    ui.addAutocompleteProvider(() => ({}) as never);
    ui.setEditorComponent(undefined);
    expect(ui.getEditorComponent()).toBeUndefined();
    expect(ui.getToolsExpanded()).toBe(false);
    ui.setToolsExpanded(true);
    expect(ui.getAllThemes()).toEqual([]);
    expect(ui.getTheme('dark')).toBeUndefined();
    expect(ui.setTheme('dark')).toEqual({ success: false, error: expect.any(String) });
    await expect(ui.custom(() => ({}) as never)).resolves.toBeUndefined();
    // 以上都不该产生下行请求
    expect(requests).toEqual([]);
  });
});

describe('ExtensionUiBridge：阻塞型往返', () => {
  it('select：应答 value 结算；未知 id 的应答返回 false（正常竞态，不报错）', async () => {
    const { ui, bridge } = makeBridge();
    const promise = ui.select('选一个', ['a', 'b']);
    const request = bridge.pendingCount === 1 ? 1 : 0;
    expect(request).toBe(1);

    const pending = (bridge as unknown as { pending: Map<string, unknown> }).pending;
    const id = [...pending.keys()][0] as string;
    expect(bridge.respond({ id, value: 'b' })).toBe(true);
    await expect(promise).resolves.toBe('b');
    expect(bridge.respond({ id: 'gone', value: 'x' })).toBe(false);
  });

  it('confirm：cancelled → false（默认值语义不是 undefined）', async () => {
    const { ui, bridge } = makeBridge();
    const promise = ui.confirm('删掉吗', '不可恢复');
    const id = [
      ...(bridge as never as { pending: Map<string, unknown> }).pending.keys(),
    ][0] as string;
    bridge.respond({ id, cancelled: true });
    await expect(promise).resolves.toBe(false);
  });

  it('input：应答 value；editor 同样走阻塞通道（RPC 载荷没有 timeout 字段）', async () => {
    const { ui, bridge } = makeBridge();
    const input = ui.input('名字', '占位');
    const editor = ui.editor('长文本', 'prefill');
    const pending = (bridge as unknown as { pending: Map<string, unknown> }).pending;
    expect(pending.size).toBe(2);
    const ids = [...pending.keys()];
    bridge.respond({ id: ids[0] as string, value: 'answer' });
    bridge.respond({ id: ids[1] as string, value: 'multi\nline' });
    await expect(input).resolves.toBe('answer');
    await expect(editor).resolves.toBe('multi\nline');
  });

  it('扩展自己的 opts.timeout 到期 → 默认值（不通知客户端关闭）', async () => {
    vi.useFakeTimers();
    try {
      const { ui, closed } = makeBridge();
      const promise = ui.select('t', ['a'], { timeout: 50 });
      vi.advanceTimersByTime(60);
      await expect(promise).resolves.toBeUndefined();
      expect(closed).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('宿主默认超时到期 → 默认值 + 通知客户端关闭（ADR-0012 自补项）', async () => {
    vi.useFakeTimers();
    try {
      const { ui, closed, bridge } = makeBridge({ defaultTimeoutMs: 100 });
      const promise = ui.editor('t');
      expect(bridge.pendingCount).toBe(1);
      vi.advanceTimersByTime(120);
      await expect(promise).resolves.toBeUndefined();
      expect(closed).toEqual([{ id: expect.any(String), reason: 'timeout' }]);
      expect(bridge.pendingCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opts.signal abort → 默认值', async () => {
    const { ui } = makeBridge();
    const controller = new AbortController();
    const promise = ui.input('t', undefined, { signal: controller.signal });
    controller.abort();
    await expect(promise).resolves.toBeUndefined();
  });
});

describe('ExtensionUiBridge：清账与快照', () => {
  it('cancelAllPending → 全部以 cancelled 结算，并逐个发出关闭通知', async () => {
    const { ui, bridge, closed } = makeBridge();
    const a = ui.select('a', ['1']);
    const b = ui.confirm('b', 'm');
    const c = ui.input('c');
    expect(bridge.pendingCount).toBe(3);

    bridge.cancelAllPending();
    await expect(a).resolves.toBeUndefined();
    await expect(b).resolves.toBe(false);
    await expect(c).resolves.toBeUndefined();
    expect(closed.map((x) => x.reason)).toEqual(['shutdown', 'shutdown', 'shutdown']);
    expect(bridge.pendingCount).toBe(0);
  });

  it('dispose：清账 + 清空快照；此后新请求直接回落默认值（不再发事件）', async () => {
    const { ui, bridge, requests } = makeBridge();
    ui.setStatus('k', 'v');
    ui.setWidget('w', ['x']);
    const pending = ui.select('t', ['a']);

    bridge.dispose();
    await expect(pending).resolves.toBeUndefined();
    expect(bridge.statusItems).toEqual([]);
    expect(bridge.widgetItems).toEqual([]);

    const before = requests.length;
    await expect(ui.select('t', ['a'])).resolves.toBeUndefined();
    expect(requests.length).toBe(before); // disposed 后不再下发
  });

  it('clearStatusesAndWidgets：扩展重绑时撤下旧残留（未决请求不受影响）', async () => {
    const { ui, bridge } = makeBridge();
    ui.setStatus('old', 'stale');
    const pending = ui.select('t', ['a']);
    bridge.clearStatusesAndWidgets();
    expect(bridge.statusItems).toEqual([]);
    expect(bridge.pendingCount).toBe(1);
    bridge.cancelAllPending();
    await pending;
  });
});
