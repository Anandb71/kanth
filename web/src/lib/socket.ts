// Browser side of /ws. Reconnects with backoff, keeps a heartbeat, and queues
// messages sent while the connection is down so nothing the user chose is lost.
import type { ClientMessage, ServerMessage } from "../../../shared/protocol.ts";

type Listener = (msg: ServerMessage) => void;
export type LinkState = "connecting" | "open" | "closed";

export class KanthSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<(s: LinkState) => void>();
  private queue: ClientMessage[] = [];
  private attempt = 0;
  private heartbeat: number | undefined;
  private stopped = false;
  state: LinkState = "connecting";
  rttMs = 0;

  constructor(private url = defaultUrl()) {
    this.connect();
    // Reflect real connectivity at once instead of waiting for a socket timeout.
    window.addEventListener("offline", () => this.dropForOffline());
    window.addEventListener("online", () => {
      if (this.state !== "open" && !this.stopped) this.connect();
    });
  }

  /** The device went offline: show it immediately. Cached phrases keep working. */
  dropForOffline(): void {
    this.setState("closed");
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onState(fn: (s: LinkState) => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else if (msg.t !== "stt_audio" && msg.t !== "ping") this.queue.push(msg);
  }

  close(): void {
    this.stopped = true;
    window.clearInterval(this.heartbeat);
    this.ws?.close();
  }

  private setState(s: LinkState): void {
    this.state = s;
    for (const fn of this.stateListeners) fn(s);
  }

  private connect(): void {
    this.setState("connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.setState("open");
      const pending = this.queue.splice(0);
      for (const m of pending) ws.send(JSON.stringify(m));
      window.clearInterval(this.heartbeat);
      this.heartbeat = window.setInterval(() => this.send({ t: "ping", at: performance.now() }), 10000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.t === "pong") this.rttMs = performance.now() - msg.at;
      for (const fn of this.listeners) fn(msg);
    };
    ws.onclose = () => {
      window.clearInterval(this.heartbeat);
      if (this.stopped) return;
      this.setState("closed");
      if (!navigator.onLine) return; // the "online" event reconnects
      const delay = Math.min(8000, 250 * 2 ** this.attempt++) * (0.7 + Math.random() * 0.6);
      window.setTimeout(() => this.connect(), delay);
    };
  }
}

function defaultUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}
