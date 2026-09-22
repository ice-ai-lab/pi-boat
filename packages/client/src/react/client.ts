import { type ApiClient, createApiClient } from '../http';

/**
 * 默认 ApiClient（同源 + protocol 路径常量自带 /api 前缀）。
 * 需要直连（Electron / LAN / 非默认端口）时用 react 层的 `setApiClient()` 覆盖。
 */
let defaultClient: ApiClient = createApiClient();

export function setApiClient(client: ApiClient): void {
  defaultClient = client;
}

export function getApiClient(): ApiClient {
  return defaultClient;
}
