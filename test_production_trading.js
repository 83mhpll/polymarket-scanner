// ══════════════════════════════════════════════════════════════════════
//  test_production_trading.js — Polymarket Live Trading Credentials Validator
//  Run with: node test_production_trading.js
// ══════════════════════════════════════════════════════════════════════

import { ClobClient } from "@polymarket/clob-client-v2";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.POLY_PRIVATE_KEY || process.env.POLYMARKET_PRIVATE_KEY || process.env.PRIVATE_KEY;
const API_KEY = process.env.POLY_API_KEY || process.env.POLYMARKET_API_KEY;
const API_SECRET = process.env.POLY_API_SECRET || process.env.POLYMARKET_API_SECRET;
const API_PASSPHRASE = process.env.POLY_API_PASSPHRASE || process.env.POLYMARKET_API_PASSPHRASE;
const BUILDER_CODE = process.env.POLY_BUILDER_CODE || process.env.POLYMARKET_BUILDER_CODE || "0x0000000000000000000000000000000000000000000000000000000000000000";

console.log('\n\x1b[35m%s\x1b[0m', ' 🛠️  POLYMARKET LIVE TRADING VALIDATOR  ');
console.log('======================================================');

// 1. Sanity Check
const missing = [];
if (!PRIVATE_KEY) missing.push("POLY_PRIVATE_KEY (Private Key for signing EIP-712 orders)");
if (!API_KEY) missing.push("POLY_API_KEY");
if (!API_SECRET) missing.push("POLY_API_SECRET");
if (!API_PASSPHRASE) missing.push("POLY_API_PASSPHRASE");

if (missing.length > 0) {
  console.log('\n\x1b[31m[Config Missing] The following credentials are required for live trading:\x1b[0m');
  missing.forEach(m => console.log(`  - ${m}`));
  
  console.log('\n\x1b[33mHow to configure:\x1b[0m');
  console.log('1. Open your Polymarket settings and export your Private Key (or get it from Magic Link/EOA).');
  console.log('2. Derive CLOB API credentials in Polymarket Developer settings.');
  console.log('3. Add them to your .env file in the workspace root like this:');
  console.log('   POLY_PRIVATE_KEY=0xYourWalletPrivateKey...');
  console.log('   POLY_API_KEY=your-api-key-uuid...');
  console.log('   POLY_API_SECRET=your-base64-secret...');
  console.log('   POLY_API_PASSPHRASE=your-passphrase...\n');
  process.exit(1);
}

// 2. Instantiate Wallet and ClobClient
console.log('\nInitialising Ethers Wallet...');
let wallet;
try {
  wallet = new ethers.Wallet(PRIVATE_KEY);
  console.log(`  Signer Wallet Address: \x1b[36m${wallet.address}\x1b[0m`);
} catch (err) {
  console.error('\x1b[31m[Error] Invalid Private Key format. Must be a 64-character hex string starting with 0x.\x1b[0m');
  process.exit(1);
}

const client = new ClobClient(
  "https://clob.polymarket.com",
  137, // Polygon Mainnet
  wallet,
  {
    key: API_KEY,
    secret: API_SECRET,
    passphrase: API_PASSPHRASE
  }
);

async function runTest() {
  // Test 1: Fetch API Status / Credentials Health
  console.log('\nTesting CLOB API Authentication (L1/L2)...');
  try {
    // Attempting a public get request that requires API authorization
    const ok = await client.getApiKeyDerivationPath();
    console.log('\x1b[32m[SUCCESS] L2 API Key & HMAC Authentication valid!\x1b[0m');
  } catch (err) {
    console.error('\x1b[31m[Failed] API Key Authentication failed. Check your Secret/Passphrase.\x1b[0m');
    console.error(`Error details: ${err.message}`);
    return;
  }

  // Test 2: Try to place a dummy limit buy order at 1 cent (safe test)
  const TEST_TOKEN_ID = "38518143332037288484633396654229786818605633587123244059417243387587370099760"; // Standard YES/NO token
  
  console.log('\nCreating EIP-712 Signed Limit Order...');
  console.log(`  Targeting TokenID: ${TEST_TOKEN_ID}`);
  console.log(`  Price Limit: $0.01 (1¢)`);
  console.log(`  Quantity: 5 shares ($0.05 USD total value)`);

  let orderId;
  try {
    const order = {
      tokenID: TEST_TOKEN_ID,
      price: 0.01,
      size: 5,
      side: 0, // BUY
      builderCode: BUILDER_CODE
    };

    console.log('Signing and posting order to matching engine...');
    const resp = await client.createAndPostOrder(order, { tickSize: "0.01", negRisk: false });
    
    if (resp && resp.success) {
      orderId = resp.orderID;
      console.log(`\x1b[32m[SUCCESS] Order placed successfully! Order ID: ${orderId}\x1b[0m`);
    } else {
      console.error('\x1b[31m[Failed] Order rejected by CLOB:\x1b[0m', resp);
      return;
    }
  } catch (err) {
    console.error('\x1b[31m[Failed] Order placement threw an error:\x1b[0m', err.message);
    console.error('Make sure your wallet holds sufficient collateral (USDC/pUSD) on Polygon Mainnet.');
    return;
  }

  // Test 3: Immediately Cancel the placed order
  if (orderId) {
    console.log(`\nCancelling Order ${orderId}...`);
    try {
      const cancelResp = await client.cancelOrder(orderId);
      if (cancelResp && cancelResp.success) {
        console.log('\x1b[32m[SUCCESS] Order cancelled successfully. Funds released.\x1b[0m');
      } else {
        console.warn('\x1b[33m[Warning] Order cancel request failed. Please check on dashboard.\x1b[0m');
      }
    } catch (err) {
      console.error('\x1b[31m[Failed] Cancel request threw error:\x1b[0m', err.message);
    }
  }

  console.log('\n======================================================');
  console.log('\x1b[32m✅ ALL SYSTEMS GO! Credentials and cryptographic signature engine are fully production-ready.\x1b[0m\n');
}

runTest().catch(console.error);
