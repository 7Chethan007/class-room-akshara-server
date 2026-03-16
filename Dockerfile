# Build stage
FROM node:20 AS builder

WORKDIR /app

COPY package*.json ./

# Install build dependencies for native modules (mediasoup)
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN npm ci --omit=dev

# Runtime stage
FROM node:20-slim

WORKDIR /app

# Install dumb-init to handle signals properly
RUN apt-get update && apt-get install -y dumb-init && rm -rf /var/lib/apt/lists/*

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application
COPY . .

# Create recordings directory
RUN mkdir -p recordings

# Expose port
EXPOSE 5001

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start server
CMD ["npm", "start"]
