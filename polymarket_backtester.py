import pandas as pd
import numpy as np
from datetime import datetime

class PolymarketBacktester:
    def __init__(self, initial_capital=1000.0, transaction_fee=0.00):
        self.initial_capital = initial_capital
        self.capital = initial_capital
        self.transaction_fee = transaction_fee
        self.positions = {}
        self.trade_log = []
        
    def load_clob_data(self, df):
        """
        โหลดข้อมูล Orderbook (CLOB) ที่มีความละเอียดสูง
        Columns ที่คาดหวัง: timestamp, best_bid, best_ask, bid_vol, ask_vol
        """
        self.data = df.sort_values('timestamp')
        
    def run_strategy(self, strategy_func):
        """
        รัน Loop ผ่านข้อมูลแบบ Event-driven เพื่อป้องกัน Look-ahead bias
        """
        for index, row in self.data.iterrows():
            signal = strategy_func(row)
            
            # การคำนวณ Slippage และ Spread
            spread = row['best_ask'] - row['best_bid']
            
            if signal == 'BUY' and self.capital > row['best_ask']:
                # ซื้อที่ราคา Ask (บวก Slippage สมมติ 0.001)
                execution_price = row['best_ask'] + 0.001
                shares_to_buy = 100 # Position Sizing สมมติ
                cost = execution_price * shares_to_buy
                
                if self.capital >= cost:
                    self.capital -= cost
                    self.positions['YES'] = self.positions.get('YES', 0) + shares_to_buy
                    self.log_trade(row['timestamp'], 'BUY', shares_to_buy, execution_price)
                    
            elif signal == 'SELL' and self.positions.get('YES', 0) > 0:
                # ขายที่ราคา Bid (ลบ Slippage)
                execution_price = row['best_bid'] - 0.001
                shares_to_sell = self.positions['YES']
                revenue = execution_price * shares_to_sell
                
                self.capital += revenue
                self.positions['YES'] = 0
                self.log_trade(row['timestamp'], 'SELL', shares_to_sell, execution_price)
                
    def log_trade(self, timestamp, action, amount, price):
        self.trade_log.append({
            'timestamp': timestamp,
            'action': action,
            'amount': amount,
            'price': price,
            'capital': self.capital
        })
        
    def calculate_metrics(self):
        df_trades = pd.DataFrame(self.trade_log)
        if df_trades.empty:
            return {"Error": "No trades executed"}
            
        pnl = self.capital - self.initial_capital
        win_rate = 0 # ต้องการ logic เช็ค PnL ต่อเทรด
        
        return {
            "Initial Capital": self.initial_capital,
            "Final Capital": self.capital,
            "Total PnL": pnl,
            "ROI (%)": (pnl / self.initial_capital) * 100,
            "Total Trades": len(df_trades)
        }

# ตัวอย่างกลยุทธ์: Orderbook Imbalance (Micro-arbitrage)
def imbalance_strategy(row):
    """
    ถ้าฝั่ง Bid มี Volume หนาแน่นกว่า Ask มากๆ (Imbalance) 
    แสดงว่ามีความต้องการซื้อสูง ให้เข้าซื้อ (BUY)
    """
    imbalance = row['bid_vol'] / (row['bid_vol'] + row['ask_vol'])
    
    if imbalance > 0.6: # แรงซื้อมากกว่า 60%
        return 'BUY'
    elif imbalance < 0.4: # แรงขายมากกว่า 60%
        return 'SELL'
    return 'HOLD'

# การจำลองข้อมูล (Mock Data)
if __name__ == "__main__":
    print("Initializing Polymarket Backtest Engine...")
    
    # ล็อกค่า Random Seed เพื่อให้ผลลัพธ์คงที่ทุกครั้งที่รัน
    np.random.seed(42)
    
    # สร้างข้อมูลจำลอง (Mock Orderbook Data)
    mock_data = pd.DataFrame({
        'timestamp': pd.date_range(start='1/1/2024', periods=100, freq='min'),
        'best_bid': np.random.uniform(0.40, 0.60, 100),
        'best_ask': np.random.uniform(0.42, 0.62, 100),
        'bid_vol': np.random.uniform(100, 1000, 100),
        'ask_vol': np.random.uniform(100, 1000, 100)
    })
    
    # ตรวจสอบว่า Ask > Bid เสมอ (ป้องกัน data ผิดพลาด)
    mock_data['best_ask'] = mock_data[['best_bid', 'best_ask']].max(axis=1) + 0.01
    
    tester = PolymarketBacktester()
    tester.load_clob_data(mock_data)
    tester.run_strategy(imbalance_strategy)
    
    metrics = tester.calculate_metrics()
    print("=== Backtest Results ===")
    for k, v in metrics.items():
        print(f"{k}: {v}")
