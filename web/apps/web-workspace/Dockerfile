FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter=web-workspace build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
COPY --from=0 /app/apps/web-workspace/.next/standalone ./
COPY --from=0 /app/apps/web-workspace/.next/static ./apps/web-workspace/.next/static
EXPOSE 3001
CMD ["node", "apps/web-workspace/server.js"]
