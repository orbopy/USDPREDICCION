FROM node:20-alpine AS builder
WORKDIR /app
COPY shared/ ./shared/
COPY telegram-bot/package*.json ./telegram-bot/
RUN cd telegram-bot && npm ci
COPY telegram-bot/ ./telegram-bot/
RUN cd telegram-bot && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/telegram-bot/dist ./dist
COPY --from=builder /app/telegram-bot/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
