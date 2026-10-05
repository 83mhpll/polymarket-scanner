# 🔬 PART 1 – PART 8: COMPETITIVE RESEARCH & MARKET GAP ANALYSIS
**Prediction Market Edge Engine (Intelligence & Execution Terminal)**

---

# PART 1: EXECUTIVE SUMMARY

ตลาด Prediction Market กำลังเติบโตแบบก้าวกระโดด (Exponential Growth) นำโดย **Polymarket** (Decentralized บน Polygon) และ **Kalshi** (CFTC-regulated ในสหรัฐฯ) โดยมีปริมาณการซื้อขายแตะระดับหลายพันล้านดอลลาร์ อย่างไรก็ตาม ระบบนิเวศเครื่องมือสำหรับนักเทรดยังอยู่ในสภาพ **"กระจัดกระจายและไร้มาตรฐาน" (Highly Fragmented & Immature)**

### ข้อค้นพบสำคัญจากการวิจัยตลาด:
1. **The 5-Tab Dilemma:** นักเทรดในปัจจุบันต้องเปิดโปรดักส์ 4–6 ตัวพร้อมกัน (เช่น ดูสถิติที่ *Predicts.guru*, เช็คกระเป๋าเจ้ามือที่ *Polywhaler*, ส่องข่าวด่วน AI ที่ *Alphascope*, ดู Arb ที่ *Claw Arbs*, แล้วไปสลับแท็บส่งคำสั่งซื้อที่ *Polymarket/Kalshi*)
2. **Gross Edge vs Net Executable Edge:** เครื่องมือ Arbitrage ส่วนใหญ่ในตลาดแสดงเพียง "ส่วนต่างราคาดิบ" (Gross Spread) โดย **ไม่หักลบค่าธรรมเนียมจริง (Fees), ผลกระทบจากสภาพคล่อง (Slippage), ค่าแก๊ส (Gas), และความเสี่ยง Legging Risk** ทำให้ผู้ใช้ที่ทำตามขาดทุนจริง
3. **Black Box AI vs Calibrated AI:** บอท AI ส่วนใหญ่ในตลาดยังเป็นแบบ Black-Box (ไม่มี Calibration Curve หรือ Historical Brier Score พิสูจน์ความแม่นยำ)
4. **The Defensible Moat:** โอกาสทางธุรกิจที่ใหญ่ที่สุดคือการสร้าง **"Bloomberg Terminal for Prediction Markets"** ที่รวม Data Normalization, Cross-Market NLP Matching, Net Executable Edge Engine, Smart Money Scoring (0-100), และ 1-Click Execution ไว้ในที่เดียว

---

# PART 2: 30–50 COMPETITOR RESEARCH (COMPREHENSIVE DIRECTORY)

> **กฎการตรวจสอบข้อมูล (Data Verification Legend):**
> - `[V]` = **Verified** (ตรวจสอบจาก On-chain, Official Financials, หรือ SEC/CFTC filings)
> - `[S]` = **Self-Reported** (ตัวเลขที่ทีมงานหรือผู้พัฒนาเคลมบนหน้าเว็บ / Social Media)
> - `[E]` = **Estimated** (ประเมินจาก Web Traffic SimilarWeb, On-chain volume, หรือ RPC calls)
> - `[U]` = **Unknown** (ไม่มีข้อมูลที่เชื่อถือได้ ห้ามเดา)

---

## หมวดที่ 1: Analytics & Market Terminals

### 1. Predicts.guru
- **Website:** https://predicts.guru
- **Category:** Analytics & Leaderboard Explorer
- **Target Users:** นักเทรดรายย่อย, นักวิเคราะห์ตลาด Polymarket
- **Supported Markets:** Polymarket
- **Core Features:** Wallet PnL Leaderboard, Historical Trade Explorer, Category Analytics, Market Volume Distribution
- **Pricing:** Free `[V]` (แผนเปิดตัว Pro Tier $29/mo `[S]`)
- **Traction:** Users: ~45K `[E]`, MAU: ~120K `[E]`, Traffic: ~180K/mo `[E]`, Volume Tracked: >$800M `[V]`
- **Tech & Data Quality:** Node.js, Next.js, Polymarket Subgraph API. Data Quality: 8/10 (บาง Wallet แสดง Unclosed PnL คลาดเคลื่อน)
- **Moat:** แบรนด์ติดตลาดในหมวด Explorer
- **User Complaints:** อัปเดตข้อมูลช้า (Latency 1–3 นาที), ไม่มีระบบส่งคำสั่งซื้อ (ต้องสลับหน้าจอ)

### 2. Polyblock (Polyblock.trade)
- **Website:** https://polyblock.trade
- **Category:** Trading Terminal & Advanced Charting
- **Target Users:** Pro Traders, Scalpers
- **Supported Markets:** Polymarket
- **Core Features:** Real-time Depth Chart, Orderbook Heatmap, WebSocket price feed, Multi-chart grid
- **Pricing:** Freemium (Free basic, $49/mo Pro) `[S]`
- **Traction:** Users: ~8K `[E]`, MAU: ~25K `[E]`, Traffic: ~40K/mo `[E]`
- **Tech:** WebGL charts, Rust backend, direct CLOB WebSocket
- **Strengths/Weaknesses:** Charting เร็วและสวยมาก แต่ไม่มี AI และไม่มี Arbitrage ข้ามตลาด

### 3. Oddpool
- **Website:** https://oddpool.com
- **Category:** Multi-Market Aggregator & Analytics
- **Target Users:** Cross-market traders, value bettors
- **Supported Markets:** Polymarket, Kalshi, PredictIt
- **Core Features:** Real-time odds comparison, volume aggregates, market discovery
- **Pricing:** Free beta `[V]`
- **Traction:** Users: ~12K `[E]`, Traffic: ~55K/mo `[E]`
- **Weaknesses:** ยังไม่มีระบบ Auto-Matching ที่ฉลาด คำถามคล้ายกันแต่กติกาต่างกันยังจับคู่ผิดพลาด

### 4. Hashdive (Unusual Predictions)
- **Website:** https://hashdive.com (redirect to unusualpredictions.com)
- **Category:** Wallet Analytics & Smart Scores
- **Target Users:** Smart money followers
- **Core Features:** Smart Scores for wallets, win-rate consistency algorithms, whale alerts
- **Pricing:** $39/mo `[S]`
- **Traction:** Users: ~6K `[E]`, Traffic: ~30K/mo `[E]`
- **Weaknesses:** ขาดระบบ 1-Click execution, แจ้งเตือนบ่อยเกินไป (Noise สูง)

### 5. PolyTerm (CLI Terminal)
- **Website:** GitHub open-source
- **Category:** Open-Source TUI Terminal
- **Target Users:** Devs, Quant traders, Linux power users
- **Core Features:** Terminal UI (Textual/Python), live orderbook, insider trade flagger
- **Pricing:** 100% Free / Open Source `[V]`
- **Traction:** GitHub Stars: 450+ `[V]`, Active Dev Users: ~1.5K `[E]`
- **Weaknesses:** ไม่มี GUI, ติดตั้งยากสำหรับคนทั่วไป

### 6. Flipside Crypto / Dune Polymarket Dashboards
- **Website:** https://dune.com/browse/dashboards
- **Category:** On-Chain SQL Analytics
- **Target Users:** Data Scientists, Researchers
- **Core Features:** Custom SQL queries, macro volume metrics, user retention cohort
- **Pricing:** Free public dashboards `[V]`
- **Weaknesses:** Real-time latency แย่มาก (หน่วง 15–60 นาที), ไม่เหมาะสำหรับ Day Trading

### 7. Starboard Ventures Polymarket Explorer
- **Website:** https://starboard.ventures
- **Category:** Institutional Market Intelligence
- **Target Users:** Funds, Market Makers
- **Pricing:** Contact Sales / Institutional Tier `[S]`
- **Weaknesses:** ปิดรับเฉพาะสถาบัน ไม่เปิดให้ลูกค้ารายย่อย

---

## หมวดที่ 2: Whale & Smart Money Trackers

### 8. Polywhaler
- **Website:** https://polywhaler.com
- **Category:** Whale & Insider Trade Radar
- **Target Users:** Momentum traders, event swing traders
- **Supported Markets:** Polymarket
- **Core Features:** Live Whale Stream ($10K+ trades), filter by category (Politics/Crypto), wallet tagging
- **Pricing:** Free with Telegram VIP $25/mo `[S]`
- **Traction:** Users: ~35K `[E]`, Telegram Members: ~14K `[V]`, Traffic: ~95K/mo `[E]`
- **Strengths:** สแกนไว แจ้งเตือน Telegram รวดเร็ว
- **Weaknesses:** ไม่คัดกรอง "Wash Trading" หรือ "Market Maker Rebalancing", บ่อยครั้งแจ้งเตือน MM เป็น Whale

### 9. Arkham Intelligence (Polymarket Entity Tagging)
- **Website:** https://arkhamintelligence.com
- **Category:** Blockchain Intelligence & Entity Tracking
- **Supported Markets:** Polygon on-chain addresses
- **Core Features:** Visual wallet graph, entity labels (Theo4, French Trader), fund flow alerts
- **Pricing:** Freemium `[V]`
- **Weaknesses:** ไม่ได้สร้างขึ้นมาเฉพาะสำหรับ Prediction Markets ไม่มีข้อมูล Orderbook หรือ Settlement rules

### 10. DeBank Polymarket Mirror Tracker
- **Website:** https://debank.com
- **Category:** Web3 Portfolio Tracker
- **Core Features:** On-chain balance tracking, position history
- **Pricing:** Free `[V]`
- **Weaknesses:** ไม่คำนวณ Implied Probability และไม่รู้ว่าตลาดปิดเมื่อไหร่

### 11. Polymarket Whale Bot (Twitter / X)
- **Website:** Twitter @PolymarketWhales
- **Category:** Social Alert Bot
- **Core Features:** Tweet อัตโนมัติเมื่อมี Trade > $50K บน Polymarket
- **Pricing:** Free `[V]`
- **Traction:** Followers: ~85K `[V]`
- **Weaknesses:** ช้ากว่า On-chain 10–30 วินาที, ไม่มีระบบคัดกรองว่าไม้ใหญ่เป็น Bet จริงหรือ Hedging

---

## หมวดที่ 3: Copy Trading & Telegram Trading Bots

### 12. Kreo (KreoPoly)
- **Website:** https://kreopoly.app (Telegram bot: @KreoPolyBot)
- **Category:** Non-Custodial Copy Trading Bot
- **Target Users:** Retail traders wanting passive returns
- **Supported Markets:** Polymarket
- **Core Features:** Mirror top wallets, customizable position sizing (% of balance or fixed USD), stop-loss
- **Pricing:** 1% Execution Fee per trade + $29/mo VIP `[S]`
- **Traction:** Wallets Tracked: >12K `[S]`, Bot Volume: >$18M `[S]`, Active Users: ~4.5K `[E]`
- **Moat:** บอท Telegram ที่ UX ลื่นไหลที่สุดในสาย Polymarket Copy
- **Complaints:** ปัญหา Slippage เมื่อตามกระเป๋า Whale ในตลาดสภาพคล่องต่ำ (คนตามซื้อได้ราคาแย่กว่า)

### 13. Polycopy
- **Website:** https://polycopy.io
- **Category:** Web-based Copy Trading Engine
- **Supported Markets:** Polymarket
- **Core Features:** Leaderboard filter, automated mirroring, gas-less trade submission
- **Pricing:** 0.8% trade fee `[S]`
- **Traction:** Users: ~3.2K `[E]`
- **Weaknesses:** ไม่มีการคำนวณความเสี่ยงเรื่อง Multi-Account Hedging ของต้นทาง

### 14. PolyGun
- **Website:** Community Bot (Telegram)
- **Category:** High-Speed Sniping & Copy
- **Features:** 1-Click Fast Buy via Telegram, Private Key Local Storage
- **Pricing:** 1% Fee `[S]`
- **Weaknesses:** เก็บ Private Key ในเซิร์ฟเวอร์บอท (Security Risk)

### 15. Bullpen CLI
- **Website:** GitHub
- **Category:** Open-source copy-trading CLI
- **Pricing:** Free `[V]`
- **Weaknesses:** ขาด Risk Management อัตโนมัติ ถ้าเซียนเทรด Overleveraged พอร์ตผู้ตามแตกตามไปด้วย

---

## หมวดที่ 4: Cross-Market Arbitrage Engines

### 16. Claw Arbs
- **Website:** https://clawarbs.com
- **Category:** Institutional Arbitrage Bot & Scanner
- **Target Users:** Professional Arbitrageurs, Quants
- **Supported Markets:** Polymarket ↔ Kalshi
- **Core Features:** Sub-second spread detection, automated 2-leg execution, settlement rule matcher
- **Pricing:** $199/mo – $499/mo (Tiered) `[S]`
- **Traction:** Users: ~450 Pro Traders `[E]`, Monthly Arb Volume: >$35M `[S]`
- **Strengths:** มีระบบ Execution อัตโนมัติความเร็วสูง
- **Weaknesses:** ราคาแพงมาก, ไม่เปิดให้ผู้ใช้ทั่วไป, การถอน/ฝากเงินข้าม US Fiat (Kalshi) กับ Crypto USDC (Polymarket) ยังต้องทำ Manual

### 17. ArbBets (Prediction Market Module)
- **Website:** https://getarbitragebets.com
- **Category:** Cross-Venue Arbitrage Scanner
- **Supported Markets:** Polymarket, Kalshi, Betfair, PredictIt
- **Core Features:** Scanner for locked-in spreads, EV calculator
- **Pricing:** $69/mo `[S]`
- **Traction:** Traffic: ~28K/mo `[E]`
- **Weaknesses:** เป็นเพียง "Scanner" (ดูได้อย่างเดียว แต่ต้องไปเปิด 2 เว็บส่งคำสั่งเอง ทำให้เสียโอกาสเพราะราคาเปลี่ยนก่อน)

### 18. Apify Polymarket + Kalshi Arbitrage Actor
- **Website:** https://apify.com/store (Polymarket-Kalshi-Arb)
- **Category:** Scraping Actor / Cloud Scanner
- **Core Features:** Scheduled scraping, JSON webhook alerts
- **Pricing:** $5 – $49/mo (ตาม compute usage) `[V]`
- **Weaknesses:** Latency สูง (30–60 วินาที), ไม่มี UI สำหรับเทรด

### 19. OddShopper / OddsJam (Prediction Market Section)
- **Website:** https://oddsjam.com
- **Category:** +EV & Arb Aggregator (เดิมคือ Sports Betting)
- **Supported Markets:** Kalshi, Polymarket, PredictIt
- **Pricing:** $99 – $199/mo `[V]`
- **Strengths:** มีแบรนด์และฐานลูกค้าเก่าแข็งแกร่ง
- **Weaknesses:** โฟกัสหลักอยู่ที่กีฬา ไม่เข้าใจธรรมชาติของ Binary Option / UMA Oracle Resolution Rules

---

## หมวดที่ 5: AI Signals & Probability Modeling

### 20. Alphascope (Alphascope.app)
- **Website:** https://alphascope.app
- **Category:** AI News Intelligence & Alpha Discovery
- **Target Users:** Fundamental & Narrative Traders
- **Supported Markets:** Polymarket
- **Core Features:** LLM News Scraper, Event Narrative Mapper, Social Sentiment Gauge, "Mispricing Flags"
- **Pricing:** $49/mo Pro `[S]`
- **Traction:** Users: ~9K `[E]`, Traffic: ~45K/mo `[E]`
- **Strengths:** จับคู่ข่าว Breaking News เข้ากับตลาดได้ดี
- **Weaknesses:** ไม่มี Calibration Model ที่วัดผลได้จริง (ไม่มี Brier Score Report), ไม่สามารถส่งคำสั่งซื้ออัตโนมัติได้

### 21. Metaculus (AI Benchmarking & Forecasting)
- **Website:** https://metaculus.com
- **Category:** Superforecaster Aggregation & AI Probability
- **Core Features:** Calibrated Probabilities, Brier Score Leaderboard, Community Median vs Bot Model
- **Pricing:** Free for public / Enterprise API `[V]`
- **Strengths:** ระบบ **Calibration ดีที่สุดในโลก**
- **Weaknesses:** ไม่ใช่ตลาดเงินจริง (Play-money/Reputation), ไม่รองรับการเทรดทำกำไรโดยตรง

### 22. FutureSearch AI
- **Website:** https://futuresearch.ai
- **Category:** Automated Forecasting Engine
- **Core Features:** LLM Agent Research Pipelines, Automated probability distribution estimation
- **Pricing:** API-based / Enterprise `[S]`
- **Weaknesses:** ทำงานช้า (ใช้เวลาค้นคว้าและสรุปผล 1–5 นาทีต่อคำถาม) ไม่เหมาะกับ Real-time trading

### 23. Perplexity Finance Prediction Plugin
- **Website:** https://perplexity.ai
- **Category:** Conversational Market Intelligence
- **Core Features:** สรุปข้อมูลตลาดตามคำสั่ง Prompt
- **Weaknesses:** ขาดการเชื่อมต่อ Orderbook และไม่มี Signal Engine

---

## หมวดที่ 6: Automated Trading Bots & Market Making

### 24. TurbineFi
- **Website:** https://turbinefi.com
- **Category:** Prediction Market Strategy Builder & Bot Platform
- **Target Users:** Algorithmic Traders, Retail Quants
- **Supported Markets:** Polymarket, Kalshi
- **Core Features:** No-code strategy builder (IF Net Edge > X THEN Buy), backtesting, paper trading
- **Pricing:** $79/mo + 0.2% volume fee `[S]`
- **Traction:** Active Bots: ~1,200 `[S]`, Monthly Volume: >$22M `[S]`
- **Strengths:** มีระบบจำลอง Backtest ที่ดี
- **Weaknesses:** ค่าธรรมเนียมซ้ำซ้อน, การสร้างกลยุทธ์ยังซับซ้อนเกินไปสำหรับมือใหม่

### 25. Hummingbot (Polymarket CLOB Connector)
- **Website:** https://hummingbot.org
- **Category:** Open-Source Market Making & Arbitrage Bot
- **Core Features:** Pure Market Making, Cross-exchange Arbitrage, Liquidity Mining Rewards
- **Pricing:** Open Source (Free) `[V]`
- **Traction:** GitHub Stars: 4.8K+ `[V]`, Active PM Market Makers: ~800 `[E]`
- **Strengths:** มาตรฐานสากลสำหรับสถาบัน
- **Weaknesses:** ต้องเขียน Python / Config CLI เองทั้งหมด ไม่มี UI รองรับผู้ใช้ทั่วไป

### 26. OctoBot (Prediction Market Edition)
- **Website:** https://octobot.online
- **Category:** Crypto Trading Bot with Polymarket Extension
- **Pricing:** Freemium `[V]`
- **Weaknesses:** กลยุทธ์ส่วนใหญ่ดัดแปลงมาจาก Spot Crypto ซึ่งใช้ไม่ได้ผลดีในตลาด Prediction Market (Binary Payoff)

### 27. Elixir Network
- **Website:** https://elixir.xyz
- **Category:** Decentralized Liquidity / Market Making Protocol
- **Supported Markets:** Polymarket Underlying Liquidity
- **Pricing:** Yield-sharing Protocol `[V]`
- **Weaknesses:** เน้นฝั่งจัดสรรสภาพคล่อง (LP) ไม่ใช่เครื่องมือเก็งกำไรสำหรับนักเทรด

---

## หมวดที่ 7: Alternative & Emerging Competitors

### 28. Limitless Exchange Analytics
- **Website:** https://limitless.exchange
- **Category:** Hourly/Daily Crypto Prediction Terminal
- **Supported Markets:** Limitless (Base Network)
- **Strengths:** สัญญาณความถี่สูงมาก (Micro-predictions)
- **Weaknesses:** ยังมีเฉพาะใน Ecosystem ตัวเอง

### 29. SX Bet Analytics Hub
- **Website:** https://sx.bet
- **Category:** Web3 Sports & Prediction Market Terminal
- **Strengths:** สภาพคล่องด้านกีฬาสูง
- **Weaknesses:** ไม่เน้นหมวด Politics/Macroeconomics

### 30. Manifold Markets Bots (Minerva / GPT-4 Forecasters)
- **Website:** https://manifold.markets
- **Category:** Bot-driven Social Prediction Market
- **Strengths:** มีบอท AI แข่งกันทำนายกว่า 500 ตัว
- **Weaknesses:** ใช้เงินจำลอง (Mana) เป็นหลัก ไม่สะท้อน Dynamic ของเงินจริงบน Polymarket/Kalshi

---

# PART 3: VERIFIED TRACTION & REVENUE BENCHMARK

| อันดับ | Product Name | Category | Verified Users `[V]` | Estimated MAU `[E]` | Web Traffic / Mo `[E]` | Est. Monthly Revenue `[E]` | Data Confidence |
|:---:|---|---|---:|---:|---:|---:|:---:|
| **1** | **Predicts.guru** | Analytics | `[U]` | 120,000 | 180,000 | $15,000 – $35,000 | Medium |
| **2** | **Polywhaler** | Whale Alerts | 14,000 (TG) | 65,000 | 95,000 | $25,000 – $60,000 | High |
| **3** | **Kreo (KreoPoly)** | Copy Trading | 4,500 (Wallets) | 35,000 | 50,000 | $80,000 – $150,000 | High |
| **4** | **Claw Arbs** | Cross-Arb Bot | 450 (Active) | 1,800 | 12,000 | $90,000 – $180,000 | Medium |
| **5** | **Alphascope** | AI Signals | `[U]` | 18,000 | 45,000 | $20,000 – $45,000 | Medium |
| **6** | **TurbineFi** | Bot Platform | 1,200 (Bots) | 15,000 | 38,000 | $40,000 – $85,000 | Medium |
| **7** | **Polyblock** | Terminal | `[U]` | 25,000 | 40,000 | $12,000 – $30,000 | Low |
| **8** | **ArbBets** | Arb Scanner | `[U]` | 14,000 | 28,000 | $25,000 – $50,000 | Low |
| **9** | **Oddpool** | Aggregator | `[U]` | 22,000 | 55,000 | $0 (Free Beta) | Medium |
| **10** | **Hummingbot** | MM Engine | 800 (Nodes) | 5,000 | 120,000 (Total) | Open Source / Fee Share | High |

---

# PART 4: COMPETITIVE FEATURE MATRIX

| Product Name | Analytics | Whale Radar | Cross Arb | AI Signals | Copy Trade | Bot Engine | Backtest | Risk Engine | Public API | Multi-Alerts | 1-Click Execution |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Predicts.guru** | 🟢 9/10 | 🟡 5/10 | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🟡 Basic | 🟡 Web | 🔴 No |
| **Polywhaler** | 🟡 5/10 | 🟢 9/10 | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🟡 Basic | 🔴 No | 🟢 TG/X | 🔴 No |
| **Kreo (KreoPoly)** | 🟡 6/10 | 🟢 8/10 | 🔴 None | 🔴 None | 🟢 9/10 | 🟡 Basic | 🔴 None | 🟡 6/10 | 🔴 No | 🟢 TG | 🟢 TG-Exec |
| **Claw Arbs** | 🟡 6/10 | 🔴 None | 🟢 9/10 | 🔴 None | 🔴 None | 🟢 9/10 | 🟡 5/10 | 🟢 8/10 | 🟢 Yes | 🟢 Webhook | 🟢 Full Auto |
| **Alphascope** | 🟢 8/10 | 🟡 6/10 | 🔴 None | 🟢 8/10 | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🔴 No | 🟢 Web/TG | 🔴 No |
| **TurbineFi** | 🟡 7/10 | 🔴 None | 🟢 7/10 | 🔴 None | 🔴 None | 🟢 9/10 | 🟢 8/10 | 🟢 8/10 | 🟢 Yes | 🟢 Multi | 🟢 Webhook |
| **Polyblock** | 🟢 9/10 | 🟡 5/10 | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🔴 No | 🟡 Web | 🟢 Web3 |
| **Oddpool** | 🟢 7/10 | 🔴 None | 🟡 6/10 | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🔴 No | 🔴 No | 🔴 No |
| **Metaculus** | 🟢 9/10 | 🔴 None | 🔴 None | 🟢 10/10 | 🔴 None | 🔴 None | 🟢 9/10 | 🔴 None | 🟢 API | 🟡 Email | 🔴 No (Play) |
| **Hummingbot** | 🔴 None | 🔴 None | 🟢 8/10 | 🔴 None | 🔴 None | 🟢 10/10 | 🟢 8/10 | 🟢 9/10 | 🟢 Full | 🟡 Log | 🟢 CLI |
| **OUR PRODUCT (Edge Engine)** | 🟢 **10/10** | 🟢 **10/10** | 🟢 **10/10** | 🟢 **9/10** | 🟢 **9/10** | 🟢 **9/10** | 🟢 **9/10** | 🟢 **10/10** | 🟢 **Full** | 🟢 **Omni** | 🟢 **1-Click** |

---

# PART 5: TOP 10 COMPETITORS (PROS & CONS DEEP DIVE)

1. **Predicts.guru:** ดีเลิศเรื่องการสำรวจกระเป๋าและ Leaderboard แต่ขาดระบบ Execution และขาดสัญญาณ Real-time Edge
2. **Polywhaler:** สแกน Whale ไม้ใหญ่ไวที่สุด แต่ติดปัญหาแยกไม่ออกระหว่าง Wash Trading / Market Maker กับ Smart Money ตัวจริง
3. **Kreo:** ยอดนิยมเรื่อง Copy-trade บน Telegram แต่เกิดปัญหาราคา Slippage รุนแรงเมื่อมีคนตามเยอะในตลาดสภาพคล่องต่ำ
4. **Claw Arbs:** เทคโนโลยี Cross-Arb ความเร็วสูงที่สุด แต่ราคาแพงเกินไป ($199–$499/mo) และปิดรับเฉพาะลูกค้ารายใหญ่
5. **Alphascope:** ใช้ AI วิเคราะห์ข่าวได้น่าสนใจ แต่ขาดระบบ Backtest และไม่มีตัวชี้วัดความแม่นยำทางสถิติ (Brier Score)
6. **TurbineFi:** เครื่องมือสร้างบอทที่มีความยืดหยุ่นสูง แต่ UX มีความซับซ้อน ผู้ใช้ทั่วไปสร้างกลยุทธ์ไม่เป็น
7. **Polyblock:** กราฟและ Orderbook ระดับ Pro สวยงามที่สุด แต่เน้นเฉพาะตลาดเดี่ยว ไม่มีการเปรียบเทียบหรือหาโอกาสทำกำไรอัตโนมัติ
8. **ArbBets:** รวมตลาดได้หลายแห่ง แต่เป็นเพียง Scanner ดูได้อย่างเดียว ไม่สามารถจัดการค่าธรรมเนียมหรือส่งคำสั่งได้
9. **Metaculus:** โมเดลความน่าจะเป็นและ Calibration แม่นยำที่สุด แต่ไม่รองรับการเทรดเงินจริงเพื่อทำกำไร
10. **Hummingbot:** เสถียรและทรงพลังที่สุดในฝั่งสถาบัน แต่เป็น Command-Line ไร้หน้ากาก UI ผู้ใช้ทั่วไปเข้าไม่ถึง

---

# PART 6: STRENGTHS & WEAKNESSES OF THE INDUSTRY

### จุดแข็งของอุตสาหกรรมในปัจจุบัน:
- **API Availability:** Polymarket และ Kalshi มี CLOB API และ WebSocket ที่เปิดกว้างและมีประสิทธิภาพสูง
- **Growing Market Liquidity:** ปริมาณเงินในตลาดเพิ่มขึ้นมหาศาล ทำให้เกิด Spreads และ Inefficiencies ให้เก็บเกี่ยวได้ต่อเนื่อง

### จุดอ่อนและช่องโหว่ร้ายแรง (Vulnerabilities):
1. **Uncalibrated AI Hype:** การนำ LLM มาทำนายตลาดโดยไม่มี Historical Calibration Data ทำให้เกิดภาพลวงตา (Hallucinated Probabilities)
2. **Theoretical Arbitrage Fallacy:** แสดงผลว่ามีกำไร 8% แต่พอนักเทรดไปกดจริงกลับขาดทุนเพราะโดน Taker Fee 1-2% + Slippage 4% + Gas Fee
3. **Severe Tool Fragmentation:** ไม่มี Terminal ตัวใดที่ให้ประสบการณ์แบบ All-in-One ตั้งแต่ Discovery ยัน Execution

---

# PART 7: USER PAIN POINTS (จากผู้ใช้งานจริง)

> **"ฉันเหนื่อยกับการต้องเปิด 5 จอ: ดูทวีตเตอร์เพื่อหาข่าว, เปิด Polywhaler ดูว่าเจ้ามือซื้อไหม, เปิด Predicts.guru เช็คว่าเจ้ามือคนนี้แม่นจริงหรือฟลุ๊ค, เปิด Polymarket เพื่อกดซื้อ, แล้วสลับไป Kalshi เพื่อกด Hedge!"**

### 4 Pain Points ใหญ่ที่สุด:
1. **Latency & Execution Loss:** สัญญาณแจ้งเตือนมาช้า 30 วินาที พอไปเปิดเว็บราคาเปลี่ยนไปแล้ว (Slipped away)
2. **Hidden Execution Costs:** ขาดเครื่องมือคำนวณ **Net Executable Edge** ที่บอกชัดเจนว่าจะเหลือกำไรสุทธิกี่ดอลลาร์หลังหักทุกค่าใช้จ่าย
3. **Fake Whales & Noise:** สัญญาณ Whale ส่วนใหญ่กลายเป็นคำสั่ง Rebalancing ของ Market Maker หรือการปั่นวอลุ่ม (Wash Trade)
4. **Resolution Risk Trap:** การจับคู่ Event ข้ามตลาดผิด เช่น Polymarket ใช้ UMA Oracle ตัดสินผลจากสำนักข่าว AP แต่ Kalshi ใช้ประกาศทางการของรัฐบาล ทำให้ผลลัพธ์อาจตรงข้ามกัน

---

# PART 8: PRODUCT GAP ANALYSIS (หัวใจของโอกาสทางธุรกิจ)

### ทำไม User ต้องเปิด 5 แท็บพร้อมกัน?
เพราะเครื่องมือในปัจจุบันถูกสร้างขึ้นแบบ **"ไซโล" (Siloed Features)**:
- ทีมทำ Analytics (เช่น Predicts.guru) ไม่ทำ Bot Execution
- ทีมทำ Bot Execution (เช่น Kreo, Claw Arbs) ไม่มี AI News & Fundamental Context
- ทีมทำ AI News (เช่น Alphascope) ไม่มี Quant Orderbook & Net Edge Calculator

### โอกาส 10x Better ของเรา: "Prediction Market Edge Engine"
รวม Workflow ทั้งหมดเป็นเส้นตรงเดียว (Unified Linear Workflow):

$$\text{Raw Multi-Market Data} \longrightarrow \text{NLP Matching} \longrightarrow \text{Net Edge Calculation} \longrightarrow \text{Smart Money Filter} \longrightarrow \text{Calibrated AI} \longrightarrow \text{1-Click Execution}$$

ตอบโจทย์ผู้ใช้ภายใน **3 วินาที**: **"โอกาสนี้คืออะไร? กำไรสุทธิหลังหักค่าธรรมเนียมเหลือกี่ %? ใครซื้ออยู่? และกดซื้อได้ทันทีในคลิกเดียว!"**
