# ⚡ Polymarket Pro Scanner: สรุปสูตรลัดกลยุทธ์ 1 หน้า (Strategy Cheat Sheet)

> **Quick Reference Guide** สำหรับเทรดเดอร์ที่ต้องการความเร็วในการตัดสินใจและคว้ากำไรในทุกสภาวะตลาด

---

## 📊 Matrix เปรียบเทียบ 4 สุดยอดกลยุทธ์ทำกำไร

| กลยุทธ์ (Strategy) | ช่วงราคาเป้าหมาย | ความเสี่ยง (Risk) | ผลตอบแทนคาดหวัง | ระยะเวลาถือครอง | แหล่งสัญญาณใน Dashboard |
| :--- | :---: | :---: | :---: | :---: | :--- |
| 🎯 **1c Dust Sweeping** | $0.01 – $0.03 | ต่ำมาก ($1/ไม้) | **+3,200% ถึง +9,900%** | ไม่กี่ชั่วโมง – 7 วัน | เมนู `🎯 1c Dust Sweeper` |
| ⚖️ **NegRisk Arbitrage** | $\sum \text{YES} \le \$0.97$ | **0% ไร้ความเสี่ยง** | **+3.0% ถึง +12.0%** (การันตี) | จนตลาดตัดสินผล | เมนู `⚖️ NegRisk Spreads` |
| 🔗 **Cross-Market Lag** | Divergence $\ge 12\%$ | ปานกลาง | **+15.0% ถึง +45.0%** | 5 – 60 นาที (Take Profit ไว) | เมนู `🔗 Cross-Market Lag` |
| 🛡️ **High-Certainty Sweep** | $0.87 – $0.95 | ต่ำ (Win Rate 92%+) | **+5.2% ถึง +14.9%** | 1 – 24 ชั่วโมง | หน้าหลัก `🏠 Dashboard` |

---

## 🧮 สูตรคำนวณลัดที่ต้องจำ (Key Financial Formulas)

### 1. Net ROI% (ผลตอบแทนสุทธิ)
$$\text{ROI (\%)} = \left( \frac{\$1.00 - \text{Price}}{\text{Price}} \right) \times 100$$
- ซื้อราคา **$0.92** ➔ $\text{ROI} = \frac{0.08}{0.92} \times 100 = \mathbf{+8.70\%}$
- ซื้อราคา **$0.01** ➔ $\text{ROI} = \frac{0.99}{0.01} \times 100 = \mathbf{+9,900\%}$

### 2. Expected Value (มูลค่าคาดหวัง EV)
$$\text{EV} = (\text{Win Probability} \times \$1.00) - \text{Price}$$
- *ตัวอย่าง 1c Dust:* โอกาสชนะจริง 6% (0.06), ราคาซื้อ $0.01  
  $$\text{EV} = (0.06 \times 1.00) - 0.01 = \mathbf{+\$0.050 \text{ ต่อหุ้น (Edge มหาศาล)}}$$

### 3. NegRisk Arbitrage Guaranteed Profit
$$\text{Risk-Free Profit (\%)} = \left( \frac{\$1.00 - \sum \text{YES Prices}}{\sum \text{YES Prices}} \right) \times 100$$
- ผลรวม YES 3 ตัวเลือก $= 0.42 + 0.33 + 0.18 = \$0.93$  
  $$\text{Risk-Free Margin} = \frac{\$1.00 - \$0.93}{\$0.93} \times 100 = \mathbf{+7.52\% \text{ (กำไรล็อก 100\%)}}$$

### 4. Position Sizing (Kelly Criterion แบบอนุรักษ์นิยม)
$$\text{ไม้ลงทุนสูงสุดต่อดีล} = \text{เงินทุนในพอร์ต} \times 0.05 \quad (\text{ไม่เกิน } 5\% \text{ ของพอร์ต})$$

---

## ⏱️ กิจวัตรทำกำไร 3 นาทีต่อวัน (3-Minute Daily Routine)

```
[นาทีที่ 1: เช็ก Arbitrage] ────► [นาทีที่ 2: สแกน High Certainty] ────► [นาทีที่ 3: กวาด 1c Dust]
  เปิดแท็บ NegRisk Spreads        กรอง Category + Score ≥ 85           เปิดแท็บ 1c Dust Sweeper
  ถ้าเจอ ∑ < $0.97                 เลือกตลาดที่จบภายใน 24 ชม.           กระจายซื้อไม้ละ $1-$5 
  กด "Buy Arbitrage" ทันที          กดเปิด Order Ticket ส่งคำสั่ง        ในตัวเลือกที่มีโอกาสพลิกล็อก
```

---

## 🛡️ กฎเหล็ก 5 ข้อเพื่อความปลอดภัยของเงินทุน (Risk Rules)

1. 🚫 **ห้ามเข้าตลาดที่สภาพคล่อง (Liquidity) ต่ำกว่า $5,000** หากคุณใช้ Market Order เพื่อป้องกัน Slippage
2. ⏳ **เน้นตลาดที่จบภายใน 24–72 ชั่วโมง (Time Decay Edge):** ยิ่งเงินหมุนรอบเร็ว ผลตอบแทนต่อปี (Annualized APY) ยิ่งทวีคูณ
3. 🎯 **กระจายความเสี่ยงเสมอ:** ห้ามลงเงินเกิน 5% ในคู่ที่มีโอกาสแพ้ และสำหรับ 1c Dust ห้ามลงเกิน 1% ต่อตลาด
4. ⚡ **ใช้ Limit Order เพื่อรับ 0% Maker Fees:** หากตลาดไม่เร่งด่วน ให้ตั้งราคา Bid ดักไว้เสมอ
5. 🦊 **ตรวจสอบ Polygon Network เสมอ:** ตรวจสอบว่าใน MetaMask มีเหรียญ POL สำรองไว้ $1–$2 เสมอสำหรับค่า Gas

---

## ⌨️ ตารางคีย์ลัดและฟังก์ชันด่วน (Dashboard Hotkeys)

| คีย์ลัด / ปุ่ม | การทำงาน |
| :--- | :--- |
| `⌘ + K` หรือ `Ctrl + K` | กระโดดไปที่กล่องค้นหาตลาดทันที |
| **`⚡ Buy Share`** | เปิดหน้าต่างคำนวณและส่งคำสั่งซื้อออเดอร์ทันที |
| **`⭐ Star Icon`** | บันทึกตลาดลงใน Watchlist เพื่อติดตามราคา |
| **`🔄 Refresh Scan`** | สั่งให้อัลกอริทึมดึงข้อมูล Order Book สดจาก Polymarket CLOB ทันที |
| **`Toggle: Paper Trade`** | สลับเป็นโหมดซ้อมเทรดด้วยเงินจำลอง ไม่ต้องใช้เงินจริง |

---
*Polymarket Pro Scanner — Institutional Grade Prediction Market Intelligence*
