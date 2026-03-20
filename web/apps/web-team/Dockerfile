FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter=web-team build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3004
ENV HOSTNAME=0.0.0.0
COPY --from=0 /app/apps/web-team/.next/standalone ./
COPY --from=0 /app/apps/web-team/.next/static ./apps/web-team/.next/static
EXPOSE 3004
CMD ["node", "apps/web-team/server.js"]
