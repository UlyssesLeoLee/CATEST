FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --no-frozen-lockfile
ENV NEXT_PUBLIC_SAAS_MODE=true
RUN pnpm --filter=web-tb build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3006
ENV HOSTNAME=0.0.0.0
COPY --from=0 /app/apps/web-tb/public ./apps/web-tb/public
COPY --from=0 /app/apps/web-tb/.next/standalone ./
COPY --from=0 /app/apps/web-tb/.next/static ./apps/web-tb/.next/static
EXPOSE 3006
CMD ["node", "apps/web-tb/server.js"]
