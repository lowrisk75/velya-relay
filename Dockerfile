# Velya Cloud Relay - Production Docker Image
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for TypeScript build)
RUN npm ci

# Copy source
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Now remove devDependencies to keep image small
RUN npm prune --production

# Production image
FROM node:22-alpine

WORKDIR /app

# Install production dependencies only
RUN apk add --no-cache dumb-init

# Copy built files and node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Create keys directory
RUN mkdir -p /app/keys && chmod 700 /app/keys

# Create non-root user
RUN addgroup -g 1000 velya && \
    adduser -D -u 1000 -G velya velya && \
    chown -R velya:velya /app

USER velya

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 8080

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
