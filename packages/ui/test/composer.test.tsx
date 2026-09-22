import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from '../src/chat/composer';

/**
 * 组件渲染测试（无 Provider；docs/06 §1 边界 2）：输入卡的核心交互——
 * Enter 发送、空文本禁用发送、streaming 时发送键变停止。
 */
afterEach(cleanup);

describe('Composer', () => {
  it('Enter 触发提交；Shift+Enter 不提交', () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    render(
      <Composer
        value="你好"
        onChange={onChange}
        onSubmit={onSubmit}
        onAbort={vi.fn()}
        streaming={false}
      />,
    );
    const textarea = screen.getByLabelText(/消息/);
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('空文本时发送按钮禁用', () => {
    render(
      <Composer
        value="   "
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onAbort={vi.fn()}
        streaming={false}
      />,
    );
    const send = screen.getByRole('button', { name: '发送' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it('streaming 时显示停止并触发 abort', () => {
    const onAbort = vi.fn();
    render(<Composer value="" onChange={vi.fn()} onSubmit={vi.fn()} onAbort={onAbort} streaming />);
    fireEvent.click(screen.getByRole('button', { name: '停止' }));
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('模式胶囊在未给 options 时为只读（M1：预设判定归 core，docs/02 §11.1）', () => {
    render(
      <Composer
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onAbort={vi.fn()}
        streaming={false}
      />,
    );
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByText('默认')).toBeTruthy();
  });
});
