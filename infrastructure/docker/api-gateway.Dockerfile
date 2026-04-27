FROM node:20-alpine AS builder
WORKDIR /app
COPY shared/ ./shared/
COPY api-gateway/package*.json ./api-gateway/
RUN cd api-gateway && npm ci
COPY api-gateway/ ./api-gateway/
RUN cd api-gateway && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/api-gateway/dist ./dist
COPY --from=builder /app/api-gateway/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
