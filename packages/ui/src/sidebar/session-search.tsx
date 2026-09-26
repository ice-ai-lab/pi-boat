import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input } from '../primitives/input';

/**
 * SessionSearch（docs/06 §4.3）：输入框 + 防抖（宿主用返回的 debouncedQuery 发服务端搜索）。
 * 正文搜索在服务端做（有界候选扫正文，G2-7），本组件只管输入与防抖。
 * 视觉对齐 pi-web `SessionSidebar` 的搜索行（32px 高、mono 11px）。
 */
export interface SessionSearchProps {
  onQueryChange(query: string): void;
  /** 防抖毫秒（默认 300） */
  delayMs?: number;
  placeholder?: string;
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function SessionSearch({
  onQueryChange,
  delayMs = 300,
  placeholder = '搜索会话（标题 / 正文）',
}: SessionSearchProps) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, delayMs);

  useEffect(() => {
    onQueryChange(debounced.trim());
  }, [debounced, onQueryChange]);

  return (
    <div className="relative flex items-center">
      <Search size={13} className="pointer-events-none absolute left-2.5 text-text-dim" />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className="pl-7 pr-7 font-mono"
      />
      {query.length > 0 && (
        <button
          type="button"
          aria-label="清空搜索"
          onClick={() => setQuery('')}
          className="absolute right-2 flex h-5 w-5 items-center justify-center text-text-dim hover:text-text"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
