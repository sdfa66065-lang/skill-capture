import type { ErrorCode, PushCmd, Pushes, RequestCmd, Requests, ResponseMsg } from '@game/shared';

export class NetError extends Error {
  constructor(readonly code: ErrorCode | 'DISCONNECTED') {
    super(code);
  }
}

type Pending = { resolve: (d: unknown) => void; reject: (e: NetError) => void };

/** WebSocket 请求/响应 + 服务端推送 + 服务器时间同步 */
class Net {
  private ws: WebSocket | null = null;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Map<string, Set<(data: never) => void>>();
  private closeHandler: (() => void) | null = null;
  /** 服务器时间 - 本地时间 */
  private offset = 0;

  connect(url = defaultUrl()): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new NetError('DISCONNECTED'));
      ws.onclose = () => {
        for (const p of this.pending.values()) p.reject(new NetError('DISCONNECTED'));
        this.pending.clear();
        this.closeHandler?.();
      };
      ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data));
      this.ws = ws;
    });
  }

  private onMessage(msg: ResponseMsg | { cmd: PushCmd; data: unknown }) {
    if ('seq' in msg) {
      const p = this.pending.get(msg.seq);
      this.pending.delete(msg.seq);
      if (!p) return;
      if (msg.ok) p.resolve(msg.data);
      else p.reject(new NetError(msg.error));
      return;
    }
    for (const fn of this.listeners.get(msg.cmd) ?? []) fn(msg.data as never);
  }

  request<C extends RequestCmd>(cmd: C, data: Requests[C][0]): Promise<Requests[C][1]> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return reject(new NetError('DISCONNECTED'));
      const seq = ++this.seq;
      this.pending.set(seq, { resolve: resolve as (d: unknown) => void, reject });
      this.ws.send(JSON.stringify({ cmd, seq, data }));
    });
  }

  /** 订阅推送，返回取消订阅函数 */
  on<C extends PushCmd>(cmd: C, fn: (data: Pushes[C]) => void): () => void {
    let set = this.listeners.get(cmd);
    if (!set) this.listeners.set(cmd, (set = new Set()));
    set.add(fn as (data: never) => void);
    return () => set.delete(fn as (data: never) => void);
  }

  onClose(fn: () => void) {
    this.closeHandler = fn;
  }

  /** 取往返最快的一次估算时钟差 */
  async syncTime() {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t = Date.now();
      const { serverTime } = await this.request('ping', { t });
      const now = Date.now();
      if (now - t < best) {
        best = now - t;
        this.offset = serverTime - (t + now) / 2;
      }
    }
  }

  serverNow(): number {
    return Date.now() + this.offset;
  }
}

function defaultUrl(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) return configured;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export const net = new Net();
