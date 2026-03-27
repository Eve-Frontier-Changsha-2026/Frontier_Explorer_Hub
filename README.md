# Frontier Explorer Hub

> 全宇宙情報星圖網路與 dApp 平台

> **[EVE Frontier 專案憲法與開發準則](https://github.com/Eve-Frontier-Changsha-2026/Constitution/blob/master/EVE_Frontier_Project_Constitution.md)**
> 本專案的世界觀設定與底層相依資源，均遵從此憲法文檔之規範。

## 概念簡介

Frontier Explorer Hub 是一個結合「情報販售、威脅雷達與外部 App Store」的聚合星圖平台（External App）。核心亮點為 **Privacy-Preserving Heatmap**，作為串聯各生態的 DaaS (Data-as-a-Service) 數據服務引擎。

玩家在宇宙中探索與戰鬥時，透過 Smart Assembly 把觀測結果（礦帶、殘骸、防線、海盜）與聚合後的即時/延遲熱力數據回傳鏈上。玩家與聯盟可付費搜索情報資訊，建立宇宙間的「信息經濟」。

### 核心循環

```
Explorer 提交情報 → 聚合為熱力圖 → 訂閱者付費消費
    ↑                                      │
    └──── 分潤收入 ← 單次解鎖 ← 資訊需求 ←─┘
```

### 解決痛點

- **隱私保護熱力圖與訂閱經濟**：透過 Spatial Bucketing + K-anonymity 聚合防護，避免洩漏玩家個體座標。Free 用戶看延遲模糊熱力，Premium 用戶解鎖即時細節。
- **情報集線與風險預警**：探勘者掃描到的特殊礦區或威脅標記上鏈，聚合後提供「安全航線」與區域風險指數。
- **戰術復盤**：整合 Utopia killmails 與 EVE EYES 活動數據，提供即時擊殺滾動 feed 與區域活動指標。
- **懸賞系統**：透過 Bounty Escrow Protocol 實現去中心化情報懸賞，包含質押、驗證、爭議解決完整生命週期。
- **情報市集**：Reporter 可將加密情報上架固定價格販售，Seal 協議保障交易前的 payload 隱私。
- **Web3 dApp Store**：開發者可將自創工具在此上架，Hub 提供鏈上 Plugin Registry 與分潤機制。

### 衍生/相關專案

- **[Bounty_Escrow_Protocol](../Bounty_Escrow_Protocol)**：情報懸賞功能的底層合約，透過 `bounty.move` wrapper 整合進 Explorer Hub。

---

## 系統架構

三層架構：Client → Service (off-chain) → On-chain (Sui Move)。

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  Dashboard │ Heatmap │ Intel Submit │ Bounties │ Store │ Portal  │
│  (Next.js) │ (/map)  │ (single/batch)│ (lifecycle)│(plugins)│(links)│
└──────────────────────┬───────────────────────────────────────────┘
                       │ Next.js + @mysten/dapp-kit + TanStack Query
┌──────────────────────▼───────────────────────────────────────────┐
│                      SERVICE LAYER                                │
│  Heatmap Aggregator │ Event Indexer  │ Data API (7 route groups) │
│  (K-anon + bucket)  │ (dual-pkg poll)│ (tier-gated REST)         │
│                     │                │                            │
│  EVE EYES Tracker   │ Utopia Tracker │ World Aggregator           │
│  (activity/defense) │ (kills/chars)  │ (dual-source merge)        │
└──────────────────────┬───────────────────────────────────────────┘
                       │ Sui RPC + EVE EYES API + Utopia API
┌──────────────────────▼───────────────────────────────────────────┐
│                      ON-CHAIN LAYER (Sui Move)                    │
│  admin │ intel │ subscription │ access │ bounty │ market │ marketplace │
│        │       │              │        │ (wraps bounty_escrow)       │
└──────────────────────────────────────────────────────────────────┘
```

---

## 已實現功能

### On-chain 合約 (Sui Move)

| Module | 功能 |
|--------|------|
| **admin** | OTW + AdminCap、Intel 類型/嚴重度/可見度常數、經濟安全邊界 |
| **intel** | `submit_intel` / `batch_submit`（max 20）、`expire_intel` 退押金、`update_visibility`、`AggregationAnchor` 鏈上錨定 |
| **subscription** | `subscribe` / `renew` / `upgrade`（Free→Premium）、`is_active_premium` 查詢、`withdraw_treasury` |
| **access** | `unlock_intel` 單次付費解鎖（含 `max_price` 滑點保護）、`PricingTable` 動態定價、reporter/platform 分潤（預設 70/30） |
| **bounty** | Wrap `bounty_escrow` — `create_intel_bounty`、`submit_intel_proof`（驗證 region + type + reporter=hunter）、`verify_and_approve`、`resubmit_intel_proof` |
| **market** | 情報上架 `list_intel`（固定價、max_buyers、加密 payload）、`purchase_intel`（seller/platform 分潤）、`delist_intel`、`seal_approve` 解密授權 |
| **marketplace** | Plugin 開發者 `register_plugin`、用戶 `use_plugin`（分潤）、admin `remove_plugin` 審核 |

**關鍵設計決策：**
- `IntelReport` / `BountyRequest` 為 shared object（任何用戶可在 PTB 中引用）
- 含 `Balance<SUI>` 的 struct 只有 `key`（無 `store`），防止意外 wrap 遺失資金
- Dedup 策略：off-chain indexer 處理（避免 shared object contention 瓶頸）
- Anti-spam：每筆情報需 `MIN_SUBMIT_DEPOSIT`（0.01 SUI），到期退回

### Service Layer (Off-chain Backend)

**Event Indexer**
- 雙 package cursor-based polling（`frontier_explorer_hub` + `bounty_escrow`）
- 監聽事件：IntelSubmitted、SubscriptionCreated、IntelUnlocked、Bounty 全生命週期（ProofSubmitted / Rejected / Resubmitted / DisputeRaised / DisputeResolved / AutoApproved）
- Crash recovery：從 last cursor checkpoint 恢復

**Heatmap Aggregator**
- Pipeline：Raw Intel → Spatial Bucketing → K-Anonymity Filter → Time Delay (Free) → Output
- 排程批次 recompute（處理過期清理）
- AggregationAnchor 鏈上寫入 Merkle root

**雙源世界數據整合**
- **EVE EYES**：region-level defense index / infra index / traffic index / active players
- **Utopia API**：killmails、characters、assemblies（NWN/ONLINE）、tribes
- **WorldAggregator**：兩源獨立 poll 每 5min，聯集合併，per-source staleness tracking；一源掛了另一源繼續顯示
- Character Resolver：SUI address → `PlayerProfile`(owned) → `Character`(shared) 兩層 RPC

**Data API（7 組 routes）**

| Route | 功能 |
|-------|------|
| `GET /api/heatmap/:zoomLevel` | Tier-gated 熱力圖（Free: zoom 0-1 + 延遲, Premium: 全 zoom + 即時 + 類型細分） |
| `GET /api/intel/:intelId` | 單筆情報（public=完整, private=需 unlock receipt 或為 reporter） |
| `GET /api/subscription/status` | 查詢用戶訂閱等級 |
| `GET /api/bounties/*` | Active 列表、by-creator、by-hunter、detail、events audit trail |
| `GET /api/region/:regionId/summary` | 區域聚合（activity + intel 數量） |
| `GET /api/world/status` | 聚合 world status（kills, players, assemblies, tribes, defense） |
| `GET /api/world/{character,assembly,tribe}/:id` | Proxy 至 Utopia API detail endpoints |

**Storage：** SQLite（12 tables：intel_reports、heatmap_cache、subscriptions、unlock_receipts、bounties、bounty_events、aggregation_anchors、region_activity、characters、utopia_killmails/characters/assemblies/tribes、world_status_cache）

### Client Layer (Frontend)

**Tech Stack：** Next.js 14 (App Router) + React 18 + TailwindCSS + @mysten/dapp-kit + TanStack Query + Zustand

| Route | 功能 |
|-------|------|
| `/` | Dashboard — WorldStatusBar（5 指標）+ KillTicker（即時擊殺 feed）+ 區域概覽 |
| `/map` | 互動式 Heatmap — 3 zoom levels、region/type/severity 篩選 |
| `/submit` | 情報提交 — 單筆 / 批次、押金計算 |
| `/bounties` | 懸賞看板 — 列表 + 建立 |
| `/bounties/[id]` | 懸賞詳情 — ProofTimeline、CountdownTimer、ActionPanel（submit/dispute/claim） |
| `/subscribe` | 訂閱管理 — Tier 比較、購買/續約/升級 |
| `/store` | Plugin 市集 — 瀏覽、購買 |
| `/portal` | 連結管理 — 新增/排序/刪除書籤、iframe 預覽 |
| `/portal/[id]` | 書籤 fullscreen 瀏覽（sidebar-aware layout） |
| `/portal/view` | 公開分享（URL fallback route，不依賴 localStorage） |

**Key Components：** CharacterName、PlayerCard、KillTicker、WorldStatusBar、RegionActivityPanel、Portal 系列（EmptyState / LinkList / Preview / AddLinkDialog / FullscreenBar）、Bounty 系列（ClaimTicketList / ProofTimeline / CountdownTimer / ActionPanel）

---

## Data Flow

### 情報提交 → 熱力圖更新

```
Explorer → /submit UI → intel::submit_intel() → emit IntelSubmittedEvent
    → Event Indexer (poll) → SQLite INSERT → Heatmap Aggregator
    → Spatial bucket recalc → K-anonymity check → heatmap_cache UPSERT
    → AggregationAnchor on-chain (batch)
```

### 世界狀態雙源聚合

```
EVE EYES API ──poll 5min──→ ActivityTracker → region_activity table ─┐
                                                                     ├→ WorldAggregator
Utopia API ───poll 5min──→ UtopiaTracker → utopia_* tables ──────────┘     │
                                                                     world_status_cache
                                                                           │
Frontend ← GET /api/world/status ← cached aggregate ──────────────────────┘
```

### 懸賞生命週期

```
① Requester → create_intel_bounty() → SUI locked in bounty_escrow
② Explorer sees bounty → goes scouting → submit_intel()
③ Explorer → submit_intel_proof() → validates region + type + reporter=hunter
④ Verifier → verify_and_approve() → escrow released → ClaimTicket minted
⑤ Explorer → claim() → SUI transferred
   (可選) Dispute → dispute_resolution → admin 裁決
```

---

## 測試

| Layer | 數量 | 涵蓋範圍 |
|-------|------|----------|
| Backend | 134 tests (14 files) | Indexer、Aggregator、API routes、Utopia/EVE EYES clients、WorldAggregator |
| Frontend | 161 tests (36 files) | Components、hooks、pages、portal、bounty lifecycle、monkey tests |
| Move | `sui move test` | intel submit/expire、subscription lifecycle、access unlock/pricing、bounty verification |

Monkey testing 涵蓋：極端輸入、concurrent 操作、斷線容錯、localStorage 清除後 rehydrate 行為。

---

## 未來展望 (Roadmap)

### Phase 1 — 體驗強化

| 功能 | 說明 |
|------|------|
| **deck.gl 3D 星圖** | HeatmapLayer + ScatterplotLayer + PathLayer + TextLayer，取代目前靜態視覺化 |
| **安全航線計算** | 基於 heatmap 數據的 AI 路線規劃，標記低風險/高風險路徑 |
| **Merkle Proof 前端驗證** | 用戶可驗證 heatmap cell 對應的 AggregationAnchor（已有鏈上 anchor，缺前端 UI） |
| **Wallet-signed JWT 認證** | 以 SUI 簽名取代目前簡易 address 提取，防止身份偽造 |

### Phase 2 — 平台開放

| 功能 | 說明 |
|------|------|
| **Plugin SDK (`@explorer-hub/plugin-sdk`)** | iframe + postMessage bridge，讓第三方 plugin 安全存取 Hub 數據與錢包操作 |
| **Plugin Permission Manifest** | 每個 plugin 聲明所需權限（read:heatmap, request:transaction 等），安裝時 user consent |
| **Plugin Bridge (Host-side)** | Auth proxy + Data API proxy + Wallet action proxy，sandbox 安全代理 |
| **Module Federation** | Plugin 通過安全審計後可升級為 federated mode，共享 React context 提升 UX |

### Phase 3 — 進階隱私與去中心化

| 功能 | 說明 |
|------|------|
| **差分隱私 (Differential Privacy)** | `applyDPNoise()` 已預留接口，注入統計噪音強化 K-anonymity |
| **Walrus 歷史快照** | 將 heatmap 歷史聚合結果存至 Walrus 去中心化儲存 |
| **Reputation / Trust System** | 基於 reporter 歷史準確率的信譽權重，壓制假情報 |
| **Tribe/Alliance 可見性** | `VIS_TRIBE` / `VIS_ALLIANCE` 常數已保留，需要鏈上 tribe membership registry 支撐 |

### Phase 4 — 自動化與治理

| 功能 | 說明 |
|------|------|
| **訂閱自動續約** | Keeper bot 或 lazy-evaluation 模式，Sui Move 無原生 cron |
| **Multi-sig AdminCap** | 防止 admin key 單點風險 |
| **SSE 即時推送** | 取代目前 polling 模式，Event Indexer 直推前端 |
| **DAO 治理** | 社區投票決定 platform fee、reporter share、plugin 審核標準 |

---

## 本地開發

需同時啟動兩個 server：

```bash
# Terminal 1 — Frontend
cd next-monorepo/app
npm run dev          # :3000

# Terminal 2 — Backend
cd services
npx tsx watch src/index.ts   # :3001
```

`API_BASE_URL` fallback 為 `http://localhost:3001`（獨立 Express backend，非 Next.js API routes）。

---

## 技術棧

| Layer | Tech |
|-------|------|
| Smart Contracts | Sui Move (framework/testnet) |
| Backend | Express.js + TypeScript + SQLite + better-sqlite3 |
| Frontend | Next.js 14 + React 18 + TailwindCSS + shadcn/ui |
| Wallet | @mysten/dapp-kit |
| State | Zustand (UI) + TanStack Query (server) + dapp-kit (on-chain) |
| External Data | EVE EYES API (eve-eyes.d0v.xyz) + Utopia API (utopia.evedataco.re) |
| Testing | Vitest + React Testing Library (frontend) + Vitest (backend) + sui move test (contracts) |
| Deploy | Railway (backend) + Vercel (frontend) |
