# Frontier Explorer Hub — 進度追蹤

> 格式：最新紀錄放最上面

---

## 狀態

| 階段 | 狀態 |
|------|:----:|
| 設計文檔 (Spec) | ✅ |
| 系統架構設計 | ✅ |
| Plan A (合約+服務層) | ✅ 已寫完，待實作 |
| Plan B (前端+Plugin SDK) | ✅ 已寫完，待實作 |
| Move 合約實作 | ⬜ |
| 服務層實作 | ⬜ |
| 前端實作 | ⬜ |
| 部署 | ⬜ |

---

## 進度日誌

### 2026-03-20 — System Design Spec + Plan A 完成

#### 做了什麼
- 完整系統設計 spec（三層架構、5 個 Move modules、Plugin Platform）
- 經過 3 輪 SUI agent 審查（Architect、Security Guard、Docs Query）+ 1 輪 spec reviewer
- 修正 11 個 critical/important issues（owned vs shared object、OTW、revenue split、anti-Sybil 等）
- Plan A（合約 + 服務層）14 tasks，包含 monkey tests
- 加入 Plugin Platform 架構（iframe sandbox + SDK）

#### 更動了哪些檔案
- `docs/superpowers/specs/2026-03-20-frontier-explorer-hub-design.md`（spec）
- `docs/superpowers/plans/2026-03-20-plan-a-contracts-and-services.md`（plan A）
- `progress.md`

#### 決策原因
- 實作 scope B（訂閱+熱力圖+Bounty），架構 scope C（dApp Store）
- Hybrid 資料架構（鏈上 intel + off-chain indexer），預留 Walrus
- iframe sandbox for plugins（安全隔離），預留 Module Federation
- 所有 revenue 統一到 SubscriptionConfig.treasury

#### 待做
- ~~Plan B（前端 + Plugin SDK）~~ → 已完成
- 開始 Plan A 實作（建議開新 chat）

---

### 2026-03-20 — Plan B 完成

#### 做了什麼
- Plan B（前端功能+Plugin SDK+UX 優化）10 tasks，經 code reviewer 審查修正
- 修正 4 critical issues：`tx.pure.id()` → `tx.pure.address()`、缺少 vitest.config.ts/tsconfig.json、缺少 monorepo workspace config、Bridge origin check 安全漏洞
- 修正 6 important issues：Bridge getUser 硬編碼改為 callback、展開所有 PTB tests、展開 page shells、加入 Zustand store tests、修正 heatmap URL 重複參數、加入 create-eve-dapp deviation 說明

#### 更動了哪些檔案
- `docs/superpowers/plans/2026-03-20-plan-b-frontend-features-and-ux.md`（plan B）
- `progress.md`

#### 決策原因
- Plan B 只包含 data layer / hooks / state / Plugin SDK / Plugin Bridge，不含 UI
- 視覺實作留給前端工程師，Plan B 提供 hook 介面合約與 UX 優化目標文檔

#### 待做
- 開始 Plan A 實作：Move 合約 → 服務層（建議開新 chat）
- Plan A 完成後再開新 chat 實作 Plan B

---

### 2026-03-20 — 隱私保護熱力圖整合

#### 做了什麼
- 評估 Privacy-Preserving Heatmap 概念，確認為可行的跨專案核心 DaaS
- 落實到 README，導入訂閱經濟模型（免費模糊 / 付費精確 + 即時）
- 確認熱力圖可服務三個上層應用（Explorer 情報、Fleet 偵察、DAO 預警）

#### 更動了哪些檔案
- `README.md`（概念簡介與核心循環）

#### 決策原因
- 熱力圖是最適合跑通 Web3 資訊買賣的場景，收斂成具有商業模式的視覺化產品強化 Hackathon 說服力。
