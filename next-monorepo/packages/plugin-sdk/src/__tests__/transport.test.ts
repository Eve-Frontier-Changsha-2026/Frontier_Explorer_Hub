import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostMessageTransport } from "../transport";

const listeners: Record<string, Function[]> = {};
vi.stubGlobal("window", {
  addEventListener: (type: string, fn: Function) => {
    listeners[type] = listeners[type] ?? [];
    listeners[type].push(fn);
  },
  removeEventListener: (type: string, fn: Function) => {
    listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
  },
  parent: {
    postMessage: vi.fn()
  }
});

describe("PostMessageTransport", () => {
  let transport: PostMessageTransport;

  beforeEach(() => {
    listeners.message = [];
    transport = new PostMessageTransport("*");
    (window.parent.postMessage as ReturnType<typeof vi.fn>).mockClear();
  });

  it("sends request via postMessage and resolves on response", async () => {
    const promise = transport.request<string>("getUser");
    const sentMsg = (window.parent.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const reqId = sentMsg.message.id;

    const onMessage = listeners.message.at(-1) as Function;
    onMessage({
      data: {
        source: "explorer-hub-host",
        message: { id: reqId, success: true, data: "user-data" }
      }
    });

    await expect(promise).resolves.toBe("user-data");
  });

  it("rejects on error response", async () => {
    const promise = transport.request("getUser");
    const sentMsg = (window.parent.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const reqId = sentMsg.message.id;

    const onMessage = listeners.message.at(-1) as Function;
    onMessage({
      data: {
        source: "explorer-hub-host",
        message: { id: reqId, success: false, error: "Unauthorized" }
      }
    });

    await expect(promise).rejects.toThrow("Unauthorized");
  });

  it("dispatches events to registered handlers", () => {
    const handler = vi.fn();
    transport.on("viewportChange", handler);

    const onMessage = listeners.message.at(-1) as Function;
    onMessage({
      data: {
        source: "explorer-hub-host",
        message: { type: "viewportChange", data: { zoom: 5 } }
      }
    });

    expect(handler).toHaveBeenCalledWith({ zoom: 5 });
  });
});
