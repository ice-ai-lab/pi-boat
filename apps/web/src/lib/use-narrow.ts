import { useEffect, useState } from 'react';

/** 窄屏门禁断点（原型第二条断点 880px，docs/06 §9.1） */
export const NARROW_BREAKPOINT_PX = 880;

/** 视口是否窄于门禁宽度（M1 只保大屏，不做小屏适配） */
export function useNarrow(breakpointPx = NARROW_BREAKPOINT_PX): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpointPx,
  );
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [breakpointPx]);
  return narrow;
}
