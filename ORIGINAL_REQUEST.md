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


## 2026-10-16T06:03:58Z

An institutional prediction market trading terminal continuous enhancement, end-to-end integration verification, and production packaging system resuming directly from CHECKPOINT_2026_10_08.md and VICTORY_AUDIT.md.

Working directory: /Users/mk83/.gemini/antigravity/scratch/polymarket-scanner
Frontend directory: /Users/mk83/.gemini/antigravity/scratch/polymarket-scanner/frontend
Integrity mode: development

## Requirements

### R1. Baseline Verification & Integrity Preservation
- Verify that all existing 341 backend regression tests across all test suites (`tests/test_*.js`) continue to pass with a 100% pass rate when executed serially.
- Verify that the React + Vite frontend in `frontend/` builds cleanly (`npm run build`) without compilation or fatal lint errors.

### R2. Frontend E2E Integration & Live Wire Verification
- Wire and verify full end-to-end integration between the React frontend and the Express/WebSocket backend (`server.js`, port 3001):
  - Real-time 5-level L2 DOM Depth Ladder (`/api/v1/clob/live-depth`) rendering with proportional volume fill bars.
  - Opportunity Cards rendering responsive 24h SVG Sparklines, current price anchor dots, and Fair Value / Net Edge gauges.
  - Order Modal rendering dynamic VWAP slippage warning badges for varied trade sizes.
  - Bot Control Bar and Emergency Hard Kill-Switch reflecting live backend status and dispatching controls with instant UI feedback.
- Implement an automated headless integration / E2E verification test or script that exercises these UI components against mocked/live backend APIs to certify 0 runtime console errors.

### R3. Production Packaging & Unified Server Delivery
- Update `server.js` to serve compiled production static assets from `frontend/dist/` when accessed via HTTP, while maintaining API route integrity and fallback handling.
- Ensure the system can be booted for production terminal usage via a single command (`npm start` / `node server.js`).

### R4. Final Victory Certification & Clean Version Control Wrap-up
- Generate a final audit report certifying end-to-end test completion across Backend M1–M4 and Frontend M1–M4.
- Stage and commit all project changes, new test suites, documentation, and frontend assets with a clean, descriptive Git commit.

## Acceptance Criteria

### Baseline & Execution Safety
- [ ] All 341 backend automated tests pass (100% pass rate, 0 failures) without breaking existing institutional risk or CLOB streaming contracts.
- [ ] Frontend builds cleanly via `npm run build` with zero build errors.

### Frontend Integration & Verification
- [ ] Automated frontend verification script passes and certifies all key visual trading components render without runtime JavaScript exceptions.
- [ ] Bot controls and emergency hard kill-switch communicate with backend endpoints and update state without UI lag.

### Production Readiness & Git
- [ ] Backend server successfully delivers production frontend assets from `frontend/dist`.
- [ ] Working tree is staged and committed with clean Git history.
- [ ] Final audit report is generated and archived in the workspace.
