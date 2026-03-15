# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files
COPY web/package*.json ./web/
WORKDIR /app/web
RUN npm ci

# Copy source
WORKDIR /app
COPY web ./web

# Build
WORKDIR /app/web
RUN npm run build

# Runtime stage
FROM node:22-slim AS runner

WORKDIR /app/web
ENV NODE_ENV=production

# Copy necessary files from standalone output
COPY --from=builder /app/web/public ./public
COPY --from=builder /app/web/.next/standalone ./
COPY --from=builder /app/web/.next/static ./.next/static

EXPOSE 3000

# Next.js standalone server entry point
CMD ["node", "server.js"]
