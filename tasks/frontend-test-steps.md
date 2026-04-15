# Frontier Explorer Hub — 使用者情境測試腳本

> **用法**：以真實使用者角度操作，每個 Scenario 是一段完整的使用旅程。
> **環境**：Testnet + Backend running + 瀏覽器安裝 SUI Wallet
> **標記**：✅ 通過 / ❌ 失敗 / ⚠️ 有問題但不 block

---

## Scenario 1：新訪客第一次進入系統

> **角色**：從未使用過的玩家，沒有連線 wallet，第一次打開網站。
> **目的**：驗證未登入狀態下的瀏覽體驗，確保不白屏、不報錯。

### 操作步驟

1. **打開首頁**
   - 頁面完整渲染，背景有 scanline/noise 動畫效果
   - 左側 Sidebar 展開，顯示 7 個導航項目（Dashboard / Tactical Map / Intel Market / Bounties / Membership / Plugin Store / Portal）
   - Sidebar 底部顯示 "Connect Wallet" 按鈕
   - Header 區域顯示 "REAL-TIME FRONTIER INTEL DASHBOARD" 標題
   - 右側有 Reports / Active Alerts / Active Regions 三個數據指標
   - Console 無紅字 error（extension noise 忽略）

2. **瀏覽 Dashboard 內容**
   - **WorldStatusBar**（Header 下方橫條）顯示 5 個指標：
     - PILOTS（綠色）：registered 數字 + active 子標
     - KILLS 24H（琥珀色）：擊殺數 + 活躍系統數
     - ASSEMBLIES（藍色）：online/total 數字 + infra index
     - DEFENSE（紫色）：defense index 數值
     - FACTIONS（琥珀色）：faction 數量 + 最大 faction ticker
   - 若資料源過時，對應指標旁出現 "STALE" badge
   - 「Breaking」區塊顯示一條置頂新聞（來自最近擊殺事件），含標題、摘要、標籤
   - 「Daily Briefing」有 AI 摘要文字
   - 「Headlines」列出多條新聞，每條有 RiskBadge 顏色標示風險等級
   - 「Events Timeline」顯示最近事件列表
   - 右側 Conflict Map 有 ef-map.com 的 iframe 地圖
   - **Kill Ticker**（右側欄，Live Intel Feed 下方）顯示最近擊殺事件：
     - 每條格式：`killerName → victimName`（紅/灰色）
     - 右側標籤：loss type badge（如 SHIP）+ `SYS-{id}` 系統 badge
     - 可點擊跳轉到 SUI Explorer 查看鏈上記錄
     - 無擊殺時顯示 "No recent kills"
   - Live Intel Feed 區塊顯示情報紀錄（可能為空或有 "Loading feed..." 字樣）
   - Activity 區塊顯示 Total Reports / Active Alerts / Reporters 統計數字

3. **逐一點擊 7 個導航頁面**
   - 每點一個導航項目，對應頁面正常載入，不白屏
   - 被點擊的 nav item 有視覺高亮（邊框 / 顏色變化）
   - 地址列 URL 正確跳轉（`/`, `/map`, `/intel-market`, `/bounties`, `/subscribe`, `/store`, `/portal`）

4. **收合 / 展開 Sidebar**
   - 點擊 Sidebar toggle → Sidebar 縮到只剩 icon
   - 再點一次 → 展開回來，label 文字出現
   - 收合狀態下頁面主內容區域變寬

5. **嘗試需要 wallet 的操作（未連線）**
   - 進入 Intel Market → SELL INTEL tab 的 NewListingForm 需要 wallet 連線才能提交
   - 進入 Bounties 頁面 → "Create Bounty" 按鈕 disabled，面板 badge 顯示 "Connect Wallet"
   - 進入 Bounties 列表 → Tab 只顯示 "All Active"（不顯示 My Bounties / My Submissions）
   - 進入 Membership 頁面 → "Upgrade Membership" 按鈕 disabled

**結果：** [ ]

---

## Scenario 2：連線 Wallet 並確認身份狀態

> **角色**：訪客決定連線 wallet，變成已登入使用者。
> **目的**：驗證 wallet 連線流程、auto-reconnect、tier 顯示。

### 操作步驟

1. **連線 Wallet**
   - 點擊 Sidebar 底部 "Connect Wallet" 按鈕
   - 彈出 wallet selector 視窗（列出已安裝的 Sui Wallet / Suiet 等）
   - 選擇一個 wallet → wallet 端彈出授權確認
   - 確認授權後，Sidebar 底部改為顯示你的截短地址（如 `0x1a2b...cdef`）
   - Sidebar 出現 tier badge（FREE 或 PREMIUM）

2. **確認 wallet 狀態在各頁面同步**
   - 進入 Intel Market → NewListingForm 可提交，MY ACTIVITY tab 顯示個人交易紀錄
   - 進入 Bounties → "Create Bounty" 按鈕可點擊；Tab bar 多出 "My Bounties" 和 "My Submissions"
   - 進入 Membership → 顯示你的 Current Access Level（Free / Premium）和 Expiry 資訊
   - 進入 Bounty Detail（任一 bounty）→ Header 的 Role 指標顯示 CREATOR / HUNTER / VIEWER（取決於你跟這個 bounty 的關係）

3. **Auto-reconnect**
   - 按 F5 重整頁面
   - 頁面載入完成後，wallet 自動重新連線（不需再次手動連線）
   - 地址和 tier badge 跟重整前一致

4. **斷開 Wallet**
   - 在 Sidebar 點擊已連線的地址 / disconnect
   - Sidebar 恢復 "Connect Wallet" 按鈕
   - 各頁面功能恢復為 Scenario 1 的未連線狀態

**結果：** [ ]

---

## Scenario 3：觀察戰況 — Dashboard + 戰術地圖

> **角色**：探險者登入後，想了解目前宇宙的戰況和熱點區域。
> **目的**：驗證 Dashboard 資料載入、Map 頁面的雙視圖切換、System Heatmap 星圖互動。

### 操作步驟

1. **Dashboard 資料檢視**
   - 首頁正常顯示所有 Panel（WorldStatusBar / Breaking / Headlines / Daily Briefing / Events Timeline / Conflict Map / Kill Ticker / Live Intel Feed / Activity）
   - **WorldStatusBar** 5 個指標有數據（來自 Utopia + EVE EYES 雙源 API，每 5 分鐘自動刷新）
   - Kill Ticker 有最近擊殺事件，或顯示 "No recent kills"
   - 如果 Backend 還沒有活躍資料 → Live Intel Feed 可能為空但不報錯，Activity 數字顯示 0
   - 如果有資料 → Feed 每筆顯示 intel ID、風險 badge（顏色隨 severity 變化）、系統編號、時間戳

2. **進入 Tactical Map 頁面**
   - Header 顯示 "TACTICAL CONFLICT MAP"
   - 顯示 Zoom Level / Visible Cells / Loading 三個指標
   - Map Controls 面板含 Conflict Map / Intel Heatmap 兩個 tab + Zoom Out / Zoom In 按鈕
   - 預設顯示 "Conflict Map" tab（ef-map.com iframe 地圖 + 兩欄佈局）

3. **Conflict Map tab 檢查**
   - 左側：RegionActivityPanel（compact 模式）+ Conflict Map iframe embed
   - 右側：Selected System 面板（預設 "Click a system node to inspect."）+ Systems 列表
   - Systems 列表按 intensity 排序顯示所有星系節點，每個含 label + intensity + 四色指標

4. **切換到 Intel Heatmap tab**
   - 點擊 "Intel Heatmap" 按鈕 → 視圖切換為 **全寬 Canvas2D 星圖**
   - 星圖佔滿 70vh 高度，深色太空背景
   - 星系以橙色光暈圓點渲染，大小和亮度反映 intensity
   - 星系之間有連線（共享 killer 或距離相近）
   - 每個星系旁有多色數據標籤（⚔ 紅 / 📡 青 / 🚪 紫 / 💰 黃）
   - 右側有 **floating overlay sidebar**（半透明深色面板）
   - 如果無資料 → 顯示 "No system data yet."

5. **Heatmap 星圖互動**
   - 點擊某個星系節點 → floating sidebar 更新顯示該星系的詳細資料（Kills / Intel / Gates / Market + Intensity）
   - 星系在星圖上以金色邊框高亮
   - 在 floating sidebar 的 Systems 列表中點擊某星系 → 星圖自動置中+縮放到該星系（centerOnSystem）

6. **Floating sidebar 收合/展開**
   - 點擊 sidebar 右上角的 ▶ 按鈕 → sidebar 滑出消失
   - 右側邊緣出現垂直 "◀ PANEL" 小 tab
   - 點擊 "◀ PANEL" → sidebar 滑入恢復

7. **Zoom 控制（Free tier）**
   - 點 "Zoom In" → zoom level 數字增加
   - 連續 zoom in 直到超過 tier 限制 → 出現黃色閃爍警告文字 "Current tier limits deeper zoom. Upgrade to Premium for full depth."
   - 點 "Zoom Out" → zoom level 遞減，回到 0 時不再繼續遞減

8. **切回 Conflict Map**
   - 點擊 "Conflict Map" tab → iframe 地圖恢復，兩欄佈局回來

**結果：** [ ]

---

## Scenario 4：提交情報 — Intel Submission 完整流程

> **角色**：探險者發現了一個資源點，想提交鏈上情報賺取收入。
> **前提**：已連線 wallet，帳戶有 testnet SUI。

### 操作步驟

1. **進入 Submit Intel 頁面（`/submit`）**
   - 顯示 "INTEL SUBMISSION DESK" 標題
   - 左側為表單面板 "New Report"（badge 顯示 "Ready"）
   - 右側為 "Transaction History" 面板（初始顯示 "No submissions yet."）

2. **填寫情報表單**
   - Region ID 輸入 `1`
   - Sector X / Y / Z 各輸入座標值（如 `10`, `20`, `30`）
   - Zoom 輸入 `0`
   - Intel Type 下拉選擇 "RESOURCE"
   - Severity 拖曳滑桿到 `7` → 旁邊數字即時更新
   - Expiry 選擇 "24 hours"
   - Visibility 選擇 "Public"
   - Deposit 保持預設值（或手動輸入更高金額）

3. **提交情報**
   - 點擊 "Submit Intel" 按鈕
   - 按鈕文字變成 "Submitting..."，呈 disabled 狀態
   - Wallet 彈出交易簽名確認 → 確認簽名
   - 如果地址列出現 "Pending: xxxxx..." 動態文字（pending TX digest）
   - 交易完成 → Transaction History 面板新增一筆紀錄，顯示完整 digest 和時間
   - Toast 通知顯示成功訊息

4. **再提交一筆不同類型的情報**
   - 改 Intel Type 為 "THREAT"，Severity 拉高到 `9`
   - 提交 → 同樣流程，Transaction History 現在有 2 筆

5. **錯誤情境 — 餘額不足**
   - 把 Deposit 改成一個極大數字（超過帳戶餘額）
   - 提交 → Wallet 可能拒絕或交易失敗
   - 頁面不白屏，顯示 error toast

**結果：** [ ]

---

## Scenario 5：Intel Market — 買賣情報 & 懸賞

> **角色**：探險者想在 Intel Market 上架情報販賣，或發布懸賞需求。
> **前提**：已連線 wallet，帳戶有 testnet SUI。
> **目的**：驗證 Intel Market 三個 tab 的完整功能。

### Part A — 上架情報販賣（SELL INTEL tab）

1. **進入 Intel Market 頁面**
   - Header 顯示 "INTEL MARKET"
   - 副標題 "Trade encrypted intelligence. Buy verified intel. Build your reputation."
   - 三個 sub-tab：SELL INTEL / BOUNTY BOARD / MY ACTIVITY
   - 預設在 SELL INTEL tab

2. **瀏覽現有 Listings**
   - 左側 IntelListingBrowser 顯示已上架的情報列表
   - 每筆 listing 顯示：標題/描述、價格（SUI）、seller 地址、狀態
   - 如果無 listings → 顯示空狀態提示

3. **建立新 Listing**
   - 右側 NewListingForm（sticky 定位）
   - 填入 intel 描述、設定價格
   - 點擊提交 → Wallet 簽名（listing fee 0.01 SUI）
   - 成功後 listing 出現在左側列表

4. **購買情報（需另一帳號）**
   - 切換到 Account B
   - 在 SELL INTEL tab 看到 Account A 的 listing
   - 點擊購買 → Wallet 簽名（支付 listing 價格）
   - 交易完成後取得 intel 內容

### Part B — 發布懸賞（BOUNTY BOARD tab）

5. **切換到 BOUNTY BOARD tab**
   - 左側 IntelRequestBrowser 顯示已發布的懸賞需求
   - 右側 PostRequestForm（sticky 定位）

6. **發布懸賞需求**
   - 填入需求描述、設定獎金金額、截止時間
   - 點擊提交 → Wallet 簽名（獎金 escrow 到合約）
   - 成功後需求出現在左側列表

7. **獵人提交回應（Account B）**
   - 切到 Account B
   - 在 BOUNTY BOARD 看到需求 → 點擊提交回應
   - Wallet 簽名 → 提交成功

### Part C — 個人活動紀錄（MY ACTIVITY tab）

8. **切換到 MY ACTIVITY tab**
   - MyActivity 顯示個人相關的所有交易紀錄
   - 包含：我的 listings、我的購買、我的懸賞、我的回應
   - 各筆紀錄狀態正確（active / completed / expired）

**結果：** [ ]

---

## Scenario 6：懸賞任務全生命週期 — 建立、認領、提交證據、審核

> **角色**：兩個帳號（Account A = 懸賞發起者 / Account B = 獵人）。
> **前提**：需要兩個 wallet 帳號切換，或用兩個瀏覽器。
> **目的**：驗證 Bounty 從建立到完成的整個生命週期。

### Part A — 建立懸賞（Account A）

1. **建立 Bounty**
   - 進入 Bounties 頁面
   - 在 "Create Bounty" 面板填入：
     - Region ID: `1`, Sector X/Y/Z: `10/20/30`
     - Intel Types: 點擊 "RESOURCE" 和 "THREAT"（兩個同時選中，金色高亮）
     - Reward: `2` SUI
     - Deadline: 選 "72h"
   - 點 "Create Bounty" → Wallet 簽名 → 成功
   - 右側 Bounties 列表出現新建立的 bounty
   - Bounty 顯示：截短 ID（可點擊）、Status = "OPEN"、Reward = "2.00 SUI"、Types = "RESOURCE, THREAT"

2. **查看 Bounty Detail**
   - 點擊新建的 bounty ID 連結 → 導航到 `/bounties/{id}`
   - Header 顯示 Role = "CREATOR"
   - Bounty Info 面板顯示完整資訊（Region / Intel Types / Reward / Deadline 倒計時 / Creator 地址 / Submissions: 0）
   - Activity 面板顯示 "No proof activity yet."
   - Hunters 面板顯示 "No claim tickets yet."
   - Actions 面板 badge 顯示 "CREATOR"

3. **返回 Bounties 列表**
   - 點擊 "← Back to Bounty Board" → 回到 `/bounties`
   - 切到 "My Bounties" tab → 只顯示自己建立的 bounties

### Part B — 獵人認領 & 提交證據（Account B）

4. **切換到 Account B（獵人）**
   - 斷開 Account A → 連線 Account B
   - 進入 Bounties → "All Active" tab 看到 Account A 建立的 bounty

5. **查看 Bounty Detail（獵人視角）**
   - 點擊進入 → Header 的 Role 顯示 "HUNTER" 或 "VIEWER"
   - Actions 面板根據角色顯示不同按鈕

6. **提交 Proof**
   - 在 Actions 面板填入 proof URL 和描述
   - 點 "Submit Proof" → Wallet 簽名
   - Activity 面板出現新事件 "proof_submitted"
   - Bounty status 變為 "PROOF_SUBMITTED"

### Part C — 審核流程（Account A）

7. **切回 Account A 查看**
   - 進入同一個 Bounty Detail → Role = "CREATOR"
   - Activity 面板有 proof_submitted 事件
   - CountdownTimer 顯示 review deadline 倒計時
   - Hunters 面板列出 Account B 的 claim ticket

8. **Reject Proof**
   - 在 Actions 面板選 "Reject"，填入拒絕原因
   - Wallet 簽名 → Activity 追加 "proof_rejected" 事件
   - Status 變為 "REJECTED"

9. **（Account B）Resubmit Proof**
   - 切到 Account B → 看到被拒絕的事件
   - 填入新的 proof → "Resubmit Proof" → Activity 追加 "proof_resubmitted"

10. **（Account A）Auto Approve**
    - 切回 Account A → 點 "Auto Approve"
    - Wallet 簽名 → Bounty status 變為 "COMPLETED"
    - Activity 追加 "proof_auto_approved"

11. **驗證完成狀態**
    - Bounty detail 所有 Actions 按鈕 disabled（已完結）
    - 回到 Bounties 列表 → 該 bounty 不再出現在 "All Active"（如果只顯示 active 的話）

**結果：** [ ]

---

## Scenario 7：Plugin 市集 — 瀏覽、搜尋、裝備

> **角色**：探險者想要安裝情報分析插件來強化自己的戰場感知。
> **目的**：驗證 Plugin 市集的搜尋、篩選、裝備 slot 系統。

### 操作步驟

1. **進入 Plugin Marketplace**
   - 頁面標題 "PLUGIN MARKETPLACE"（紫/藍色 store variant header）
   - 左側有 Catalog Filters（搜尋欄 + 4 個 category 按鈕：All / Intel / Economy / Signals）
   - Plugin Catalog 列出所有插件
   - 右側 Plugin Preview 預設選中第一個插件

2. **搜尋插件**
   - 在搜尋欄輸入 "trace" → 列表即時篩選，只顯示名稱或描述含 "trace" 的插件
   - 清空搜尋 → 恢復全部

3. **Category 篩選**
   - 點 "Intel" → 只顯示 Intel 類插件（按鈕變金色高亮）
   - 點 "Economy" → 切換到 Economy 類
   - 點 "Signals" → 切換到 Signals 類
   - 點 "All" → 恢復全部
   - 搜尋 + category 組合：選 "Intel" 後輸入關鍵字 → 雙重篩選
   - 找不到結果 → 顯示 "No plugins matched filters."

4. **選擇插件查看 Preview**
   - 點擊任一插件 card → 該 card 有選中高亮（藍色邊框 + 陰影）
   - 右側 Plugin Preview 更新：顯示插件名稱、描述、category、effect、價格
   - 切換不同插件 → Preview 跟著更新

5. **裝備 Plugin 到 Loadout Slot**
   - 右下角 Loadout Slots 顯示 4 個 slot（S1 Tactical Core / S2 Economic Engine / S3 Signal Bay / S4 Auxiliary Dock）
   - 全部初始為 "[Empty]"，虛線邊框
   - 點擊 S1 → S1 被選中（藍色邊框高亮），底部 "S1 Control" 面板顯示 role = "Intel Only"
   - 選擇一個 Intel 類插件 → 點 "Equip to S1" → S1 顯示插件名稱，邊框變金色實線

6. **Category 限制驗證**
   - 選擇一個 Economy 類插件 → S1 仍為 active slot
   - 底部出現黃色警告 "Category mismatch for this slot."
   - "Equip" 按鈕 disabled
   - 改選 S2（Economic Engine）→ 警告消失，"Equip" 可點擊

7. **S4 Auxiliary Dock（Flexible slot）**
   - 選擇 S4 → role = "Flexible"
   - 任何 category 的 plugin 都可裝備，不受限制

8. **Clear Slot**
   - 在已裝備的 slot 上點 "Clear" → slot 恢復為 "[Empty]"

**結果：** [ ]

---

## Scenario 8：訂閱升級 — Free → Premium

> **角色**：Free tier 探險者，想升級到 Premium 以解鎖深度 zoom 和更快刷新。
> **前提**：已連線 wallet，帳戶有足夠 testnet SUI。

### 操作步驟

1. **查看當前 Free 狀態**
   - 進入 Membership 頁面
   - Header 為 "MEMBERSHIP COMMAND"（membership variant 金色風格）
   - Current Access Level badge 顯示 "FREE ACCESS"
   - MetricChips 顯示 Tier = "Free"、Status = "Active (Basic)" 或 "Standard"、Expiry = "N/A"
   - Billing Summary 顯示 "No active paid membership."、Wallet Access = "Unbound"

2. **查看 Coverage Zone 差異**
   - Coverage Advantage Map 有 4 個 zone 按鈕（Z-A1 Citadel Arc / Z-B4 Refinery Spine / Z-C8 Outer Colony / Z-D2 Ancient Relay）
   - 點擊不同 zone → 下方 Feature Delta 更新，顯示 Free vs Premium 的功能差異
   - 例：Z-B4 → Free: "Locked Depth" / Premium: "Deep Zoom"

3. **查看 Capability Matrix**
   - 底部表格列出 5 項能力比較：Heatmap Refresh（60s vs 10s）/ Map Zoom Depth（Level 1 vs 2）/ Intel Breakdown / Bounty Signal Priority / Route Forecast

4. **選擇付費方案**
   - Plan Selection 顯示 "Monthly Billing" 和 "Quarterly Billing" 兩個按鈕
   - 預設選中 Monthly → Premium 卡片顯示 "30 SUI / 30d"
   - 切換到 Quarterly → 價格變為 "81 SUI / 90d"（打九折）
   - Billing Summary 的 Current Cycle 跟著更新

5. **升級訂閱**
   - 點擊 Premium 卡片的 "Upgrade Membership" → 按鈕變 "Processing..."
   - Wallet 彈出簽名確認（金額對應所選方案）
   - 簽名 → 成功 toast
   - Current Access Level badge 更新為 "PREMIUM ACTIVE"
   - Tier 變 "Premium"、Status 變 "Active (Premium)"、Expiry 顯示到期日期
   - Sidebar 的 tier badge 也同步更新

6. **驗證 Premium 權限生效**
   - 回到 Tactical Map → Zoom In 到更深層（Level 2）→ 不再出現 tier 限制警告

**結果：** [ ]

---

## Scenario 9：Portal — 自訂外部工具收藏

> **角色**：探險者想把常用的外部工具（地圖、交易所、Discord）嵌入到 Portal 頁面。
> **目的**：驗證 Portal 完整生命週期：空狀態 → 新增 → 瀏覽 → 全螢幕 → 持久化。

### 操作步驟

1. **首次進入 Portal（空狀態）**
   - 頁面標題 "PORTAL"（portal variant header）
   - 顯示 EmptyState 畫面，引導文字提示新增第一個連結
   - 有 "Add your first link" 之類的 CTA 按鈕

2. **新增第一個連結**
   - 點 Add Link → 彈出 AddLinkDialog 對話框
   - Name 輸入 "EVE Frontier Map"
   - URL 輸入 `https://ef-map.com`
   - 點確認 → 對話框關閉
   - 頁面自動切換為 Split View：左側 LinkList 有一個項目，右側 Preview 自動載入 iframe

3. **新增更多連結**
   - 重複新增 2-3 個不同連結（如 `https://suiscan.xyz`, `https://suivision.xyz`）
   - 左側列表逐漸增長，每個項目顯示名稱 + URL

4. **切換預覽**
   - 點擊左側列表中不同的連結 → 右側 iframe 載入對應的 URL
   - 載入時可能有短暫 loading 狀態
   - 如果某個網站拒絕被 iframe 嵌入（X-Frame-Options 阻擋）→ 5 秒後顯示 failed state
   - Failed state 提供 "Retry" 按鈕和 "Open in new tab" 連結

5. **調整連結順序**
   - 在列表中某個連結上點 "↑" 上移 / "↓" 下移按鈕 → 順序即時改變
   - 最上面的連結不顯示 "↑"，最下面的不顯示 "↓"

6. **刪除連結**
   - 點某個連結的刪除按鈕 → 連結從列表中消失
   - 如果刪除的是正在預覽的連結 → Preview 清空或自動選到第一個

7. **全螢幕模式**
   - 在 Preview 區域找到 fullscreen 按鈕 → 點擊
   - 跳轉到 `/portal/{id}`，iframe 佔滿全螢幕
   - 頂部顯示 PortalFullscreenBar：含連結名稱、close 按鈕（返回 /portal）、external link 按鈕（新 tab 開啟原始 URL）
   - 點 close → 返回 Portal split view

8. **Fallback URL 模式**
   - 在地址列手動輸入 `/portal/view?url=https://example.com&name=Test%20Page`
   - 頁面全螢幕載入 example.com
   - PortalFullscreenBar 多出 "Add to Portal" 按鈕
   - 點 "Add to Portal" → 自動將此連結加入 Portal store 並跳轉到全螢幕頁面 `/portal/{新id}`
   - 回到 `/portal` → 列表中出現新加的 "Test Page"

9. **URL 安全驗證（Fallback 模式）**
   - 手動輸入 `/portal/view?url=javascript:alert(1)&name=XSS`
   - 頁面不載入 iframe，顯示 "Invalid URL" 紅色錯誤訊息 + 錯誤原因
   - 有 "← Back to Portal" 按鈕可返回

10. **刷新後資料保留**
    - 確認列表有 2-3 個連結 → F5 重整頁面
    - 連結全部保留，順序不變
    - 打開 DevTools → Application → Local Storage → 看到 `feh-portal-links` 的 JSON 資料

11. **清除後恢復空狀態**
    - DevTools 中刪除 `feh-portal-links` → 重整頁面
    - 回到步驟 1 的空狀態畫面

12. **不存在的 Portal link ID**
    - 地址列輸入 `/portal/一個不存在的id`
    - 觸發 warning toast "Portal link not found"
    - 自動跳轉回 `/portal`

**結果：** [ ]

---

## Scenario 10：戰術地圖深度分析 — System Heatmap 互動

> **角色**：Premium 探險者正在分析特定星系的威脅密度。
> **目的**：驗證 Canvas2D 星圖的完整互動流程、sidebar overlay、星系置中。

### 操作步驟

1. **切換到 Heatmap 視圖**
   - 進入 Tactical Map → 點 "Intel Heatmap" tab
   - Canvas2D 星圖完整渲染，d3-force 佈局自動排列星系節點
   - 星系以橙色光暈渲染，intensity 高的星系更大更亮
   - 星系間連線可見（半透明線條）

2. **點擊星系節點**
   - 在星圖上直接點擊某個星系 → 該星系以金色邊框高亮
   - Floating sidebar 自動展開（若已收合）
   - Sidebar 頂部面板更新為該星系的 4 項指標（Kills / Intel / Gates / Market）
   - 下方顯示 Intensity 數值

3. **從 Systems 列表選擇星系**
   - 在 floating sidebar 的 Systems 列表中點擊另一個星系
   - 星圖自動平滑移動 + 縮放到 1.2x，將目標星系置於 viewport 中央
   - Sidebar 頂部面板同步更新為新選中的星系

4. **連續切換多個星系**
   - 快速連續點擊不同星系 → 每次都能正確置中 + 更新 sidebar
   - 無跳動或閃爍問題

5. **Sidebar 收合後操作**
   - 收合 sidebar（▶ 按鈕）
   - 直接在星圖上點擊星系 → sidebar 自動展開並顯示該星系資料
   - 星系正確高亮

6. **空資料狀態**
   - 如果 backend 沒有 heatmap 資料 → Systems 列表顯示 "No system data yet."
   - 星圖為空白太空背景，不報錯

**結果：** [ ]

---

## Scenario 11：斷線容錯 & Edge Cases

> **角色**：使用者遇到各種異常狀況。
> **目的**：確保頁面不會白屏或卡死。

### 操作步驟

1. **Backend 離線**
   - 關閉 Backend server
   - Dashboard → WorldStatusBar 不渲染（條件渲染，worldStatus 為 null 時隱藏）
   - Kill Ticker 顯示 "No recent kills"（kills 為空陣列）
   - Breaking / Headlines / Timeline 面板顯示為空或 fallback 狀態
   - Live Intel Feed 顯示 loading 或空白
   - 頁面整體不白屏、Console 無 uncaught error
   - Bounties → 列表為空或顯示 loading，不白屏
   - Intel Market → Listings 為空，PostRequestForm 可填寫但提交會失敗 → error toast
   - Submit Intel → 填表可以操作但提交會失敗 → error toast

2. **Portal 在斷網狀態**
   - 斷開網路 → 進入 Portal → 已儲存的連結列表正常顯示（因為是 localStorage）
   - 新增 / 刪除 / 排序連結 → 都正常（純 client-side 操作）
   - 點擊預覽某個連結 → iframe 載入失敗 → 顯示 failed state + retry

3. **恢復網路**
   - 重新開啟 Backend / 恢復網路
   - 回到 Dashboard → 資料自動 refetch（TanStack Query 的 refetchOnWindowFocus）
   - Portal iframe retry → 正常載入

4. **直接訪問不存在的路由**
   - 輸入 `/bounties/不存在的id` → 頁面載入，顯示 "Bounty not found or failed to load." 紅色錯誤
   - 有 "← Back to Bounty Board" 返回連結

5. **Fallback URL 缺少參數**
   - 訪問 `/portal/view`（不帶 query params）→ 自動跳轉回 `/portal`

**結果：** [ ]

---

## Scenario 12：Demo 快速走位（5 分鐘 Smoke Test）

> **目的**：Demo 前的最後確認，只走核心路徑。

| # | 操作 | 確認 | ✅/❌ |
|---|------|------|------|
| 1 | 開啟首頁 | 頁面完整渲染，Console 無紅字 | [ ] |
| 2 | Connect Wallet | 地址出現在 Sidebar | [ ] |
| 3 | 7 個導航都點一次 | 全部正常載入（`/`, `/map`, `/intel-market`, `/bounties`, `/subscribe`, `/store`, `/portal`） | [ ] |
| 4 | Dashboard | WorldStatusBar 5 指標有數據 + Kill Ticker 有事件 + Map iframe + Feed | [ ] |
| 5 | Tactical Map → Conflict Map → Heatmap 切換 | 兩個 tab 都能切換；Heatmap 星圖渲染 + floating sidebar 可展開收合 | [ ] |
| 6 | Heatmap 星系互動 | 點擊星系 → sidebar 更新 + 星圖置中 | [ ] |
| 7 | Submit Intel → 填表 → 提交 | Wallet 簽名成功，TX 出現在 History | [ ] |
| 8 | Intel Market → 三個 tab 切換 | SELL INTEL / BOUNTY BOARD / MY ACTIVITY 正常渲染 | [ ] |
| 9 | Bounties → 建立一個 Bounty | 成功出現在列表 | [ ] |
| 10 | Plugin Market → 搜尋 → 裝備到 slot | Slot 顯示插件名 | [ ] |
| 11 | Portal → Add Link → 預覽 → 全螢幕 → 返回 | 完整流程不報錯 | [ ] |
| 12 | Membership → 看到 Capability Matrix | 表格正常渲染 | [ ] |
| 13 | Sidebar 收合 / 展開 | 動畫流暢 | [ ] |
| 14 | F5 重整 | Wallet auto-reconnect + Portal 連結保留 | [ ] |
