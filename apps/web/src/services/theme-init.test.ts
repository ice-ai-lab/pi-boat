import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { THEME_INIT_SCRIPT, THEME_OPTIONS } from '@ice-ai/client';
import { describe, expect, it } from 'vitest';

/**
 * 首帧主题脚本（`index.html` 内联）与 client 的 `THEME_INIT_SCRIPT` 必须语义一致：
 * 两边各有一份「调色板 id 清单 + storage key + dark/pine 判定」，任何一边加主题都会漂移。
 * 这里不做逐字比对（两侧写法不同：内联版被 Biome 格式化过），只锁这三件事实。
 */
const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');

describe('首帧主题脚本', () => {
  it('调色板清单与 THEME_OPTIONS 一致', () => {
    const ids = THEME_OPTIONS.map((option) => option.id);
    expect(ids).toHaveLength(6);
    const listPattern = new RegExp(`\\[${ids.map((id) => `'${id}'`).join(', ')}\\s*\\]`);
    expect(html).toMatch(listPattern);
  });

  it('storage key 与 client 的脚本一致', () => {
    const key = /localStorage\.getItem\(['"]([^'"]+)['"]\)/.exec(THEME_INIT_SCRIPT)?.[1];
    expect(key).toBeDefined();
    expect(html).toContain(`localStorage.getItem('${key}')`);
  });

  it('写 data-theme 且 dark/pine 都算暗色', () => {
    expect(html).toContain('dataset.theme');
    expect(html).toMatch(/theme === 'dark' \|\| theme === 'pine'/);
  });
});
