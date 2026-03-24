# Portal — Custom URL Embed Feature

> Spec date: 2026-03-25
> Status: Approved

## Overview

用戶可自訂 URL 嵌入面板，將 Frontier Explorer Hub 作為入口平台，在同一介面下查看不同網站的資料來源。

## Requirements

- 用戶可新增、刪除、重新排序自訂 URL
- 每個 link 包含：名稱（自訂）+ URL
- 總覽頁為 List + Preview split view
- 可點開單一 link 進入全屏 iframe 頁
- 支援 query param fallback URL，防止 localStorage 遺失後書籤失效
- 儲存：localStorage（Phase 1），預留 wallet-bound sync 擴展點

## Data Model

```ts
interface PortalLink {
  id: string;          // crypto.randomUUID()
  name: string;        // 用戶自訂名稱
  url: string;         // 完整 URL (https://...)
  createdAt: number;   // timestamp
  order: number;       // 排序用
}
```

## State Management

Zustand store + `persist` middleware → localStorage key `"feh-portal-links"`。

```ts
interface PortalState {
  links: PortalLink[];
  addLink: (name: string, url: string) => void;
  removeLink: (id: string) => void;
  updateLink: (id: string, patch: Partial<Pick<PortalLink, 'name' | 'url'>>) => void;
  reorderLinks: (ids: string[]) => void;
}
```

> **Note**: `selectedLinkId` 為頁面級 local state（`useState`），不放 store — 選中狀態不需要跨頁面持久化。

> **Note**: 這是專案首次使用 Zustand `persist` middleware，為新 pattern。

### 未來 Sync 擴展點

Phase 2 可將 persist 的 `storage` adapter 從 localStorage 切換為 API client（wallet-bound backend sync），store interface 不變。

## Routes

| Route | Purpose |
|---|---|
| `/portal` | 總覽頁：左側 link 列表 + 右側 iframe preview |
| `/portal/[id]` | 全屏 iframe 頁，從 store 取 link 資料 |
| `/portal/view?url=...&name=...` | Fallback 全屏頁，URL 自帶資料，不依賴 localStorage |

## Page Designs

### `/portal` — 總覽頁

Layout: split view（左列表 + 右 preview），符合現有 Panel 風格。

- **左側 PortalLinkList**
  - 顯示所有 link：name + url domain + 刪除按鈕
  - 可排序（Phase 1: up/down 箭頭按鈕，Phase 2: drag-and-drop via `@dnd-kit`）
  - 底部 "＋ Add" 按鈕 → 開啟 AddLinkDialog
  - 點 link → 右側 preview 切換
- **右側 PortalPreview**
  - 選中 link 的 iframe preview
  - 「全屏展開」按鈕 → `router.push(/portal/[id])`
  - 預設選中第一個 link
- **Empty state**
  - 無 link 時顯示引導畫面（PortalEmptyState）

### `/portal/[id]` — 全屏頁

- 頂部 bar：link name + url + 返回按鈕 + 「在新分頁開啟」
- 下方：iframe 佔滿剩餘高度
- id 找不到 → redirect `/portal` + toast「連結不存在」

### `/portal/view?url=...&name=...` — Fallback 全屏頁

- 與 `/portal/[id]` 相同佈局
- 頂部 bar 多一個「加入 Portal」按鈕
- 點「加入 Portal」→ `addLink()` + redirect 到 `/portal/[新id]`
- 缺 `url` param → redirect `/portal`
- `url` 不合法 → 顯示錯誤 + 返回按鈕

## Components

```
components/portal/
├── PortalLinkList.tsx      — 左側列表 (link items + add + delete + reorder)
├── PortalPreview.tsx       — 右側 iframe preview 區
├── AddLinkDialog.tsx       — 新增 URL 表單 (name + url input)
├── PortalEmptyState.tsx    — 無 link 時的引導畫面
└── PortalFullscreenBar.tsx — 全屏頁頂部 bar (name + url + back + actions)
```

## Sidebar

在 NAV_ITEMS 最後新增 "Portal" 項目（Plugin Store 下方）。

Sidebar active state 使用 `pathname.startsWith('/portal')` 而非精確匹配，以涵蓋 `/portal/[id]` 和 `/portal/view` 子路由。可能需要擴展 `NAV_ITEMS` 類型或 active-check 邏輯。

## iframe Security

```html
<iframe
  src={link.url}
  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
  referrerPolicy="strict-origin-when-cross-origin"
  loading="lazy"
/>
```

- **sandbox 限制**：不給 `allow-top-navigation`（防嵌入頁劫持主窗口），不給 `allow-popups-to-escape-sandbox`
- **`allow-scripts + allow-same-origin` 風險說明**：此組合允許嵌入頁存取其自身 origin 的 storage。Phase 1 可接受，因 host app 與嵌入頁跨 origin。若未來嵌入同 origin 內容需重新評估。
- **X-Frame-Options 處理**：部分網站設了 `DENY`/`SAMEORIGIN` 會載入失敗 → 顯示友善提示 +「在新分頁開啟」按鈕

### URL 驗證規則

- 必須以 `https://` 開頭（`http://localhost` 開發例外）
- 明確拒絕 `javascript:`、`data:`、`blob:` scheme
- 最大長度：2048 字元
- IP-based URL：允許（如 `https://192.168.1.1`）
- Query string 和 fragment：原樣保留

### iframe 載入失敗偵測

機制：mount 時啟動 5s timer，`iframe.onload` 觸發時清除 timer。Timer 到期 → 顯示 fallback UI。

注意：這是啟發式方法 — 慢速網站可能誤判為失敗。Fallback UI 提供「重試」+「在新分頁開啟」兩個按鈕。

### Fallback URL XSS 防護

`/portal/view?name=...` 的 `name` param 僅透過 JSX text interpolation 渲染（React 自動 escape），不使用 innerHTML 注入。

## Error Handling

| Case | Behavior |
|---|---|
| URL 不合法 | 新增表單阻擋，顯示驗證錯誤 |
| 重複 URL | 提示已存在，可選擇跳轉到該 link |
| iframe 載入失敗 | 5s timeout，顯示 fallback UI +「在新分頁開啟」按鈕 |
| `/portal/[id]` id 不存在 | redirect `/portal` + toast |
| `/portal/view` 缺 url | redirect `/portal` |
| `/portal/view` url 不合法 | 顯示錯誤 + 返回按鈕 |
| 列表超過 20 個 | 顯示提示（不硬擋） |

## Testing Strategy

- **Unit**: store CRUD operations, URL validation, reorder logic
- **Integration**: 頁面路由跳轉、iframe 載入/失敗偵測、fallback URL 解析
- **Monkey**: 極端 URL（超長、特殊字元、javascript: scheme）、快速連續 add/delete、localStorage 清空後的行為
