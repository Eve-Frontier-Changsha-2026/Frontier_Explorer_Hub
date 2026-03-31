import {
  type ChildMessage,
  type WalletSignRequest,
  type WalletSignResponse,
  WALLET_BRIDGE_SOURCE_CHILD,
  WALLET_BRIDGE_SOURCE_HOST,
  isAllowedOrigin,
} from "./types";

type ConnectRequestHandler = () => void;
type SignRequestHandler = (id: string, txBytes: string) => void;

export class WalletBridgeHost {
  private iframe: HTMLIFrameElement;
  private connectHandler: ConnectRequestHandler | null = null;
  private signHandler: SignRequestHandler | null = null;

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
    window.addEventListener("message", this.handleMessage);
  }

  onConnectRequest(handler: ConnectRequestHandler) {
    this.connectHandler = handler;
  }

  onSignRequest(handler: SignRequestHandler) {
    this.signHandler = handler;
  }

  broadcastState(address: string, network: string) {
    this.iframe.contentWindow?.postMessage(
      {
        source: WALLET_BRIDGE_SOURCE_HOST,
        type: "wallet:state",
        address,
        network,
      },
      "*"
    );
  }

  broadcastDisconnect() {
    this.iframe.contentWindow?.postMessage(
      {
        source: WALLET_BRIDGE_SOURCE_HOST,
        type: "wallet:disconnect",
      },
      "*"
    );
  }

  sendSignResponse(
    id: string,
    result: { digest?: string; error?: string }
  ) {
    const msg: WalletSignResponse = {
      source: WALLET_BRIDGE_SOURCE_HOST,
      type: "wallet:sign-response",
      id,
      ...result,
    };
    this.iframe.contentWindow?.postMessage(msg, "*");
  }

  private handleMessage = (event: MessageEvent) => {
    if (!isAllowedOrigin(event.origin)) return;

    const data = event.data as ChildMessage;
    if (!data || data.source !== WALLET_BRIDGE_SOURCE_CHILD) return;

    switch (data.type) {
      case "wallet:connect-request":
        this.connectHandler?.();
        break;
      case "wallet:sign-request": {
        const req = data as WalletSignRequest;
        if (req.id && req.txBytes) {
          this.signHandler?.(req.id, req.txBytes);
        }
        break;
      }
    }
  };

  destroy() {
    window.removeEventListener("message", this.handleMessage);
  }
}
