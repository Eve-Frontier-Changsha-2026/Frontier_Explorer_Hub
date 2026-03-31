# Wallet Bridge Protocol

Frontier Explorer Hub provides a postMessage-based wallet bridge for portal-embedded dApps.
When your app is loaded inside the Hub's portal iframe, you can use the parent's connected wallet
instead of asking the user to connect again.

## Detection

```ts
const isInIframe = window.self !== window.top;
```

If `isInIframe` is true, activate bridge mode.

## Message Format

All messages use `window.postMessage`. Each message has a `source` and `type` field.

### Source Identifiers

| Direction | source value |
|-----------|-------------|
| Hub → Child | `"feh-wallet-host"` |
| Child → Hub | `"feh-wallet-child"` |

### Child → Hub Messages

#### `wallet:connect-request`

Request the current wallet state. Hub will respond with `wallet:state` or `wallet:disconnect`.

```ts
window.parent.postMessage({
  source: "feh-wallet-child",
  type: "wallet:connect-request",
}, "*");
```

#### `wallet:sign-request`

Request a transaction signature. Hub will show a confirmation dialog to the user.

```ts
window.parent.postMessage({
  source: "feh-wallet-child",
  type: "wallet:sign-request",
  id: crypto.randomUUID(),       // unique request ID
  txBytes: "<base64-encoded TX>", // Transaction.build() → toBase64()
}, "*");
```

### Hub → Child Messages

#### `wallet:state`

Sent in response to `connect-request`, and whenever the wallet state changes.

```ts
{
  source: "feh-wallet-host",
  type: "wallet:state",
  address: "0x...",
  network: "testnet" | "mainnet"
}
```

#### `wallet:disconnect`

Sent when the user disconnects their wallet.

```ts
{
  source: "feh-wallet-host",
  type: "wallet:disconnect"
}
```

#### `wallet:sign-response`

Sent in response to `sign-request`.

```ts
// Success — TX was executed by parent, digest is the on-chain transaction hash
{
  source: "feh-wallet-host",
  type: "wallet:sign-response",
  id: "<matching request ID>",
  digest: "..."
}

// Error (user rejected or signing failed)
{
  source: "feh-wallet-host",
  type: "wallet:sign-response",
  id: "<matching request ID>",
  error: "User rejected the transaction"
}
```

## Allowed Origins

The Hub only accepts messages from these origins:

- `https://bounty-escrow-protocol.vercel.app`
- `https://wreckage-insurance-protocol.vercel.app`
- `https://astro-logistics-network.vercel.app`
- `https://industrial-auto-os.vercel.app`
- `http://localhost:*` (dev only)

## Example: Minimal Child Implementation

```ts
// 1. Listen for wallet state
let walletAddress: string | null = null;
let walletNetwork: string | null = null;

window.addEventListener("message", (event) => {
  const { data } = event;
  if (data?.source !== "feh-wallet-host") return;

  switch (data.type) {
    case "wallet:state":
      walletAddress = data.address;
      walletNetwork = data.network;
      break;
    case "wallet:disconnect":
      walletAddress = null;
      walletNetwork = null;
      break;
    case "wallet:sign-response":
      // Handle sign result by matching data.id
      break;
  }
});

// 2. Request initial state
window.parent.postMessage({
  source: "feh-wallet-child",
  type: "wallet:connect-request",
}, "*");

// 3. Request a signature (parent executes the TX and returns digest)
function requestSign(txBytes: string): Promise<{ digest: string }> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const { data } = event;
      if (data?.source !== "feh-wallet-host") return;
      if (data.type !== "wallet:sign-response" || data.id !== id) return;
      window.removeEventListener("message", handler);
      if (data.error) reject(new Error(data.error));
      else resolve({ digest: data.digest });
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({
      source: "feh-wallet-child",
      type: "wallet:sign-request",
      id,
      txBytes,
    }, "*");
  });
}
```
