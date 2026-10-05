#!/bin/bash
# ══════════════════════════════════════════════════════════════════════
# 🚀 Polymarket Pro - Automated Ubuntu VPS Deployment Script
# ══════════════════════════════════════════════════════════════════════

set -e

echo "=========================================="
echo " Starting Polymarket Scanner Deployment..."
echo "=========================================="

# 1. Update system packages
echo "📦 Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl wget git build-essential nginx certbot python3-certbot-nginx ufw python3-pip python3-numpy python3-pandas python3-requests

# 2. Install Node.js 20 LTS (if not installed)
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# 3. Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 process manager..."
    sudo npm install -g pm2
fi

# 4. Install Docker & Docker Compose (Optional / Recommended)
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm -f get-docker.sh
fi

# 5. Setup Project Dependencies
echo "📦 Installing project dependencies..."
npm install --omit=dev

# 6. Setup .env if not exists
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "📝 Creating .env from .env.example..."
        cp .env.example .env
        echo "⚠️ Please edit .env with your actual API keys using: nano .env"
    fi
fi

# 7. Start application with PM2
echo "🚀 Starting app with PM2..."
pm2 delete polymarket-pro 2>/dev/null || true
pm2 start server.js --name polymarket-pro
pm2 save
pm2 startup | tail -n 1 | sudo bash || true

# 8. Firewall setup (UFW)
echo "🛡️ Configuring Firewall..."
sudo ufw allow 22/tcp || true
sudo ufw allow 80/tcp || true
sudo ufw allow 443/tcp || true
sudo ufw --force enable || true

echo "=========================================="
echo "✅ Deployment completed successfully!"
echo "=========================================="
echo "Useful Commands:"
echo " - View logs:       pm2 logs polymarket-pro"
echo " - Check status:    pm2 status"
echo " - Restart service: pm2 restart polymarket-pro"
echo " - Edit env file:   nano .env"
echo ""
echo "To setup Domain + SSL (Nginx):"
echo " 1. Configure /etc/nginx/sites-available/polymarket"
echo " 2. Run: sudo certbot --nginx -d yourdomain.com"
echo "=========================================="
