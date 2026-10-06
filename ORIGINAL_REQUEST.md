# Institutional Polymarket Terminal & Autonomous Multi-Agent Master Roadmap

> Status: Ready for Next Run (Milestone M1 Completed, Awaiting Resume for M2–M5)
> Working Directory: /Users/mk83/.gemini/antigravity/scratch/polymarket-scanner
> Current Git Commit: e204e2f
> Branch: main

---

## 📌 Executive Summary
ระบบ Institutional Prediction Market Terminal & Autonomous Quantitative Trading System เชื่อมต่อระหว่าง Backend Engine, โมเดลคำนวณ Fair Value, บอทเทรดจำลองอัตโนมัติ 24/7 และหน้าจอ Terminal Dashboard ([public/index.html](file:///Users/mk83/.gemini/antigravity/scratch/polymarket-scanner/public/index.html)) อย่างครบวงจร

---

## 🏛️ หมวดหมู่ฟีเจอร์และแผนงานที่ต้องพัฒนาให้สมบูรณ์ทั้งหมด

### หมวดที่ 1: Market Scanner & Arbitrage Engine (ระบบสแกนและตรวจจับโอกาสทำกำไร)
1. **Market Scanner (`scanner.js` / `server.js`)**
   - [ ] ปรับปรุงจาก REST Polling ช้าๆ (รอบละ 2 นาที) ให้เป็น **Real-Time Market Stream**
   - [ ] เพิ่มระบบคัดกรองหมวดหมู่เฉพาะทาง (Weather, Politics, Crypto, Sports, Macro)
   - [ ] อัปเกรด High Conviction Score Filtering ($\ge 85$) พร้อมจัดเรียงตาม Net Edge
2. **Cross-Exchange Arbitrage (`engine/market_matcher.js`, `engine/kalshi_client.js`, `engine/manifold_matcher.js`)**
   - [ ] พัฒนา **NLP Semantic Matcher** สำหรับจับคู่คำถามและเงื่อนไขตลาดระหว่าง Polymarket, Kalshi และ Manifold ได้แม่นยำ 100%
   - [ ] คำนวณ **Net Arbitrage Engine (`engine/net_arbitrage.js`)** โดยหักค่าธรรมเนียม Taker/Maker ของทั้งสองตลาดจริง
3. **Whale Radar & Smart Money (`whale_radar.js`, `engine/smart_money.js`)**
   - [ ] สแกนตรวจจับธุรกรรมและวอลุ่มผิดปกติ (Abnormal Volume Spikes)
   - [ ] ระบบวิเคราะห์ Wallet Forensics แยกแยะระหว่าง Institutional Market Maker กับ Retail Whales
   - [ ] ส่งสัญญาณแจ้งเตือน Live Whale Alerts เข้าสู่หน้าจอ Terminal
4. **NegRisk & 1¢ Dust Sniper (`negrisk_arbitrage.js`, `dust_sniper_1c.js`)**
   - [ ] สแกนหาตลาด Multi-outcome ที่ผลรวมความน่าจะเป็นเบี่ยงเบนจาก 1.00 ($\sum p_i \ne 1.00$)
   - [ ] ระบบตรวจจับ 1¢ Dust Opportunities
   - [ ] เพิ่มระบบ Pre-flight Orderbook Slippage Check ก่อนส่งคำสั่งเพื่อป้องกันปัญหาขาดสภาพคล่อง

---

### หมวดที่ 2: Orderbook & Pricing Brain (สมองวิเคราะห์ราคาและการสั่งซื้อ)
1. **Quantitative Fair Value Engine (`engine/weather_fair_value.js`) [COMPLETED ✅ M1]**
   - [x] โมเดล Open-Meteo Ensemble NWP (82 members: GFS + ECMWF)
   - [x] คำนวณใน Logit/Expit space และประเมินความหนาแน่นด้วย Gaussian KDE (Silverman rule) + ECDF Laplace correction
   - [x] ผ่านการทดสอบ Unit & Adversarial Tests 208/208 เคส (Brier Score ดีกว่าตลาด 74.92%)
2. **De-vigging & Dynamic Fee Suite (`engine/devigging.js`, `engine/dynamic_fees.js`) [COMPLETED ✅ M1]**
   - [x] ตัดค่าต๋งเจ้ามือครบทั้ง 3 แบบ: Multiplicative, Power Method, และ Shin (1993) แก้นิสัย Favorite-Longshot Bias
   - [x] คำนวณ Dynamic Taker Fee ตามสูตร Polymarket จริง พร้อมรองรับ Maker Rebate 25%
3. **Real-Time WebSocket CLOB Orderbook Streamer (`engine/clob_depth.js`) [MILESTONE M3]**
   - [ ] สร้างการเชื่อมต่อ WebSocket กับ Polymarket CLOB โดยตรง
   - [ ] สตรีมข้อมูล BBO (Best Bid/Offer) และ Depth Ladder 5 ระดับ (DOM) แบบเรียลไทม์โดยไม่ต้องกดรีเฟรช
   - [ ] ระบบ Reconnection อัตโนมัติด้วย Jittered Exponential Backoff และ Fallback ไปยัง REST API
4. **Interactive Order Execution Modal (`public/index.html`) [MILESTONE M5]**
   - [ ] เชื่อมต่อปุ่ม Order Modal (YES/NO) เข้ากับสูตร **Fractional Kelly Criterion + Market Shrinkage** เพื่อแนะนำขนาดไม้เทรดที่ปลอดภัยอัตโนมัติ
   - [ ] เลือกระหว่างคำสั่งแบบ Passive (Maker) หรือ Aggressive (Taker Crossing)

---

### หมวดที่ 3: Autonomous Execution, Portfolio & Risk Control (ระบบเทรดอัตโนมัติและการคุมความเสี่ยง)
1. **24/7 Autonomous Paper-Trading Bot (`engine/paper_bot.js`, `backtest.json`) [MILESTONE M2]**
   - [ ] บอททำงานเบื้องหลังอัตโนมัติ 24 ชั่วโมงในโหมดจำลอง (Zero live capital risk)
   - [ ] สแกนตลาดหา Net Edge หลังหักค่าธรรมเนียม หากเกินเกณฑ์ Hurdle Rate จะสร้าง Paper Order อัตโนมัติ
   - [ ] จำลองคิว Orderbook เสมือนจริง (`simulate_passive_fill`), การเกิด Slippage และการกินสภาพคล่อง (Liquidity Consumption)
   - [ ] บันทึกประวัติคำสั่ง, ตำแหน่งถือครอง (Positions), ยอดเงินคงเหลือ และ PnL ลง `backtest.json` อัตโนมัติ
2. **Portfolio Analytics & Equity Curve (`engine/portfolio_analytics.js`) [MILESTONE M5]**
   - [ ] กราฟ Live Equity Curve แบบเรียลไทม์แสดงการเติบโตของพอร์ต
   - [ ] คำนวณ Sharpe Ratio, Win Rate, Profit Factor, และ Historical Max Drawdown
   - [ ] การ์ด Brier Score Calibration แสดงความแม่นยำของพอร์ตเทียบกับความน่าจะเป็นของตลาด
3. **Institutional Risk Controls & Emergency Hard Kill-Switch (`engine/risk_manager.js`) [MILESTONE M4]**
   - [ ] ระบบมอนิเตอร์ความเสี่ยงแบบเรียลไทม์: จำกัด Max Drawdown, จำกัด Net/Gross Exposure, และเพดานถือครองต่อตลาดเดี่ยว (Concentration Limit)
   - [ ] **ปุ่ม Hard Kill-Switch ฉุกเฉิน:** สั่งหยุดการทำงานของบอททันที และยกเลิกคำสั่งค้างทั้งหมดภายใน 1 วินาที
   - [ ] Volatility Circuit Breaker ตัดระบบอัตโนมัติเมื่อราคาตลาดผันผวนรุนแรงผิดปกติหรือข้อมูล Feed ขาดหาย

---

### หมวดที่ 4: Terminal UI Dashboard Integration (หน้าจอแสดงผลและการใช้งานจริง)
1. **Market Cards & Scanner Table (`public/index.html`)**
   - [ ] แสดงค่า **Fair Value ($)**, **True Implied Probability (%)**, และ **Net Edge (%)** เทียบข้างราคาตลาดปัจจุบัน
   - [ ] แถบสีไฮไลต์ตลาดที่เป็น **Underpriced (โอกาสซื้อ YES)** หรือ **Overpriced (โอกาสซื้อ NO)**
2. **Paper-Trading Bot Control Widget**
   - [ ] สวิตช์เปิด/ปิด บอทอัตโนมัติบนหน้าจอ (Bot Status: Active / Paused)
   - [ ] หน้าต่างแสดง Live Activity Feed ของบอท (ออเดอร์ที่บอทกำลังวาง, ผลการ Match, กำไรสะสม)
3. **L2 Depth Ladder DOM Widget**
   - [ ] หน้าต่าง Depth of Market (Ladder 5 ระดับ) อัปเดตสดด้วย WebSocket พร้อมแถบ Bar แสดง Volume ของ Bid / Ask
4. **Whale Radar & Arbitrage Notification Feed**
   - [ ] แถบแจ้งเตือน Toast & Sound Alert เมื่อตรวจพบธุรกรรมเจ้ามือขนาดใหญ่ หรือพบโอกาส Arbitrage กำไรสูง

---

## 🚀 ลำดับการดำเนินงาน (Execution Roadmap)
* **Milestone M1 [DONE ✅]:** Quantitative Fair Value Engine & Scoring (ผ่านทดสอบ 208 ข้อ)
* **Milestone M2 [NEXT]:** 24/7 Autonomous Paper-Trading Bot & Queue Simulator (`backtest.json`)
* **Milestone M3:** Real-time WebSocket CLOB Orderbook Streamer (L2 DOM Depth)
* **Milestone M4:** Institutional Risk Engine, Exposure Limits & Hard Kill-Switch
* **Milestone M5:** Full Terminal UI Integration (เชื่อมต่อ Scanner, Arbitrage, Whale Radar, Order Modals เข้าสู่ `public/index.html`)

---

## 💬 คำสั่งสำหรับสั่งงานเมื่อ Token รีเซ็ตเสร็จแล้ว:
```text
ดำเนินการต่อตามแผนงานใน ORIGINAL_REQUEST.md เริ่มต้นที่ Milestone M2 (Autonomous Paper-Trading Bot) และเชื่อมโยงทุกหมวดหมู่ (Scanner, Arbitrage, Orderbook, Risk, Terminal UI) ให้สมบูรณ์แบบทั้งหมด
```
