FROM node:20-alpine AS builder
WORKDIR /app
COPY shared/ ./shared/
COPY data-ingestion/package*.json ./data-ingestion/
RUN cd data-ingestion && npm ci
COPY data-ingestion/ ./data-ingestion/
RUN cd data-ingestion && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/data-ingestion/dist ./dist
COPY --from=builder /app/data-ingestion/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
