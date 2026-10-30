# Space Fighter B2.2 Cloud Run API only.
# Build context MUST be the repository root because gameService imports
# client/src/constants.js and client/src/utils/profileSchema.js.
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server/server.js ./server.js
COPY server/lib/ ./lib/
COPY server/resources/ ./resources/
COPY client/package.json /app/client/package.json
COPY client/src/constants.js /app/client/src/constants.js
COPY client/src/utils/profileSchema.js /app/client/src/utils/profileSchema.js
COPY client/src/game/catalog/ /app/client/src/game/catalog/

# Cloud Run sets PORT (normally 8080); server.js listens on 0.0.0.0.
USER node
EXPOSE 8080
CMD ["node", "server.js"]
