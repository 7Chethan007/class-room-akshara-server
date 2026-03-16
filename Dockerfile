# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init

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
