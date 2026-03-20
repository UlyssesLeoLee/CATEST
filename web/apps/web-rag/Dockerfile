FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter=web-rag build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
COPY --from=0 /app/apps/web-rag/.next/standalone ./
COPY --from=0 /app/apps/web-rag/.next/static ./apps/web-rag/.next/static
EXPOSE 3002
CMD ["node", "apps/web-rag/server.js"]
