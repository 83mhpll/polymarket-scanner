# Stripe Product Setup Guide

Follow this guide to configure Stripe for the Polymarket Pro SaaS.

## 1. Create Products and Prices

Go to the **Stripe Dashboard > Products > Add Product**.

### Product 1: Polymarket Pro - FREE

- **Price:** $0.00
- **Type:** Recurring / Monthly
- **Features:** 5 Scans per day, No Backtesting

### Product 2: Polymarket Pro - PRO

- **Price:** $29.00
- **Type:** Recurring / Monthly
- **Features:** Unlimited Scans, Full Backtesting, Paper Trading

### Product 3: Polymarket Pro - ELITE

- **Price:** $79.00
- **Type:** Recurring / Monthly
- **Features:** Automated API Trading, WebSocket Alerts, Priority Support

## 2. Configure Customer Portal

Go to **Settings > Billing > Customer portal**.

1. Enable the portal so users can manage subscriptions.
2. Add the PRO and ELITE prices to the "Products" section so users can upgrade/downgrade.
3. Set your Terms of Service and Privacy Policy URLs (`/legal.md`).

## 3. Set Webhook Endpoints

Go to **Developers > Webhooks > Add endpoint**.

- **Endpoint URL:** `https://yourdomain.com/api/webhook/stripe`
- **Events to listen to:**
  - `checkout.session.completed` (To grant initial PRO/ELITE access)
  - `customer.subscription.updated` (To handle upgrades/downgrades)
  - `customer.subscription.deleted` (To revoke access on churn)

Save the **Signing Secret** (`whsec_...`) and place it in your `.env` file as `STRIPE_WEBHOOK_SECRET`.
