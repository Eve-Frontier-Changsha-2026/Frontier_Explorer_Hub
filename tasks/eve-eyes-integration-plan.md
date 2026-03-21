# EVE EYES API Integration Plan

> Source: https://eve-eyes.d0v.xyz
> Status: **Updated — Phase 0 探測完成**
> Date: 2026-03-21

---

## 1. API 規格

### Base URL
`https://eve-eyes.d0v.xyz`

### 認證
```
x-api-key: <api-key>               # machine-to-machine (preferred)
Authorization: ApiKey <api-key>     # alternative
Authorization: Bearer <jwt>         # browser sessions
```

Env var: `EVE_EYES_API_KEY`（存 `.env`，不進 git）

### Endpoints（只有 2 個）

| Endpoint | 說明 |
|----------|------|
| `GET /api/indexer/transaction-blocks` | 分頁交易記錄（metadata only） |
| `GET /api/indexer/move-calls` | 分頁 move call 記錄（含 rawCall PTB payload） |

其他頁面（codex, fleet, tribes, atlas）是前端 SSR render，無對應 API。

### 分頁
- Pages 1-3：公開
- Pages 4+：需 API key
- Filters 皆為 exact-match

### 完整 response schema
→ 見 `tasks/eve-eyes-api-schema.md`

---

## 2. 核心發現

### EVE EYES ≠ Entity REST API

EVE EYES 是**鏈上 Move call 的 indexer**。rawCall 只含 PTB references（`{Input: 0}`），不是解析後的值。

**要拿遊戲物件資料（座標、角色名、物件狀態），需要雙步驟：**
1. EVE EYES → 取得 `txDigest` 和 `senderAddress`
2. SuiClient → 用 `txDigest` 查完整交易，或直接查物件狀態

### EVE World Contract
Package: `0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75`（testnet）

### Module 活動量

| moduleName | functions | total calls |
|------------|-----------|-------------|
| network_node | anchor, deposit_fuel, destroy_offline_assemblies, online, share_network_node, update_fuel | 51,535 |
| turret | offline_connected_turret | 36,915 |
| storage_unit | offline_connected_storage_unit | 25,017 |
| assembly | offline_connected_assembly | 23,713 |
| gate | anchor, offline_connected_gate, online, share_gate | 16,821 |
| character | borrow_owner_cap, return_owner_cap | 5,088 |
| energy | set_energy_config | 19 |
| fuel | set_fuel_efficiency | 6 |

---

## 3. 修正後的整合策略

### 3.1 玩家活動統計 → Region Enrichment（高優先，直接可用）

**不需 SuiClient。** EVE EYES 自帶的 filter 就夠。

**做法：**
- 定時查各 module 的 move-calls，統計 `senderAddress` 去重數和操作量
- 按時間窗口聚合 → 「系統活動指數」
- 寫入 `region_activity` table，供 `GET /api/region/:region_id/summary` 使用

**具體 query：**
```
GET /api/indexer/move-calls?moduleName=network_node&page=1&pageSize=20  → 基建活動
GET /api/indexer/move-calls?moduleName=turret&page=1&pageSize=20        → 防禦活動
GET /api/indexer/move-calls?moduleName=gate&page=1&pageSize=20          → 跳躍活動
```

**輸出指標：**
- `defense_index` = turret calls / time window
- `infra_index` = network_node calls / time window
- `traffic_index` = gate calls / time window
- `active_players` = distinct senderAddress count

**影響檔案：**
- `services/src/eve-eyes/client.ts` — API client wrapper
- `services/src/eve-eyes/activity-tracker.ts` — 定時聚合邏輯
- `services/src/db/schema.ts` — `region_activity` table
- `services/src/api/routes/region.ts` — 擴充 response

---

### 3.2 玩家身份識別 → Reporter Display（中優先，需 SuiClient 輔助）

**做法：**
1. EVE EYES: `moduleName=character&senderAddress=<addr>` → 確認該地址是否有 character 操作
2. SuiClient: 從 character 操作的 txDigest → `getTransactionBlock()` → 取得 created/mutated character object ID
3. SuiClient: `getObject(characterObjId)` → 取得 character fields（name 等）
4. 快取到 SQLite `characters` table（address → name, 24hr TTL）

**影響檔案：**
- `services/src/eve-eyes/character-resolver.ts` — 雙步驟解析
- `services/src/db/schema.ts` — `characters` table
- `services/src/api/routes/character.ts` — `GET /api/character/:address`

---

### 3.3 交易交叉驗證 → Anti-Sybil（低優先）

**做法：**
- `GET /api/indexer/transaction-blocks?senderAddress=<reporter>&status=success` → 檢查是否有正常遊戲行為
- 有 character/gate/network_node 操作 = 真玩家
- 只有合約互動無遊戲操作 = 可疑

---

### 3.4 物件狀態查詢 → 座標/系統資料（中優先，需 SuiClient）

**EVE EYES 的角色：** 提供 txDigest 列表 → 找到 gate/network_node 物件 ID

**做法：**
1. EVE EYES: `moduleName=gate&functionName=share_gate` → 取得建立 gate 的交易
2. SuiClient: `getTransactionBlock(digest)` → 取得 gate object ID
3. SuiClient: `getObject(gateObjId)` → 取得 gate fields（含位置資訊）
4. 批量爬取 → 建立 system/constellation 對照表

**注意：** 這是一次性的大量爬取（16K gate calls），需要：
- Auto-pagination（loop until last page）
- Rate limiting（每秒 N requests）
- 結果持久化到 `eve_systems.json` 靜態檔

---

## 4. 實作順序

### Phase 1：服務層建立時（Task 7-10）

| # | 任務 | 說明 | 優先級 |
|---|------|------|--------|
| E1 | EVE EYES API client | auth, pagination, rate limit, retry | 高 |
| E2 | Activity tracker | 定時聚合 module 活動指標（直接可用，無需 SuiClient） | 高 |
| E3 | Character resolver | EVE EYES + SuiClient 雙步驟解析 | 中 |

### Phase 2：前端時（Plan B）

| # | 任務 | 說明 | 優先級 |
|---|------|------|--------|
| E4 | Region activity panel | 顯示 defense/infra/traffic index | 中 |
| E5 | Reporter name display | 用 character resolver hook | 中 |

### Phase 3：一次性爬取（可提前做）

| # | 任務 | 說明 | 優先級 |
|---|------|------|--------|
| E6 | System/gate 座標爬取 | EVE EYES + SuiClient 批量查詢 → 靜態 JSON | 中 |
| E7 | Intel type 語義標籤 | 待確認 EVE codex 資料來源 | 低 |

### Phase 4：Demo / Post-Hackathon

| # | 任務 | 優先級 |
|---|------|--------|
| E8 | Anti-Sybil reporter 驗證 | 低 |
| E9 | Route Planner plugin（gate jump 分析） | Demo 加分 |

---

## 5. 技術注意事項

- **API Key** 存 `.env` 的 `EVE_EYES_API_KEY`，不進 git
- **雙資料源架構：** EVE EYES（indexer metadata）+ SuiClient（object state）
- **分頁爬取：** 大量資料需 auto-pagination，注意 rate limit
- **rawCall 不可直接用：** 只有 PTB references，需 SuiClient 解析
- **快取策略：**
  - 活動統計：5min 快取
  - Character name：24hr TTL
  - System 座標：靜態（一次性爬取 + 定期刷新）
- **Fallback：** EVE EYES 不可用時 heatmap 仍可運作，activity indicators 標記 stale
