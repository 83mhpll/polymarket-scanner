import { ClobClient } from "@polymarket/clob-client-v2";
import { ethers } from "ethers";

export async function placeTrade(tradeReq, config) {
  // config should contain apiCredentials
  if (!config || !config.apiCredentials || !config.apiCredentials.apiKey) {
    throw new Error(
      "API Credentials missing. Please add them in the Config UI.",
    );
  }

  const { apiKey, apiSecret, apiPass, builderCode } = config.apiCredentials;

  // Polymarket ClobClient requires a signer, but L2 actions can be signed with just the API keys
  // as long as the wallet address matches. If a random wallet is used, API keys (which are tied to the proxy wallet)
  // are actually what authorizes the transaction for L2.
  // Wait, ClobClient constructor requires: (host, chainId, wallet, creds)
  const wallet = new ethers.Wallet(
    "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  const client = new ClobClient(
    "https://clob.polymarket.com",
    137, // Polygon Mainnet
    wallet,
    {
      key: apiKey,
      secret: apiSecret,
      passphrase: apiPass,
    },
  );

  const response = await client.createAndPostOrder(
    {
      tokenID: tradeReq.tokenID,
      price: tradeReq.price,
      size: tradeReq.size,
      side: tradeReq.side === "BUY" ? 0 : 1, // 0 for BUY, 1 for SELL
      builderCode:
        builderCode ||
        "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
    { tickSize: "0.01", negRisk: false },
  );

  return response;
}
