import { activeFileTab } from '@ice-ai/client';
import { useSyncExternalStore } from 'react';
import { fileTabsStore } from './file-tabs-store';

/** 订阅文件页签 store（组件侧统一入口） */
export function useFileTabs() {
  const state = useSyncExternalStore(
    fileTabsStore.subscribe.bind(fileTabsStore),
    fileTabsStore.getSnapshot.bind(fileTabsStore),
  );
  return { state, tab: activeFileTab(state) };
}
