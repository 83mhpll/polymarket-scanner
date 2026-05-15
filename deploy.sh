#!/bin/bash
# 🚀 Polymarket Pro - Ubuntu 22.04 VPS Deployment Script

echo "Starting deployment setup..."

# 1. Update and install dependencies
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common nginx certbot python3-certbot-nginx

# 2. Install Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 3. Setup Project Directory
mkdir -p /opt/polymarket-pro
cd /opt/polymarket-pro

# Assuming code is cloned here... (replace with your git clone)
# git clone https://github.com/yourusername/polymarket-pro.git .

# 4. Configure Nginx
cat << 'EOF' | sudo tee /etc/nginx/sites-available/polymarket
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/polymarket /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# 5. SSL Certificate via Certbot (Run manually after DNS propagates)
# sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# 6. Start the App
echo "Starting application..."
npm install
pm2 start server.js --name polymarket-pro # Assuming PM2 is installed globally

echo "✅ Deployment complete! Don't forget to run certbot and setup your .env file."
