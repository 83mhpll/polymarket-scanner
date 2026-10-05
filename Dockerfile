# Multi-stage or lightweight production container
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies & Python for Quant Backtester
RUN apk add --no-cache python3 py3-pip py3-requests py3-numpy py3-pandas

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application files
COPY . .

# Expose port
EXPOSE 3001

# Set production environment
ENV NODE_ENV=production
ENV PORT=3001

# Start the application
CMD ["npm", "start"]
