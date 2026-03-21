# EVE EYES API Schema（Phase 0 探測結果）

> Date: 2026-03-21
> Base URL: https://eve-eyes.d0v.xyz

---

## Endpoints

只有 2 個 API endpoint，其他頁面（codex, fleet, tribes）是前端 render，無對應 API。

### `GET /api/indexer/transaction-blocks`

```json
{
  "items": [
    {
      "id": "47814",
      "digest": "7H66FmNk...",
      "network": "testnet",
      "checkpoint": "314100593",
      "senderAddress": "0xfa7eac...",
      "transactionKind": "ProgrammableTransaction",
      "status": "success",
      "errorMessage": null,
      "executedAt": "2026-03-21T01:42:27.369Z",
      "transactionTime": "2026-03-21T01:42:27.369Z",
      "createdAt": "2026-03-21T01:46:48.396Z",
      "updatedAt": "2026-03-21T01:46:48.396Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 2, "total": 13041, "totalPages": 6521, "freePageLimit": 3 },
  "auth": { "type": "apiKey" }
}
```

**Filters:** network, senderAddress, status, digest, transactionKind, checkpoint

### `GET /api/indexer/move-calls`

```json
{
  "items": [
    {
      "id": "169299",
      "txDigest": "7H66FmNk...",
      "callIndex": 2,
      "packageId": "0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75",
      "moduleName": "character",
      "functionName": "return_owner_cap",
      "rawCall": "{\"package\":\"0x...\",\"module\":\"character\",\"function\":\"return_owner_cap\",\"type_arguments\":[...],\"arguments\":[{\"Input\":0},{\"NestedResult\":[0,0]}]}",
      "transactionTime": "2026-03-21T01:42:27.369Z",
      "createdAt": "2026-03-21T01:48:07.255Z",
      "network": "testnet",
      "senderAddress": "0xfa7eac...",
      "status": "success",
      "checkpoint": "314100593"
    }
  ],
  "pagination": { "page": 1, "pageSize": 2, "total": 5088, "totalPages": 2544, "freePageLimit": 3 },
  "auth": { "type": "apiKey" }
}
```

**Filters:** network, senderAddress, status, txDigest, packageId, moduleName, functionName, callIndex

---

## rawCall 結構

rawCall 是 stringified JSON，包含 PTB argument references（不是解析後的值）：

```json
{
  "package": "0xd12a70c...",
  "module": "character",
  "function": "borrow_owner_cap",
  "type_arguments": ["0xd12a70c...::gate::Gate"],
  "arguments": [
    {"Input": 0},         // PTB input reference
    {"Input": 1},
    {"Result": 0},        // result of previous command
    {"NestedResult": [0, 0]}  // nested result
  ]
}
```

**重要：** arguments 只有 PTB references，無法直接得到實際值。需要用 txDigest 透過 SuiClient 查完整交易。

---

## Module Function Names

| moduleName | functionNames | total calls |
|------------|---------------|-------------|
| character | borrow_owner_cap, return_owner_cap | 5,088 |
| gate | anchor, offline_connected_gate, online, share_gate | 16,821 |
| turret | offline_connected_turret | 36,915 |
| storage_unit | offline_connected_storage_unit | 25,017 |
| assembly | offline_connected_assembly | 23,713 |
| network_node | anchor, deposit_fuel, destroy_offline_assemblies, online, share_network_node, update_fuel | 51,535 |
| energy | set_energy_config | 19 |
| fuel | set_fuel_efficiency | 6 |

---

## EVE World Contract

Package: `0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75`（testnet）

---

## 認證

```
Header: x-api-key: <api-key>
     or: Authorization: ApiKey <api-key>
     or: Authorization: Bearer <jwt>
```

Pages 1-3 public, 4+ require auth.

---

## 可提取的有用資料

### 直接可用（不需 SuiClient）
1. **玩家活動統計** — senderAddress 頻率分布（誰最活躍）
2. **Module 活動趨勢** — 各 module 操作量隨時間變化（哪些系統在用）
3. **交易時序** — transactionTime 可做時間序列分析
4. **特定玩家行為** — filter by senderAddress 看操作模式

### 需搭配 SuiClient（用 txDigest 查完整交易）
1. **物件 ID** — 從完整交易結果取得 created/mutated object IDs
2. **座標/位置** — 從物件狀態查詢 fields
3. **角色名稱** — 查 character object fields
4. **物件詳情** — 任何 EVE world object 的完整狀態
