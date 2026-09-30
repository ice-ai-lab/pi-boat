import { afterAll, describe, expect, it, vi } from 'vitest';

// pickDirectory 只走 execFile(osascript) + platform 分支：把两个宿主能力钉住，
// 其余 SystemService 的真实语义归 system-service.test.ts（那里用真实 git/文件系统）
const execFileMock = vi.hoisted(() => vi.fn());
const mockPlatform = vi.hoisted(() => ({ value: 'darwin' }));

vi.mock('node:child_process', () => ({ execFile: execFileMock }));
vi.mock('node:os', () => ({
  homedir: () => '/home/tester',
  platform: () => mockPlatform.value,
}));

const { SystemService } = await import('../src/system/system-service');

afterAll(() => {
  vi.restoreAllMocks();
});

describe('SystemService.pickDirectory', () => {
  it('macOS：osascript 的 POSIX 路径去尾斜杠后返回 picked', async () => {
    execFileMock.mockImplementation((_file: unknown, _args: unknown, callback: unknown) => {
      (callback as (error: null, result: { stdout: string }) => void)(null, {
        stdout: '/Users/tester/New Project/\n',
      });
    });
    await expect(new SystemService().pickDirectory()).resolves.toEqual({
      status: 'picked',
      path: '/Users/tester/New Project',
    });
    expect(execFileMock).toHaveBeenCalledWith(
      'osascript',
      ['-e', 'POSIX path of (choose folder)'],
      expect.any(Function),
    );
  });

  it('macOS：根目录 `/` 去尾斜杠后仍保留', async () => {
    execFileMock.mockImplementation((_file: unknown, _args: unknown, callback: unknown) => {
      (callback as (error: null, result: { stdout: string }) => void)(null, { stdout: '/\n' });
    });
    await expect(new SystemService().pickDirectory()).resolves.toEqual({
      status: 'picked',
      path: '/',
    });
  });

  it('macOS：用户取消（stderr 带 (-128)，错误码不随系统语言变）→ canceled', async () => {
    const error = new Error('exec failed') as Error & { stderr: string };
    error.stderr = 'execution error: User canceled. (-128)';
    execFileMock.mockImplementation((_file: unknown, _args: unknown, callback: unknown) => {
      (callback as (error: Error) => void)(error);
    });
    await expect(new SystemService().pickDirectory()).resolves.toEqual({ status: 'canceled' });
  });

  it('macOS：其他失败原样抛出（前端回落内建选择器）', async () => {
    execFileMock.mockImplementation((_file: unknown, _args: unknown, callback: unknown) => {
      (callback as (error: Error) => void)(new Error('osascript: not found'));
    });
    await expect(new SystemService().pickDirectory()).rejects.toThrow('osascript: not found');
  });

  it('非 macOS → unsupported（前端回落内建选择器）', async () => {
    mockPlatform.value = 'win32';
    await expect(new SystemService().pickDirectory()).resolves.toEqual({ status: 'unsupported' });
  });
});
