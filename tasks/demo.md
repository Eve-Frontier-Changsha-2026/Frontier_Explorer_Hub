# Demo Script — "The Explorer's Intelligence Economy"

**Format**: Pre-recorded video + slides
**Duration**: ~3:50
**Audience**: EVE Frontier game officials — focus on utility & long-term sustainability

---

## Structure

| # | Section | Time | Screen |
|---|---------|------|--------|
| 0 | Hook | 20s | Title card + Dashboard full view |
| 1 | Battlefield Awareness | 35s | Dashboard scroll → Map heatmap |
| 2 | Sell Intel | 50s | List → TX → Seal encrypt → TX |
| 3 | Buy Intel | 40s | Purchase TX → Seal decrypt → Confirm+Rate TX |
| 4 | Bounty Hunt | 50s | Post request TX → Fulfill TX → Accept TX |
| 5 | Flywheel & Roadmap | 30s | Slides: reputation + fee + plugin + roadmap |
| 6 | Close | 5s | Logo |

---

## Narration Script

### [0 — HOOK, 20s]
*Dashboard full view fades in*

> In EVE Frontier, intelligence is the most valuable currency — yet there's no trusted way to trade it. Sellers risk giving away secrets for nothing; buyers have no guarantee of quality. Frontier Explorer Hub changes that. It's a decentralised intelligence marketplace built on SUI, where every trade is escrow-protected, encrypted, and reputation-tracked.

### [1 — BATTLEFIELD AWARENESS, 35s]
*Dashboard scrolldown: WorldStatusBar → Kill Ticker → Headlines*
*Cut to: Tactical Map → switch to Intel Heatmap tab*

> Every explorer starts here. The dashboard aggregates live data from two independent sources — pilot counts, kill feeds, faction movements, defence indices — all refreshed automatically. The tactical map layers this into a heatmap, so you can spot hotspots at a glance. This is the situational awareness layer that feeds the entire platform.

### [2 — SELL INTEL, 50s]
*Intel Market → Sell Intel tab*
*Seller fills form → TX1 list_intel → wallet confirm → TX digest appears*
*TX2 set_encrypted_payload → "SEALED" badge appears*
*Cut to: SuiScan showing the listing object on-chain*

> Now suppose you've discovered a high-value wreckage site. On the Sell Intel tab, you set a price, attach public metadata — region, threat level, expiry — and submit. The first transaction creates the listing on-chain and locks a small anti-spam fee. The second encrypts your coordinates with SUI's Seal protocol. At this point, the intel exists on-chain but is unreadable — only a paying buyer can decrypt it.

### [3 — BUY INTEL, 40s]
*Switch to Account B*
*Browse listings → click BUY → TX purchase_intel → wallet confirm*
*Seal decrypt animation → plaintext revealed*
*TX confirm_and_rate → rating slider → wallet confirm*
*SellerProfile shows updated score*

> From the buyer's side — you browse active listings, pay the asking price, and your SUI is held in escrow inside the listing object. Once the Viewer Receipt is minted, Seal decrypts the payload client-side. You review the intel, rate the seller one to five, and confirm. Only then does the escrow release payment. If you never confirm, an automatic release triggers after twenty-four hours — no funds are ever stuck.

### [4 — BOUNTY HUNT, 50s]
*Switch to Bounty Board tab*
*Account B posts request → TX post_request → reward locked*
*Switch to Account A → fulfill_request TX → encrypted submission*
*Switch to Account B → decrypt submissions → accept_and_rate TX*
*SuiScan: reward transfer event*

> The Bounty Board flips the model. A buyer posts a request — say, "resource scan in region forty-seven" — and locks the full reward on-chain. Multiple sellers can compete to fulfil it. The first submission starts a twenty-four-hour countdown. The buyer decrypts all submissions, picks the best, rates the seller, and the reward transfers instantly. If the buyer goes silent, the first submitter receives the reward automatically. No arbitrator needed.

### [5 — FLYWHEEL & ROADMAP, 30s]
*Slide: flywheel diagram — Reputation → Trust → Volume → Better Sellers → Reputation*
*Quick cut: SellerProfile card with rating + volume*
*Quick cut: Plugin Market with equipped slots*
*Slide: roadmap — Walrus storage, cross-game intel, governance*

> What makes this sustainable? Three things. First, on-chain reputation — every rating is weighted by trade value, so gaming it costs real money. Second, the fee model is designed to evolve — today it's a listing fee that gets refunded on sale; tomorrow it can include platform fees flowing to a community treasury. Third, the plugin marketplace lets the community build on top — analytics tools, signal processors, custom dashboards — all slotted into the platform. Looking ahead, we plan to integrate Walrus for permanent intel storage and explore cross-game intelligence portability.

### [6 — CLOSE, 5s]
*Logo + team*

> Frontier Explorer Hub — the intelligence economy for EVE Frontier.

---

## Pre-Recording Checklist

- [ ] Backend + dual-source API running (Dashboard has live data)
- [ ] 2 testnet accounts, each with ≥ 5 SUI
- [ ] Pre-seed: 2-3 active listings + 1 SellerProfile with trades
- [ ] Pre-seed: 1 open bounty request
- [ ] Intel Market frontend TX flow end-to-end verified
- [ ] Seal encrypt/decrypt end-to-end verified
- [ ] Screen recorder ready (OBS or equivalent)
- [ ] Post-production: TX annotation overlays, wallet wait fast-forward

## On-Chain TX Summary (6 transactions to capture)

| # | TX | Account | Section |
|---|-----|---------|---------|
| 1 | `list_intel` | A (Seller) | Sell Intel |
| 2 | `set_encrypted_payload` | A (Seller) | Sell Intel |
| 3 | `purchase_intel` | B (Buyer) | Buy Intel |
| 4 | `confirm_and_rate` | B (Buyer) | Buy Intel |
| 5 | `post_request` | B (Buyer) | Bounty Hunt |
| 6 | `fulfill_request` | A (Seller) | Bounty Hunt |
| 7 | `accept_and_rate` | B (Buyer) | Bounty Hunt |

## SuiScan Verification

At least 1 TX should cut to SuiScan to show on-chain proof. Recommended: the `purchase_intel` TX (Section 3) — shows escrow lock clearly.
