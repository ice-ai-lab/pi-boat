import { CLIENT_VERSION } from '@pi-boat/client';
import { PORTS, PROTOCOL_VERSION } from '@pi-boat/protocol';

/**
 * @pi-boat/ui —— 纯展示组件库，只依赖 protocol 类型与 client hooks，
 * 不依赖任何宿主框架（Web 与桌面端直接复用，docs/01 §3.1）。
 * M1 计划：ChatWindow / MessageView / ChatInput …
 */

/** M0 占位组件：验证 apps/web → ui → client → protocol 依赖链路 */
export function PiBoatShell() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>PiBoat</h1>
      <p>
        Web UI 空壳已就绪 · client {CLIENT_VERSION} · protocol v{PROTOCOL_VERSION}
      </p>
      <p>
        Agent API: <code>http://127.0.0.1:{PORTS.server}</code>（开发期浏览器直连，M1 接入）
      </p>
    </main>
  );
}
