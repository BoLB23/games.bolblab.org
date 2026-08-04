FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/catalog-web/package.json apps/catalog-web/package.json
COPY games/sample-game/package.json games/sample-game/package.json
COPY packages/game-client-sdk/package.json packages/game-client-sdk/package.json
RUN npm ci

COPY apps/catalog-web apps/catalog-web
COPY games/sample-game games/sample-game
COPY packages/game-client-sdk packages/game-client-sdk

ARG VITE_API_BASE_URL=/api/v1
ARG VITE_CATALOG_URL=/

RUN npm run build --workspace @game-platform/game-client-sdk \
    && VITE_API_BASE_URL="$VITE_API_BASE_URL" npm run build --workspace @game-platform/catalog-web \
    && VITE_API_BASE_URL="$VITE_API_BASE_URL" VITE_CATALOG_URL="$VITE_CATALOG_URL" \
      npm run build --workspace @game-platform/sample-game -- --base=/games/sample-game/

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/catalog-web/dist /usr/share/nginx/html
COPY --from=build /app/games/sample-game/dist /usr/share/nginx/html/games/sample-game

EXPOSE 8080
