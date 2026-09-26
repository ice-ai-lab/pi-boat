/** GET /api/health —— 服务健康检查（M0 已落地） */
export type HealthResponse = {
  ok: boolean;
  name: string;
  /** 运行时 pi SDK 版本（core 读 `VERSION`，供 UI 版本块展示） */
  piVersion: string;
};

// ---------------------------------------------------------------------------
// ⑦ 辅助通道（docs/02 §7）：liveness lease
// ---------------------------------------------------------------------------
