import type { BridgeMessage, BridgeRequest, BridgeResponse, BridgeEvent } from "./types";

type ResponseHandler = (response: BridgeResponse) => void;
type EventHandler = (data: unknown) => void;

export class PostMessageTransport {
  private pendingRequests = new Map<string, ResponseHandler>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private requestCounter = 0;

  constructor(private targetOrigin: string = "*") {
    window.addEventListener("message", this.handleMessage);
  }

  private handleMessage = (event: MessageEvent) => {
    const msg = event.data as BridgeMessage;
    if (msg?.source !== "explorer-hub-host") return;

    const inner = msg.message;

    if ("id" in inner && "success" in inner) {
      const handler = this.pendingRequests.get(inner.id);
      if (handler) {
        handler(inner as BridgeResponse);
        this.pendingRequests.delete(inner.id);
      }
      return;
    }

    if ("type" in inner && !("id" in inner)) {
      const evt = inner as BridgeEvent;
      const handlers = this.eventHandlers.get(evt.type);
      handlers?.forEach((h) => h(evt.data));
    }
  };

  async request<T>(type: BridgeRequest["type"], payload: unknown = {}, timeoutMs = 30_000): Promise<T> {
    const id = `req-${++this.requestCounter}-${Date.now()}`;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Plugin SDK request '${type}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, (response) => {
        clearTimeout(timer);
        if (response.success) resolve(response.data as T);
        else reject(new Error(response.error ?? "Unknown error"));
      });

      const msg: BridgeMessage = {
        source: "explorer-hub-sdk",
        message: { id, type, payload }
      };
      window.parent.postMessage(msg, this.targetOrigin);
    });
  }

  on(eventType: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)?.add(handler);
    return () => {
      this.eventHandlers.get(eventType)?.delete(handler);
    };
  }

  destroy() {
    window.removeEventListener("message", this.handleMessage);
    this.pendingRequests.clear();
    this.eventHandlers.clear();
  }
}
