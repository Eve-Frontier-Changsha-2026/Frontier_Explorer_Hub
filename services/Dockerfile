FROM node:20-slim

# better-sqlite3 needs build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# Persistent volume mount point for SQLite
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data/explorer-hub.db
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
