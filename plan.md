# Frontier Explorer Hub — 開發計畫

> 層級：應用層
> 定位：情報星圖 + 隱私保護熱力圖 + 訂閱經濟 (DaaS)

---

## 架構定位

```
Frontier Explorer Hub ──依賴──▶ Bounty Escrow Protocol（情報懸賞）
```

核心產品：Privacy-Preserving Heatmap + 訂閱分層模型

---

## 開發階段

### Phase 1：情報訂閱合約 (Intel Subscription Contract)
- [ ] 訂閱等級資料結構設計
  - Free tier：模糊熱力圖（延遲 30min）
  - Premium tier：精確活動類型 + 人數 + 戰鬥值（即時）
- [ ] 付費解鎖機制（SUI 支付 → 解鎖期限）
- [ ] 延遲播報邏輯

### Phase 2：熱力圖前端
- [ ] 星圖 UI 元件
- [ ] 分層熱力區塊呈現（模糊 vs 精確）
- [ ] 資料聚合邊界（防逆向工程出個體玩家座標）
- [ ] 前端 scaffold（React + @mysten/dapp-kit）

### Phase 3：Bounty 整合
- [ ] 情報懸賞發布與領取流程
- [ ] 掃描結果上鏈（礦點、威脅、殘骸）
- [ ] 可見範圍控制（公共 / 部落 / 聯盟 / 私人）

### Phase 4：外部 dApp 平台（如有時間）
- [ ] 開發者上架情報工具
- [ ] 通用付費解鎖 SDK
- [ ] 平台費機制

---

## 技術待確認
- [ ] 延遲播報的時間梯度（免費 30min? 付費即時?）
- [ ] 資料聚合邊界的演算法選擇
- [ ] 是否需要 off-chain indexer（熱力圖資料聚合）
- [ ] 前端框架（純 React? Next.js?）

---

## 技術決策（已確認）
- 熱力圖作為核心 DaaS 產品，採訂閱分層模型
- 低階看延遲模糊資訊，高階解鎖即時活動類型 → 資訊落差的訂閱經濟

---

## TODO
- [ ] Intel Subscription Contract 資料結構原型
- [ ] 星圖元件呈現分層熱力區塊
- [ ] UI 串接 Bounty 任務發布與領取
- [x] 將熱力圖功能整合更新至 README.md
- [x] 評估隱私保護熱力圖可行性與跨專案整合方式
