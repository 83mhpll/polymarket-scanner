# Institutional Polymarket Terminal — Roadmap & Pending Work

> Status: PAUSED BY USER (Ready to resume anytime)
> Working Directory: /Users/mk83/.gemini/antigravity/scratch/polymarket-scanner
> Git Commit: 801bd09
> Total Automated Tests Passing: 287 / 287 (100% Pass Rate / 0 Failures)

---

## 🟢 1. งานที่เสร็จสมบูรณ์แล้วในรอบนี้ (Completed Work)

### Forensic Audit & Analysis (R1 & R2) [เสร็จสมบูรณ์ 100%]
- [x] ตรวจสอบโค้ดเชิงลึกแบบ Line-by-line ครบทั้ง 4 หมวดหมู่ (Scanner, Pricing, Paper Bot, Risk Controls, UI)
- [x] จัดทำเอกสารและรายงานผลการตรวจสอบเชิงลึก พร้อม Pre-Execution Action Plan เสนอให้ผู้ใช้ตรวจสอบเรียบร้อยแล้ว

### Milestone M1: Core Execution & Risk Safety Remediation [เสร็จสมบูรณ์ 100%]
- [x] **Pre-Trade Risk Guard:** ติดตั้ง `checkPreTradeRisk()` ป้องกันบอทเปิดสถานะเกิน Gross Exposure (50%) หรือ Single Market Limit (10%)
- [x] **Hard Kill-Switch Halt:** บอทหยุดการทำงานทันทีหากสถานะ Kill-Switch ทำงาน
- [x] **Chronological Drawdown:** เรียงลำดับเวลาประวัติการเทรดก่อนคำนวณ Peak-to-Trough Drawdown
- [x] **Atomic Persistence:** บันทึกไฟล์ `backtest.json` แบบ Atomic File Write ป้องกัน Race Condition และไฟล์เสียหายเมื่อรันคำสั่งพร้อมกัน 100-500 threads
- [x] **Weather NWP Schema:** ปรับจูน Schema `{min, max}` และ Property `.fairProb` ให้ส่งค่าให้บอทได้อย่างแม่นยำ
- [x] **ชุดทดสอบขยายเป็น 287 เคส:** ผ่านการทดสอบ Stress Test & Concurrency Race Condition 100%

---

## 🟡 2. งานที่ค้างอยู่สำหรับรอบต่อไป (Pending Tasks)

### Milestone M2: Quantitative & Mathematical Pricing Hardening [รอดำเนินการ]
1. **NegRisk Arbitrage (`negrisk_arbitrage.js`):** เพิ่มการตรวจสอบแท็ก `negRisk: true` ของ Polymarket, ปรับใช้ราคา Best Ask บน CLOB แทน Mid-price, และคำนวณหัก Dynamic Fees จริง
2. **Cross-Exchange Arbitrage (`cross_market_arbitrage.js`):** เพิ่มเงื่อนไขความน่าจะเป็นแบบมีเงื่อนไข ($P(\text{Child}) \le P(\text{Parent})$) และปรับระบบจับคู่ชื่อตลาดเป็น Strict Entity Matching
3. **1¢ Dust Sweeper (`dust_sniper_1c.js`):** ปรับเกณฑ์คัดกรองตามความน่าจะเป็นจริง แทนการ Hardcode 25% และจำกัดความเสี่ยงไม้ละ $\le 0.5\%$ ของ Bankroll
4. **Shin De-vigging Solver (`engine/devigging.js`):** ปรับแก้สูตรทางคณิตศาสตร์เพื่อตัดปัญหา Floating-point cancellation เมื่อสัดส่วนข้อมูลวงใน $z \to 1$

### Milestone M3: High-Resilience Streaming & Terminal UI Polish [รอดำเนินการ]
1. **Persistent WebSocket CLOB Singleton:** เปิดการเชื่อมต่อ WebSocket อัตโนมัติทันทีที่บูตเซิร์ฟเวอร์ และเชื่อมโยงเข้ากับ `/api/v1/clob/live-depth`
2. **Harmonize L2 DOM Depth Schema:** จัดรูปแบบโครงสร้างข้อมูล Depth Ladder ระหว่าง WebSocket สดและ REST Fallback ให้เป็นรูปแบบเดียวกัน 100%
3. **UI Event Loop & Toast Optimization:** ปรับปรุง `/api/backtest/check` ให้ดึงข้อมูลแบบ Bounded Parallel เพื่อไม่ให้บล็อก Node.js Event Loop

### Milestone M4: Full Regression Verification & Live Benchmark [รอดำเนินการ]
1. รันชุดทดสอบความถูกต้องครบทั้ง 287 เคสเดิม และเพิ่ม Regression Tests สำหรับ M2 และ M3
2. ทดสอบความเสถียรของ 24/7 Autonomous Bot ในระยะยาว

---

## 📋 คำสั่งสำหรับใช้เมื่อต้องการกลับมาทำต่อ:
```text
ดำเนินการต่อตามแผนงานใน ORIGINAL_REQUEST.md เริ่มต้นที่ Milestone M2 (Quantitative & Mathematical Pricing Hardening) และต่อด้วย Milestone M3 ได้เลยครับ
```
