# 📘 คู่มือปฏิบัติการ: วิธีใช้งานทีม AI (Operational Guide)

## 🚀 Quick Start — สั่งงานทีม AI ได้ทันที

### วิธีที่ 1: สั่งงานผ่าน Antigravity (แนะนำ — ใช้ได้ทันทีตอนนี้)

เพียงพิมพ์คำสั่งในแชทนี้ เช่น:

```
"ให้ Quant Dev สร้างสูตรตรวจจับ Midpoint Arbitrage ใหม่"
"ให้ UI Engineer เพิ่มกราฟ Donut Chart แสดงสัดส่วนหมวดหมู่ตลาด"
"ให้ QA Tester ตรวจสอบบั๊กในระบบ Order Ticket"
"ให้ Telegram Bot Dev สร้างบอทส่งสัญญาณเข้า Telegram"
```

ระบบจะเรียกบอทตัวที่เหมาะสมมาทำงานให้ทันที

---

### วิธีที่ 2: สั่งงานผ่าน Hermes Agent (Bot Mode)

1. ติดตั้ง Hermes Agent: https://hermes-agent.nousresearch.com
2. คัดลอกโฟลเดอร์ `team/agents/` ไปวางที่ `~/.hermes/profiles/`
3. เปิด Hermes Desktop App → เข้าสู่ Bot Mode
4. บอททั้ง 9 ตัวจะปรากฏบนแถบด้านข้าง พร้อมใช้งาน

---

## 📋 ตัวอย่างคำสั่งงานจริง (Real-World Task Examples)

### 🧮 สั่ง Quant Algorithm Dev (Agent 1)
```
"ปรับปรุงสูตร 1c Dust ให้คำนวณ Implied Probability จาก Historical Win Rate 
 ของตลาดที่มีคำถามคล้ายกัน เช่น ถ้าตลาดประเภท 'Will X win?' เคยชนะ 15% 
 ในอดีต แต่ราคาอยู่ที่ 1¢ (implied prob 1%) แสดงว่ามี Edge 14%"
```

### 🎨 สั่ง UI/UX Engineer (Agent 3)
```
"เพิ่ม Donut Chart แสดงสัดส่วนหมวดหมู่ตลาด (Crypto 40%, Sports 25%, 
 Politics 20%, Other 15%) ใน grid-row-top ของหน้าแดชบอร์ด"
```

### 🦊 สั่ง Web3 Protocol Engineer (Agent 4)
```
"ลงทะเบียน Builder Code ของเราในทุก Trade Submission 
 และเพิ่มระบบแสดงยอดค่าคอมมิชชั่นสะสมในหน้า Dashboard"
```

### 🧪 สั่ง QA Tester (Agent 5)
```
"ตรวจสอบความถูกต้องของตัวเลข ROI% ในทุก Card และ Order Ticket Modal 
 ทดสอบ Edge Cases: ราคา 0, ราคา 1, จำนวนเงินติดลบ"
```

### 🤖 สั่ง Telegram Bot Dev (Agent 7)
```
"สร้าง Telegram Bot ที่เชื่อมต่อกับ /api/scan 
 ส่งแจ้งเตือนเมื่อพบดีล 1c Dust ที่ EV > $0.03 เข้ากลุ่ม VIP"
```

---

## 🗂️ โครงสร้างไฟล์ทีม

```
team/
├── ROSTER.md                  ← สรุปสมาชิกทั้งหมด (ไฟล์นี้)
├── OPERATIONAL_GUIDE.md       ← คู่มือวิธีใช้งาน (ไฟล์นี้)
└── agents/
    ├── 00_chief_product_lead.md    ← 👑 Chief Product Lead
    ├── 01_quant_algorithm_dev.md   ← 🧮 Quant Algorithm Dev
    ├── 02_highspeed_data_eng.md    ← ⚡ High-Speed Data Eng
    ├── 03_liquid_ui_ux_eng.md      ← 🎨 Liquid UI/UX Engineer
    ├── 04_web3_protocol_eng.md     ← 🦊 Web3 Protocol Engineer
    ├── 05_qa_accuracy_tester.md    ← 🧪 QA & Accuracy Tester
    ├── 06_saas_monetization_lead.md← 💰 SaaS Monetization Lead
    ├── 07_vip_telegram_bot_dev.md  ← 🤖 VIP Telegram Bot Dev
    └── 08_strategy_education_ai.md ← 📚 Strategy Education AI
```
